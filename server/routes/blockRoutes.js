const express = require('express');
const blockController = require('../controllers/blockController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// حماية جميع المسارات بالمصادقة
router.use(authMiddleware);

// POST /api/blocks/block/:userId       - حظر مستخدم
// POST /api/blocks/unblock/:userId     - فك حظر مستخدم
// GET  /api/blocks/blocked-list        - قائمة المحظورين
// GET  /api/blocks/check/:userId       - التحقق من حالة الحظر

router.post('/block/:userId', blockController.blockUser);
router.post('/unblock/:userId', blockController.unblockUser);
router.get('/blocked-list', blockController.getBlockedUsers);
router.get('/check/:userId', blockController.checkBlockStatus);
router.get('/mutual-status/:userId', blockController.getMutualBlockStatus);

module.exports = router;
