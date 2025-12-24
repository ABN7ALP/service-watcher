const mongoose = require('mongoose');

// --- استبدل messageSchema بهذا ---
const messageSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 300 // ✅ إضافة الحد الأقصى هنا أيضًا للأمان
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    room: {
        type: String,
        default: 'public-room',
    },
    // --- ✅ الحقل الجديد للرد ---
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message' // يشير إلى رسالة أخرى
    }
}, { timestamps: true });


const Message = mongoose.model('Message', messageSchema);
module.exports = Message;
