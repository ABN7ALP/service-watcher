// 📁 routes/wheel.js
const express = require('express');
const router = express.Router();
const wheelController = require('../controllers/wheelController');
const authMiddleware = require('../middleware/auth');

// 📊 إحصائيات العجلة (مسار عام للجميع)
router.get('/stats', wheelController.getWheelStats);

// 🔒 المسارات التالية فقط تتطلب تسجيل دخول
router.use(authMiddleware);

// 🎡 تدوير العجلة
router.post('/spin', wheelController.spinWheel);

module.exports = router;
