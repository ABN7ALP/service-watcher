const express = require('express');
const musicController = require('../controllers/musicController');
const authMiddleware = require('../middleware/authMiddleware');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

// ✅ البحث متاح لأي مستخدم مسجّل دخول (يُستخدم من داخل أي غرفة صوتية)
router.get('/search', authMiddleware, musicController.searchTracks);

// ✅ الإضافة/الحذف حصراً لمسؤولي المنصة — المكتبة مُنسَّقة (لا رفع عام) لا مصدرها المستخدمون
router.post('/', adminAuth, musicController.addTrack);
router.delete('/:id', adminAuth, musicController.deleteTrack);

module.exports = router;
