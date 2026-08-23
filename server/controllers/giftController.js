const Gift = require('../models/Gift');
const GiftLog = require('../models/GiftLog');
const User = require('../models/User');

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

        if (receiver.socketId && io) {
            io.to(receiver.socketId).emit('giftReceived', {
                giftId: gift._id,
                giftName: gift.name,
                giftImage: gift.imageUrl,
                quantity: qty,
                fromUserId: senderId,
                fromUsername: sender.username,
                fromProfileImage: sender.profileImage,
                animation: gift.animation,
                timestamp: new Date().toISOString()
            });
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
exports.getTopSendersThisMonth = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const topSenders = await GiftLog.getTopSenders(startOfMonth, endOfMonth, 20);
        res.status(200).json({ status: 'success', data: { leaders: topSenders } });
    } catch (error) {
        console.error('[ERROR] in getTopSendersThisMonth:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// المتصدرين: أكثر شخص استقبل هدايا هذا الشهر
exports.getTopReceiversThisMonth = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const topReceivers = await GiftLog.getTopReceivers(startOfMonth, endOfMonth, 20);
        res.status(200).json({ status: 'success', data: { leaders: topReceivers } });
    } catch (error) {
        console.error('[ERROR] in getTopReceiversThisMonth:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};
