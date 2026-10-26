const express = require('express');
const coinPurchaseController = require('../controllers/coinPurchaseController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

// ✅ شراء الكوينزات بالشحن الخارجي (شام كاش) انتقل بالكامل لـ/api/wallet — هذا المسار الوحيد
// المتبقي هنا هو التحويل الداخلي بين رصيد المستخدم الدولاري وكوينزه (لا شحن خارجي، لا مراجعة إدارية)
router.post('/buy-with-balance', coinPurchaseController.buyWithBalance);

module.exports = router;
