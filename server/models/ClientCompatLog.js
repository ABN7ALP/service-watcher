const mongoose = require('mongoose');

// ✅ عدّاد مجهول الهوية (room-ux-v2 — بند 5): كل زيارة من متصفح تفشل أحد فحوص الميزات الحرجة
// بـpublic/js/browser-gate.js (قبل حتى تحميل app.js) تُسجَّل هنا — لا user/IP/أي معرّف شخصي،
// فقط عائلة/إصدار المتصفح والميزات الناقصة، لمعرفة حجم مشكلة "متصفحات قديمة" فعلياً بلوحة
// التحكم. نفس فلسفة ClientErrorLog (TTL شهر — سجل تشخيصي لا يحتاج أرشفة دائمة) المجاور تماماً
const clientCompatLogSchema = new mongoose.Schema({
    uaFamily: { type: String, default: 'unknown' },
    uaVersion: { type: String, default: '' },
    missingFeatures: [{ type: String }],
    userAgent: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }
});

clientCompatLogSchema.index({ createdAt: -1 });
clientCompatLogSchema.index({ uaFamily: 1, uaVersion: 1 });

module.exports = mongoose.model('ClientCompatLog', clientCompatLogSchema);
