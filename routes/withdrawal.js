// 📁 routes/withdrawal.js
const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawalController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// 📤 تقديم طلب سحب جديد
router.post('/request', withdrawalController.createWithdrawalRequest);

// 📋 طلبات السحب الخاصة بي
router.get('/my-requests', withdrawalController.getMyWithdrawals);

// 📊 إحصائيات السحب
router.get('/stats', withdrawalController.getWithdrawalStats);

// ❌ إلغاء طلب سحب
router.post('/:id/cancel', withdrawalController.cancelWithdrawal);

module.exports = router;
