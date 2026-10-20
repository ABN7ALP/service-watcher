const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

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
    // ✅ حدود دفاع-بعمق على مستوى المخطط (المصدر الرسمي للتحقق هو parsePricesInput بـ
    // frameController.js — أرقام صحيحة فقط، راجع التعليق هناك) — نفس سقف 10 ملايين
    prices: {
        day1: { type: Number, required: true, min: 0, max: 10000000 },
        day3: { type: Number, required: true, min: 0, max: 10000000 },
        day7: { type: Number, required: true, min: 0, max: 10000000 }
    },
    // ✅ طلب صريح (استوديو الإطارات بلوحة التحكم): أصل الإطار الفعلي (متحرك webp + نسخة ثابتة
    // لمستخدمي prefers-reduced-motion — راجع .avatar__frame--static بـinput.css) يعيشان الآن
    // بالمستند نفسه بدل خريطة FRAME_ASSET_URLS الثابتة بـapp.js — الأدمن يرفعهما عبر الاستوديو
    // بلا أي تعديل كود. الإطارات الـ11 الأصلية تُملأ هذان الحقلان لها تلقائياً عبر
    // seedDisplayDefaults أدناه (مسارها المحلي الثابت القديم بالضبط — لا رفع Cloudinary لها)
    assetUrl: String,
    staticUrl: String,
    // ✅ نفس القيم الخمس المستخدَمة فعلياً بـframeDisplayStyle/hostCrownTopAttr بـapp.js —
    // الآن قابلة للضبط من استوديو الإطارات مباشرة بدل تحرير public/assets/frames/frame-display.json
    // يدوياً. الاحتياطيات هنا تطابق "_default" بذاك الملف حرفياً (راجع seedDisplayDefaults)
    // ✅ حدود دفاع-بعمق على مستوى المخطط مطابقة تماماً لـDISPLAY_BOUNDS بـframeController.js
    // (المصدر الرسمي للرفض الواضح بالعربية — هذه فقط سقف أخير لو وصلت قيمة من مسار آخر)
    display: {
        frameScale: { type: Number, default: 1.45, min: 0.8, max: 2.4 },
        avatarScale: { type: Number, default: 0.8, min: 0.4, max: 1 },
        offsetX: { type: Number, default: 0, min: -0.3, max: 0.3 },
        offsetY: { type: Number, default: 0, min: -0.3, max: 0.3 },
        crownTop: { type: Number, default: 0.45, min: 0.2, max: 1 }
    }
}, { timestamps: true });

// ✅ تهيئة idempotent — تُستدعى عند كل إقلاع خادم (راجع server.js)، آمنة بالتشغيل المتكرر:
// تملأ فقط الحقول الناقصة (assetUrl/staticUrl/display) لأي مستند لم تُضبَط له بعد، ولا تلمس
// إطلاقاً أي مستند مُعدَّل مسبقاً من الأدمن (عبر استوديو الإطارات) — لا تُكرِّر الملء، ولا
// تُفرِّغ قيماً مقصودة. تقرأ frame-display.json مرة واحدة فقط كمصدر القيم الأصلية الصحيحة
// للإطارات الـ11 المشحونة أصلاً مع المشروع (نفس روابط FRAME_ASSET_URLS الثابتة سابقاً بـapp.js)
profileFrameSchema.statics.seedDisplayDefaults = async function () {
    let displayConfig = {};
    try {
        const displayPath = path.join(__dirname, '../../public/assets/frames/frame-display.json');
        displayConfig = JSON.parse(fs.readFileSync(displayPath, 'utf8'));
    } catch (error) {
        console.error('[ProfileFrame.seedDisplayDefaults] تعذّر قراءة frame-display.json:', error.message);
        return;
    }
    const defaults = displayConfig._default || {};

    const frames = await this.find({});
    for (const frame of frames) {
        let changed = false;
        if (!frame.assetUrl) {
            frame.assetUrl = `/assets/frames/${frame.cssClass}.webp`;
            changed = true;
        }
        if (!frame.staticUrl) {
            frame.staticUrl = `/assets/frames/${frame.cssClass}-static.webp`;
            changed = true;
        }
        if (frame.display == null || typeof frame.display.frameScale !== 'number') {
            const cfg = displayConfig[frame.cssClass] || {};
            frame.display = {
                frameScale: typeof cfg.frameScale === 'number' ? cfg.frameScale : (defaults.frameScale ?? 1.45),
                avatarScale: typeof cfg.avatarScale === 'number' ? cfg.avatarScale : (defaults.avatarScale ?? 0.8),
                offsetX: typeof cfg.offsetX === 'number' ? cfg.offsetX : (defaults.offsetX ?? 0),
                offsetY: typeof cfg.offsetY === 'number' ? cfg.offsetY : (defaults.offsetY ?? 0),
                crownTop: typeof cfg.crownTop === 'number' ? cfg.crownTop : (defaults.crownTop ?? 0.45)
            };
            changed = true;
        }
        if (changed) await frame.save();
    }
};

module.exports = mongoose.model('ProfileFrame', profileFrameSchema);
