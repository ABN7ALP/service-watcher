const mongoose = require('mongoose');

const oneTimeMessageLogSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    wasPaid: { type: Boolean, default: false } // false = الرسالة المجانية الأولى، true = رسالة إضافية مدفوعة
}, { timestamps: true });

oneTimeMessageLogSchema.index({ sender: 1, receiver: 1 });

module.exports = mongoose.model('OneTimeMessageLog', oneTimeMessageLogSchema);
