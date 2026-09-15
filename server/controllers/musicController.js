const MusicTrack = require('../models/MusicTrack');

// =====================================================
// ✅ GET /api/music/search — بحث/تصفّح مكتبة الأغاني المشتركة (لأي مستخدم مسجّل دخول)
// الإضافة/الحذف انتقلت بالكامل للوحة التحكم (راجع adminController: getMusicTracks/saveMusicTrack/deleteMusicTrack)
// =====================================================
exports.searchTracks = async (req, res) => {
    try {
        const { q, category, page, limit } = req.query;
        const result = await MusicTrack.search({ q, category, page, limit });
        res.json({ status: 'success', ...result });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
