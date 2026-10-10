const express = require('express');
const frameController = require('../controllers/frameController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

router.get('/shop', frameController.getFrameShop);
router.post('/purchase', frameController.purchaseFrame);
router.post('/equip', frameController.setActiveFrame);
router.post('/box/seen', frameController.markFrameBoxSeen);
// ✅ تفعيل/إلغاء التجديد التلقائي لإطار مملوك محدَّد — راجع checkAndExpireActiveFrame بالكونترولر
router.patch('/auto-renew', frameController.setFrameAutoRenew);

module.exports = router;
