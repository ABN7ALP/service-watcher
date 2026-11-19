// ملف: server/models/CosmeticItem.js
// ✅ feat/gift-fx-and-cosmetics-base: نموذج عام واحد لفقاعات الدردشة وإعلانات الدخول معاً —
// render الآن cssClass فقط (تصاميم CSS)، مع imageUrl/videoUrl اختياريين لاحقاً بلا أي تغيير
// بنيوي. source يحدد من أين يُمنح العنصر (شراء بالمتجر، هدية ترحيب تلقائية، نادي معجبين حسب
// المستوى، أو علاقة الثنائي مستقبلاً) — راجع server/utils/cosmeticResolver.js للأولوية بينها
const mongoose = require('mongoose');

const cosmeticItemSchema = new mongoose.Schema({
    type: { type: String, enum: ['bubble', 'entrance'], required: true },
    name: { type: String, required: true },
    // ✅ التصميم الفعلي الآن: صنف CSS جاهز بـinput.css (bb/entr بالنموذج الأولي). imageUrl/
    // videoUrl تبقى فارغة حالياً — محجوزة لتصاميم مستقبلية (رسوم متحركة/فيديو) بلا أي تغيير بالنموذج
    cssClass: { type: String, required: true },
    imageUrl: { type: String, default: null },
    videoUrl: { type: String, default: null },
    source: { type: String, enum: ['shop', 'welcome', 'couple', 'fanclub'], required: true },
    // ✅ شراء المتجر فقط: مدد متعددة (7/30 يوماً مثلاً) بسعر مستقل لكل مدة — فارغة لأي مصدر آخر
    durations: [{
        days: { type: Number, required: true },
        price: { type: Number, required: true }
    }],
    // ✅ مصدر "نادي المعجبين" فقط: المستوى الأدنى لهذا التصميم بنادي المضيف (5/9/13/17 — نفس
    // عتبات fanClubLevels.js الحالية بالضبط). يُحسَب حياً من عضوية المستخدم، لا يُشترى ولا يُملَك
    fanClubTierLevel: { type: Number, default: null },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('CosmeticItem', cosmeticItemSchema);
