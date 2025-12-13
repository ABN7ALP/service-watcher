// 📁 models/DepositRequest.js
const mongoose = require('mongoose');

const DepositRequestSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: [1, 'الحد الأدنى للإيداع هو 1 دولار']
    },
    senderName: {
        type: String,
        required: true,
        trim: true
    },
    transactionId: {
        type: String,
        required: true,
        unique: true
    },
    screenshot: {
        type: String, // مسار الصورة
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'cancelled'],
        default: 'pending'
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: Date,
    reviewNotes: String,
    adminNotes: String, // ملاحظات سرية للأدمن فقط
    paymentMethod: {
        type: String,
        enum: ['sham_kash', 'other'],
        default: 'sham_kash'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        default: () => new Date(+new Date() + 30 * 60 * 1000), // تنتهي بعد 30 دقيقة
        index: { expires: '1h' } // حذف تلقائي بعد ساعة
    }
});

// فهرسة للبحث السريع
DepositRequestSchema.index({ userId: 1, status: 1, createdAt: -1 });
DepositRequestSchema.index({ transactionId: 1 }, { unique: true });
DepositRequestSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('DepositRequest', DepositRequestSchema);
