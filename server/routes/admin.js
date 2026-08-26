const withdrawalController = require('../controllers/withdrawalController');
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');

router.use(adminAuth);

router.get('/dashboard', adminController.getDashboardStats);
router.get('/users', adminController.getUsers);
router.get('/users/:userId', adminController.getUserDetails);
router.post('/users/:userId/ban', adminController.banUser);
router.post('/users/:userId/unban', adminController.unbanUser);
router.get('/withdrawals', withdrawalController.getAllWithdrawals);
router.post('/withdrawals/:withdrawalId/review', withdrawalController.reviewWithdrawal);
router.post('/users/:userId/set-agent', adminController.setAgentStatus); // ✅ سنضيفها بالفقرة 4

module.exports = router;
