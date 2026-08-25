const mongoose = require('mongoose');

const profileFrameSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    price: { type: Number, required: true, min: 0 },
    cssClass: { type: String, required: true }, // كلاس CSS ثابت معرف بملف الأنماط
    previewImage: String,
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('ProfileFrame', profileFrameSchema);
