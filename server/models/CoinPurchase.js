const mongoose = require('mongoose');

const coinPurchaseSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    method: { type: String, enum: ['sham_cash', 'visa', 'agent'], required: true },
    amountUSD: { type: Number, required: true, min: 1 },
    coinsAmount: { type: Number, required: true },
    status: {
        type: String,
        enum: ['pending_payment', 'pending_review', 'approved', 'rejected'],
        default: 'pending_payment'
    },
    receiptImage: String,
    transactionId: { type: String, unique: true },
    adminNotes: String,
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    processedAt: Date
}, { timestamps: true });

coinPurchaseSchema.index({ user: 1, status: 1, createdAt: -1 });

coinPurchaseSchema.pre('save', function(next) {
    if (!this.transactionId) {
        this.transactionId = `CP${Date.now()}${Math.floor(Math.random() * 10000)}`;
    }
    next();
});

module.exports = mongoose.model('CoinPurchase', coinPurchaseSchema);
