const mongoose = require('mongoose');
const Gift = require('../models/Gift');
const GiftLog = require('../models/GiftLog');
const User = require('../models/User');
const PrivateChat = require('../models/PrivateChat');
const PrivateMessage = require('../models/PrivateMessage');
const RoomBattle = require('../models/RoomBattle');
const { addGiftExperience } = require('../utils/experienceManager');

// ✅ يُضيف قيمة هدية كنقاط لصف الغرفة التي أُرسلت منها لو كانت طرفاً بمعركة PK نشطة الآن —
// تحديث ذرّي واحد (findOneAndUpdate + $inc) يمنع فقدان نقاط عند إرسال هدايا متزامنة بسرعة
async function applyGiftToActiveBattle(io, roomId, totalPrice) {
    const battle = await RoomBattle.findOne({
        $or: [{ roomA: roomId }, { roomB: roomId }],
        status: 'active'
    });
    if (!battle) return;

    const isRoomA = battle.roomA.toString() === roomId.toString();
    const updated = await RoomBattle.findOneAndUpdate(
        { _id: battle._id, status: 'active' },
        { $inc: isRoomA ? { scoreA: totalPrice } : { scoreB: totalPrice } },
        { new: true }
    );
    if (!updated || !io) return;

    const payload = {
        battleId: updated._id.toString(),
        roomA: updated.roomA.toString(),
        roomB: updated.roomB.toString(),
        scoreA: updated.scoreA,
        scoreB: updated.scoreB
    };
    io.to(`room-chat-${updated.roomA}`).emit('pk-score-update', payload);
    io.to(`room-chat-${updated.roomB}`).emit('pk-score-update', payload);
}

// ✅ يضيف قيمة أي هدية أُرسلت داخل غرفة (بغض النظر عن وجود معركة PK نشطة أم لا) كـ"نقاط دعم"
// تراكمية دائمة لتلك الغرفة — هذا ما يرفع مستوى الغرفة (1-5) ويفتح مزايا كتوسيع المقاعد.
// انظر VoiceRoom.addSupportPoints/LEVEL_THRESHOLDS للصيغة الكاملة. لا يُوقف إرسال الهدية أبداً
// حتى لو فشل (الغرفة الرسمية مثلاً بلا نظام مستوى — يُرجع null بأمان ويُتجاهل بصمت)
async function applyGiftToRoomSupport(io, roomId, totalPrice) {
    const VoiceRoom = require('../models/VoiceRoom');
    const result = await VoiceRoom.addSupportPoints(roomId, totalPrice);
    if (!result || !io) return;

    io.to(`room-chat-${roomId}`).emit('room-support-points-updated', {
        roomId: roomId.toString(),
        supportPoints: result.supportPoints,
        sessionSupportPoints: result.sessionSupportPoints,
        level: result.level,
        pointsToNextLevel: VoiceRoom.pointsToNextLevel(result.supportPoints, result.level),
        levelProgressPercent: VoiceRoom.levelProgressPercent(result.supportPoints, result.level)
    });

    if (result.leveledUp) {
        io.to(`room-chat-${roomId}`).emit('room-leveled-up', {
            roomId: roomId.toString(),
            newLevel: result.level,
            unlockedSeatCounts: result.unlockedSeatCounts
        });
    }
}

// ✅ يضيف قيمة هدية كنقاط لفريق المستلِم لو كان طرفاً بتحدٍ نشط الآن داخل نفس الغرفة (تحدٍ
// بين أعضاء، وليس معركة PK بين غرفتين — راجع applyGiftToActiveBattle أعلاه لتلك). مثل بقية
// خطّافات الهدايا: لا يُوقف إرسالها أبداً حتى لو فشل (لا تحدٍ نشط غالباً — يُتجاهل بصمت)
async function applyGiftToActiveSeatChallenge(io, roomId, receiverId, totalPrice) {
    const SeatChallenge = require('../models/SeatChallenge');
    const challenge = await SeatChallenge.findOne({ room: roomId, status: 'active', 'participants.user': receiverId });
    if (!challenge) return;

    const participant = challenge.participants.find(p => p.user.toString() === receiverId.toString());
    if (!participant) return;
    const isTeamA = participant.team === 'A';

    const updated = await SeatChallenge.findOneAndUpdate(
        { _id: challenge._id, status: 'active' },
        { $inc: isTeamA ? { scoreA: totalPrice } : { scoreB: totalPrice } },
        { new: true }
    );
    if (!updated || !io) return;

    io.to(`room-chat-${roomId}`).emit('seat-challenge-score-update', {
        challengeId: updated._id.toString(),
        scoreA: updated.scoreA,
        scoreB: updated.scoreB
    });
}

