const express = require('express');
const coinPurchaseController = require('../controllers/coinPurchaseController');
const authMiddleware = require('../middleware/authMiddleware');
// 🛡️ إصلاح جذري (مراجعة أمنية — redteam-audit-1، البند #12، Low): approve/reject كانتا
// محميتين فقط بفحص محلي (if(!req.user.isAdmin)) داخل الدالة نفسها بدل بوابة adminAuth
// المشتركة التي تمر منها كل مسارات الإدارة الأخرى بهذا المشروع (راجع server/routes/admin.js)
// — ليست ثغرة فعلية حالياً (الفحص المحلي كان يرفض صحيحاً)، لكن نمط غير متّسق: أي مسار إداري
// جديد يُضاف لهذا الملف لاحقاً بلا نسخ الفحص يدوياً يبقى بلا أي حماية إدارية إطلاقاً
const adminAuth = require('../middleware/adminAuth');
const { chatUpload } = require('../utils/cloudinary');

const router = express.Router();
router.use(authMiddleware);

router.get('/info', coinPurchaseController.getPaymentInfo);
router.get('/my-pending', coinPurchaseController.getMyPendingPurchases);
router.post('/create', coinPurchaseController.createPurchaseRequest);
router.post('/buy-with-balance', coinPurchaseController.buyWithBalance);
router.post('/:purchaseId/receipt', chatUpload.single('file'), coinPurchaseController.uploadReceipt);

router.post('/:purchaseId/approve', adminAuth, coinPurchaseController.approvePurchase);
router.post('/:purchaseId/reject', adminAuth, coinPurchaseController.rejectPurchase);

module.exports = router;
