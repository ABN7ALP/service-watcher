const mongoose = require('mongoose');

// ✅ هدايا v2 — المرحلة 4: هدية يُصمّمها المستخدم بنفسه (صورة + اسم)، تدفع "رسم تصميم"
// (createCost) عند الإرسال للمراجعة، وتحتاج موافقة إدارية (status) قبل أن تصبح قابلة
// للإرسال فعلياً. createCost/sendPrice تُجمَّدان هنا عند الإنشاء من SystemSettings وقتها
// بالضبط (لا تُقرآن مجدداً عند كل إرسال لاحق) — فتغيير الإدارة لاحقاً للسعر الافتراضي لا
// يُغيّر بأثر رجعي سعر هدية صُمِّمت بالفعل، ولا يُغيّر رسم التصميم الذي دُفع بالفعل
const customGiftSchema = new mongoose.Schema({
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 12 },
    imageUrl: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    rejectReason: { type: String, default: null },
    createCost: { type: Number, required: true },
    sendPrice: { type: Number, required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null }
}, { timestamps: true });

customGiftSchema.index({ owner: 1, status: 1 });
customGiftSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('CustomGift', customGiftSchema);
