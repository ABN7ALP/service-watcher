const express = require('express');
const frameController = require('../controllers/frameController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// ✅ طلب صريح (استوديو الإطارات): عام بلا أي مصادقة — يستبدل frame-display.json الثابت +
// FRAME_ASSET_URLS المُضمَّنة بـapp.js سابقاً، مُخزَّن بـETag. مُثبَّت صراحةً قبل
// router.use(authMiddleware) أدناه كي يبقى هذا المسار بعينه بلا مصادقة بصرف النظر عنها
router.get('/display', frameController.getFrameDisplayConfig);

router.use(authMiddleware);

router.get('/shop', frameController.getFrameShop);
router.post('/purchase', frameController.purchaseFrame);
router.post('/equip', frameController.setActiveFrame);
router.post('/box/seen', frameController.markFrameBoxSeen);
// ✅ تفعيل/إلغاء التجديد التلقائي لإطار مملوك محدَّد — راجع checkAndExpireActiveFrame بالكونترولر
router.patch('/auto-renew', frameController.setFrameAutoRenew);

module.exports = router;
