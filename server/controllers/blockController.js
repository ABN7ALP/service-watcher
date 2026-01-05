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

            // =================================================
// ✅ إرسال إشعارات Socket للحظر
// =================================================
if (req.app.get('io')) {
    const io = req.app.get('io');
    
    // 1. تنظيف cache للجميع
    io.emit('clearBlockCache', {
        userId: blockerId,
        targetUserId: blockedUserId
    });
    
    // 2. إرسال إشعار قوي للمستخدم المحظور
    try {
        // البحث عن socket المستخدم المحظور
        const sockets = await io.fetchSockets();
        const blockedUserSocket = sockets.find(s => 
            s.user && s.user.id && s.user.id.toString() === blockedUserId.toString()
        );
        
        if (blockedUserSocket) {
            blockedUserSocket.emit('forceClearBlockCache', {
                blockedBy: blockerId,
                forceAll: true, // ⬅️ تنظيف كل cache الخاص به
                timestamp: new Date().toISOString()
            });
            
            // أيضاً إرسال تحديث لبيانات الحظر
            blockedUserSocket.emit('refreshBlockStatus', {
                action: 'blocked_by_user',
                blockerId: blockerId,
                blockerUsername: blocker.username
            });
            
            console.log(`[BLOCK NOTIFICATION] Sent to ${blockedUserId} (socket: ${blockedUserSocket.id})`);
        }
    } catch (socketError) {
        console.error('[BLOCK SOCKET ERROR]:', socketError);
    }
    
    // 3. إرسال للمستخدم الحالي أيضاً
    const blockerSocket = sockets.find(s => 
        s.user && s.user.id && s.user.id.toString() === blockerId.toString()
    );
    
    if (blockerSocket) {
        blockerSocket.emit('refreshBlockStatus', {
            action: 'you_blocked_user',
            blockedUserId: blockedUserId,
            blockedUsername: blockedUser.username
        });
    }
}

res.status(200).json({ 
    status: 'success', 
    message: 'تم حظر المستخدم بنجاح.',
    data: { blockedUserId }
});

    // --- ✅ إرسال حدث Socket لتحديث كلا الطرفين ---
