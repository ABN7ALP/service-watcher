// 📁 models/Transaction.js
const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['deposit', 'withdrawal', 'spin', 'bonus', 'penalty'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'completed'
    },
    referenceId: String, // رقم مرجعي للعملية
    metadata: mongoose.Schema.Types.Mixed, // بيانات إضافية
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// فهرسة للبحث السريع
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ type: 1, status: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
