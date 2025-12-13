// 📁 routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// 🔐 المسارات العامة (لا تتطلب تسجيل دخول)
router.post('/register', authController.register);
router.post('/login', authController.login);

// 🔒 المسارات المحمية (تتطلب تسجيل دخول)
router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router;
