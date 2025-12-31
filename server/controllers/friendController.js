const User = require('../models/User');

// ===================================
// إرسال طلب صداقة (محسّن مع البروفايل المصغر)
// ===================================
exports.sendFriendRequest = async (req, res) => {
    try {
        const senderId = req.user.id;
        const receiverId = req.params.userId;

        if (senderId === receiverId) {
            return res.status(400).json({ message: 'لا يمكنك إرسال طلب صداقة لنفسك.' });
        }

        const sender = await User.findById(senderId).select('username profileImage customId');
        const receiver = await User.findById(receiverId).select('socketId friendRequestsReceived friends');

        if (!receiver) {
            return res.status(404).json({ message: 'المستخدم غير موجود.' });
        }

        if (receiver.friends.includes(senderId)) {
            return res.status(400).json({ message: 'أنتم أصدقاء بالفعل.' });
        }

        if (receiver.friendRequestsReceived.includes(senderId)) {
            return res.status(400).json({ message: 'لقد أرسلت طلب صداقة بالفعل.' });
        }

        // إضافة الطلب
        await Promise.all([
            User.findByIdAndUpdate(senderId, {
                $addToSet: { friendRequestsSent: receiverId }
            }),
            User.findByIdAndUpdate(receiverId, {
                $addToSet: { friendRequestsReceived: senderId }
            })
        ]);

        // إشعار فوري للطرف الآخر
        const io = req.app.get('socketio');
        
        if (receiver.socketId) {
            // ✅ إشعار البروفايل المصغر بحالة "مرسل"
            io.to(receiver.socketId).emit('friendStatusUpdate', {
                action: 'request_sent',
                fromUserId: senderId,
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
// قبول طلب صداقة (محسّن مع البروفايل المصغر)
// ===================================
exports.acceptFriendRequest = async (req, res) => {
    try {
        const accepterId = req.user.id;
        const senderId = req.params.userId;

        // تحديث كلا الطرفين
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

        // جلب البيانات المحدثة
        const updatedAccepter = await User.findById(accepterId)
            .populate('friends', 'username profileImage customId level')
            .select('username profileImage customId level socketId');

        const updatedSender = await User.findById(senderId)
            .populate('friends', 'username profileImage customId level')
            .select('username profileImage customId level socketId');

        const io = req.app.get('socketio');

        // ✅ إشعار الطرف الأول (من قبل الطلب)
        if (updatedAccepter.socketId) {
            io.to(updatedAccepter.socketId).emit('friendStatusUpdate', {
                action: 'friend_added',
                friendId: senderId,
                friendsCount: updatedAccepter.friends.length,
                isFriend: true
            });
        }

        // ✅ إشعار الطرف الثاني (مرسل الطلب)
        if (updatedSender.socketId) {
            io.to(updatedSender.socketId).emit('friendStatusUpdate', {
                action: 'request_accepted',
                friendId: accepterId,
                friendsCount: updatedSender.friends.length,
                isFriend: true,
                friendData: {
                    id: accepterId,
                    username: updatedAccepter.username,
                    profileImage: updatedAccepter.profileImage,
                    customId: updatedAccepter.customId,
                    level: updatedAccepter.level
                }
            });
        }

        res.status(200).json({
            message: 'تم قبول طلب الصداقة بنجاح.',
            friendsCount: updatedAccepter.friends.length,
            isFriend: true
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
        const otherUserId = req.params.userId; // ✅ تم إصلاح المسافة

        const user = await User.findById(userId);
        const isRejecting = user.friendRequestsReceived.includes(otherUserId);

        if (isRejecting) {
            await Promise.all([
                User.findByIdAndUpdate(userId, {
                    $pull: { friendRequestsReceived: otherUserId }
                }),
                User.findByIdAndUpdate(otherUserId, {
                    $pull: { friendRequestsSent: userId }
                })
            ]);
        } else {
            await Promise.all([
                User.findByIdAndUpdate(userId, {
                    $pull: { friendRequestsSent: otherUserId }
                }),
                User.findByIdAndUpdate(otherUserId, {
                    $pull: { friendRequestsReceived: userId }
                })
            ]);
        }

        const io = req.app.get('socketio');
        const otherUser = await User.findById(otherUserId).select('socketId');

        if (otherUser.socketId) {
            // ✅ إشعار البروفايل المصغر بحالة "مرسل" مرة أخرى
            io.to(otherUser.socketId).emit('friendStatusUpdate', {
                action: isRejecting ? 'request_rejected' : 'request_cancelled',
                userId: userId,
                isFriend: false,
                requestStatus: null
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
        const userId = req.user.id;
        const friendId = req.params.userId;

        await Promise.all([
            User.findByIdAndUpdate(userId, {
                $pull: { friends: friendId }
            }),
            User.findByIdAndUpdate(friendId, {
                $pull: { friends: userId }
            })
        ]);

        const updatedUser = await User.findById(userId);
        const updatedFriend = await User.findById(friendId).select('socketId');

        const io = req.app.get('socketio');

        // ✅ إشعار البروفايل المصغر بحالة "مرسل" (يمكن إرسال طلب)
        if (updatedUser.socketId) {
            io.to(updatedUser.socketId).emit('friendStatusUpdate', {
                action: 'friend_removed',
                friendId: friendId,
                isFriend: false,
                requestStatus: null
            });
        }

        if (updatedFriend.socketId) {
            io.to(updatedFriend.socketId).emit('friendStatusUpdate', {
                action: 'friend_removed',
                friendId: userId,
                isFriend: false,
                requestStatus: null
            });
        }

        res.status(200).json({
            message: 'تم إزالة الصديق بنجاح.',
            isFriend: false
        });

    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};
