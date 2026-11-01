const express = require('express');
const withdrawalController = require('../controllers/withdrawalController');
const withdrawalPinController = require('../controllers/withdrawalPinController');
const authMiddleware = require('../middleware/authMiddleware');
const { financialLimiter, pinResetLimiter } = require('../middleware/globalMiddleware');

const router = express.Router();
router.use(authMiddleware);

router.get('/my-withdrawals', withdrawalController.getMyWithdrawals);
router.post('/create', financialLimiter, withdrawalController.createWithdrawal);

// 🛡️ مراجعة الأمان v2 (البند 2) — رمز السحب + محفظة الصرف المحفوظة
router.get('/pin/status', withdrawalPinController.getStatus);
router.post('/pin/setup', financialLimiter, withdrawalPinController.setup);
router.post('/pin/change', financialLimiter, withdrawalPinController.change);
router.post('/pin/forgot/request-code', pinResetLimiter, withdrawalPinController.requestResetCode);
router.post('/pin/forgot/verify-code', pinResetLimiter, withdrawalPinController.verifyResetCode);
router.post('/payout-wallet', financialLimiter, withdrawalPinController.setPayoutWallet);

module.exports = router;
