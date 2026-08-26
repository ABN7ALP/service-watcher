const mongoose = require('mongoose');

const profileFrameSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    cssClass: { type: String, required: true }, // كلاس CSS ثابت معرف بملف الأنماط
    previewImage: String,
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

    // ✅ أسعار مختلفة حسب المدة (يمكن تعديلها بحرية لكل إطار)
    prices: {
        days7: { type: Number, required: true },
        days30: { type: Number, required: true },
        days365: { type: Number, required: true }
    },

module.exports = mongoose.model('ProfileFrame', profileFrameSchema);
