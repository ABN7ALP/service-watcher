// 📁 routes/admin.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// 📊 لوحة التحكم الرئيسية
router.get('/dashboard', adminController.getDashboardStats);

// 📋 إدارة طلبات الإيداع
router.post('/deposits/manage', adminController.manageDeposits);

// ⚙️ إعدادات العجلة
router.post('/wheel/settings', adminController.updateWheelSettings);

module.exports = router;
