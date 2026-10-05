const mongoose = require('mongoose');

const profileFrameSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    cssClass: { type: String, required: true }, // كلاس CSS ثابت معرف بملف الأنماط
    previewImage: String,
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    // ✅ إطار خاص بالأدمن فقط (طلب صريح) — لا يُشترى إطلاقاً (isActive:false دوماً له)، ولا
    // يُفعَّل عبر ownedFrames العادية بل بفحص مباشر لـisAdmin بـsetActiveFrame؛ قابل للتفعيل/
    // الإزالة/التبديل من الأدمن نفسه بحرية تماماً كبقية الإطارات، لكن لا أحد غيره يقدر عليه
    adminOnly: { type: Boolean, default: false },
    // ✅ أسعار مختلفة حسب المدة (يمكن تعديلها بحرية لكل إطار)
    prices: {
        days7: { type: Number, required: true },
        days30: { type: Number, required: true },
        days365: { type: Number, required: true }
    }
}, { timestamps: true });

    

module.exports = mongoose.model('ProfileFrame', profileFrameSchema);
