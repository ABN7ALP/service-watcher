const express = require('express');
const musicController = require('../controllers/musicController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// ✅ البحث متاح لأي مستخدم مسجّل دخول (يُستخدم من داخل أي غرفة صوتية)
// ✅ الإضافة/الحذف حصراً عبر لوحة التحكم الآن (راجع /api/admin/music-tracks) — المكتبة
// مُنسَّقة بالكامل من إدارة المنصة، لا رفع ولا إضافة مباشرة من المضيفين
router.get('/search', authMiddleware, musicController.searchTracks);

module.exports = router;
