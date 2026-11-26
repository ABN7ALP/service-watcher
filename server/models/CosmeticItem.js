// ملف: server/models/CosmeticItem.js
// ✅ feat/gift-fx-and-cosmetics-base: نموذج عام واحد لفقاعات الدردشة وإعلانات الدخول معاً —
// render الآن cssClass فقط (تصاميم CSS)، مع imageUrl/videoUrl اختياريين لاحقاً بلا أي تغيير
// بنيوي. source يحدد من أين يُمنح العنصر (شراء بالمتجر، هدية ترحيب تلقائية، نادي معجبين حسب
// المستوى، أو علاقة الثنائي مستقبلاً) — راجع server/utils/cosmeticResolver.js للأولوية بينها
const mongoose = require('mongoose');

// 🛡️ feat/bubble-frames: نفس نمط isValidMediaUrl بـprivateChatController.js بالضبط — رابط
// Cloudinary الخاص بسحابتنا فقط (cloud_name من البيئة)، أو مسار محلي ثابت (يبدأ بـ"/" وحيدة،
// بلا "..") يُخدَّم عبر express.static(public) — لا أصل خارجي آخر مشروع إطلاقاً لإطار/زخرفة فقاعة
function isAllowedCosmeticAssetUrl(url) {
    if (url === null || url === undefined || url === '') return true;
    if (typeof url !== 'string' || url.length > 2000) return false;
    if (url.startsWith('/') && !url.startsWith('//') && !url.includes('..')) return true;
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!cloudName) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' &&
            parsed.hostname === 'res.cloudinary.com' &&
            parsed.pathname.startsWith(`/${cloudName}/`);
    } catch {
        return false;
    }
}

// 🛡️ feat/bubble-frames: textColor يصل كـstyle.color مباشرة بالعميل (app.js) — hex سداسي فقط
// (لا rgb()/اسم لون/أي شيء آخر قد يحمل محارف غريبة) يقفل أي سطح حقن محتمل عبر هذا الحقل
function isValidHexColor(v) {
    if (v === null || v === undefined || v === '') return true;
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

// ✅ شريحتا الإطار (9-slice حدّي عبر border-image) والزخرفة الزاوية الواحدة — _id:false (لا
// حاجة لمعرّف مستقل لكل منهما، هما حقلان مضمَّنان بعنصر الفقاعة فقط). كلاهما اختياري بالكامل
// (default: undefined بأسفل بالمخطط الأب) — فقاعة بلا frame تستمر بمسارها الحالي (CSS فقط)
// بلا أي تغيير؛ العميل (app.js) يتحقق من url فعلياً قبل تطبيق أي نمط إطار
const frameSchema = new mongoose.Schema({
    url: {
        type: String,
        default: null,
        validate: { validator: isAllowedCosmeticAssetUrl, message: 'رابط صورة الإطار يجب أن يكون من Cloudinary الخاص بنا أو مساراً محلياً ثابتاً' }
    },
    slice: {
        top: { type: Number, min: 0, max: 200, default: 50 },
        right: { type: Number, min: 0, max: 200, default: 50 },
        bottom: { type: Number, min: 0, max: 200, default: 50 },
        left: { type: Number, min: 0, max: 200, default: 50 }
    },
    borderWidth: { type: Number, min: 0, max: 60, default: 18 },
    padY: { type: Number, min: 0, max: 40, default: 9 },
    padX: { type: Number, min: 0, max: 60, default: 16 },
    textColor: {
        type: String,
        default: null,
        validate: { validator: isValidHexColor, message: 'لون النص يجب أن يكون hex سداسي صالح (مثال: #fde68a)' }
    }
}, { _id: false });

const ornamentSchema = new mongoose.Schema({
    url: {
        type: String,
        default: null,
        validate: { validator: isAllowedCosmeticAssetUrl, message: 'رابط صورة الزخرفة يجب أن يكون من Cloudinary الخاص بنا أو مساراً محلياً ثابتاً' }
    },
    anchor: { type: String, enum: ['top-start', 'top-end'], default: 'top-start' },
    width: { type: Number, min: 0, max: 200, default: 38 },
    height: { type: Number, min: 0, max: 200, default: 26 },
    offsetX: { type: Number, min: -100, max: 100, default: -2 },
    offsetY: { type: Number, min: -100, max: 100, default: -17 }
}, { _id: false });

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
    sortOrder: { type: Number, default: 0 },
    // ✅ feat/bubble-frames: صورة إطار (border-image) + زخرفة زاوية اختياريتان — لفقاعات
    // (type:'bubble') فقط عملياً، لكن لا قيد enum صريح هنا (مصدرا الحالتين مستقلّان تماماً،
    // وelement.entrance الحالي CSS فقط دوماً فلا يصل frame أبداً بالممارسة). default:undefined
    // يمنع Mongoose من إنشاء كائن فرعي فارغ تلقائياً لأي عنصر لم يُحدَّد له إطار إطلاقاً
    frame: { type: frameSchema, default: undefined },
    ornament: { type: ornamentSchema, default: undefined },
    reserveTop: { type: Number, min: 0, max: 60, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('CosmeticItem', cosmeticItemSchema);
module.exports.isAllowedCosmeticAssetUrl = isAllowedCosmeticAssetUrl;
module.exports.isValidHexColor = isValidHexColor;
