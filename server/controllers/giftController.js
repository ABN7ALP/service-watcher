const Gift = require('../models/Gift');
const GiftLog = require('../models/GiftLog');
const User = require('../models/User');
const PrivateChat = require('../models/PrivateChat');
const PrivateMessage = require('../models/PrivateMessage');
const { addGiftExperience } = require('../utils/experienceManager');

// ✅ حماية بسيطة من إرسال الهدايا بمعدل غير طبيعي (استدعاء الـ API مباشرة بمعزل عن الواجهة)
// ملاحظة: هذا حل مناسب لخادم واحد (single instance). عند التوسع لعدة خوادم لاحقاً يفضل نقل هذا لـ Redis
const giftRateMap = new Map(); // userId -> [timestamps]
const GIFT_RATE_WINDOW_MS = 2000;
const GIFT_RATE_MAX_REQUESTS = 12; // يسمح بالإرسال السريع المتسارع الطبيعي، ويمنع الاستدعاء الآلي المفرط

function isGiftRateLimited(userId) {
    const now = Date.now();
    const key = userId.toString();
    const timestamps = (giftRateMap.get(key) || []).filter(t => now - t < GIFT_RATE_WINDOW_MS);
    timestamps.push(now);
    giftRateMap.set(key, timestamps);
    return timestamps.length > GIFT_RATE_MAX_REQUESTS;
}

setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of giftRateMap.entries()) {
        const filtered = timestamps.filter(t => now - t < GIFT_RATE_WINDOW_MS);
        if (filtered.length === 0) giftRateMap.delete(key);
        else giftRateMap.set(key, filtered);
    }
}, 30 * 1000);