try {
    const io = req.app.get('socketio');
    if (io) {
        // 1️⃣ إعداد بيانات الحدث
        const blockEventData = {
            action: 'user_blocked',
            blockerId: blockerId,
            blockedId: blockedUserId,
            blockerUsername: blocker.username,
            blockedUsername: blockedUser.username,
            timestamp: new Date().toISOString()
        };
        
        // 2️⃣ إرسال للمستخدم الحالي (الحاسر)
        const blockerSocket = io.sockets.sockets.get(req.user.socketId);
        if (blockerSocket) {
            blockerSocket.emit('friendshipUpdate', {
                ...blockEventData,
                forUser: 'blocker',
                message: `لقد حظرت ${blockedUser.username}`
            });
            
            // ✅ إرسال حدث خاص لتحديث البيانات
            blockerSocket.emit('forceRefreshUserData', {
                reason: 'you_blocked_user',
                userId: blockedUserId
            });
        }
        
        // 3️⃣ إرسال للمستخدم المحظور (إذا كان متصلاً)
        const sockets = await io.fetchSockets();
        const blockedUserSocket = sockets.find(sock => 
            sock.user && sock.user.id && sock.user.id.toString() === blockedUserId
        );
        
        if (blockedUserSocket) {
            blockedUserSocket.emit('friendshipUpdate', {
                ...blockEventData,
                forUser: 'blocked',
                message: `${blocker.username} حظرك`
            });
            
            // ✅ إرسال حدث خاص لتحديث البيانات
            blockedUserSocket.emit('forceRefreshUserData', {
                reason: 'you_were_blocked',
                userId: blockerId
            });
            
            console.log(`[BLOCK SOCKET] Sent update to blocked user: ${blockedUserId}`);
        }
        
        // 4️⃣ تنظيف Cache للجميع
        io.emit('clearBlockCache', {
            userId: blockerId,
            targetUserId: blockedUserId
        });
        
        console.log(`[BLOCK CONTROLLER] Sent updates to both users successfully`);
        
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

        // 1. البحث عن المستخدمين
        const unblocker = await User.findById(unblockerId);
        const blockedUser = await User.findById(blockedUserId);

        if (!unblocker) {
            return res.status(404).json({ 
                status: 'fail', 
                message: 'المستخدم غير موجود.' 
            });
        }

        if (!blockedUser) {
            return res.status(404).json({ 
                status: 'fail', 
                message: 'المستخدم المراد فك حظره غير موجود.' 
            });
        }

        // 2. التحقق إذا كان غير محظور
        if (!unblocker.blockedUsers.includes(blockedUserId)) {
            return res.status(400).json({ 
                status: 'fail', 
                message: 'هذا المستخدم غير محظور.' 
            });
        }

        // 3. فك الحظر من كلا الجانبين
        await Promise.all([
            User.findByIdAndUpdate(unblockerId, {
                $pull: { blockedUsers: blockedUserId }
            }),
            User.findByIdAndUpdate(blockedUserId, {
                $pull: { blockedBy: unblockerId }
            })
        ]);

        // 4. ⭐⭐ تحديث Socket و Cache ⭐⭐
        // 4. ⭐⭐ تحديث Socket و Cache والبروفايل المصغر ⭐⭐
if (req.app.get('io')) {
    const io = req.app.get('io');
    
    // أ. تنظيف cache للطرفين
    io.emit('clearBlockCache', {
        userId: unblockerId,
        targetUserId: blockedUserId
    });
    
    // ب. جلب جميع الـ Sockets المتصلة
    const sockets = await io.fetchSockets();
    
    // ج. إرسال إشعار للمستخدم الذي قام برفع الحظر
    const unblockerSocket = sockets.find(s => 
        s.user && s.user.id && s.user.id.toString() === unblockerId.toString()
    );
    
    if (unblockerSocket) {
        // 1. تنظيف cache المحلي
        unblockerSocket.emit('forceClearBlockCache', {
            blockedBy: blockedUserId,
            forceAll: true,
            timestamp: new Date().toISOString()
        });
        
        // 2. تحديث حالة الحظر
        unblockerSocket.emit('refreshBlockStatus', {
            action: 'you_unblocked_user',
            unblockedUserId: blockedUserId,
            unblockedUsername: blockedUser.username,
            message: `تم رفع الحظر عن ${blockedUser.username}`
        });
        
        // 3. ⭐⭐ إرسال حدث لتحديث البروفايل المصغر ⭐⭐
        unblockerSocket.emit('friendshipUpdate', {
            action: 'user_unblocked',
            unblockerId: unblockerId,
            unblockedId: blockedUserId,
            unblockedUsername: blockedUser.username,
            timestamp: new Date().toISOString(),
            source: 'unblock_action'
        });
        
        // 4. ⭐⭐ إرسال حدث خاص لتحديث البروفايل ⭐⭐
        unblockerSocket.emit('profileNeedsRefresh', {
            userId: blockedUserId,
            action: 'unblocked',
            newStatus: 'not_blocked',
            unblockerId: unblockerId,
            unblockerUsername: unblocker.username,
            timestamp: new Date().toISOString()
        });
        
        // 5. ⭐⭐ إرسال حدث خاص من الإعدادات ⭐⭐
        unblockerSocket.emit('unblockedFromSettings', {
            unblockerId: unblockerId,
            unblockedId: blockedUserId,
            unblockedUsername: blockedUser.username,
            timestamp: new Date().toISOString()
        });
        
        console.log(`[UNBLOCK] Sent profile refresh events to unblocker: ${unblockerId}`);
    }
    
    // د. إرسال إشعار للمستخدم الذي تم رفع الحظر عنه
    const blockedUserSocket = sockets.find(s => 
        s.user && s.user.id && s.user.id.toString() === blockedUserId.toString()
    );
    
    if (blockedUserSocket) {
        // تنظيف cache المحلي
        blockedUserSocket.emit('forceClearBlockCache', {
            blockedBy: unblockerId,
            forceAll: true,
            timestamp: new Date().toISOString()
        });
        
        // تحديث حالة الحظر
        blockedUserSocket.emit('refreshBlockStatus', {
            action: 'unblocked_by_user',
            unblockerId: unblockerId,
            unblockerUsername: unblocker.username,
            message: `${unblocker.username} رفع الحظر عنك`
        });
        
        console.log(`[UNBLOCK] Sent notification to unblocked user: ${blockedUserId}`);
    }
            // ﻫ. إرسال حدث عام لتحديث cache للجميع
        io.emit('blockCacheRefreshed', {
            userId1: unblockerId,
            userId2: blockedUserId,
            action: 'unblock',
            timestamp: new Date().toISOString()
        });
    }
    
    // ⭐⭐ جلب البيانات المحدثة للمستخدم ⭐⭐
    const updatedUser = await User.findById(unblockerId)
        .select('username profileImage balance level experience friends blockedUsers friendRequestsSent friendRequestsReceived')
        .lean();

    // 5. الرد الناجح مع البيانات المحدثة
    res.status(200).json({ 
        status: 'success', 
        message: 'تم فك حظر المستخدم بنجاح.',
        data: { 
            unblockedUserId: blockedUserId,
            unblockedUsername: blockedUser.username,
            timestamp: new Date().toISOString(),
            updatedUser: updatedUser  // ⭐ الإضافة المهمة
        }
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
