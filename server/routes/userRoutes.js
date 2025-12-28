// ملف: server/routes/userRoutes.js

const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const { upload } = require('../utils/cloudinary');


const router = express.Router();

// حماية جميع المسارات التالية
router.use(authMiddleware);
router.get('/:id', userController.getUserById);
// ... (في userRoutes.js)
// --- ✅ أضف هذا المسار الجديد ---
router.get('/me/details', userController.getMeDetails);



// مسار لتحديث اسم المستخدم
// Express سيبحث عن خاصية 'updateUsername' في الكائن الذي تم تصديره من userController
router.patch('/updateUsername', userController.updateUsername);

// مسار لتحديث الصورة الشخصية
// سيتم تنفيذ 'upload' أولاً، ثم 'updateProfilePicture'
router.patch('/updateProfilePicture', upload, userController.updateProfilePicture);

module.exports = router;
