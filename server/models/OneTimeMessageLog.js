const mongoose = require('mongoose');

const oneTimeMessageLogSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

// ✅ حماية أساسية: منع إرسال أكثر من رسالة تجاوز واحدة لنفس العلاقة للأبد
oneTimeMessageLogSchema.index({ sender: 1, receiver: 1 }, { unique: true });

module.exports = mongoose.model('OneTimeMessageLog', oneTimeMessageLogSchema);
