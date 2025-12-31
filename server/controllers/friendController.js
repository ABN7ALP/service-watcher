const User = require('../models/User');

// =================================================
// إرسال طلب صداقة (محسّن)
// =================================================
exports.sendFriendRequest = async (req, res) => {
    try {
        const senderId = req.user.id;
        const receiverId = req.params.userId;

        console.log(`[FRIEND] Sending friend request from ${senderId} to ${receiverId}`);

        // 1. التحقق من عدم إرسال طلب لنفسك
        if (senderId === receiverId) {
            return res.status(400).json({ 
                status: 'fail', 
                message: 'لا يمكنك إرسال طلب صداقة لنفسك.' 
            });
        }

        // 2. البحث عن المستخدمين
        const sender = await User.findById(senderId);
        const receiver = await User.findById(receiverId);

        if (!receiver) {
            return res.status(404).json({ 
                status: 'fail', 
                message: 'المستخدم غير موجود.' 
            });
        }

        // 3. التحقق من أنهم ليسوا أصدقاء بالفعل
        if (sender.friends.includes(receiverId) || receiver.friends.includes(senderId)) {
            return res.status(400).json({ 
                status: 'fail', 
                message: 'أنتم أصدقاء بالفعل.' 
            });
        }

        // 4. التحقق من عدم وجود طلب مسبق
        if (sender.friendRequestsSent.includes(receiverId) || 
            receiver.friendRequestsReceived.includes(senderId)) {
            return res.status(400).json({ 
                status: 'fail', 
                message: 'لقد أرسلت طلب صداقة بالفعل.' 
            });
        }

        // 5. إضافة الطلب إلى كلا المستخدمين
        await Promise.all([
            User.findByIdAndUpdate(senderId, {
                $addToSet: { friendRequestsSent: receiverId }
            }),
            User.findByIdAndUpdate(receiverId, {
                $addToSet: { friendRequestsReceived: senderId }
            })
        ]);

        // 6. جلب البيانات المحدثة
        const updatedSender = await User.findById(senderId)
            .select('friendRequestsSent friendRequestsReceived friends')
            .lean();
        
        const updatedReceiver = await User.findById(receiverId)
            .select('friendRequestsSent friendRequestsReceived friends socketId')
            .lean();

        // 7. إرسال إشعار فوري للطرف الآخر عبر Socket
        const io = req.app.get('socketio');
        if (updatedReceiver.socketId) {
            io.to(updatedReceiver.socketId).emit('friendshipUpdate', {
                action: 'request_received',
                fromUserId: senderId,
                requestId: `${senderId}-${receiverId}`,
                timestamp: new Date().toISOString(),
                senderData: {
                    id: sender._id,
                    username: sender.username,
                    profileImage: sender.profileImage,
                    customId: sender.customId,
                    level: sender.level
                },
                metadata: {
                    sentRequestsCount: updatedSender.friendRequestsSent.length,
                    receivedRequestsCount: updatedReceiver.friendRequestsReceived.length
                }
            });
            console.log(`[SOCKET] Sent request_received notification to ${receiverId}`);
        }

        // 8. إشعار المرسل
        if (updatedSender.socketId) {
            io.to(updatedSender.socketId).emit('friendshipUpdate', {
                action: 'request_sent',
                toUserId: receiverId,
                requestId: `${senderId}-${receiverId}`,
                timestamp: new Date().toISOString()
            });
        }

        // 9. الرد الناجح
        res.status(200).json({ 
            status: 'success', 
            message: 'تم إرسال طلب الصداقة بنجاح.',
            data: {
                requestId: `${senderId}-${receiverId}`,
                receiver: {
                    id: receiver._id,
                    username: receiver.username,
                    profileImage: receiver.profileImage
                },
                counts: {
                    sentRequests: updatedSender.friendRequestsSent.length,
                    receivedRequests: updatedSender.friendRequestsReceived.length
                }
            }
        });

        console.log(`[FRIEND] Friend request sent successfully from ${sender.username} to ${receiver.username}`);

    } catch (error) {
        console.error('[ERROR] in sendFriendRequest:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'حدث خطأ في الخادم أثناء إرسال طلب الصداقة.' 
        });
    }
};

