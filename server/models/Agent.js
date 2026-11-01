const mongoose = require('mongoose');

// ✅ feat/agents-v1: وكلاء شحن معتمدون بمخزون مدفوع مسبقاً (نموذج Bigo) — المنصة لا تمنح
// كوينز بلا دفع مسبق إطلاقاً؛ خطأ الوكيل محصور بمخزونه هو (walletAgentInventory على User
// نفسه، لا على هذا المستند — هذا مستند الهوية/الحالة/الإحصاء فقط)
const agentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    displayName: { type: String, required: true, trim: true, maxlength: 40 },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    // null = الفئة تُحسَب تلقائياً من مشتريات المخزون آخر 30 يوماً (راجع agentTierService)
    tierOverride: { type: String, enum: [null, 'bronze', 'silver', 'gold'], default: null },
    ratingSum: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    totalTransfers: { type: Number, default: 0 },
    totalCoinsTransferred: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

agentSchema.virtual('averageRating').get(function () {
    return this.ratingCount > 0 ? this.ratingSum / this.ratingCount : 0;
});
agentSchema.set('toJSON', { virtuals: true });
agentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Agent', agentSchema);
