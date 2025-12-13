// 📁 models/WheelSpin.js
const mongoose = require('mongoose');

const WheelSpinSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    cost: {
        type: Number,
        default: 1.00,
        required: true
    },
    prize: {
        type: Number,
        required: true
    },
    resultIndex: {
        type: Number,
        min: 0,
        max: 9,
        required: true
    },
    ipAddress: String,
    userAgent: String,
    netProfit: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// فهرسة للتحليلات
WheelSpinSchema.index({ userId: 1, createdAt: -1 });
WheelSpinSchema.index({ resultIndex: 1 });
WheelSpinSchema.index({ netProfit: 1 });

module.exports = mongoose.model('WheelSpin', WheelSpinSchema);
