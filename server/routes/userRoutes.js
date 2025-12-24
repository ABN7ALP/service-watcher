// ملف: server/routes/userRoutes.js

const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// حماية جميع المسارات التالية بالمصادقة
router.use(authMiddleware);

router.patch('/updateMe', userController.updateMe);

module.exports = router;