// ✅ حماية بسيطة من إرسال الهدايا بمعدل غير طبيعي (استدعاء الـ API مباشرة بمعزل عن الواجهة)
// ملاحظة: هذا حل مناسب لخادم واحد (single instance). عند التوسع لعدة خوادم لاحقاً يفضل نقل هذا لـ Redis
const giftRateMap = new Map(); // userId -> [timestamps]
const GIFT_RATE_WINDOW_MS = 2000;
// ✅ رُفعت من 12 إلى 20: أقصى تسارع طبيعي من واجهة الإرسال السريع (ضغط مستمر) يصل تقريباً
// لـ14 نداء/ثانيتين عند أعلى سرعة — رقم أقل من ذلك كان يعطّل استخدامات شرعية عادية بلا داعٍ
const GIFT_RATE_MAX_REQUESTS = 20;

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
        const { receiverId, giftId, quantity = 1, context = 'private_chat', roomId } = req.body;

        if (isGiftRateLimited(senderId)) {
            return res.status(429).json({ status: 'fail', message: 'أنت ترسل الهدايا بسرعة كبيرة جداً، انتظر لحظة' });
        }

        if (senderId === receiverId) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكنك إرسال هدية لنفسك' });
        }

        const qty = Math.max(1, Math.min(parseInt(quantity) || 1, 50));

        const [sender, receiver, gift] = await Promise.all([
            User.findById(senderId),
            User.findById(receiverId).select('username profileImage socketId coins level blockedUsers isBot'),
            Gift.findById(giftId)
        ]);

        // 🛡️ sender نادراً ما يكون null (حساب حُذف بلحظة بين إصدار التوكن وهذا الطلب مثلاً)،
        // لكن بدون هذا التحقق كانت القراءات اللاحقة (sender.username...) ترمي خطأ غير
        // متوقع — كانت أحد الأسباب المحتملة لتعطّل الخادم بالكامل (راجع unhandledRejection بـ server.js)
        if (!sender) {
            return res.status(401).json({ status: 'fail', message: 'يرجى تسجيل الدخول من جديد' });
        }
        if (!receiver) {
            return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        }
        if (receiver.isBot) {
            return res.status(403).json({ status: 'fail', message: 'لا يمكنك إرسال هدية لهذا الحساب' });
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

        // 🛡️ roomId اختياري وقادم من العميل — يُتحقق من صحته كـ ObjectId فقط، ولا يُمنح أي ثقة
        // إضافية (لا صلاحيات، فقط لربط الهدية بمعركة PK نشطة إن وُجدت لهذي الغرفة تحديداً)
        const cleanRoomId = (roomId && mongoose.Types.ObjectId.isValid(roomId)) ? roomId : null;

        const giftLog = await GiftLog.create({
            sender: senderId,
            receiver: receiverId,
            gift: gift._id,
            giftName: gift.name,
            giftImage: gift.imageUrl,
            quantity: qty,
            unitPrice: unitPrice,
            totalPrice: totalPrice,
            context: context,
            room: cleanRoomId
        });

        // ✅ لو الهدية أُرسلت من داخل غرفة بها معركة PK نشطة الآن، تُضاف قيمتها لنقاط صفّها فوراً
        if (cleanRoomId) {
            const ioForRoom = req.app.get('socketio');
            try {
                await applyGiftToActiveBattle(ioForRoom, cleanRoomId, totalPrice);
            } catch (battleError) {
                console.error('[PK BATTLE] Failed to apply gift score:', battleError);
            }
            try {
                await applyGiftToRoomSupport(ioForRoom, cleanRoomId, totalPrice);
            } catch (supportError) {
                console.error('[ROOM LEVEL] Failed to apply support points:', supportError);
            }
            try {
                await applyGiftToActiveSeatChallenge(ioForRoom, cleanRoomId, receiverId, totalPrice);
            } catch (challengeError) {
                console.error('[SEAT CHALLENGE] Failed to apply gift score:', challengeError);
            }
        }

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
        // — لكن ليس لهدايا الغرفة: هذي تظهر كإعلان داخل دردشة الغرفة نفسها (فقاعة ذهبية)، لا كرسالة
        // خاصة ولا فقاعة إشعار عائمة فوق الغرفة (كان هذا هو السلوك المزعج سابقاً)
        let savedMessage = null;
        let unreadCountForReceiver = 0;

        if (context === 'private_chat' && !cleanRoomId) {
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

        // ✅ إعلان الهدية داخل دردشة الغرفة نفسها (فقاعة ذهبية) — بديل الرسالة الخاصة/الإشعار
        // العائم السابقين، بنفس أسلوب "فلان أرسل هدية لفلان" بالتطبيقات المشهورة
        if (cleanRoomId && io) {
            io.to(`room-chat-${cleanRoomId}`).emit('room-gift-announcement', {
                roomId: cleanRoomId,
                fromUserId: senderId,
                fromUsername: sender.username,
                fromProfileImage: sender.profileImage,
                toUserId: receiverId,
                toUsername: receiver.username,
                giftName: gift.name,
                giftImage: safeGiftImage,
                giftIcon: gift.icon || '🎁',
                quantity: qty
            });
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

// =====================================================
// ✅ إرسال هدية لعدّة مستلمين دفعة واحدة (غرفة/دردشة خاصة) — نداء شبكة واحد بدل حلقة
// متتالية من نداء لكل مستلم. يحل مشكلتين حقيقيتين كانتا بالحلقة القديمة على العميل:
// 1) خصم ذري واحد بإجمالي التكلفة الصحيح — بدل خصم جزئي متتالٍ كان يجعل الرصيد المعروض
//    "يصعد وينزل" (كل استجابة فردية كانت ترجع الرصيد بعد خصم مستلم واحد فقط، فيُستبدَل
//    الرصيد الصحيح المتفائل مؤقتاً برصيد جزئي أكبر ظاهرياً قبل أن يهبط تدريجياً من جديد).
// 2) بث giftReceived/room-gift-announcement للجميع بنفس اللحظة تماماً (Promise.all) بدل
//    وصولها بالتتابع مستلماً بعد مستلم.
// =====================================================
exports.sendGiftBatch = async (req, res) => {
    try {
        const senderId = req.user.id;
        const { recipientIds, giftId, quantity = 1, roomId } = req.body;

        if (isGiftRateLimited(senderId)) {
            return res.status(429).json({ status: 'fail', message: 'أنت ترسل الهدايا بسرعة كبيرة جداً، انتظر لحظة' });
        }

        const cleanRecipientIds = Array.isArray(recipientIds)
            ? [...new Set(recipientIds.map(String))].filter(id => id !== senderId).slice(0, 80)
            : [];
        if (cleanRecipientIds.length === 0) {
            return res.status(400).json({ status: 'fail', message: 'يجب اختيار مستلم واحد على الأقل' });
        }

        const qty = Math.max(1, Math.min(parseInt(quantity) || 1, 50));

        const [sender, gift, receivers] = await Promise.all([
            User.findById(senderId),
            Gift.findById(giftId),
            User.find({ _id: { $in: cleanRecipientIds } }).select('username profileImage socketId blockedUsers isBot')
        ]);

        if (!sender) {
            return res.status(401).json({ status: 'fail', message: 'يرجى تسجيل الدخول من جديد' });
        }
        if (!gift || !gift.isActive) {
            return res.status(404).json({ status: 'fail', message: 'الهدية غير متوفرة حالياً' });
        }

        // 🛡️ استبعاد أي علاقة حظر (بأي اتجاه) والحسابات الآلية — نفس حماية الإرسال الفردي بالضبط
        const senderBlocked = new Set((sender.blockedUsers || []).map(id => id.toString()));
        const validReceivers = receivers.filter(r =>
            !r.isBot &&
            !senderBlocked.has(r._id.toString()) &&
            !(r.blockedUsers || []).map(id => id.toString()).includes(senderId.toString())
        );
        if (validReceivers.length === 0) {
            return res.status(400).json({ status: 'fail', message: 'لا يوجد مستلمون متاحون للإرسال' });
        }

        const unitPrice = gift.discountedPrice || gift.price;
        const totalPrice = unitPrice * qty; // لكل مستلم
        const totalCost = totalPrice * validReceivers.length; // الإجمالي الحقيقي المخصوم فعلياً

        // ✅ خصم ذري واحد بكامل التكلفة الحقيقية (عدد المستلمين المقبولين فعلياً بعد الفلترة،
        // وليس عدد المطلوبين أصلاً) — يستحيل خصم أكثر من الرصيد الفعلي حتى مع طلبات متزامنة
        const updatedSender = await User.findOneAndUpdate(
            { _id: senderId, coins: { $gte: totalCost } },
            { $inc: { coins: -totalCost } },
            { new: true }
        );
        if (!updatedSender) {
            return res.status(400).json({ status: 'fail', message: `رصيد الكوينز غير كافٍ (تحتاج ${totalCost} كوينز لهذا العدد)` });
        }
        sender.coins = updatedSender.coins;

        const cleanRoomId = (roomId && mongoose.Types.ObjectId.isValid(roomId)) ? roomId : null;
        const io = req.app.get('socketio');
        const safeGiftImage = gift.imageUrl || '';

        await GiftLog.insertMany(validReceivers.map(r => ({
            sender: senderId, receiver: r._id, gift: gift._id,
            giftName: gift.name, giftImage: gift.imageUrl,
            quantity: qty, unitPrice, totalPrice, context: 'private_chat', room: cleanRoomId
        })));

        if (cleanRoomId) {
            try {
                await applyGiftToActiveBattle(io, cleanRoomId, totalCost);
            } catch (battleError) {
                console.error('[PK BATTLE] Failed to apply gift score:', battleError);
            }
            try {
                await applyGiftToRoomSupport(io, cleanRoomId, totalCost);
            } catch (supportError) {
                console.error('[ROOM LEVEL] Failed to apply support points:', supportError);
            }
        }

        // ✅ لكل مستلم بالتوازي: إعلان الغرفة (لو بغرفة) أو رسالة دردشة خاصة حقيقية (لو بلا سياق
        // غرفة — نفس سلوك الإرسال الفردي بالضبط)، ثم بث الحدث اللحظي — الكل بنفس اللحظة تقريباً
        await Promise.all(validReceivers.map(async (receiver) => {
            const receiverId = receiver._id.toString();
            const giftEventPayload = {
                giftId: gift._id, giftName: gift.name, giftImage: safeGiftImage, quantity: qty,
                fromUserId: senderId, fromUsername: sender.username, fromProfileImage: sender.profileImage,
                animation: gift.animation, context: 'private_chat', timestamp: new Date().toISOString()
            };

            if (cleanRoomId) {
                // ✅ تحدي الأعضاء يُحسَب لكل مستلم على حدة (بعكس PK/مستوى الغرفة أعلاه، المحسوبين
                // إجمالاً) — مستلمو الإرسال الجماعي قد يكونون بفريقين مختلفين، فلا يصح تجميعهم
                try {
                    await applyGiftToActiveSeatChallenge(io, cleanRoomId, receiverId, totalPrice);
                } catch (challengeError) {
                    console.error('[SEAT CHALLENGE] Failed to apply gift score:', challengeError);
                }
                if (io) {
                    io.to(`room-chat-${cleanRoomId}`).emit('room-gift-announcement', {
                        roomId: cleanRoomId, fromUserId: senderId, fromUsername: sender.username, fromProfileImage: sender.profileImage,
                        toUserId: receiverId, toUsername: receiver.username, giftName: gift.name,
                        giftImage: safeGiftImage, giftIcon: gift.icon || '🎁', quantity: qty
                    });
                }
            } else {
                const participants = [senderId.toString(), receiverId].sort();
                const chatId = participants.join('_');
                let chat = await PrivateChat.findOne({ chatId });
                if (!chat) {
                    chat = await PrivateChat.create({
                        chatId, participants,
                        participantData: [
                            { userId: senderId, username: sender.username, profileImage: sender.profileImage },
                            { userId: receiverId, username: receiver.username, profileImage: receiver.profileImage }
                        ]
                    });
                }
                await PrivateMessage.create({
                    chatId, sender: senderId, receiver: receiverId, type: 'gift',
                    content: `${gift.name}${qty > 1 ? ' × ' + qty : ''}`,
                    metadata: { giftId: gift._id, giftImage: safeGiftImage, giftPrice: totalPrice, giftQuantity: qty }
                });
                chat.lastMessage = `🎁 هدية ${gift.name}`;
                chat.lastMessageAt = new Date();
                chat.lastMessageBy = senderId;
                chat.messageCount += 1;
                const currentUnread = chat.unreadCount.get(receiverId) || 0;
                chat.unreadCount.set(receiverId, currentUnread + 1);
                chat.hiddenBy = chat.hiddenBy.filter(id => id.toString() !== senderId.toString() && id.toString() !== receiverId);
                await chat.save();
                if (receiver.socketId && io) {
                    io.to(receiver.socketId).emit('privateMessageReceived', {
                        chatId: chat.chatId, senderId, senderName: sender.username
                    });
                }
            }

            if (receiver.socketId && io) {
                io.to(receiver.socketId).emit('giftReceived', giftEventPayload);
            }
        }));

        if (sender.socketId && io) {
            io.to(sender.socketId).emit('balanceUpdate', { newBalance: sender.balance, newCoins: sender.coins });
        }

        await addGiftExperience(io, senderId, totalCost, 'sender');
        await Promise.all(validReceivers.map(r => addGiftExperience(io, r._id, totalPrice, 'receiver')));

        res.status(201).json({
            status: 'success',
            message: `تم إرسال هدية ${gift.name} بنجاح`,
            data: { newSenderCoins: sender.coins, recipientCount: validReceivers.length }
        });

    } catch (error) {
        console.error('[ERROR] in sendGiftBatch:', error);
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

// ✅ ملخص الهدايا المستلمة لمستخدم محدد (لعرضها بصفحة الملف الشخصي الكامل)
exports.getUserGiftsSummary = async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        const summary = await GiftLog.aggregate([
            { $match: { receiver: new mongoose.Types.ObjectId(targetUserId) } },
            { $group: { _id: null, totalGiftsCount: { $sum: '$quantity' }, totalCoinsValue: { $sum: '$totalPrice' } } }
        ]);
        const data = summary[0] || { totalGiftsCount: 0, totalCoinsValue: 0 };
        res.status(200).json({
            status: 'success',
            data: { totalGiftsCount: data.totalGiftsCount, totalCoinsValue: data.totalCoinsValue }
        });
    } catch (error) {
        console.error('[ERROR] in getUserGiftsSummary:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ✅ مساهمون (من دعم هذا المستخدم بالهدايا) + الهدايا المتلقّاة — لعرض بطاقة "المساهمون
// والهدايا" بنافذة الإعجاب السريع بالملف الشخصي (اضغط عدد الداعمين → قائمة مساهمين + تبويب هدايا)
exports.getUserContributors = async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف مستخدم غير صالح' });
        }
        const targetObjId = new mongoose.Types.ObjectId(targetUserId);

        // ✅ يُحتسب فقط من هدايا "الإعجاب السريع" (context: profile) — أي عبر هذا الزر تحديداً
        // بالملف الشخصي، وليس كل هدايا المستخدم من كل مكان بالتطبيق
        const [contributors, totalAgg, giftsBreakdown] = await Promise.all([
            GiftLog.aggregate([
                { $match: { receiver: targetObjId, context: 'profile' } },
                { $group: { _id: '$sender', totalContributed: { $sum: '$totalPrice' }, giftsCount: { $sum: '$quantity' } } },
                { $sort: { totalContributed: -1 } },
                { $limit: 50 },
                { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
                { $unwind: '$user' },
                { $project: {
                    userId: '$_id', username: '$user.username', profileImage: '$user.profileImage',
                    activeFrameClass: '$user.activeFrameClass', totalContributed: 1, giftsCount: 1
                } }
            ]),
            GiftLog.aggregate([
                { $match: { receiver: targetObjId, context: 'profile' } },
                { $group: { _id: null, totalGiftsCount: { $sum: '$quantity' }, totalCoinsValue: { $sum: '$totalPrice' } } }
            ]),
            GiftLog.aggregate([
                { $match: { receiver: targetObjId, context: 'profile' } },
                { $group: { _id: '$gift', giftName: { $first: '$giftName' }, giftImage: { $first: '$giftImage' }, totalCount: { $sum: '$quantity' } } },
                { $sort: { totalCount: -1 } },
                { $limit: 30 }
            ])
        ]);

        const totals = totalAgg[0] || { totalGiftsCount: 0, totalCoinsValue: 0 };
        res.status(200).json({
            status: 'success',
            data: {
                contributorsCount: contributors.length,
                totalGiftsCount: totals.totalGiftsCount,
                totalCoinsValue: totals.totalCoinsValue,
                contributors,
                gifts: giftsBreakdown.map(g => ({ giftId: g._id, name: g.giftName, image: g.giftImage, count: g.totalCount }))
            }
        });
    } catch (error) {
        console.error('[ERROR] in getUserContributors:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
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
        if (!sender) return res.status(401).json({ status: 'fail', message: 'يرجى تسجيل الدخول من جديد' });
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
