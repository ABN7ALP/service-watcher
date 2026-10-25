const mongoose = require('mongoose');

// ✅ عدّاد مجهول الهوية (room-ux-v2 — بند 5): كل زيارة من متصفح تفشل أحد فحوص الميزات الحرجة
// بـpublic/js/browser-gate.js (قبل حتى تحميل app.js) تُسجَّل هنا — لا user/IP/أي معرّف شخصي،
// فقط عائلة/إصدار المتصفح والميزات الناقصة، لمعرفة حجم مشكلة "متصفحات قديمة" فعلياً بلوحة
// التحكم. TTL 90 يوماً (مراجعة PR #116 — كان شهراً واحداً) — سجل تشخيصي لا يحتاج أرشفة دائمة،
// لكن فترة أطول من ClientErrorLog المجاور لأن هذا عدّاد اتجاه بطيء التغيّر (توزيع متصفحات
// الزوّار) لا أخطاء فردية يُفترض معالجتها سريعاً
const clientCompatLogSchema = new mongoose.Schema({
    uaFamily: { type: String, default: 'unknown' },
    uaVersion: { type: String, default: '' },
    missingFeatures: [{ type: String }],
    // ✅ 'in-app' (مراجعة PR #116): متصفح تطبيق مدمج (إنستغرام/واتساب/سناب شات...) أو WebRTC
    // وحدها الناقصة (نفس أعراض متصفح تطبيق مدمج غالباً حتى لو لم يُكتشَف من UA) — يُعرَض له
    // "افتح برابط Chrome/Safari" لا "حدّث متصفحك"؛ 'legacy' المتصفحات القديمة الحقيقية فعلاً
    category: { type: String, enum: ['legacy', 'in-app'], default: 'legacy' },
    userAgent: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 }
});

clientCompatLogSchema.index({ createdAt: -1 });
clientCompatLogSchema.index({ uaFamily: 1, uaVersion: 1 });

module.exports = mongoose.model('ClientCompatLog', clientCompatLogSchema);
