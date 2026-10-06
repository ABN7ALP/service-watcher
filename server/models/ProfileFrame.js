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
    // ✅ أسعار مختلفة حسب المدة — طلب صريح: 3 مدد قصيرة فقط (1/3/7 أيام) بدل المدد الطويلة
    // السابقة (7/30/365 يوماً)، يمكن تعديلها بحرية لكل إطار
    prices: {
        day1: { type: Number, required: true },
        day3: { type: Number, required: true },
        day7: { type: Number, required: true }
    }
}, { timestamps: true });

    

module.exports = mongoose.model('ProfileFrame', profileFrameSchema);
