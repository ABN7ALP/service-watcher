const withdrawalController = require('../controllers/withdrawalController');
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');

router.use(adminAuth);

// لوحة التحكم
router.get('/dashboard', adminController.getDashboardStats);

// المستخدمين
router.get('/users', adminController.getUsers);
router.get('/users/:userId', adminController.getUserDetails);
router.post('/users/:userId/ban', adminController.banUser);
router.post('/users/:userId/unban', adminController.unbanUser);
router.post('/users/:userId/set-agent', adminController.setAgentStatus);
router.post('/users/:userId/adjust-funds', adminController.adjustUserFunds);

// طلبات الشحن (الإيداعات)
router.get('/deposits', adminController.getDeposits);
router.post('/deposits/:transactionId/approve', adminController.approveDeposit);
router.post('/deposits/:transactionId/reject', adminController.rejectTransaction);

// شراء الكوينزات
router.get('/coin-purchases', adminController.getCoinPurchases);
router.post('/coin-purchases/:purchaseId/approve', adminController.approveCoinPurchase);
router.post('/coin-purchases/:purchaseId/reject', adminController.rejectCoinPurchase);

// طلبات السحب
router.get('/withdrawals', withdrawalController.getAllWithdrawals);
router.post('/withdrawals/:withdrawalId/review', withdrawalController.reviewWithdrawal);

// المعاملات المالية العامة
router.get('/transactions', adminController.getAllTransactions);

// التحديات
router.get('/battles', adminController.getBattles);
router.post('/battles/:battleId/force-end', adminController.forceEndBattle);

// الهدايا
router.get('/gifts', adminController.getGifts);
router.post('/gifts', adminController.saveGift);
router.put('/gifts/:giftId', adminController.saveGift);
router.delete('/gifts/:giftId', adminController.deleteGift);

// البلاغات
router.get('/reports', adminController.getReports);
router.post('/reports/:reportId/resolve', adminController.resolveReport);

// سجلات النظام
router.get('/logs', adminController.getLogs);

module.exports = router;
