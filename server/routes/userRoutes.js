server/routes/userRoutes.js

const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const { upload } = require('../utils/cloudinary'); // ✅ استيراد middleware الرفع

const router = express.Router();

// حماية جميع المسارات التالية
router.use(authMiddleware);

// مسار لتحديث اسم المستخدم فقط
router.patch('/updateUsername', userController.updateUsername);

// ✅ مسار جديد ومخصص لرفع الصورة الشخصية
// سيتم تنفيذ middleware 'upload' أولاً، ثم 'updateProfilePicture'
router.patch('/updateProfilePicture', upload, userController.updateProfilePicture);

module.exports = router;
