const express = require('express');
const router = express.Router();
const depositController = require('../controllers/depositController');
const authMiddleware = require('../middleware/authMiddleware');
const { chatUpload } = require('../utils/cloudinary');

router.use(authMiddleware);

router.get('/wallet-info', depositController.getWalletInfo);
router.get('/my-deposits', depositController.getMyDeposits);
router.post('/create', depositController.createDepositRequest);
router.post('/:depositId/receipt', chatUpload.single('file'), depositController.uploadDepositReceipt);

module.exports = router;
