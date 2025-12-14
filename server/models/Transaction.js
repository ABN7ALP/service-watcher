const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['deposit', 'withdraw', 'spin'],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'completed', 'win', 'lose'],
        default: 'pending'
    },
    fullName: {
        type: String
    },
    shamCashNumber: {
        type: String
    },
    receiptImage: {
        type: String // رابط Cloudinary
    },
    note: {
        type: String
    },
    adminNote: {
        type: String
    },
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    processedAt: {
        type: Date
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 أيام
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// إزالة الإيصالات القديمة تلقائياً
transactionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Transaction', transactionSchema);
