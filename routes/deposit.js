// 📁 routes/deposit.js
const express = require('express');
const router = express.Router();
const depositController = require('../controllers/depositController');
const authMiddleware = require('../middleware/auth');
const upload = require('../config/upload');

// جميع المسارات محمية بتسجيل الدخول
router.use(authMiddleware);

// 📥 إنشاء طلب إيداع جديد (مع رفع صورة)
router.post('/request', upload.single('screenshot'), depositController.createDepositRequest);

// 📋 الحصول على طلباتي
router.get('/my-requests', depositController.getMyDeposits);

// 👀 تفاصيل طلب محدد
router.get('/:id', depositController.getDepositDetails);

module.exports = router;
