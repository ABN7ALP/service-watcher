const express = require('express');
const friendController = require('../controllers/friendController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// حماية جميع المسارات التالية
router.use(authMiddleware);

router.post('/send-request/:userId', friendController.sendFriendRequest);
router.post('/accept-request/:userId', friendController.acceptFriendRequest);
router.post('/reject-request/:userId', friendController.rejectOrCancelRequest);
router.delete('/remove-friend/:userId', friendController.removeFriend);
router.get('/check-status/:userId', friendController.checkFriendshipStatus);

module.exports = router;
