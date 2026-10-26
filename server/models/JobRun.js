const mongoose = require('mongoose');

// ✅ حجز ذرّي لتنفيذ مهمة دورية مرة واحدة فقط لكل نافذة زمنية (job + weekStart) — يمنع
// fanClubWeeklyFrameJob (وأي مهمة مشابهة لاحقاً) من إعادة معالجة نفس الأسبوع بعد كل نشر/إعادة
// تشغيل للسيرفر (كانت الحالة محفوظة بمتغيّر ذاكرة محلي lastProcessedWeekStartMs فقط، يُصفَّر
// عند أي إعادة تشغيل). فهرس unique على (job, weekStart) هو الضمان الفعلي: إدراج ثانٍ لنفس
// المفتاح يصطدم به فوراً (E11000)، بغض النظر عن تزامن نسخ متعددة من السيرفر
const jobRunSchema = new mongoose.Schema({
    job: { type: String, required: true },
    weekStart: { type: Date, required: true },
    claimedAt: { type: Date, default: Date.now },
    // ✅ 'running'->'completed' (مهام قابلة للاستئناف كالتضخيم ×10) — مهام أخرى (كـ
    // fanClubWeeklyFrameJob) لا تضع هذا الحقل إطلاقاً، فيبقى undefined لها كما كان دوماً
    status: { type: String, enum: ['running', 'completed'] }
});

jobRunSchema.index({ job: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('JobRun', jobRunSchema);
