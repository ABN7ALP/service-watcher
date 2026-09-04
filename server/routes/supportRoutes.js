const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/ban-appeal', supportController.createBanAppeal); // عام بدون مصادقة
router.post('/tickets', authMiddleware, supportController.createTicket);

module.exports = router;
