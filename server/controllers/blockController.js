const User = require('../models/User');

// =================================================
// حظر مستخدم
// =================================================
exports.blockUser = async (req, res) => {
    try {
        const blockerId = req.user.id; // المستخدم الحالي
        const blockedUserId = req.params.userId; // المستخدم المراد حظره

        // التحقق من عدم حظر نفسك
        if (blockerId === blockedUserId) {
            return res.status(400).json({ 
                status: 'fail', 
                message: 'لا يمكنك حظر نفسك.' 
            });
        }

        const blocker = await User.findById(blockerId);
        const blockedUser = await User.findById(blockedUserId);

        if (!blockedUser) {
            return res.status(404).json({ 
                status: 'fail', 
                message: 'المستخدم غير موجود.' 
            });
        }

        // التحقق إذا كان محظوراً بالفعل
        if (blocker.blockedUsers.includes(blockedUserId)) {
            return res.status(400).json({ 
                status: 'fail', 
                message: 'هذا المستخدم محظور بالفعل.' 
            });
        }

        // إضافة الحظر
        await User.findByIdAndUpdate(blockerId, {
            $addToSet: { blockedUsers: blockedUserId }
        });

        await User.findByIdAndUpdate(blockedUserId, {
            $addToSet: { blockedBy: blockerId }
        });

        // إزالة الصداقة إذا كانوا أصدقاء
        await Promise.all([
            User.findByIdAndUpdate(blockerId, {
                $pull: { friends: blockedUserId }
            }),
            User.findByIdAndUpdate(blockedUserId, {
                $pull: { friends: blockerId }
            })
        ]);

        // إزالة طلبات الصداقة
        await Promise.all([
            User.findByIdAndUpdate(blockerId, {
                $pull: { 
                    friendRequestsSent: blockedUserId,
                    friendRequestsReceived: blockedUserId
                }
            }),
            User.findByIdAndUpdate(blockedUserId, {
                $pull: { 
                    friendRequestsSent: blockerId,
                    friendRequestsReceived: blockerId
                }
            })
        ]);

            res.status(200).json({ 
        status: 'success', 
        message: 'تم حظر المستخدم بنجاح.',
        data: { blockedUserId }
    });

    // --- ✅ إرسال حدث Socket لتحديث Cache الحظر ---
    try {
        const io = req.app.get('socketio');
        if (io) {
            // إرسال للمستخدم الذي قام بالحظر
            const blockerSocket = io.sockets.sockets.get(req.user.socketId);
            if (blockerSocket) {
                blockerSocket.emit('blockStatusChanged', {
                    blockerId: blockerId,
                    blockedId: blockedUserId,
                    isBlocked: true
                });
            }
            
            // إرسال للمستخدم المحظور (إذا كان متصلاً)
            io.sockets.sockets.forEach((sock) => {
                if (sock.user && sock.user.id.toString() === blockedUserId) {
                    sock.emit('blockStatusChanged', {
                        blockerId: blockerId,
                        blockedId: blockedUserId,
                        isBlocked: true
                    });
                }
            });
            
            console.log(`[BLOCK CONTROLLER] Sent block event to both users`);
        }
    } catch (socketError) {
        console.error('[BLOCK CONTROLLER] Socket emit error:', socketError);
    }

} catch (error) {
        console.error('[ERROR] in blockUser:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'حدث خطأ في الخادم أثناء حظر المستخدم.' 
        });
    }
};

// =================================================
// فك حظر مستخدم
// =================================================
exports.unblockUser = async (req, res) => {
    try {
        const unblockerId = req.user.id;
        const blockedUserId = req.params.userId;

        const unblocker = await User.findById(unblockerId);

        // التحقق إذا كان غير محظور
        if (!unblocker.blockedUsers.includes(blockedUserId)) {
            return res.status(400).json({ 
                status: 'fail', 
                message: 'هذا المستخدم غير محظور.' 
            });
        }

        // فك الحظر
        await User.findByIdAndUpdate(unblockerId, {
            $pull: { blockedUsers: blockedUserId }
        });

        await User.findByIdAndUpdate(blockedUserId, {
            $pull: { blockedBy: unblockerId }
        });

        res.status(200).json({ 
            status: 'success', 
            message: 'تم فك حظر المستخدم بنجاح.',
            data: { unblockedUserId: blockedUserId }
        });

    } catch (error) {
        console.error('[ERROR] in unblockUser:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'حدث خطأ في الخادم أثناء فك حظر المستخدم.' 
        });
    }
};

// =================================================
// جلب قائمة المحظورين
// =================================================
exports.getBlockedUsers = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await User.findById(userId)
            .populate('blockedUsers', 'username profileImage customId level')
            .select('blockedUsers');

        res.status(200).json({ 
            status: 'success', 
            data: { 
                blockedUsers: user.blockedUsers || []
            }
        });

    } catch (error) {
        console.error('[ERROR] in getBlockedUsers:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'حدث خطأ في الخادم أثناء جلب قائمة المحظورين.' 
        });
    }
};

// =================================================
// التحقق من حالة الحظر بين مستخدمين
// =================================================
exports.checkBlockStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const targetUserId = req.params.userId;

        const user = await User.findById(userId);

        const isBlockedByMe = user.blockedUsers.includes(targetUserId);
        
        const targetUser = await User.findById(targetUserId);
        const isBlockedByThem = targetUser.blockedUsers.includes(userId);

        res.status(200).json({ 
            status: 'success', 
            data: { 
                isBlockedByMe,
                isBlockedByThem,
                canInteract: !isBlockedByMe && !isBlockedByThem
            }
        });

    } catch (error) {
        console.error('[ERROR] in checkBlockStatus:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'حدث خطأ في الخادم أثناء التحقق من حالة الحظر.' 
        });
    }
};

// =================================================
// جلب حالة الحظر المتبادل بين مستخدمين
// =================================================
exports.getMutualBlockStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const targetUserId = req.params.userId;

        const user = await User.findById(userId);
        const targetUser = await User.findById(targetUserId);

        if (!targetUser) {
            return res.status(404).json({ 
                status: 'fail', 
                message: 'المستخدم غير موجود.' 
            });
        }

        const isBlockedByMe = user.blockedUsers.includes(targetUserId);
        const isBlockedByThem = targetUser.blockedUsers.includes(userId);

        res.status(200).json({ 
            status: 'success', 
            data: { 
                targetUser: {
                    id: targetUser._id,
                    username: targetUser.username,
                    profileImage: targetUser.profileImage,
                    customId: targetUser.customId
                },
                blockStatus: {
                    iBlockedHim: isBlockedByMe,
                    heBlockedMe: isBlockedByThem,
                    canViewProfile: !isBlockedByThem, // يمكنه رؤية البروفايل إذا لم يحظره
                    canInteract: !isBlockedByMe && !isBlockedByThem
                }
            }
        });

    } catch (error) {
        console.error('[ERROR] in getMutualBlockStatus:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'حدث خطأ في الخادم أثناء التحقق من حالة الحظر.' 
        });
    }
};
