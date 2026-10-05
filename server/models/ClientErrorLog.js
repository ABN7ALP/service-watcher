const mongoose = require('mongoose');

// ✅ سجل الأخطاء التي يواجهها المستخدمون فعلياً بالواجهة — بطلب صريح: أي خطأ يُعرَض للمستخدم
// (أو يحدث بصمت دون توست) يصل هنا تلقائياً فيظهر بلوحة التحكم (سجلات الأخطاء)، بدل ضياعه في
// console المتصفح وحده حيث لا يراه أحد غير المستخدم نفسه. TTL شهر — سجل تشخيصي، لا يحتاج أرشفة دائمة
const clientErrorLogSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    username: { type: String, default: null },
    message: { type: String, required: true },
    context: { type: String, default: '' }, // 'notification' | 'uncaught' | 'unhandledrejection'
    url: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    stack: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }
});

clientErrorLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ClientErrorLog', clientErrorLogSchema);
