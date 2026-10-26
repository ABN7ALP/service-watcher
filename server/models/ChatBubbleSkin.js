const mongoose = require('mongoose');

const chatBubbleSkinSchema = new mongoose.Schema({
    // ✅ علم استئناف تضخيم ×10 لهذا المستند
    redenominatedV1: { type: Boolean, default: false },
    name: { type: String, required: true, unique: true },
    price: { type: Number, required: true },
    cssClass: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('ChatBubbleSkin', chatBubbleSkinSchema);
