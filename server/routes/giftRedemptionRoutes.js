const express = require('express');
const controller = require('../controllers/giftRedemptionController');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();
router.use(authMiddleware);
router.get('/summary', controller.getRedeemableGifts);
router.post('/redeem', controller.redeemGifts);
module.exports = router;
