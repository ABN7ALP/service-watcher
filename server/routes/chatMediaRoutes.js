const express = require('express');
const chatMediaController = require('../controllers/chatMediaController');
const authMiddleware = require('../middleware/authMiddleware');
const { chatUpload } = require('../utils/cloudinary');

const router = express.Router();

// حماية جميع المسارات بالمصادقة
router.use(authMiddleware);

// POST /api/chat-media/image    - رفع صورة
// POST /api/chat-media/voice    - رفع رسالة صوتية
// POST /api/chat-media/video    - رفع فيديو
// DELETE /api/chat-media/delete - حذف وسائط

router.post('/image', 
    chatUpload.single('file'),
    chatMediaController.uploadImage
);

router.post('/voice',
    chatUpload.single('file'),
    chatMediaController.uploadVoice
);

router.post('/video',
    chatUpload.single('file'),
    chatMediaController.uploadVideo
);

router.delete('/delete',
    chatMediaController.deleteMedia
);

module.exports = router;
