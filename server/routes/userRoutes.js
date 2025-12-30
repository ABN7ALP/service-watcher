// server/routes/userRoutes.js
const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const { upload } = require('../utils/cloudinary');

const router = express.Router();

// حماية جميع المسارات التالية
router.use(authMiddleware);

// --- ✅ تم تصحيح طريقة استدعاء الدوال هنا ---
// مسارات تحديث بيانات المستخدم
router.patch('/updateUsername', userController.updateUsername);
router.patch('/updateProfilePicture', upload, userController.updateProfilePicture);

// مسارات جلب بيانات المستخدمين
router.get('/me/details', userController.getMeDetails);
router.get('/:id', userController.getUserById);

// (مسارات الحظر سيتم إضافتها لاحقًا هنا)

module.exports = router;
