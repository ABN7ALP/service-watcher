// server/controllers/friendController.js
const User = require('../models/User');

// دالة مساعدة للتحقق من الحظر
const isBlocked = async (user1Id, user2Id) => {
    const user1 = await User.findById(user1Id).select('blockedUsers');
    const user2 = await User.findById(user2Id).select('blockedUsers');
    if (user1.blockedUsers.includes(user2Id) || user2.blockedUsers.includes(user1Id)) {
        return true;
    }
    return false;
};

exports.sendFriendRequest = async (req, res) => {
    try {
        const senderId = req.user.id;
        const receiverId = req.params.userId;

        if (await isBlocked(senderId, receiverId)) {
            return res.status(403).json({ message: 'لا يمكن إتمام هذا الإجراء بسبب وجود حظر.' });
        }
        // ... (باقي الكود يبقى كما هو)
        if (senderId === receiverId) return res.status(400).json({ message: 'لا يمكنك إرسال طلب صداقة لنفسك.' });
        const sender = await User.findById(senderId);
        const receiver = await User.findById(receiverId);
        if (!receiver) return res.status(404).json({ message: 'المستخدم غير موجود.' });
        if (sender.friends.includes(receiverId) || receiver.friends.includes(senderId)) return res.status(400).json({ message: 'أنتم أصدقاء بالفعل.' });
        if (sender.friendRequestsSent.includes(receiverId) || receiver.friendRequestsReceived.includes(senderId)) return res.status(400).json({ message: 'لقد أرسلت طلب صداقة بالفعل.' });
        
        await User.findByIdAndUpdate(senderId, { $addToSet: { friendRequestsSent: receiverId } });
        await User.findByIdAndUpdate(receiverId, { $addToSet: { friendRequestsReceived: senderId } });

        const io = req.app.get('socketio');
        if (receiver.socketId) {
            io.to(receiver.socketId).emit('friendshipUpdate', { action: 'received_request', from: senderId });
        }
        res.status(200).json({ message: 'تم إرسال طلب الصداقة بنجاح.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};

exports.acceptFriendRequest = async (req, res) => {
    try {
        const accepterId = req.user.id;
        const senderId = req.params.userId;

        if (await isBlocked(accepterId, senderId)) {
            return res.status(403).json({ message: 'لا يمكن إتمام هذا الإجراء بسبب وجود حظر.' });
        }
        // ... (باقي الكود يبقى كما هو)
        await Promise.all([
            User.findByIdAndUpdate(accepterId, { $addToSet: { friends: senderId }, $pull: { friendRequestsReceived: senderId } }),
            User.findByIdAndUpdate(senderId, { $addToSet: { friends: accepterId }, $pull: { friendRequestsSent: accepterId } })
        ]);
        const senderUser = await User.findById(senderId);
        const io = req.app.get('socketio');
        if (senderUser && senderUser.socketId) {
            io.to(senderUser.socketId).emit('friendshipUpdate', { action: 'request_accepted', by: accepterId });
        }
        res.status(200).json({ message: 'تم قبول طلب الصداقة.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};

// باقي الدوال (reject, remove) لا تحتاج فحص لأنها إجراءات قطع علاقة وليست بدء علاقة
exports.rejectOrCancelRequest = async (req, res) => {
    // ... (الكود الحالي يبقى كما هو)
    try {
        const selfId = req.user.id;
        const otherId = req.params.userId;
        await Promise.all([
            User.findByIdAndUpdate(selfId, { $pull: { friendRequestsReceived: otherId, friendRequestsSent: otherId } }),
            User.findByIdAndUpdate(otherId, { $pull: { friendRequestsReceived: selfId, friendRequestsSent: selfId } })
        ]);
        const otherUser = await User.findById(otherId);
        const io = req.app.get('socketio');
        if (otherUser && otherUser.socketId) {
            io.to(otherUser.socketId).emit('friendshipUpdate', { action: 'request_cancelled', by: selfId });
        }
        res.status(200).json({ message: 'تم إلغاء طلب الصداقة.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};

exports.removeFriend = async (req, res) => {
    // ... (الكود الحالي يبقى كما هو)
    try {
        const selfId = req.user.id;
        const friendId = req.params.userId;
        await Promise.all([
            User.findByIdAndUpdate(selfId, { $pull: { friends: friendId } }),
            User.findByIdAndUpdate(friendId, { $pull: { friends: selfId } })
        ]);
        const friendUser = await User.findById(friendId);
        const io = req.app.get('socketio');
        if (friendUser && friendUser.socketId) {
            io.to(friendUser.socketId).emit('friendshipUpdate', { action: 'friend_removed', by: selfId });
        }
        res.status(200).json({ message: 'تم حذف الصديق.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};
