const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const clientCompatController = require('../controllers/clientCompatController');
const { safeKeyGenerator } = require('../middleware/globalMiddleware');

// 🛡️ طلب صريح: نقطة عامة بلا تسجيل دخول — محدودة المعدل صراحة (نفس نمط roomCreationLimiter
// بـvoiceRoomRoutes.js) كي لا تُستغَل لإغراق قاعدة البيانات بسجلات وهمية متكررة من نفس الزائر
const clientCompatLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 دقائق
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: safeKeyGenerator,
    message: { status: 'fail' }
});

// بلا authMiddleware عمداً — راجع تعليق clientCompatController.reportClientCompat
router.post('/', clientCompatLimiter, clientCompatController.reportClientCompat);

module.exports = router;
