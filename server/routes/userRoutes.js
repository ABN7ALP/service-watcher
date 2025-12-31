// server/routes/userRoutes.js
const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const { upload } = require('../utils/cloudinary');

const router = express.Router();

// حماية جميع المسارات التالية
router.use(authMiddleware);

// مسارات تحديث بيانات المستخدم
router.patch('/updateUsername', userController.updateUsername);
router.patch('/updateProfilePicture', upload, userController.updateProfilePicture);

// مسارات جلب بيانات المستخدمين
router.get('/me/details', userController.getMeDetails);
router.get('/:id', userController.getUserById);
// ✅ مسار جديد لجلب بيانات المستخدم بسرعة (للملف الشخصي المصغر)
// ✅ مسار محسّن لجلب بيانات البروفايل المصغر مع حالة الصداقة
router.get('/mini-profile/:id', async (req, res) => {
    try {
        const currentUserId = req.user?.id;
        const targetUserId = req.params.id;

        const [targetUser, currentUser] = await Promise.all([
            User.findById(targetUserId).select('username profileImage customId level friends friendRequestsReceived friendRequestsSent'),
            currentUserId ? User.findById(currentUserId).select('friendRequestsSent friendRequestsReceived friends') : null
        ]);

        if (!targetUser) {
            return res.status(404).json({ status: 'fail', message: 'لم يتم العثور على المستخدم.' });
        }

        let friendshipStatus = 'none'; // none, friend, request_sent, request_received

        if (currentUser) {
            if (targetUser.friends.some(f => f.toString() === currentUserId)) {
                friendshipStatus = 'friend';
            } else if (currentUser.friendRequestsSent.includes(targetUserId)) {
                friendshipStatus = 'request_sent';
            } else if (currentUser.friendRequestsReceived.includes(targetUserId)) {
                friendshipStatus = 'request_received';
            }
        }

        res.status(200).json({
            status: 'success',
            data: {
                id: targetUser._id,
                username: targetUser.username,
                profileImage: targetUser.profileImage,
                customId: targetUser.customId,
                level: targetUser. level,
                friendsCount: targetUser.friends. length,
                // ✅ حالة الصداقة
                friendshipStatus: friendshipStatus, // none | friend | request_sent | request_received
                // ✅ بيانات إضافية للعرض
                displayState: {
                    canAddFriend: friendshipStatus === 'none',
                    isRequested: friendshipStatus === 'request_sent',
                    isFriend: friendshipStatus === 'friend',
                    hasRequest: friendshipStatus === 'request_received'
                }
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم.' });
    }
});
// مسارات الحظر
module.exports = router;
