const mongoose = require('mongoose');

// ✅ صحة النظام (chore/dependency-health): كل تشغيل لفحص `npm outdated`/`npm audit` يكتب مستنداً
// واحداً لكل نتيجة (حزمة قديمة، ثغرة، أو خطأ تنفيذ)، وكلّها تحمل نفس checkRunId لتمييز دفعة
// التشغيل. لا TTL هنا عمداً — dependencyHealthJob يحذف نتائج التشغيل السابق قبل إدراج الجديد
// (deleteMany ثم insertMany) لأن لوحة التحكم تعرض فقط الحالة الحالية، لا تاريخاً تراكمياً
const systemHealthSchema = new mongoose.Schema({
    checkRunId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['outdated', 'vulnerability', 'error'], required: true },

    // outdated
    package: { type: String, default: '' },
    current: { type: String, default: '' },
    wanted: { type: String, default: '' },
    latest: { type: String, default: '' },
    isMajorUpdate: { type: Boolean, default: false },

    // vulnerability
    severity: { type: String, enum: ['critical', 'high', 'moderate', 'low', 'info', null], default: null },
    advisoryTitle: { type: String, default: '' },
    advisoryUrl: { type: String, default: '' },

    // error (npm/network unavailable, timeout, etc.)
    source: { type: String, enum: ['outdated', 'audit', null], default: null },
    errorMessage: { type: String, default: '' },

    createdAt: { type: Date, default: Date.now }
});

systemHealthSchema.index({ checkRunId: 1 });
systemHealthSchema.index({ type: 1, severity: 1 });

module.exports = mongoose.model('SystemHealth', systemHealthSchema);
