const mongoose = require('mongoose');

// ✅ صحة المحفظة (feat/wallet-ledger-v1): كل تشغيل لـwalletReconciliationJob يكتب مستنداً
// واحداً "ملخّص" (type:'summary' — عدد المستخدمين المفحوصين، عدد التعارضات، الالتزام
// بالدولار) + مستنداً واحداً لكل تعارض فعلي (type:'mismatch')، كلّها بنفس checkRunId. نفس نمط
// SystemHealth بالضبط (deleteMany ثم insertMany لكل تشغيل — اللوحة تعرض فقط آخر تشغيل)
const walletReconciliationSchema = new mongoose.Schema({
    checkRunId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['summary', 'mismatch'], required: true },

    // summary
    usersChecked: { type: Number, default: 0 },
    mismatchCount: { type: Number, default: 0 },
    liabilityUsd: { type: Number, default: 0 },
    cashReceivedUsd: { type: Number, default: 0 },

    // mismatch — sum(ledger) لمحفظة مستخدم واحدة يجب أن يُطابق رصيدها المخزَّن بالضبط
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    wallet: { type: String, default: '' },
    ledgerSum: { type: Number, default: null },
    cachedBalance: { type: Number, default: null },
    diff: { type: Number, default: null }, // cachedBalance - ledgerSum

    createdAt: { type: Date, default: Date.now }
});

walletReconciliationSchema.index({ checkRunId: 1 });

module.exports = mongoose.model('WalletReconciliation', walletReconciliationSchema);
