const express = require('express');
const coinPurchaseController = require('../controllers/coinPurchaseController');
const authMiddleware = require('../middleware/authMiddleware');
const { chatUpload } = require('../utils/cloudinary');

const router = express.Router();
router.use(authMiddleware);

router.get('/info', coinPurchaseController.getPaymentInfo);
router.get('/my-pending', coinPurchaseController.getMyPendingPurchases);
router.post('/create', coinPurchaseController.createPurchaseRequest);
router.post('/:purchaseId/receipt', chatUpload.single('file'), coinPurchaseController.uploadReceipt);

router.post('/:purchaseId/approve', coinPurchaseController.approvePurchase);
router.post('/:purchaseId/reject', coinPurchaseController.rejectPurchase);

module.exports = router;
