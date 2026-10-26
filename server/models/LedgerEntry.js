const mongoose = require('mongoose');

// ✅ دفتر الأستاذ (feat/wallet-ledger-v1): append-only بشكل صارم — المصدر الوحيد الموثوق لكل
// رصيد بالتطبيق. لا يُكتَب إليه إلا عبر server/utils/walletService.js (الدالة الوحيدة المخوَّلة
// بتغيير أي رصيد). التصحيحات تكون قيد 'adjustment' جديداً من الإدارة فقط، لا تعديلاً على قيد قائم
const LEDGER_WALLETS = ['coins_paid', 'coins_bonus', 'beans_w', 'beans_p', 'usd_cents'];
const LEDGER_TYPES = [
    'deposit', 'withdraw', 'refund', 'gift_send', 'gift_receive', 'redeem', 'bonus',
    'opening_balance', 'adjustment', 'agent_transfer', 'custom_gift_fee', 'custom_gift_refund',
    'coin_purchase', 'frame_purchase', 'pk_reward', 'fan_club_join', 'purchase'
];

const ledgerEntrySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    wallet: { type: String, enum: LEDGER_WALLETS, required: true },
    delta: {
        type: Number,
        required: true,
        validate: { validator: Number.isInteger, message: 'delta يجب أن يكون عدداً صحيحاً' }
    },
    balanceAfter: { type: Number, required: true },
    type: { type: String, enum: LEDGER_TYPES, required: true },
    refType: { type: String, default: null },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // ✅ UNIQUE: يضمن أن إعادة محاولة نفس العملية (شبكة متقطعة، عميل أعاد الإرسال) لا تُطبَّق
    // مرتين أبداً — walletService.post يتحقق من هذا الفهرس قبل أي $inc فعلي
    idempotencyKey: { type: String, required: true, unique: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now }
});

ledgerEntrySchema.index({ user: 1, wallet: 1, createdAt: -1 });
ledgerEntrySchema.index({ refType: 1, refId: 1 });

// 🛡️ append-only صارم على مستوى النموذج: لا تعديل ولا حذف لأي قيد منشأ، بصرف النظر عن أسلوب
// الاستدعاء (استعلام ساكن أو مستند)، منعاً لأي تصحيح صامت يُفقِد مطابقة المحفظة مصداقيتها
const BLOCK_MESSAGE = 'LedgerEntry append-only: سجلات دفتر الأستاذ لا تُعدَّل ولا تُحذَف — أنشئ قيد "adjustment" جديداً بدلاً من ذلك';
function blockMutation(next) { next(new Error(BLOCK_MESSAGE)); }
['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndRemove', 'replaceOne'].forEach((hook) => {
    ledgerEntrySchema.pre(hook, { document: true, query: true }, blockMutation);
});
ledgerEntrySchema.pre('save', function (next) {
    if (!this.isNew) return blockMutation(next);
    next();
});

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
module.exports.LEDGER_WALLETS = LEDGER_WALLETS;
module.exports.LEDGER_TYPES = LEDGER_TYPES;
