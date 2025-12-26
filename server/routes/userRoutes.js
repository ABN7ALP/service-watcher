// --- استبدل محتوى userRoutes.js بالكامل بهذا ---

const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const userController = require('../controllers/userController'); // يستورد الكائن كله
const { upload } = require('../middleware/multer');

const router = express.Router();

// --- كل المسارات التالية محمية ---
router.use(authMiddleware);

// مسار لتحديث البيانات الأساسية (اسم المستخدم)
router.patch('/updateMe', userController.updateMe);

// مسار لتحديث كلمة المرور
router.patch('/updateMyPassword', userController.updateMyPassword);

// --- ✅✅ الإصلاح هنا ---
// مسار لتحديث صورة الملف الشخصي
// نستخدم upload.single('profileImage') كـ middleware قبل الوصول إلى المتحكم
router.patch(
    '/updateProfilePicture',
    upload.single('profileImage'),
    userController.updateProfilePicture // ✅ الآن سيتم العثور على هذه الدالة
);

module.exports = router;