// =================================================
// قبول طلب صداقة (محسّن)
// =================================================
exports.acceptFriendRequest = async (req, res) => {
    try {
        const accepterId = req.user.id;  // الشخص الذي يقبل الطلب
        const senderId = req.params.userId; // الشخص الذي أرسل الطلب

        console.log(`[FRIEND] Accepting friend request: ${senderId} -> ${accepterId}`);

        // 1. التحقق من وجود الطلب
        const accepter = await User.findById(accepterId);
        if (!accepter.friendRequestsReceived.includes(senderId)) {
            return res.status(400).json({ 
                status: 'fail', 
                message: 'طلب الصداقة غير موجود أو تم قبوله مسبقاً.' 
            });
        }

        // 2. تحديث كلا الطرفين (إضافة أصدقاء، حذف طلبات)
        await Promise.all([
            // تحديث الشخص الذي يقبل الطلب
            User.findByIdAndUpdate(accepterId, {
                $addToSet: { friends: senderId },
                $pull: { 
                    friendRequestsReceived: senderId,
                    friendRequestsSent: senderId 
                }
            }),
            // تحديث الشخص الذي أرسل الطلب
            User.findByIdAndUpdate(senderId, {
                $addToSet: { friends: accepterId },
                $pull: { 
                    friendRequestsSent: accepterId,
                    friendRequestsReceived: accepterId 
                }
            })
        ]);

        // 3. جلب البيانات المحدثة لكلا الطرفين
        const [updatedAccepter, updatedSender] = await Promise.all([
            User.findById(accepterId)
                .populate('friends', 'username profileImage customId level')
                .populate('friendRequestsReceived', 'username profileImage customId')
                .lean(),
            User.findById(senderId)
                .populate('friends', 'username profileImage customId level')
                .populate('friendRequestsSent', 'username profileImage customId')
                .lean()
        ]);

        // 4. إعداد بيانات الإشعارات
        const friendshipData = {
            friendshipId: `${accepterId}-${senderId}`,
            establishedAt: new Date().toISOString(),
            mutualFriends: updatedAccepter.friends.filter(f => 
                updatedSender.friends.some(sf => sf._id.toString() === f._id.toString())
            ).length
        };

        const io = req.app.get('socketio');

        // 5. إرسال إشعار للشخص الذي قبل الطلب
        if (updatedAccepter.socketId) {
            io.to(updatedAccepter.socketId).emit('friendshipUpdate', {
                action: 'friend_added',
                friendId: senderId,
                friendshipData: friendshipData,
                friendData: {
                    id: updatedSender._id,
                    username: updatedSender.username,
                    profileImage: updatedSender.profileImage,
                    customId: updatedSender.customId,
                    level: updatedSender.level,
                    friendsCount: updatedSender.friends.length
                },
                stats: {
                    friendsCount: updatedAccepter.friends.length,
                    pendingRequests: updatedAccepter.friendRequestsReceived.length,
                    friendsListUpdated: true
                }
            });
            console.log(`[SOCKET] Sent friend_added notification to accepter ${accepterId}`);
        }

        // 6. إرسال إشعار للشخص الذي أرسل الطلب
        if (updatedSender.socketId) {
            io.to(updatedSender.socketId).emit('friendshipUpdate', {
                action: 'request_accepted',
                friendId: accepterId,
                friendshipData: friendshipData,
                friendData: {
                    id: updatedAccepter._id,
                    username: updatedAccepter.username,
                    profileImage: updatedAccepter.profileImage,
                    customId: updatedAccepter.customId,
                    level: updatedAccepter.level,
                    friendsCount: updatedAccepter.friends.length
                },
                stats: {
                    friendsCount: updatedSender.friends.length,
                    sentRequests: updatedSender.friendRequestsSent.length,
                    friendsListUpdated: true
                }
            });
            console.log(`[SOCKET] Sent request_accepted notification to sender ${senderId}`);
        }

        // 7. إشعار للبث العام عن صداقة جديدة (اختياري)
        io.emit('newFriendship', {
            users: [accepterId, senderId],
            timestamp: new Date().toISOString()
        });

        // 8. الرد الناجح
        res.status(200).json({
            status: 'success',
            message: 'تم قبول طلب الصداقة بنجاح! أصبحتما أصدقاء الآن.',
            data: {
                friendship: friendshipData,
                newFriend: {
                    id: updatedSender._id,
                    username: updatedSender.username,
                    profileImage: updatedSender.profileImage,
                    customId: updatedSender.customId,
                    level: updatedSender.level
                },
                stats: {
                    friendsCount: updatedAccepter.friends.length,
                    pendingRequests: updatedAccepter.friendRequestsReceived.length
                },
                notification: 'تم تحديث قائمة أصدقائك تلقائياً.'
            }
        });

        console.log(`[FRIEND] Friendship established between ${updatedAccepter.username} and ${updatedSender.username}`);

    } catch (error) {
        console.error('[ERROR] in acceptFriendRequest:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'حدث خطأ في الخادم أثناء قبول طلب الصداقة.' 
        });
    }
};

