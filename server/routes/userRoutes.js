// server/routes/userRoutes.js
const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const { upload, roomCoverUpload } = require('../utils/cloudinary');

const router = express.Router();

// حماية جميع المسارات التالية
router.use(authMiddleware);

// مسارات تحديث بيانات المستخدم
router.patch('/updateUsername', userController.updateUsername);
router.patch('/updateProfilePicture', upload, userController.updateProfilePicture);
router.patch('/updateCoverImage', roomCoverUpload, userController.updateCoverImage); // ✅ غلاف مركز الملف الشخصي — يعيد استخدام نفس middleware رفع صور الغلاف (حقل coverImage)
router.patch('/updateProfile', userController.updateProfile); // ✅ تحديث موحَّد لحقول مركز الملف الشخصي
router.get('/online/public-room', userController.getOnlinePublicRoomUsers);

// بعد السطر router.patch('/updateProfilePicture', upload, userController.updateProfilePicture);
router.patch('/updateStatus', userController.updateStatus);  // ✅ أضف هذا السطر
// مسارات جلب بيانات المستخدمين
router.get('/me/details', userController.getMeDetails);
// ✅ متابعة/إلغاء متابعة شخص — قبل :id كي لا يُبتلع الجزء الثابت داخل باراميتر :id (غير
// وارد هنا لأنه مسار فرعي مختلف الشكل، لكن يبقى الترتيب الأوضح والأسلم دائماً)
router.post('/:id/follow', userController.followUser);
router.delete('/:id/follow', userController.unfollowUser);
router.post('/:id/poke', userController.pokeUser);
router.get('/:id/followers', userController.getFollowersList);
router.get('/:id/following', userController.getFollowingList);
router.get('/me/profile-visits', userController.getMyProfileVisits);
router.get('/discover/people', userController.discoverPeople);
router.get('/:id', userController.getUserById);
// ✅ مسار جديد لجلب بيانات المستخدم بسرعة (للملف الشخصي المصغر)
router.get('/:id/mini-profile', userController.getUserMiniProfile);
// مسارات الحظر
module.exports = router;
