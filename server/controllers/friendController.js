const User = require('../models/User');

// ===================================
// إرسال طلب صداقة
// ===================================
exports.sendFriendRequest = async (req, res) => {
    try {
        const senderId = req.user.id;
        const receiverId = req.params.userId;

        if (senderId === receiverId) {
            return res.status(400).json({ message: 'لا يمكنك إرسال طلب صداقة لنفسك.' });
        }

        const sender = await User.findById(senderId);
        const receiver = await User.findById(receiverId);

        if (!receiver) {
            return res.status(404).json({ message: 'المستخدم غير موجود.' });
        }

        if (sender.friends.includes(receiverId) || receiver.friends.includes(senderId)) {
            return res.status(400).json({ message: 'أنتم أصدقاء بالفعل.' });
        }

        if (
            sender.friendRequestsSent.includes(receiverId) ||
            receiver.friendRequestsReceived.includes(senderId)
        ) {
            return res.status(400).json({ message: 'لقد أرسلت طلب صداقة بالفعل.' });
        }

        // إضافة الطلب
        await User.findByIdAndUpdate(senderId, {
            $addToSet: { friendRequestsSent: receiverId }
        });

        await User.findByIdAndUpdate(receiverId, {
            $addToSet: { friendRequestsReceived: senderId }
        });

        // إشعار فوري للطرف الآخر
        const io = req.app.get('socketio');
        if (receiver.socketId) {
            io.to(receiver.socketId).emit('friendshipUpdate', {
                action: 'received_request',
                from: senderId
            });
        }

        res.status(200).json({ message: 'تم إرسال طلب الصداقة بنجاح.' });

    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};


// ===================================
// قبول طلب صداقة
// ===================================
exports.acceptFriendRequest = async (req, res) => {
    try {
        const accepterId = req.user.id;
        const senderId = req.params.userId;

        await Promise.all([
            User.findByIdAndUpdate(accepterId, {
                $addToSet: { friends: senderId },
                $pull: { friendRequestsReceived: senderId }
            }),
            User.findByIdAndUpdate(senderId, {
                $addToSet: { friends: accepterId },
                $pull: { friendRequestsSent: accepterId }
            })
        ]);

        const updatedAccepter = await User.findById(accepterId)
            .populate('friends', 'username profileImage')
            .populate('friendRequestsReceived', 'username profileImage');

        const updatedSender = await User.findById(senderId)
            .populate('friends', 'username profileImage')
            .populate('friendRequestsSent', 'username profileImage');

        const io = req.app.get('socketio');

        if (updatedAccepter.socketId) {
            io.to(updatedAccepter.socketId).emit('friendshipUpdate', {
                action: 'friend_added',
                friendId: senderId,
                userData: updatedAccepter
            });
        }

        if (updatedSender.socketId) {
            io.to(updatedSender.socketId).emit('friendshipUpdate', {
                action: 'friend_added',
                friendId: accepterId,
                userData: updatedSender
            });
        }

        const senderUser = await User.findById(senderId);
        if (senderUser && senderUser.socketId) {
            io.to(senderUser.socketId).emit('friendshipUpdate', {
                action: 'request_accepted',
                by: accepterId
            });
        }

        res.status(200).json({ message: 'تم قبول طلب الصداقة.' });

    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};


// ===================================
// رفض أو إلغاء طلب صداقة
// ===================================
exports.rejectOrCancelRequest = async (req, res) => {
    try {
        const selfId = req.user.id;
        const otherId = req.params.userId;

        await Promise.all([
            User.findByIdAndUpdate(selfId, {
                $pull: {
                    friendRequestsReceived: otherId,
                    friendRequestsSent: otherId
                }
            }),
            User.findByIdAndUpdate(otherId, {
                $pull: {
                    friendRequestsReceived: selfId,
                    friendRequestsSent: selfId
                }
            })
        ]);

        const otherUser = await User.findById(otherId);
        const io = req.app.get('socketio');

        if (otherUser && otherUser.socketId) {
            io.to(otherUser.socketId).emit('friendshipUpdate', {
                action: 'request_cancelled',
                by: selfId
            });
        }

        res.status(200).json({ message: 'تم إلغاء طلب الصداقة.' });

    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};


// ===================================
// حذف صديق
// ===================================
exports.removeFriend = async (req, res) => {
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
            io.to(friendUser.socketId).emit('friendshipUpdate', {
                action: 'friend_removed',
                by: selfId
            });
        }

        res.status(200).json({ message: 'تم حذف الصديق.' });

    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};