// =================================================
// رفض أو إلغاء طلب صداقة (محسّن)
// =================================================
exports.rejectOrCancelRequest = async (req, res) => {
    try {
        const userId = req.user.id;
        const otherUserId = req.params.userId;

        console.log(`[FRIEND] Processing reject/cancel: ${userId} -> ${otherUserId}`);

        // 1. جلب بيانات المستخدم الحالي
        const user = await User.findById(userId)
            .select('friendRequestsSent friendRequestsReceived friends');

        // 2. تحديد نوع الإجراء
        let actionType = 'unknown';
        let message = '';
        
        if (user.friendRequestsReceived.includes(otherUserId)) {
            actionType = 'reject'; // رفض طلب واصل
            message = 'تم رفض طلب الصداقة.';
        } else if (user.friendRequestsSent.includes(otherUserId)) {
            actionType = 'cancel'; // إلغاء طلب مرسل
            message = 'تم إلغاء طلب الصداقة.';
        } else {
            return res.status(400).json({ 
                status: 'fail', 
                message: 'لا يوجد طلب صداقة بين المستخدمين.' 
            });
        }

        // 3. تحديث كلا الطرفين
        await Promise.all([
            // تحديث المستخدم الحالي
            User.findByIdAndUpdate(userId, {
                $pull: { 
                    friendRequestsReceived: otherUserId,
                    friendRequestsSent: otherUserId
                }
            }),
            // تحديث المستخدم الآخر
            User.findByIdAndUpdate(otherUserId, {
                $pull: { 
                    friendRequestsSent: userId,
                    friendRequestsReceived: userId
                }
            })
        ]);

        // 4. جلب البيانات المحدثة
        const [updatedUser, updatedOtherUser] = await Promise.all([
            User.findById(userId)
                .select('friendRequestsSent friendRequestsReceived friends socketId')
                .lean(),
            User.findById(otherUserId)
                .select('friendRequestsSent friendRequestsReceived friends socketId')
                .lean()
        ]);

        // 5. إرسال إشعارات عبر Socket
        const io = req.app.get('socketio');

        // إشعار للمستخدم الحالي
        if (updatedUser.socketId) {
            io.to(updatedUser.socketId).emit('friendshipUpdate', {
                action: actionType === 'reject' ? 'request_rejected' : 'request_cancelled',
                otherUserId: otherUserId,
                actionType: actionType,
                timestamp: new Date().toISOString(),
                stats: {
                    sentRequests: updatedUser.friendRequestsSent.length,
                    receivedRequests: updatedUser.friendRequestsReceived.length
                }
            });
        }

        // إشعار للمستخدم الآخر
        if (updatedOtherUser.socketId) {
            io.to(updatedOtherUser.socketId).emit('friendshipUpdate', {
                action: actionType === 'reject' ? 'request_rejected_by_other' : 'request_cancelled_by_other',
                userId: userId,
                actionType: actionType,
                timestamp: new Date().toISOString(),
                stats: {
                    sentRequests: updatedOtherUser.friendRequestsSent.length,
                    receivedRequests: updatedOtherUser.friendRequestsReceived.length
                }
            });
            console.log(`[SOCKET] Sent ${actionType}_by_other notification to ${otherUserId}`);
        }

        // 6. الرد الناجح
        res.status(200).json({ 
            status: 'success', 
            message: message,
            data: {
                action: actionType,
                otherUser: {
                    id: otherUserId,
                    username: updatedOtherUser.username || 'مستخدم'
                },
                counts: {
                    sentRequests: updatedUser.friendRequestsSent.length,
                    receivedRequests: updatedUser.friendRequestsReceived.length
                }
            }
        });

        console.log(`[FRIEND] ${actionType === 'reject' ? 'Request rejected' : 'Request cancelled'} successfully`);

    } catch (error) {
        console.error('[ERROR] in rejectOrCancelRequest:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'حدث خطأ في الخادم أثناء معالجة طلب الصداقة.' 
        });
    }
};

