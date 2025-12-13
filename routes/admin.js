// 📁 routes/admin.js - النسخة المحدثة
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// 📊 لوحة التحكم
router.get('/dashboard', adminController.getDashboardStats);

// 💰 إدارة الإيداعات
router.get('/deposits', adminController.getAllDeposits); // تحتاج لإنشائه
router.post('/deposits/manage', adminController.manageDeposits);

// 🏦 إدارة السحوبات
router.get('/withdrawals', adminController.getAllWithdrawals);
router.post('/withdrawals/manage', adminController.manageWithdrawal);

// 👥 إدارة المستخدمين
router.get('/users', adminController.getAllUsers); // تحتاج لإنشائه
router.post('/users/manage', adminController.manageUsers);

// ⚙️ إعدادات العجلة
router.get('/wheel/settings', adminController.getWheelSettings); // تحتاج لإنشائه
router.post('/wheel/settings', adminController.updateWheelSettings);

// 📈 التقارير
router.get('/reports/advanced', adminController.getAdvancedReports);

// 🔧 أدوات النظام
router.get('/system/queues', adminController.getQueueStats); // تحتاج لإنشائه
router.post('/system/cleanup', adminController.systemCleanup); // تحتاج لإنشائه

module.exports = router;
