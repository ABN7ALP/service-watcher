const express = require('express');
const withdrawalController = require('../controllers/withdrawalController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

router.get('/my-withdrawals', withdrawalController.getMyWithdrawals);
router.post('/create', withdrawalController.createWithdrawal);

module.exports = router;
