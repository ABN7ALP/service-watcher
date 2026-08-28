const Gift = require('../models/Gift');
const GiftLog = require('../models/GiftLog');
const User = require('../models/User');
const { addGiftExperience } = require('../utils/experienceManager');

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

        if (sender.coins < totalPrice) {
            return res.status(400).json({ status: 'fail', message: 'رصيد الكوينز غير كافٍ لإرسال هذه الهدية' });
        }

        sender.coins -= totalPrice;
        await sender.save();

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

        if (sender.socketId && io) {
            io.to(sender.socketId).emit('balanceUpdate', { newBalance: sender.balance, newCoins: sender.coins });
        }

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
            timestamp: new Date().toISOString()
        };

        if (receiver.socketId && io) {
            io.to(receiver.socketId).emit('giftReceived', giftEventPayload);
        }

                // ✅ منح خبرة للطرفين بناءً على قيمة الهدية
        await addGiftExperience(io, senderId, totalPrice, 'sender');
        await addGiftExperience(io, receiverId, totalPrice, 'receiver');

        // ✅ نرسل نفس البيانات (giftImage الحقيقي) للمرسل أيضاً حتى تظهر الصورة الصحيحة بتأثيره العائم
        if (sender.socketId && io) {
            io.to(sender.socketId).emit('giftSentConfirmation', giftEventPayload);
        }

        res.status(201).json({
            status: 'success',
            message: `تم إرسال هدية ${gift.name} بنجاح`,
            data: { giftLog, newSenderCoins: sender.coins }
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
                .slice(0, 20); // ✅ حد أقصى 20 مستلم بضغطة واحدة لحماية الرصيد من خطأ ضغط جماعي
        }

        if (finalRecipientIds.length === 0) {
            return res.status(400).json({ status: 'fail', message: 'لا يوجد مستلمون متاحون حالياً' });
        }

        const unitPrice = gift.discountedPrice || gift.price;
        const totalCost = unitPrice * finalRecipientIds.length;

        if (sender.coins < totalCost) {
            return res.status(400).json({ status: 'fail', message: `رصيدك غير كافٍ (تحتاج ${totalCost} كوينز لهذا العدد)` });
        }

        sender.coins -= totalCost;
        await sender.save();

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
                    timestamp: new Date().toISOString()
                });
            }
        });

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
