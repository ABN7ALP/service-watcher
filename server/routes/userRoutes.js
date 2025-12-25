// ملف: server/routes/userRoutes.js

const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const { upload } = require('../utils/cloudinary');

const router = express.Router();

// حماية جميع المسارات التالية
router.use(authMiddleware);

// ✅✅ الإصلاح: استخدام اسم الدالة الصحيح 'updateUsername'
router.patch('/updateUsername', userController.updateUsername);

// ✅✅ الإصلاح: استخدام اسم الدالة الصحيح 'updateProfilePicture'
router.patch('/updateProfilePicture', upload, userController.updateProfilePicture);

module.exports = router;
