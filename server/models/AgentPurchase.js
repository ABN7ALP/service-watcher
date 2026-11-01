const mongoose = require('mongoose');

// ✅ feat/agents-v1: سجل شحن مخزون وكيل واحد (إداري فقط) — txnNo فريد عالمياً بنفس قاعدة
// الإيداعات (لا تكرار محتمل لمرجع دفع حقيقي واحد بعدة سجلات)
const agentPurchaseSchema = new mongoose.Schema({
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
    usd: { type: Number, required: true, min: 0.01 },
    tierAtPurchase: { type: String, enum: ['bronze', 'silver', 'gold'], required: true },
    rateAtPurchase: { type: Number, required: true }, // كوينز لكل دولار لحظة الشحن
    coins: { type: Number, required: true }, // usd × rateAtPurchase — محفوظ لا يُعاد حسابه لاحقاً
    txnNo: { type: String, required: true, unique: true, trim: true },
    note: { type: String, default: '', maxlength: 200 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.model('AgentPurchase', agentPurchaseSchema);
