const mongoose = require('mongoose');

const giftRedemptionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sourceGiftLogIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'GiftLog', required: true }],
    originalCoinsValue: { type: Number, required: true },
    redeemedTo: { type: String, enum: ['balance', 'coins'], required: true },
    redemptionRate: { type: Number, default: 0.90 },
    finalAmount: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model('GiftRedemption', giftRedemptionSchema);
