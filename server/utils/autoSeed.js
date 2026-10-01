const Gift = require('../models/Gift');
const ProfileFrame = require('../models/ProfileFrame');
const ChatBubbleSkin = require('../models/ChatBubbleSkin');
const User = require('../models/User');

async function seedGiftsIfMissing() {
    const gifts = [
        { name: 'وردة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787752572/red-rose-3d-rendering-icon-illustration-png.png', price: 10, category: 'common', animation: 'float', sortOrder: 1 },
        { name: 'قلب', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787752780/3d-rendering-red-heart-shape-icon-3d-render-a-sign-of-love-or-life-icon-png.webp', price: 15, category: 'common', animation: 'float', sortOrder: 2 },
        { name: 'نجمة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787753112/magnificent-modern-yellow-star-isolated-with-five-points-high-quality-png.webp', price: 12, category: 'common', animation: 'float', sortOrder: 3 },
        { name: 'بالون', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832611/cute-pink-cartoon-balloon-with-smiling-face-and-shiny-eyes-png.png', price: 10, category: 'rare', animation: 'float', sortOrder: 4 },
        { name: 'ثعلب', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832545/cute-cartoon-little-red-fox-isolated-on-the-transparent-background-png.png', price: 15, category: 'rare', animation: 'float', sortOrder: 5 },
        { name: 'قوس قزح', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832474/colorful-rainbow-with-playful-houses-and-trees-in-a-whimsical-landscape-png.png', price: 20, category: 'rare', animation: 'float', sortOrder: 6 },
        { name: 'تاج', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832422/luxurious-gold-crown-with-intricate-detailing-free-png.webp', price: 35, category: 'epic', animation: 'float', sortOrder: 7 },
        { name: 'حديقة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832349/vibrant-garden-path-surrounded-by-blooming-flowers-greenery-and-a-white-fence-creating-a-peaceful-and-inviting-outdoor-space-free-png.png', price: 80, category: 'epic', animation: 'float', sortOrder: 8 },
        { name: 'ألماسة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832281/sparkling-cut-diamond-illustration-with-transparent-background-png.png', price: 120, category: 'epic', animation: 'float', sortOrder: 9 },
        { name: 'يخت', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832194/luxury-yacht-anchored-in-calm-waters-during-sunset-showcasing-elegant-design-and-spacious-deck-perfect-for-relaxing-getaways-png.png', price: 250, category: 'legendary', animation: 'float', sortOrder: 10 },
        { name: 'قلعة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787753218/elegant-rustic-dragon-mythical-serpent-breathing-fire-high-resolution-png.webp', price: 400, category: 'legendary', animation: 'float', sortOrder: 11 },
        { name: 'تنين', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787753218/elegant-rustic-dragon-mythical-serpent-breathing-fire-high-resolution-png.webp', price: 700, category: 'legendary', animation: 'float', sortOrder: 12 }
    ];
    for (const g of gifts) {
        const exists = await Gift.findOne({ name: g.name });
        if (!exists) {
            await Gift.create({ ...g, description: `هدية ${g.name}`, isActive: true });
            console.log(`🎁 [AUTO-SEED] تمت إضافة الهدية: ${g.name}`);
        }
    }
}

// ✅ مجموعة الإطارات الحالية للمتجر — تجربة أول إطار-صورة حقيقي خارجي ("الإطار الفاخر") بطلب
// صريح، بانتظار مراجعته قبل إرسال بقية الروابط. الإطارات الأربعة CSS السابقة (الحلقة الفضية/
// جوهرة الزمرد/إعصار اللهب/تاج الأساطير) أُحيلت للتقاعد (راجع migrateRetireOldFrames أدناه،
// لا تُحذف كي لا يفقدها من يملكها فعلاً) فيبقى هذا الإطار وحده خيار الشراء الوحيد مؤقتاً
async function seedFramesIfMissing() {
    const frames = [
        { name: 'إطار الترحيب', cssClass: 'profile-frame-welcome', isActive: false, sortOrder: 0, prices: { days7: 0, days30: 0, days365: 0 } },
        { name: 'الحلقة الفضية', cssClass: 'profile-frame-silver-elegant', isActive: false, sortOrder: 1, prices: { days7: 40, days30: 120, days365: 900 } },
        { name: 'جوهرة الزمرد', cssClass: 'profile-frame-emerald-facet', isActive: false, sortOrder: 2, prices: { days7: 120, days30: 350, days365: 2800 } },
        { name: 'إعصار اللهب', cssClass: 'profile-frame-flame-vortex', isActive: false, sortOrder: 3, prices: { days7: 250, days30: 750, days365: 6000 } },
        { name: 'تاج الأساطير', cssClass: 'profile-frame-golden-legend', isActive: false, sortOrder: 4, prices: { days7: 400, days30: 1200, days365: 9500 } },
        // ✅ إطارات-صورة حقيقية بالمتجر (overlay حقيقي فوق الصورة الشخصية، راجع
        // IMAGE_OVERLAY_FRAMES بـapp.js) — مجموعة أولى من تسعة، مُسعَّرة بتدرّج حسب
        // الندرة الظاهرة من اسم كل صورة (ملكي/تاج أساسي → أسطوري/مخلوقات أسطورية)
        { name: 'الإطار الفاخر', cssClass: 'profile-frame-luxury-01', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790887531/luxury_frame_512px.gif', isActive: true, sortOrder: 1, prices: { days7: 400, days30: 1200, days365: 9500 } },
        { name: 'الإطار الملكي', cssClass: 'profile-frame-royal-01', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790892729/royal_frame_600px.gif', isActive: true, sortOrder: 2, prices: { days7: 150, days30: 450, days365: 3500 } },
        { name: 'إطار التاج', cssClass: 'profile-frame-crown-01', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790894895/crown_frame_600px.gif', isActive: true, sortOrder: 3, prices: { days7: 150, days30: 450, days365: 3500 } },
        { name: 'التاج الأسود والذهبي', cssClass: 'profile-frame-black-gold-crown', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790895602/black_gold_crown_frame_600px.webp', isActive: true, sortOrder: 4, prices: { days7: 250, days30: 750, days365: 6000 } },
        { name: 'الإطار القوطي الملكي', cssClass: 'profile-frame-gothic-royal', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790896169/gothic_royal_frame.webp', isActive: true, sortOrder: 5, prices: { days7: 250, days30: 750, days365: 6000 } },
        { name: 'إطار الجمشت الملكي', cssClass: 'profile-frame-amethyst-royal', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790896497/amethyst_royal_frame.webp', isActive: true, sortOrder: 6, prices: { days7: 300, days30: 900, days365: 7000 } },
        { name: 'إطار تنانين النار', cssClass: 'profile-frame-fire-dragons', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790897430/fire_dragons_frame.webp', isActive: true, sortOrder: 7, prices: { days7: 450, days30: 1350, days365: 10500 } },
        { name: 'إطار الأسد والنحلة والياقوت', cssClass: 'profile-frame-lion-bee-sapphire', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790897852/lion_bee_sapphire_frame.webp', isActive: true, sortOrder: 8, prices: { days7: 450, days30: 1350, days365: 10500 } },
        { name: 'إطار فارس بيغاسوس', cssClass: 'profile-frame-pegasus-warrior', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790898291/pegasus_warrior_frame.webp', isActive: true, sortOrder: 9, prices: { days7: 500, days30: 1500, days365: 12000 } },
        // ✅ إطار حصري غير مباع بالمتجر (isActive:false) — يُمنح فقط تلقائياً لمن يفوز بالمركز
        // الأول بمساهمات نادي معجبين لأسبوع كامل (راجع server/utils/fanClubWeeklyFrameJob.js)
        { name: 'إطار المساهم', cssClass: 'profile-frame-contributor', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790702503/81162475603.png', isActive: false, sortOrder: 20, prices: { days7: 0, days30: 0, days365: 0 } },
        // ✅ إطار مهمة — غير مباع (isActive:false)، يُمنح تلقائياً لمن يكمل مهمة الحضور اليومي
        // بمستوى الدعم 7 أيام متتالية (راجع server/controllers/userController.js claimSupportCheckIn)
        { name: 'إطار المثابر', cssClass: 'profile-frame-persistent', isActive: false, sortOrder: 21, prices: { days7: 0, days30: 0, days365: 0 } }
    ];
    for (const f of frames) {
        const exists = await ProfileFrame.findOne({ name: f.name });
        if (!exists) {
            await ProfileFrame.create(f);
            console.log(`🖼️ [AUTO-SEED] تمت إضافة الإطار: ${f.name}`);
        }
    }
}

// 🔧 يحيل الإطارات القديمة (ستة مسطّحة بأسلوب مبتدئ + أربعة CSS أحدث) للتقاعد من المتجر دون
// حذفها إطلاقاً — أي مستخدم اشتراها/يملكها يحتفظ بها ويقدر يبقيها مفعّلة، فقط لن تظهر بعد
// الآن كخيار شراء جديد لمن لا يملكها؛ isActive:false تكفي وحدها (getFrameShop يستعلم
// isActive:true فقط)، ولا حاجة لأي تعديل على ownedFrames أو activeFrame الحاليين
async function migrateRetireOldFrames() {
    const retiredNames = [
        'إطار ذهبي كلاسيكي', 'إطار نيون بنفسجي', 'إطار قوس قزح', 'إطار ناري', 'إطار جليدي', 'إطار ملكي',
        // ✅ أُحيلت الآن أيضاً — "الإطار الفاخر" (صورة خارجية حقيقية) هو الخيار الوحيد مؤقتاً
        'الحلقة الفضية', 'جوهرة الزمرد', 'إعصار اللهب', 'تاج الأساطير'
    ];
    const result = await ProfileFrame.updateMany({ name: { $in: retiredNames }, isActive: true }, { $set: { isActive: false } });
    if (result.modifiedCount > 0) {
        console.log(`🔧 [MIGRATION] تمت إحالة ${result.modifiedCount} إطاراً قديماً للتقاعد من المتجر`);
    }
}

async function seedBubbleSkinsIfMissing() {
    const skins = [
        { name: 'فقاعة ليلية', price: 40, cssClass: 'bubble-skin-midnight', sortOrder: 1 },
        { name: 'فقاعة غروب', price: 60, cssClass: 'bubble-skin-sunset', sortOrder: 2 },
        { name: 'فقاعة زمردية', price: 80, cssClass: 'bubble-skin-emerald', sortOrder: 3 },
        { name: 'فقاعة ملكية', price: 120, cssClass: 'bubble-skin-royal', sortOrder: 4 }
    ];
    for (const s of skins) {
        const exists = await ChatBubbleSkin.findOne({ name: s.name });
        if (!exists) await ChatBubbleSkin.create(s);
    }
}

// ✅ الإصلاح الجذري: إصلاح بيانات المستخدمين القدامى الذين ownedFrames عندهم بصيغة قديمة
// غير متوافقة مع الصيغة الجديدة (كائنات بمدة صلاحية). هذا التعارض كان يمنع نجاح
// أي عملية .save() لهؤلاء المستخدمين — بما فيها خصم الكوينز عند إرسال الهدايا.
async function migrateLegacyOwnedFrames() {
    const users = await User.find({}).select('ownedFrames');
    let fixedCount = 0;

    for (const user of users) {
        let needsFix = false;
        const cleanedFrames = [];

        for (const entry of user.ownedFrames) {
            if (entry && typeof entry === 'object' && entry.frame) {
                cleanedFrames.push(entry);
            } else if (entry) {
                cleanedFrames.push({
                    frame: entry,
                    purchasedAt: new Date(),
                    durationDays: 9999,
                    activatedAt: null,
                    expiresAt: null
                });
                needsFix = true;
            }
        }

        if (needsFix) {
            await User.updateOne({ _id: user._id }, { $set: { ownedFrames: cleanedFrames } });
            fixedCount++;
        }
    }

    if (fixedCount > 0) {
        console.log(`🔧 [MIGRATION] تم إصلاح بيانات الإطارات القديمة لـ ${fixedCount} مستخدم`);
    }
}


// ✅ يُحدّث رابط صورة أي هدية موجودة أصلاً بقاعدة البيانات إذا تغيّر بالكود
// (seedGiftsIfMissing تتجاهل الهدايا الموجودة، فهذه الدالة تكمل النقص)
async function migrateGiftImageUrls() {
    const giftImageMap = {
        'وردة': 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787752572/red-rose-3d-rendering-icon-illustration-png.png',
        'قلب': 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787752780/3d-rendering-red-heart-shape-icon-3d-render-a-sign-of-love-or-life-icon-png.webp',
        'نجمة': 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787753112/magnificent-modern-yellow-star-isolated-with-five-points-high-quality-png.webp',
        'بالون': 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832611/cute-pink-cartoon-balloon-with-smiling-face-and-shiny-eyes-png.png',
        'ثعلب': 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832545/cute-cartoon-little-red-fox-isolated-on-the-transparent-background-png.png',
        'قوس قزح': 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832474/colorful-rainbow-with-playful-houses-and-trees-in-a-whimsical-landscape-png.png',
        'تاج': 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832422/luxurious-gold-crown-with-intricate-detailing-free-png.webp',
        'حديقة': 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832349/vibrant-garden-path-surrounded-by-blooming-flowers-greenery-and-a-white-fence-creating-a-peaceful-and-inviting-outdoor-space-free-png.png',
        'ألماسة': 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832281/sparkling-cut-diamond-illustration-with-transparent-background-png.png',
        'يخت': 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832194/luxury-yacht-anchored-in-calm-waters-during-sunset-showcasing-elegant-design-and-spacious-deck-perfect-for-relaxing-getaways-png.png',
        'قلعة': 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832073/fantasy-castle-3d-model-illuminated-architecture-with-towers-and-pillars-free-png.webp',
        'تنين': 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787753218/elegant-rustic-dragon-mythical-serpent-breathing-fire-high-resolution-png.webp'
    };

    for (const [name, url] of Object.entries(giftImageMap)) {
        await Gift.updateOne({ name }, { $set: { imageUrl: url } });
    }
    console.log('🔧 [MIGRATION] تم تحديث روابط صور الهدايا للتطابق مع الكود الحالي');
}

// ✅ إصلاح جذري: يضيف حقل "prices" لأي إطار قديم بقاعدة البيانات لا يملكه بعد
// (كانت الإطارات موجودة من قبل إضافة نظام الأسعار المتعدد المدد، فتبقى بلا أسعار)
async function migrateLegacyFramePrices() {
    const defaultPrices = {
        'إطار الترحيب': { days7: 0, days30: 0, days365: 0 },
        'إطار ذهبي كلاسيكي': { days7: 50, days30: 150, days365: 1200 },
        'إطار نيون بنفسجي': { days7: 90, days30: 280, days365: 2200 },
        'إطار قوس قزح': { days7: 150, days30: 450, days365: 3500 },
        'إطار ناري': { days7: 200, days30: 600, days365: 4800 },
        'إطار جليدي': { days7: 200, days30: 600, days365: 4800 },
        'إطار ملكي': { days7: 350, days30: 1000, days365: 8000 }
    };

    const framesMissingPrices = await ProfileFrame.find({
        $or: [{ prices: { $exists: false } }, { 'prices.days7': { $exists: false } }]
    });

    for (const frame of framesMissingPrices) {
        const defaults = defaultPrices[frame.name] || { days7: 50, days30: 150, days365: 1200 };
        frame.prices = defaults;
        await frame.save();
        console.log(`🔧 [MIGRATION] تم إصلاح أسعار الإطار: ${frame.name}`);
    }
}

async function seedBotAccountIfMissing() {
    const existing = await User.findOne({ isBot: true });
    if (existing) return;
    await User.create({
        username: 'بوت_المنصة',
        email: 'bot@internal.system',
        password: require('crypto').randomBytes(32).toString('hex'), // كلمة مرور عشوائية، لا يُستخدم تسجيل الدخول بها أبداً
        gender: 'male',
        birthDate: new Date('2024-01-01'),
        profileImage: 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg',
        isBot: true,
        agreedToTerms: true
    });
    console.log('🤖 [AUTO-SEED] تم إنشاء حساب بوت المنصة');
}

module.exports = async function autoSeed() {
    try {
        await seedBotAccountIfMissing();
        await migrateLegacyOwnedFrames();
        await migrateLegacyFramePrices();
        await migrateGiftImageUrls(); // ✅ جديد
        await seedGiftsIfMissing();
        await seedFramesIfMissing();
        await migrateRetireOldFrames(); // ✅ بعد seedFramesIfMissing كي توجد الإطارات الجديدة أولاً كبديل
        await seedBubbleSkinsIfMissing();
        await require('../models/OneTimeMessageLog').syncIndexes(); // ✅ سبب مشكلة رقم 6 أدناه
    } catch (error) {
        console.error('[AUTO-SEED] خطأ أثناء التهيئة التلقائية:', error);
    }
};
