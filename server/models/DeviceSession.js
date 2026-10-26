const mongoose = require('mongoose');

// ✅ خدمة كشف الحسابات المرتبطة (feat/wallet-ledger-v1): سجل خفيف لكل تسجيل دخول (HTTP) أو
// اتصال socket ناجح — معرّف جهاز (من localStorage بالعميل) + IP. TTL 30 يوماً، يكفي لرصد
// الربط ضمن نافذة 24 ساعة المطلوبة بلا تراكم غير محدود
const deviceSessionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId: { type: String, default: null },
    ip: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }
});

deviceSessionSchema.index({ user: 1, createdAt: -1 });
deviceSessionSchema.index({ deviceId: 1 });
deviceSessionSchema.index({ ip: 1 });

module.exports = mongoose.model('DeviceSession', deviceSessionSchema);
