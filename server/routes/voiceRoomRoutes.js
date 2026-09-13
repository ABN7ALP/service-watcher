const express = require('express');
const rateLimit = require('express-rate-limit');
const voiceRoomController = require('../controllers/voiceRoomController');
const authMiddleware = require('../middleware/authMiddleware');
const { safeKeyGenerator } = require('../middleware/globalMiddleware');
const { chatUpload } = require('../utils/cloudinary');

const router = express.Router();
router.use(authMiddleware);

// 🛡️ محدد معدل مخصص لإنشاء الغرف — يمنع إغراق قائمة التصفح بغرف وهمية
const roomCreationLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 دقائق
    max: 6,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: safeKeyGenerator,
    message: { status: 'fail', message: 'إنشاء غرف كثيرة جداً خلال وقت قصير. حاول لاحقاً.' },
});

router.get('/rooms', voiceRoomController.listRooms);
router.get('/my-room', voiceRoomController.getMyRoom);
router.get('/background-shop', voiceRoomController.getBackgroundShop);
router.post('/rooms', roomCreationLimiter, voiceRoomController.createRoom);
router.get('/rooms/:id', voiceRoomController.getRoomById);
router.get('/rooms/:id/messages', voiceRoomController.getRoomMessages);
router.patch('/rooms/:id', voiceRoomController.updateRoom);
router.post('/rooms/:id/background', voiceRoomController.purchaseBackground);
router.get('/rooms/:id/music', voiceRoomController.getMusicLibrary);
router.post('/rooms/:id/music/upload', chatUpload.single('file'), voiceRoomController.uploadMusicTrack);

router.get('/', voiceRoomController.getVoiceRoomState);

module.exports = router;
