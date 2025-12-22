const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true,
        trim: true,
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // ربط الرسالة بنموذج المستخدم
        required: true,
    },
    room: {
        type: String,
        default: 'public-room', // حالياً، كل الرسائل في الغرفة العامة
    },
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;
