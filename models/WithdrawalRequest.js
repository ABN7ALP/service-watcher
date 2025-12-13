// 📁 models/WithdrawalRequest.js
const mongoose = require('mongoose');

const WithdrawalRequestSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: [10, 'الحد الأدنى للسحب هو 10 دولار'] // كما طلبت
    },
    paymentMethod: {
        type: String,
        enum: ['sham_kash', 'bank_transfer', 'other'],
        default: 'sham_kash',
        required: true
    },
    accountDetails: {
        type: mongoose.Schema.Types.Mixed, // بيانات الحساب (رقم هاتف، اسم، إلخ)
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'rejected', 'cancelled'],
        default: 'pending'
    },
    transactionId: String, // رقم المعاملة بعد الإرسال
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: Date,
    reviewNotes: String,
    adminNotes: String,
    completedAt: Date,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// فهرسة
WithdrawalRequestSchema.index({ userId: 1, status: 1, createdAt: -1 });
WithdrawalRequestSchema.index({ status: 1, createdAt: 1 });
WithdrawalRequestSchema.index({ transactionId: 1 }, { sparse: true });

module.exports = mongoose.model('WithdrawalRequest', WithdrawalRequestSchema);
