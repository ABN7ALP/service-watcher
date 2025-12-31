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
            return res. status(400).json({ message: 'أنتم أصدقاء بالفعل.' });
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
                from: senderId,
                senderData: {
                    id: sender._id,
                    username: sender.username,
                    profileImage: sender.profileImage,
                    customId: sender.customId
                }
            });
        }

        res.status(200).json({ message: 'تم إرسال طلب الصداقة بنجاح.' });

    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};


// ===================================
// قبول طلب صداقة (تم تحسينه)
// ===================================
exports.acceptFriendRequest = async (req, res) => {
    try {
        const accepterId = req.user.id;
        const senderId = req.params.userId;

        // ✅ تحديث كلا الطرفين
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

        // ✅ جلب بيانات محدثة لكلا الطرفين
        const updatedAccepter = await User.findById(accepterId)
            .populate('friends', 'username profileImage customId')
            .populate('friendRequestsReceived', 'username profileImage customId');

        const updatedSender = await User. findById(senderId)
            .populate('friends', 'username profileImage customId')
            .populate('friendRequestsReceived', 'username profileImage customId');

        const io = req.app.get('socketio');

        // ✅ إرسال التحديثات لكلا الطرفين
        if (updatedAccepter.socketId) {
            io.to(updatedAccepter.socketId).emit('friendshipUpdate', {
                action: 'friend_added',
                friendId: senderId,
                friendsCount: updatedAccepter.friends.length,
                friendData: {
                    id: updatedSender._id,
                    username: updatedSender.username,
                    profileImage: updatedSender.profileImage,
                    customId: updatedSender.customId
                }
            });
        }

        if (updatedSender.socketId) {
            io.to(updatedSender.socketId).emit('friendshipUpdate', {
                action: 'friend_accepted',
                friendId: accepterId,
                friendsCount: updatedSender.friends.length,
                friendData: {
                    id: updatedAccepter._id,
                    username: updatedAccepter.username,
                    profileImage: updatedAccepter.profileImage,
                    customId: updatedAccepter.customId
                }
            });
        }

        res.status(200).json({
            message: 'تم قبول طلب الصداقة بنجاح.',
            friendsCount: updatedAccepter.friends.length,
            friend: {
                id: updatedSender._id,
                username: updatedSender.username,
                profileImage: updatedSender.profileImage,
                customId: updatedSender.customId
            }
        });

    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};


// ===================================
// رفض أو إلغاء طلب صداقة
// ===================================
exports.rejectOrCancelRequest = async (req, res) => {
    try {
        const userId = req.user.id;
        const otherUserId = req.params. userId;

        // تحديد إذا كان رفض أم إلغاء
        const user = await User.findById(userId);
        const isRejecting = user.friendRequestsReceived.includes(otherUserId);

        if (isRejecting) {
            // رفض طلب مستقبل
            await User.findByIdAndUpdate(userId, {
                $pull: { friendRequestsReceived: otherUserId }
            });
            await User.findByIdAndUpdate(otherUserId, {
                $pull: { friendRequestsSent: userId }
            });
        } else {
            // إلغاء طلب مرسل
            await User.findByIdAndUpdate(userId, {
                $pull: { friendRequestsSent: otherUserId }
            });
            await User. findByIdAndUpdate(otherUserId, {
                $pull: { friendRequestsReceived:  userId }
            });
        }

        const io = req.app.get('socketio');
        const otherUser = await User.findById(otherUserId);

        if (otherUser.socketId) {
            io.to(otherUser.socketId).emit('friendshipUpdate', {
                action: isRejecting ? 'request_rejected' : 'request_cancelled',
                userId: userId
            });
        }

        res.status(200).json({ message: 'تم بنجاح.' });

    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};


// ===================================
// إزالة صديق
// ===================================
exports.removeFriend = async (req, res) => {
    try {
        const userId = req.user. id;
        const friendId = req.params.userId;

        // ✅ إزالة من كلا الطرفين
        await Promise.all([
            User.findByIdAndUpdate(userId, {
                $pull:  { friends: friendId }
            }),
            User.findByIdAndUpdate(friendId, {
                $pull: { friends: userId }
            })
        ]);

        const updatedUser = await User.findById(userId);
        const updatedFriend = await User.findById(friendId);

        const io = req. app.get('socketio');

        // ✅ إشعار كلا الطرفين
        if (updatedUser.socketId) {
            io.to(updatedUser. socketId).emit('friendshipUpdate', {
                action: 'friend_removed',
                friendId: friendId,
                friendsCount: updatedUser.friends. length
            });
        }

        if (updatedFriend.socketId) {
            io.to(updatedFriend.socketId).emit('friendshipUpdate', {
                action: 'friend_removed',
                friendId: userId,
                friendsCount: updatedFriend.friends.length
            });
        }

        res. status(200).json({
            message: 'تم إزالة الصديق بنجاح.',
            friendsCount: updatedUser.friends.length
        });

    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};
