const express = require('express');
const withdrawalController = require('../controllers/withdrawalController');
const authMiddleware = require('../middleware/authMiddleware');
const { financialLimiter } = require('../middleware/globalMiddleware');

const router = express.Router();
router.use(authMiddleware);

router.get('/my-withdrawals', withdrawalController.getMyWithdrawals);
router.post('/create', financialLimiter, withdrawalController.createWithdrawal);

module.exports = router;
