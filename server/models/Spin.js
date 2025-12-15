const mongoose = require('mongoose');

const spinSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    cost: {
        type: Number,
        default: 1
    },
    status: {
        type: String,
        enum: ['win', 'lose'],
        required: true
    },
    netResult: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        index: true,
        default: Date.now
    }
});

module.exports = mongoose.model('Spin', spinSchema);