// جلب متجر الهدايا
exports.getGiftShop = async (req, res) => {
    try {
        const gifts = await Gift.find({ isActive: true }).sort('sortOrder price');
        res.status(200).json({ status: 'success', data: { gifts } });
    } catch (error) {
        console.error('[ERROR] in getGiftShop:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// إرسال هدية لمستخدم آخر
exports.sendGift = async (req, res) => {
    try {
        const senderId = req.user.id;
        const { receiverId, giftId, quantity = 1, context = 'private_chat' } = req.body;

        if (isGiftRateLimited(senderId)) {
            return res.status(429).json({ status: 'fail', message: 'أنت ترسل الهدايا بسرعة كبيرة جداً، انتظر لحظة' });
        }

        if (senderId === receiverId) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكنك إرسال هدية لنفسك' });
        }

        const qty = Math.max(1, Math.min(parseInt(quantity) || 1, 50));

        const [sender, receiver, gift] = await Promise.all([
            User.findById(senderId),
            User.findById(receiverId).select('username profileImage socketId coins level blockedUsers'),
            Gift.findById(giftId)
        ]);

        if (!receiver) {
            return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        }
        if (!gift || !gift.isActive) {
            return res.status(404).json({ status: 'fail', message: 'الهدية غير متوفرة حالياً' });
        }

        const senderBlocked = sender.blockedUsers.map(id => id.toString());
        const receiverBlocked = (receiver.blockedUsers || []).map(id => id.toString());
        if (senderBlocked.includes(receiverId) || receiverBlocked.includes(senderId)) {
            return res.status(403).json({ status: 'fail', message: 'لا يمكنك إرسال هدية لهذا المستخدم' });
        }

        const unitPrice = gift.discountedPrice || gift.price;
        const totalPrice = unitPrice * qty;

                // ✅ خصم ذري (atomic) على مستوى قاعدة البيانات: الشرط والتحديث ينفذان كعملية واحدة غير قابلة للتجزئة،
        // فيستحيل خصم أكثر من الرصيد الفعلي حتى لو وصلت عدة طلبات بنفس اللحظة تماماً (race condition).
        const updatedSender = await User.findOneAndUpdate(
            { _id: senderId, coins: { $gte: totalPrice } },
            { $inc: { coins: -totalPrice } },
            { new: true }
        );

         // ✅ خصم ذري (atomic): الشرط والتحديث ينفذان كعملية واحدة غير قابلة للتجزئة على مستوى القاعدة،
        // فيستحيل خصم أكثر من الرصيد الفعلي حتى لو وصلت طلبات متزامنة بنفس اللحظة تماماً (race condition).
        const updatedSender = await User.findOneAndUpdate(
            { _id: senderId, coins: { $gte: totalPrice } },
            { $inc: { coins: -totalPrice } },
            { new: true }
        );

        if (!updatedSender) {
            return res.status(400).json({ status: 'fail', message: 'رصيد الكوينز غير كافٍ لإرسال هذه الهدية' });
        }
        sender.coins = updatedSender.coins;

        const giftLog = await GiftLog.create({
            sender: senderId,
            receiver: receiverId,
            gift: gift._id,
            giftName: gift.name,
            giftImage: gift.imageUrl,
            quantity: qty,
            unitPrice: unitPrice,
            totalPrice: totalPrice,
            context: context
        });

        const io = req.app.get('socketio');
        const safeGiftImage = gift.imageUrl || '';

                const giftEventPayload = {
            giftId: gift._id,
            giftName: gift.name,
            giftImage: safeGiftImage,
            quantity: qty,
            fromUserId: senderId,
            fromUsername: sender.username,
            fromProfileImage: sender.profileImage,
            animation: gift.animation,
            context: context, // ✅ جديد: يميّز الواجهة بين هدية خاصة وهدية عامة
            timestamp: new Date().toISOString()
        };

        // ✅ الإصلاح الجوهري: ننشئ رسالة حقيقية بالمحادثة الخاصة (تُحفظ بقاعدة البيانات وتصل فوراً للطرف الآخر)
        let savedMessage = null;
        let unreadCountForReceiver = 0;

        if (context === 'private_chat') {
            const participants = [senderId.toString(), receiverId.toString()].sort();
            const chatId = participants.join('_');

            let chat = await PrivateChat.findOne({ chatId });
            if (!chat) {
                chat = await PrivateChat.create({
                    chatId,
                    participants,
                    participantData: [
                        { userId: senderId, username: sender.username, profileImage: sender.profileImage },
                        { userId: receiverId, username: receiver.username, profileImage: receiver.profileImage }
                    ]
                });
            }

            const newMessage = await PrivateMessage.create({
                chatId,
                sender: senderId,
                receiver: receiverId,
                type: 'gift',
                content: `${gift.name}${qty > 1 ? ' × ' + qty : ''}`,
                metadata: {
                    giftId: gift._id,
                    giftImage: safeGiftImage,
                    giftPrice: totalPrice,
                    giftQuantity: qty
                }
            });

            chat.lastMessage = `🎁 هدية ${gift.name}`;
            chat.lastMessageAt = new Date();
            chat.lastMessageBy = senderId;
            chat.messageCount += 1;
            const currentUnread = chat.unreadCount.get(receiverId.toString()) || 0;
            chat.unreadCount.set(receiverId.toString(), currentUnread + 1);
            chat.hiddenBy = chat.hiddenBy.filter(id =>
                id.toString() !== senderId.toString() && id.toString() !== receiverId.toString()
            );
            await chat.save();

            savedMessage = await PrivateMessage.findById(newMessage._id)
                .populate('sender', 'username profileImage')
                .lean();

            unreadCountForReceiver = chat.unreadCount.get(receiverId.toString()) || 0;

            if (receiver.socketId && io) {
                io.to(receiver.socketId).emit('privateMessageReceived', {
                    message: savedMessage,
                    chatId: chat.chatId,
                    senderId: senderId,
                    senderName: sender.username
                });
            }
        }

        if (sender.socketId && io) {
            io.to(sender.socketId).emit('balanceUpdate', { newBalance: sender.balance, newCoins: sender.coins });
        }

        if (receiver.socketId && io) {
            io.to(receiver.socketId).emit('giftReceived', giftEventPayload);
        }
        if (sender.socketId && io) {
            io.to(sender.socketId).emit('giftSentConfirmation', giftEventPayload);
        }

        await addGiftExperience(io, senderId, totalPrice, 'sender');
        await addGiftExperience(io, receiverId, totalPrice, 'receiver');

        res.status(201).json({
            status: 'success',
            message: `تم إرسال هدية ${gift.name} بنجاح`,
            data: {
                giftLog,
                newSenderCoins: sender.coins,
                message: savedMessage,
                unreadCount: unreadCountForReceiver
            }
        });

    } catch (error) {
        console.error('[ERROR] in sendGift:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء إرسال الهدية' });
    }
};
// المتصدرين: أكثر شخص أرسل هدايا هذا الشهر
function getDateRange(range) {
    const now = new Date();
    if (range === 'week') {
        const start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);
        return { start, end: now };
    }
    if (range === 'year') {
        return { start: new Date(now.getFullYear(), 0, 1), end: now };
    }
    if (range === 'all') {
        return { start: new Date(2000, 0, 1), end: now };
    }
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }; // month (افتراضي)
}

