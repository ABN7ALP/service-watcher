const express = require('express');
const giftController = require('../controllers/giftController');
const customGiftController = require('../controllers/customGiftController');
const authMiddleware = require('../middleware/authMiddleware');
const { customGiftUpload } = require('../utils/cloudinary');
const { financialLimiter } = require('../middleware/globalMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/shop', giftController.getGiftShop);
router.post('/send', giftController.sendGift);
// ✅ هدايا v2 — المرحلة 4: "صمّم هديتك" — رسم مالي حقيقي (financialLimiter نفس حارس الشحن/السحب)
router.post('/custom', financialLimiter, customGiftUpload, customGiftController.createCustomGift);
router.get('/leaderboard/top-senders', giftController.getTopSendersThisMonth);
router.get('/leaderboard/top-receivers', giftController.getTopReceiversThisMonth);
router.get('/user/:userId/summary', giftController.getUserGiftsSummary);
router.get('/user/:userId/contributors', giftController.getUserContributors);
router.post('/send-public', giftController.sendPublicGift);
router.post('/send-batch', giftController.sendGiftBatch);

module.exports = router;
