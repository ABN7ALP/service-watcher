const express = require('express');
const rateLimit = require('express-rate-limit');
const voiceRoomController = require('../controllers/voiceRoomController');
const authMiddleware = require('../middleware/authMiddleware');
const { safeKeyGenerator } = require('../middleware/globalMiddleware');

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
router.post('/rooms', roomCreationLimiter, voiceRoomController.createRoom);
router.get('/rooms/:id', voiceRoomController.getRoomById);
router.patch('/rooms/:id', voiceRoomController.updateRoom);

router.get('/', voiceRoomController.getVoiceRoomState);

module.exports = router;