exports.getTopSendersThisMonth = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query.range);
        const topSenders = await GiftLog.getTopSenders(start, end, 20);
        res.status(200).json({ status: 'success', data: { leaders: topSenders } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.getTopReceiversThisMonth = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query.range);
        const topReceivers = await GiftLog.getTopReceivers(start, end, 20);
        res.status(200).json({ status: 'success', data: { leaders: topReceivers } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// إرسال هدية جماعية بالشات العام (لأشخاص محددين أو للجميع)
exports.sendPublicGift = async (req, res) => {
    try {
        const senderId = req.user.id;
        const { giftId, recipientIds, audience } = req.body; // audience: 'all' | 'selected'

        if (isGiftRateLimited(senderId)) {
            return res.status(429).json({ status: 'fail', message: 'أنت ترسل الهدايا بسرعة كبيرة جداً، انتظر لحظة' });
        }

        const sender = await User.findById(senderId);
        const gift = await Gift.findById(giftId);
        if (!gift || !gift.isActive) return res.status(404).json({ status: 'fail', message: 'الهدية غير متوفرة' });

        const io = req.app.get('socketio');
        let finalRecipientIds = [];

        if (audience === 'all') {
            const room = io.sockets.adapter.rooms.get('public-room');
            if (room) {
                for (const socketId of room) {
                    const s = io.sockets.sockets.get(socketId);
                    if (s?.user?.id && s.user.id.toString() !== senderId.toString()) {
                        finalRecipientIds.push(s.user.id.toString());
                    }
                }
            }
            finalRecipientIds = [...new Set(finalRecipientIds)];
        } else {
            finalRecipientIds = (recipientIds || [])
                .filter(id => id !== senderId)
                .slice(0, 20);
        }

        // ✅ حماية جديدة: استبعاد أي علاقة حظر (بأي اتجاه) من قائمة المستلمين
        const blockedSet = new Set([
            ...(sender.blockedUsers || []).map(id => id.toString()),
            ...(sender.blockedBy || []).map(id => id.toString())
        ]);
        finalRecipientIds = finalRecipientIds.filter(id => !blockedSet.has(id.toString()));

        if (finalRecipientIds.length === 0) {
            return res.status(400).json({ status: 'fail', message: 'لا يوجد مستلمون متاحون حالياً' });
        }

        const unitPrice = gift.discountedPrice || gift.price;
        const totalCost = unitPrice * finalRecipientIds.length;

                // ✅ نفس الخصم الذري المستخدم بالهدايا الخاصة — يمنع تجاوز الرصيد عند إرسال هدية جماعية سريعة
        const updatedSenderPublic = await User.findOneAndUpdate(
            { _id: senderId, coins: { $gte: totalCost } },
            { $inc: { coins: -totalCost } },
            { new: true }
        );

                // ✅ نفس الخصم الذري المستخدم بالهدايا الخاصة
        const updatedSenderPublic = await User.findOneAndUpdate(
            { _id: senderId, coins: { $gte: totalCost } },
            { $inc: { coins: -totalCost } },
            { new: true }
        );

        if (!updatedSenderPublic) {
            return res.status(400).json({ status: 'fail', message: `رصيدك غير كافٍ (تحتاج ${totalCost} كوينز لهذا العدد)` });
        }
        sender.coins = updatedSenderPublic.coins;

        const receivers = await User.find({ _id: { $in: finalRecipientIds } }).select('username socketId');

        const logs = finalRecipientIds.map(rid => ({
            sender: senderId, receiver: rid, gift: gift._id,
            giftName: gift.name, giftImage: gift.imageUrl,
            quantity: 1, unitPrice, totalPrice: unitPrice, context: 'public_chat'
        }));
        await GiftLog.insertMany(logs);

             receivers.forEach(r => {
            if (r.socketId) {
                io.to(r.socketId).emit('giftReceived', {
                    giftId: gift._id, giftName: gift.name, giftImage: gift.imageUrl,
                    quantity: 1, fromUserId: senderId, fromUsername: sender.username,
                    fromProfileImage: sender.profileImage, animation: gift.animation,
                    context: 'public_chat', // ✅ جديد
                    timestamp: new Date().toISOString()
                });
            }
        });

        // ✅ منح الخبرة: المرسل حسب إجمالي ما أنفقه، وكل مستلم حسب قيمة الهدية التي استلمها فعلياً
        await addGiftExperience(io, senderId, totalCost, 'sender');
        for (const rid of finalRecipientIds) {
            await addGiftExperience(io, rid, unitPrice, 'receiver');
        }

        const audienceText = audience === 'all'
            ? `للجميع (${finalRecipientIds.length} شخص)`
            : (finalRecipientIds.length === 1 ? `لـ ${receivers[0]?.username || 'شخص'}` : `لـ ${finalRecipientIds.length} أشخاص`);

        io.to('public-room').emit('publicGiftAnnouncement', {
            senderUsername: sender.username,
            senderProfileImage: sender.profileImage,
            giftName: gift.name,
            giftImage: gift.imageUrl,
            audienceText,
            timestamp: new Date()
        });

        res.status(200).json({ status: 'success', message: 'تم إرسال الهدية بنجاح', data: { newCoins: sender.coins } });

    } catch (error) {
        console.error('[ERROR] in sendPublicGift:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء إرسال الهدية' });
    }
};
