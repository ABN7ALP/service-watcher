const express = require('express');
const messageController = require('../controllers/messageController'); // سيتم إنشاؤه
const authMiddleware = require('../middleware/authMiddleware'); // سيتم إنشاؤه

const router = express.Router();

// تطبيق middleware المصادقة على كل المسارات في هذا الملف
router.use(authMiddleware);

// GET /api/messages/public-room
// مسار لجلب رسائل الغرفة العامة
router.get('/public-room', messageController.getPublicMessages);

module.exports = router;
