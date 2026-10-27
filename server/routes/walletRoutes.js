const express = require('express');
const router = express.Router();
const depositIntentController = require('../controllers/depositIntentController');
const authMiddleware = require('../middleware/authMiddleware');
const { financialLimiter } = require('../middleware/globalMiddleware');
const { receiptUpload } = require('../utils/cloudinary');

router.use(authMiddleware);

router.get('/summary', depositIntentController.getSummary);
router.get('/history', depositIntentController.getHistory);
router.post('/deposits', financialLimiter, depositIntentController.createDeposit);
router.post('/deposits/:id/submit', financialLimiter, receiptUpload, depositIntentController.submitDeposit);
router.post('/deposits/:id/cancel', financialLimiter, depositIntentController.cancelDeposit);

module.exports = router;
