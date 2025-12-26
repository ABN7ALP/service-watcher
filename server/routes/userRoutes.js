// --- ملف: server/routes/userRoutes.js (النسخة النهائية الصحيحة) ---

const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');
const { upload } = require('../config/multer'); // ✅ المسار الصحيح

const router = express.Router();

// --- كل المسارات التالية محمية ---
router.use(authMiddleware);

// مسار لتحديث البيانات الأساسية (اسم المستخدم)
router.patch('/updateMe', userController.updateMe);

// مسار لتحديث كلمة المرور
router.patch('/updateMyPassword', userController.updateMyPassword);

// مسار لتحديث صورة الملف الشخصي
router.patch(
    '/updateProfilePicture',
    upload.single('profileImage'),
    userController.updateProfilePicture
);

module.exports = router;
