const mongoose = require('mongoose');

const giftLogSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gift: { type: mongoose.Schema.Types.ObjectId, ref: 'Gift', required: true },
    giftName: { type: String, required: true },
    giftImage: String,
    quantity: { type: Number, default: 1, min: 1 },
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    redeemed: { type: Boolean, default: false }, // ✅ يمنع استبدال نفس الهدية مرتين
    context: {
        type: String,
        enum: ['private_chat', 'public_chat', 'profile'],
        default: 'private_chat'
    }
}, { timestamps: true });

giftLogSchema.index({ sender: 1, createdAt: -1 });
giftLogSchema.index({ receiver: 1, createdAt: -1 });
giftLogSchema.index({ createdAt: -1 });

// أعلى المرسلين خلال فترة زمنية معينة
giftLogSchema.statics.getTopSenders = async function(startDate, endDate, limit = 20) {
    return this.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: '$sender', totalSpent: { $sum: '$totalPrice' }, giftsCount: { $sum: '$quantity' } } },
        { $sort: { totalSpent: -1 } },
        { $limit: limit },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $project: {
            userId: '$_id', username: '$user.username', profileImage: '$user.profileImage',
            level: '$user.level', activeFrameClass: '$user.activeFrameClass', totalSpent: 1, giftsCount: 1
        }}
    ]);
};

giftLogSchema.statics.getTopReceivers = async function(startDate, endDate, limit = 20) {
    return this.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: '$receiver', totalReceived: { $sum: '$totalPrice' }, giftsCount: { $sum: '$quantity' } } },
        { $sort: { totalReceived: -1 } },
        { $limit: limit },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $project: {
            userId: '$_id', username: '$user.username', profileImage: '$user.profileImage',
            level: '$user.level', activeFrameClass: '$user.activeFrameClass', totalReceived: 1, giftsCount: 1
        }}
    ]);
};
const GiftLog = mongoose.model('GiftLog', giftLogSchema);
module.exports = GiftLog;
