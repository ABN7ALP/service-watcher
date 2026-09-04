const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
        type: String,
        enum: ['ban_appeal', 'payment_issue', 'gift_issue', 'redemption_issue', 'frame_issue', 'general'],
        default: 'general'
    },
    subject: { type: String, required: true },
    message: { type: String, required: true, maxlength: 1000 },
    contextData: mongoose.Schema.Types.Mixed,
    status: { type: String, enum: ['pending', 'in_progress', 'resolved'], default: 'pending' },
    adminReply: String,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date
}, { timestamps: true });

supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
