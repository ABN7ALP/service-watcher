const mongoose = require('mongoose');

const chatBubbleSkinSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    price: { type: Number, required: true },
    cssClass: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('ChatBubbleSkin', chatBubbleSkinSchema);
