const mongoose = require('mongoose');

// =====================================================
// ✅ صندوق اقتراحات/ملاحظات عام — يغطي اقتراحات الأغاني (من داخل مشغّل الغرفة) وأي ملاحظة
// عامة أخرى (زر "اقتراح" بقائمة الغرفة)، ليصل الكل كقائمة واحدة بلوحة التحكم مع إشعار فوري
// =====================================================
const suggestionSchema = new mongoose.Schema({
    type: { type: String, enum: ['song', 'general'], default: 'general' },
    message: { type: String, default: '', trim: true, maxlength: 500 },
    songTitle: { type: String, default: '', trim: true, maxlength: 80 },
    songArtist: { type: String, default: '', trim: true, maxlength: 60 },
    songUrl: { type: String, default: '', trim: true, maxlength: 300 },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceRoom', default: null },
    status: { type: String, enum: ['pending', 'reviewed', 'dismissed'], default: 'pending' },
    adminNote: { type: String, default: '', trim: true, maxlength: 300 },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Suggestion', suggestionSchema);
