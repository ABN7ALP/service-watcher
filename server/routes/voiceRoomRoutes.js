const express = require('express');
const voiceRoomController = require('../controllers/voiceRoomController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

router.get('/', voiceRoomController.getVoiceRoomState);

module.exports = router;
