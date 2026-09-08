const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
// ✅ محددات صارمة خاصة بالمصادقة (حماية من Brute-force)
const { loginLimiter, registerLimiter, passwordLimiter } = require('../middleware/globalMiddleware');

const router = express.Router();

router.post('/register', registerLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);

router.patch('/updateMyPassword', passwordLimiter, authMiddleware, authController.updatePassword);

module.exports = router;
