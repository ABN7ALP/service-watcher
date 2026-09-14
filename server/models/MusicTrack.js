const mongoose = require('mongoose');

// =====================================================
// ✅ مكتبة أغاني مشتركة للغرف الصوتية — بديل اعتماد كل غرفة على رفع المستخدمين ملفاتهم
// الخاصة فقط. تُملأ عبر لوحة التحكم/مسؤول (لا رفع عام)، وتُستعرض بالبحث داخل أي غرفة.
// =====================================================
const musicTrackSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 80 },
    artist: { type: String, default: '', trim: true, maxlength: 60 },
    url: { type: String, required: true },
    coverImage: { type: String, default: null },
    category: { type: String, default: 'عام', trim: true, maxlength: 30 },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

musicTrackSchema.index({ title: 'text', artist: 'text' });

// ✅ بحث نصي بالعنوان/الفنان + تصنيف اختياري — يُستخدم من نافذة موسيقى الغرفة
musicTrackSchema.statics.search = async function ({ q, category, page = 1, limit = 20 } = {}) {
    const query = { isActive: true };
    if (category) query.category = category;
    if (q && q.trim()) {
        const safe = q.trim().slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$or = [
            { title: { $regex: safe, $options: 'i' } },
            { artist: { $regex: safe, $options: 'i' } }
        ];
    }

    const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50);
    const safePage = Math.max(parseInt(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [tracks, total] = await Promise.all([
        this.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
        this.countDocuments(query)
    ]);

    return { tracks, total, page: safePage, pages: Math.ceil(total / safeLimit) };
};

module.exports = mongoose.model('MusicTrack', musicTrackSchema);