// =================================================
// إزالة صديق (محسّن)
// =================================================
exports.removeFriend = async (req, res) => {
    try {
        const userId = req.user.id;
        const friendId = req.params.userId;

        console.log(`[FRIEND] Removing friend: ${userId} removing ${friendId}`);

        // 1. التحقق من أنهم أصدقاء بالفعل
        const user = await User.findById(userId);
        if (!user.friends.includes(friendId)) {
            return res.status(400).json({ 
                status: 'fail', 
                message: 'هذا المستخدم ليس في قائمة أصدقائك.' 
            });
        }

        // 2. إزالة الصداقة من كلا الطرفين
        await Promise.all([
            User.findByIdAndUpdate(userId, {
                $pull: { friends: friendId }
            }),
            User.findByIdAndUpdate(friendId, {
                $pull: { friends: userId }
            })
        ]);

        // 3. جلب البيانات المحدثة
        const [updatedUser, updatedFriend] = await Promise.all([
            User.findById(userId)
                .populate('friends', 'username profileImage customId')
                .select('friends socketId username')
                .lean(),
            User.findById(friendId)
                .populate('friends', 'username profileImage customId')
                .select('friends socketId username')
                .lean()
        ]);

        // 4. إرسال إشعارات عبر Socket
        const io = req.app.get('socketio');
        const removalData = {
            removedAt: new Date().toISOString(),
            initiator: userId,
            friendshipDuration: 'N/A' // يمكن إضافة حساب المدة إذا كان هناك تاريخ صداقة
        };

        // إشعار للمستخدم الحالي
        if (updatedUser.socketId) {
            io.to(updatedUser.socketId).emit('friendshipUpdate', {
                action: 'friend_removed',
                friendId: friendId,
                removalData: removalData,
                stats: {
                    friendsCount: updatedUser.friends.length,
                    listUpdated: true
                },
                friendData: {
                    id: friendId,
                    username: updatedFriend.username,
                    wasFriend: true
                }
            });
            console.log(`[SOCKET] Sent friend_removed notification to initiator ${userId}`);
        }

        // إشعار للصديق المزال
        if (updatedFriend.socketId) {
            io.to(updatedFriend.socketId).emit('friendshipUpdate', {
                action: 'friend_removed_by_other',
                userId: userId,
                removalData: removalData,
                stats: {
                    friendsCount: updatedFriend.friends.length,
                    listUpdated: true
                },
                userData: {
                    id: userId,
                    username: updatedUser.username,
                    wasFriend: true
                }
            });
            console.log(`[SOCKET] Sent friend_removed_by_other notification to ${friendId}`);
        }

        // 5. الرد الناجح
        res.status(200).json({
            status: 'success',
            message: 'تم حذف الصديق بنجاح.',
            data: {
                removedFriend: {
                    id: friendId,
                    username: updatedFriend.username,
                    profileImage: updatedFriend.profileImage
                },
                stats: {
                    friendsCount: updatedUser.friends.length,
                    previousCount: user.friends.length
                },
                timestamp: new Date().toISOString()
            }
        });

        console.log(`[FRIEND] Friend removed successfully: ${updatedUser.username} removed ${updatedFriend.username}`);

    } catch (error) {
        console.error('[ERROR] in removeFriend:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'حدث خطأ في الخادم أثناء حذف الصديق.' 
        });
    }
};

// =================================================
// دالة مساعدة: التحقق من حالة الصداقة (اختياري)
// =================================================
exports.checkFriendshipStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const targetUserId = req.params.userId;

        const user = await User.findById(userId)
            .select('friends friendRequestsSent friendRequestsReceived');

        let status = 'none';
        let details = {};

        if (user.friends.includes(targetUserId)) {
            status = 'friends';
            details = {
                isFriend: true,
                canRemove: true,
                canMessage: true
            };
        } else if (user.friendRequestsSent.includes(targetUserId)) {
            status = 'request_sent';
            details = {
                isFriend: false,
                canCancel: true,
                pending: true,
                sentByMe: true
            };
        } else if (user.friendRequestsReceived.includes(targetUserId)) {
            status = 'request_received';
            details = {
                isFriend: false,
                canAccept: true,
                canReject: true,
                pending: true,
                sentByOther: true
            };
        } else {
            status = 'none';
            details = {
                isFriend: false,
                canSendRequest: true,
                noPreviousInteraction: true
            };
        }

        res.status(200).json({
            status: 'success',
            data: {
                relationshipStatus: status,
                details: details,
                users: {
                    currentUserId: userId,
                    targetUserId: targetUserId
                },
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('[ERROR] in checkFriendshipStatus:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'حدث خطأ في الخادم أثناء التحقق من حالة الصداقة.' 
        });
    }
};
