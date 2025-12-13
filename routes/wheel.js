// 📁 routes/wheel.js
const express = require('express');
const router = express.Router();
const wheelController = require('../controllers/wheelController');
const authMiddleware = require('../middleware/auth');

// 🔒 جميع مسارات العجلة تتطلب تسجيل دخول
router.use(authMiddleware);

// 🎡 تدوير العجلة
router.post('/spin', wheelController.spinWheel);

// 📊 إحصائيات العجلة (يمكن جعلها عامة لاحقاً)
router.get('/stats', wheelController.getWheelStats);

module.exports = router;
