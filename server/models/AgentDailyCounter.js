const mongoose = require('mongoose');

// 🛡️ مراجعة أمنية (تدقيق ما بعد الفتح): الحد اليومي كان يُفحَص بتجميع (aggregate) خارج معاملة
// التحويل — عدّة تحويلات متزامنة تقرأ نفس "الإجمالي اليوم" القديم معاً فتتجاوز السقف جماعياً.
// هذا المستند هو العدّاد الذرّي الفعلي: فهرس فريد {agent, day} + زيادة ذرّية بشرط
// (totalCoins + المبلغ ≤ السقف) ضمن نفس معاملة التحويل نفسها — تجاوز السقف يُسقِط المعاملة
// كاملة (راجع agentController.transfer)
const agentDailyCounterSchema = new mongoose.Schema({
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
    day: { type: String, required: true }, // 'YYYY-MM-DD' بتوقيت UTC — مفتاح ثابت غير قابل للالتباس
    totalCoins: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

agentDailyCounterSchema.index({ agent: 1, day: 1 }, { unique: true });

module.exports = mongoose.model('AgentDailyCounter', agentDailyCounterSchema);
