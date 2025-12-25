const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware'); // ✅ تأكد من استيراد هذا

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);

router.patch('/updateMyPassword', authMiddleware, authController.updatePassword);

module.exports = router;
