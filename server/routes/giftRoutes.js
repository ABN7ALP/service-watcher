const express = require('express');
const giftController = require('../controllers/giftController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/shop', giftController.getGiftShop);
router.post('/send', giftController.sendGift);
router.get('/leaderboard/top-senders', giftController.getTopSendersThisMonth);
router.get('/leaderboard/top-receivers', giftController.getTopReceiversThisMonth);
router.post('/send-public', giftController.sendPublicGift);

module.exports = router;
