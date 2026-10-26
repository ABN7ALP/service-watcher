const mongoose = require('mongoose');

// 🛡️ شحن الكوينزات عبر شام كاش (feat/wallet-recharge-v1) — راجع depositIntentController.js.
// exactAmountCents يتضمّن سنتات فريدة (01–99) فوق المبلغ الأساسي: فهرس unique جزئي أدناه يضمن
// عدم تكرارها بين أي طلبين "مفتوحين" (awaiting_payment/submitted) بنفس اللحظة — ذرّياً على
// مستوى قاعدة البيانات (محاولة الإنشاء تفشل بـE11000 لا فحص-ثم-كتابة). txnNo فريد عالمياً عبر
// كل الحسابات (لا حساب آخر يمكنه استخدام نفس رقم عملية شام كاش). bonusLines لقطة محسوبة وقت
// الإنشاء (base/package/method/first_recharge) — لا تتأثر بتعديل إعدادات لاحق قبل الموافقة.
const bonusLineSchema = new mongoose.Schema({
    type: { type: String, enum: ['package', 'method', 'first_recharge'], required: true },
    coins: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true }
}, { _id: false });

const depositIntentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refCode: { type: String, required: true, unique: true },
    amountUsd: { type: Number, required: true, min: 0.01 },
    exactAmountCents: { type: Number, required: true },
    baseCoins: { type: Number, required: true },
    bonusLines: { type: [bonusLineSchema], default: [] },
    totalCoinsSnapshot: { type: Number, required: true },
    status: {
        type: String,
        enum: ['awaiting_payment', 'submitted', 'approved', 'rejected', 'expired'],
        default: 'awaiting_payment',
        index: true
    },
    txnNo: { type: String, default: undefined },
    receiptImage: { type: String, default: null },
    receiptHash: { type: String, default: null },
    riskFlags: { type: [String], default: [] },
    expiresAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    processedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null }
}, { timestamps: true });

depositIntentSchema.index({ user: 1, status: 1, createdAt: -1 });
// ✅ منع تكرار السنتات الفريدة بين أي طلبين "مفتوحين" فقط — طلب منتهٍ/مرفوض/مُعتمَد يُحرِّر رقمه
depositIntentSchema.index(
    { exactAmountCents: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ['awaiting_payment', 'submitted'] } } }
);
// ✅ فريد عالمياً عبر كل الحسابات — sparse لأن الطلبات بوضع awaiting_payment ليس لها txnNo بعد
depositIntentSchema.index({ txnNo: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('DepositIntent', depositIntentSchema);
