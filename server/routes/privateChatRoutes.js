const express = require('express');
const privateChatController = require('../controllers/privateChatController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// حماية جميع المسارات بالمصادقة
router.use(authMiddleware);

// GET /api/private-chat/chat/:userId      - إنشاء/جلب دردشة مع مستخدم
// POST /api/private-chat/message          - إرسال رسالة
// GET /api/private-chat/chats             - قائمة الدردشات
// PUT /api/private-chat/message/status    - تحديث حالة الرسالة
// DELETE /api/private-chat/message        - حذف رسالة
// POST /api/private-chat/report           - الإبلاغ عن رسالة

router.get('/chat/:userId', privateChatController.getOrCreateChat);
router.post('/message', privateChatController.sendMessage);
router.get('/chats', privateChatController.getChatList);
router.put('/message/status', privateChatController.updateMessageStatus);
router.delete('/message', privateChatController.deleteMessage);
router.post('/report', privateChatController.reportMessage);
router.post('/message/media', privateChatController.sendMediaMessage);


module.exports = router;
