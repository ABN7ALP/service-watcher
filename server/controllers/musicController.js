const MusicTrack = require('../models/MusicTrack');

// =====================================================
// ✅ GET /api/music/search — بحث/تصفّح مكتبة الأغاني المشتركة (لأي مستخدم مسجّل دخول)
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

// =====================================================
// ✅ POST /api/music — إضافة أغنية لمكتبة الغرف المشتركة (مسؤولو المنصة فقط)
// =====================================================
exports.addTrack = async (req, res) => {
    try {
        const { title, artist, url, coverImage, category } = req.body;

        const cleanTitle = String(title || '').trim();
        const cleanUrl = String(url || '').trim();
        if (!cleanTitle || cleanTitle.length > 80) {
            return res.status(400).json({ status: 'fail', message: 'عنوان الأغنية مطلوب (حتى 80 حرفاً)' });
        }
        if (!cleanUrl || !/^https?:\/\//.test(cleanUrl)) {
            return res.status(400).json({ status: 'fail', message: 'رابط ملف صوتي صالح (http/https) مطلوب' });
        }

        const track = await MusicTrack.create({
            title: cleanTitle,
            artist: String(artist || '').trim().slice(0, 60),
            url: cleanUrl,
            coverImage: coverImage || null,
            category: String(category || 'عام').trim().slice(0, 30),
            addedBy: req.admin.id
        });

        res.status(201).json({ status: 'success', track });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// =====================================================
// ✅ DELETE /api/music/:id — إزالة أغنية من المكتبة المشتركة (مسؤولو المنصة فقط)
// =====================================================
exports.deleteTrack = async (req, res) => {
    try {
        await MusicTrack.findByIdAndUpdate(req.params.id, { isActive: false });
        res.json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
