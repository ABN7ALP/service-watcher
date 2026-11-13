const Gift = require('../models/Gift');
const ProfileFrame = require('../models/ProfileFrame');
const ChatBubbleSkin = require('../models/ChatBubbleSkin');
const User = require('../models/User');
const VoiceRoom = require('../models/VoiceRoom');

// 🛡️ مراجعة #157: الأسعار هنا بمقياس ما بعد ترحيل إعادة التسمية ×10 (walletRedenominationMigration.js
// — SCALE=10) مباشرة، لا المقياس القديم قبله. بيئة الإنتاج أنجزت ذلك الترحيل فعلاً؛ لو بقيت
// هذي القائمة بالمقياس القديم (وردة=1، لا 10) وأدخلت autoSeed هدية ناقصة لاحقاً (حُذفت
// بالخطأ مثلاً)، تدخل بسعر 10x أرخص من بقية الهدايا الحقيقية بلا أي مسار يصحّحها — الترحيل
// نفسه يتخطّى كاملاً فور اكتمال JobRun مرّة واحدة (claimOrResumeJobRun)، فلا يعيد فحص مستندات
// جديدة أُدرجت بعده أبداً. redenominatedV1:true هنا توثّق أن هذا السعر مُطابِق فعلاً للمقياس
// الحالي (لا "لم يُرحَّل بعد") تماشياً مع بقية الهدايا الحقيقية بعد الترحيل
async function seedGiftsIfMissing() {
    const gifts = [
        { name: 'وردة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787752572/red-rose-3d-rendering-icon-illustration-png.png', price: 100, category: 'common', animation: 'float', sortOrder: 1 },
        { name: 'قلب', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787752780/3d-rendering-red-heart-shape-icon-3d-render-a-sign-of-love-or-life-icon-png.webp', price: 150, category: 'common', animation: 'float', sortOrder: 2 },
        { name: 'نجمة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787753112/magnificent-modern-yellow-star-isolated-with-five-points-high-quality-png.webp', price: 120, category: 'common', animation: 'float', sortOrder: 3 },
        { name: 'بالون', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832611/cute-pink-cartoon-balloon-with-smiling-face-and-shiny-eyes-png.png', price: 100, category: 'rare', animation: 'float', sortOrder: 4 },
        { name: 'ثعلب', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832545/cute-cartoon-little-red-fox-isolated-on-the-transparent-background-png.png', price: 150, category: 'rare', animation: 'float', sortOrder: 5 },
        { name: 'قوس قزح', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832474/colorful-rainbow-with-playful-houses-and-trees-in-a-whimsical-landscape-png.png', price: 200, category: 'rare', animation: 'float', sortOrder: 6 },
        { name: 'تاج', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832422/luxurious-gold-crown-with-intricate-detailing-free-png.webp', price: 350, category: 'epic', animation: 'float', sortOrder: 7 },
        { name: 'حديقة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832349/vibrant-garden-path-surrounded-by-blooming-flowers-greenery-and-a-white-fence-creating-a-peaceful-and-inviting-outdoor-space-free-png.png', price: 800, category: 'epic', animation: 'float', sortOrder: 8 },
        { name: 'ألماسة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832281/sparkling-cut-diamond-illustration-with-transparent-background-png.png', price: 1200, category: 'epic', animation: 'float', sortOrder: 9 },
        { name: 'يخت', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832194/luxury-yacht-anchored-in-calm-waters-during-sunset-showcasing-elegant-design-and-spacious-deck-perfect-for-relaxing-getaways-png.png', price: 2500, category: 'legendary', animation: 'float', sortOrder: 10 },
        { name: 'قلعة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787753218/elegant-rustic-dragon-mythical-serpent-breathing-fire-high-resolution-png.webp', price: 4000, category: 'legendary', animation: 'float', sortOrder: 11 },
        { name: 'تنين', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787753218/elegant-rustic-dragon-mythical-serpent-breathing-fire-high-resolution-png.webp', price: 7000, category: 'legendary', animation: 'float', sortOrder: 12 }
    ];
    // 🛡️ تُدرِج فقط ما هو ناقص فعلاً (findOne بالاسم) — لا تلمس أي هدية موجودة أصلاً (لا سعرها
    // ولا أي حقل آخر بها) إطلاقاً؛ migrateGiftImageUrls وحدها تُحدِّث حقلاً واحداً (imageUrl) على
    // الهدايا الموجودة، والسعر ليس من بينها عمداً
    for (const g of gifts) {
        const exists = await Gift.findOne({ name: g.name });
        if (!exists) {
            await Gift.create({ ...g, description: `هدية ${g.name}`, isActive: true, redenominatedV1: true });
            console.log(`🎁 [AUTO-SEED] تمت إضافة الهدية: ${g.name}`);
        }
    }
}

// 🛡️ feat/fanclub-v2-ui: هدية "النادي" الحصرية (مستوى معجب 13+ فقط — راجع
// fanClubController.assertFanClubExclusiveGiftEligible) — isActive:true (تبقى قابلة للإرسال
// فعلياً عبر مسارات الإرسال العادية) لكنها isFanClubExclusive:true فتُستبعَد من المتجر العام
// (راجع giftController.getGiftShop). لا category حقيقية تناسبها بالتدرّج العادي — 'legendary'
// فقط لعرض بصري ملائم لو ظهرت بأي استعلام عام يوماً، لا أثر وظيفي آخر لهذا الاختيار
async function seedFanClubExclusiveGiftIfMissing() {
    const exists = await Gift.findOne({ name: 'هدية النادي' });
    if (exists) return;
    await Gift.create({
        name: 'هدية النادي',
        description: 'هدية حصرية لأعضاء النادي من المستوى 13 فما فوق',
        imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1791286502/fanclub-heart-512.png',
        price: 500,
        category: 'legendary',
        animation: 'float',
        sortOrder: 100,
        isActive: true,
        isFanClubExclusive: true,
        redenominatedV1: true
    });
    console.log('🎁 [AUTO-SEED] تمت إضافة هدية النادي الحصرية');
}

// ✅ مجموعة الإطارات الحالية للمتجر — تجربة أول إطار-صورة حقيقي خارجي ("الإطار الفاخر") بطلب
// صريح، بانتظار مراجعته قبل إرسال بقية الروابط. الإطارات الأربعة CSS السابقة (الحلقة الفضية/
// جوهرة الزمرد/إعصار اللهب/تاج الأساطير) أُحيلت للتقاعد (راجع migrateRetireOldFrames أدناه،
// لا تُحذف كي لا يفقدها من يملكها فعلاً) فيبقى هذا الإطار وحده خيار الشراء الوحيد مؤقتاً
// 🛡️ مراجعة #157: أسعار prices.day1/3/7 هنا بمقياس ما بعد ترحيل ×10 مباشرة (نفس علّة أسعار
// الهدايا أعلاه بالضبط — راجع تعليق seedGiftsIfMissing) — إطار ناقص يُدرَج autoSeed به كان
// سيدخل 10x أرخص من بقية الإطارات الحقيقية بلا أي مسار يصحّحه لاحقاً
async function seedFramesIfMissing() {
    const frames = [
        { name: 'إطار الترحيب', cssClass: 'profile-frame-welcome', isActive: false, sortOrder: 0, prices: { day1: 0, day3: 0, day7: 0 } },
        { name: 'الحلقة الفضية', cssClass: 'profile-frame-silver-elegant', isActive: false, sortOrder: 1, prices: { day1: 90, day3: 220, day7: 400 } },
        { name: 'جوهرة الزمرد', cssClass: 'profile-frame-emerald-facet', isActive: false, sortOrder: 2, prices: { day1: 260, day3: 660, day7: 1200 } },
        { name: 'إعصار اللهب', cssClass: 'profile-frame-flame-vortex', isActive: false, sortOrder: 3, prices: { day1: 550, day3: 1380, day7: 2500 } },
        // ✅ "تاج الأساطير" (profile-frame-golden-legend) أُزيل من هذي القائمة نهائياً — طلب
        // صريح بحذفه حذفاً دائماً (راجع migrateDeleteRetiredFrames أدناه)؛ إبقاؤه هنا كان
        // يُعيد خلقه عند كل إقلاع خادم فقط ليحذفه migrateDeleteRetiredFrames فوراً بعده
        // ✅ إطارات-صورة حقيقية بالمتجر (overlay حقيقي فوق الصورة الشخصية، راجع
        // IMAGE_OVERLAY_FRAMES بـapp.js) — مجموعة أولى من تسعة، مُسعَّرة بتدرّج حسب
        // الندرة الظاهرة من اسم كل صورة (ملكي/تاج أساسي → أسطوري/مخلوقات أسطورية). طلب صريح
        // لاحق: 3 مدد قصيرة فقط (1/3/7 أيام) بدل الطويلة — سعر 7 أيام = سعر "days7" القديم
        // نفسه (بلا تغيير قيمة)، و3/1 أيام نسبة تقريبية 55%/22% منه
        { name: 'الإطار الفاخر', cssClass: 'profile-frame-luxury-01', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790887531/luxury_frame_512px.gif', isActive: true, sortOrder: 1, prices: { day1: 880, day3: 2200, day7: 4000 } },
        { name: 'الإطار الملكي', cssClass: 'profile-frame-royal-01', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790892729/royal_frame_600px.gif', isActive: true, sortOrder: 2, prices: { day1: 330, day3: 830, day7: 1500 } },
        { name: 'إطار التاج', cssClass: 'profile-frame-crown-01', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790894895/crown_frame_600px.gif', isActive: true, sortOrder: 3, prices: { day1: 330, day3: 830, day7: 1500 } },
        { name: 'التاج الأسود والذهبي', cssClass: 'profile-frame-black-gold-crown', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790895602/black_gold_crown_frame_600px.webp', isActive: true, sortOrder: 4, prices: { day1: 550, day3: 1380, day7: 2500 } },
        { name: 'الإطار القوطي الملكي', cssClass: 'profile-frame-gothic-royal', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790896169/gothic_royal_frame.webp', isActive: true, sortOrder: 5, prices: { day1: 550, day3: 1380, day7: 2500 } },
        { name: 'إطار الجمشت الملكي', cssClass: 'profile-frame-amethyst-royal', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790896497/amethyst_royal_frame.webp', isActive: true, sortOrder: 6, prices: { day1: 660, day3: 1650, day7: 3000 } },
        { name: 'إطار تنانين النار', cssClass: 'profile-frame-fire-dragons', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790897430/fire_dragons_frame.webp', isActive: true, sortOrder: 7, prices: { day1: 990, day3: 2480, day7: 4500 } },
        { name: 'إطار الأسد والنحلة والياقوت', cssClass: 'profile-frame-lion-bee-sapphire', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790897852/lion_bee_sapphire_frame.webp', isActive: true, sortOrder: 8, prices: { day1: 990, day3: 2480, day7: 4500 } },
        { name: 'إطار فارس بيغاسوس', cssClass: 'profile-frame-pegasus-warrior', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790898291/pegasus_warrior_frame.webp', isActive: true, sortOrder: 9, prices: { day1: 1100, day3: 2750, day7: 5000 } },
        // ✅ إطار حصري غير مباع بالمتجر (isActive:false) — يُمنح فقط تلقائياً لمن يفوز بالمركز
        // الأول بمساهمات نادي معجبين لأسبوع كامل (راجع server/utils/fanClubWeeklyFrameJob.js)
        { name: 'إطار المساهم', cssClass: 'profile-frame-contributor', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790702503/81162475603.png', isActive: false, sortOrder: 20, prices: { day1: 0, day3: 0, day7: 0 } },
        // ✅ إطار مهمة — غير مباع (isActive:false)، يُمنح تلقائياً لمن يكمل مهمة الحضور اليومي
        // بمستوى الدعم 7 أيام متتالية (راجع server/controllers/userController.js claimSupportCheckIn)
        { name: 'إطار المثابر', cssClass: 'profile-frame-persistent', isActive: false, sortOrder: 21, prices: { day1: 0, day3: 0, day7: 0 } },
        // ✅ إطار خاص بالأدمن فقط (طلب صريح) — isActive:false (لا يُباع لأي مستخدم عادي أبداً)
        // وadminOnly:true (يتجاوز فحص ownedFrames الاعتيادي بـsetActiveFrame، يُفحَص isAdmin
        // مباشرة بدلاً منه — راجع server/controllers/frameController.js)
        { name: 'إطار الأدمن', cssClass: 'profile-frame-admin', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1791240482/admin-frame-animated-512.webp', isActive: false, adminOnly: true, sortOrder: 22, prices: { day1: 0, day3: 0, day7: 0 } }
    ];
    // 🛡️ تُدرِج فقط ما هو ناقص فعلاً — لا تلمس أي إطار موجود أصلاً (لا سعره ولا أي حقل آخر به)
    for (const f of frames) {
        const exists = await ProfileFrame.findOne({ name: f.name });
        if (!exists) {
            await ProfileFrame.create({ ...f, redenominatedV1: true });
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

// 🛡️ مراجعة #157: أسعار بمقياس ما بعد ترحيل ×10 مباشرة (نفس علّة seedGiftsIfMissing/
// seedFramesIfMissing أعلاه بالضبط)
async function seedBubbleSkinsIfMissing() {
    const skins = [
        { name: 'فقاعة ليلية', price: 400, cssClass: 'bubble-skin-midnight', sortOrder: 1 },
        { name: 'فقاعة غروب', price: 600, cssClass: 'bubble-skin-sunset', sortOrder: 2 },
        { name: 'فقاعة زمردية', price: 800, cssClass: 'bubble-skin-emerald', sortOrder: 3 },
        { name: 'فقاعة ملكية', price: 1200, cssClass: 'bubble-skin-royal', sortOrder: 4 }
    ];
    // 🛡️ تُدرِج فقط ما هو ناقص فعلاً — لا تلمس أي فقاعة موجودة أصلاً
    for (const s of skins) {
        const exists = await ChatBubbleSkin.findOne({ name: s.name });
        if (!exists) await ChatBubbleSkin.create({ ...s, redenominatedV1: true });
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

// ✅ طلب صريح (هدايا v2): category enum تضمّن "custom" الآن — لا ترحيل بيانات لازم لأي قيمة
// حالية (common/rare/epic/legendary تبقى كما هي حرفياً، لم تتغيّر أسماؤها). الحقل الوحيد
// المحتاج ترحيلاً فعلياً isFullscreen: الافتراضي بالـschema (دالة تعتمد على category) يُطبَّق
// تلقائياً فقط حين يُحمَّل المستند عبر Mongoose العادي (لا .lean()) ولا يوجد الحقل أصلاً
// بالتخزين — توثيقه صراحة هنا بالقاعدة نفسها أكثر أماناً من الاعتماد على ذلك الاستنتاج
// الضمني بأي استعلام مستقبلي قد يستخدم .lean() (يتجاهل الافتراضيات تماماً)
async function migrateGiftFullscreenFlag() {
    const result = await Gift.updateMany(
        { category: 'legendary', isFullscreen: { $exists: false } },
        { $set: { isFullscreen: true } }
    );
    if (result.modifiedCount > 0) {
        console.log(`🔧 [MIGRATION] ضُبطت isFullscreen:true لـ${result.modifiedCount} هدية أسطورية قديمة`);
    }
}

// ✅ إصلاح موحَّد للأسعار: (أ) يضيف "prices" لأي إطار قديم جداً بقاعدة البيانات لا يملكها بعد
// إطلاقاً (كانت موجودة من قبل إضافة نظام الأسعار)، و(ب) يحوّل أي إطار لا يزال بصيغة المدد
// الطويلة القديمة (days7/days30/days365) إلى الصيغة الجديدة القصيرة (day1/day3/day7 — طلب
// صريح لاحق) — day7 الجديد = القيمة القديمة لـdays7 بلا أي تغيير بالسعر، وday3/day1 نسبة
// تقريبية 55%/22% منه. دالة واحدة تغطي الحالتين معاً، آمنة التكرار (تتجاوز أي إطار مُرحَّل أصلاً)
async function migrateFramePricesToShortDurations() {
    const fallbackDay7ByName = {
        'إطار الترحيب': 0, 'إطار المساهم': 0, 'إطار المثابر': 0, 'إطار الأدمن': 0,
        'إطار ذهبي كلاسيكي': 50, 'إطار نيون بنفسجي': 90, 'إطار ناري': 200, 'إطار جليدي': 200
    };
    const frames = await ProfileFrame.find({}).lean();
    for (const f of frames) {
        const alreadyMigrated = f.prices && f.prices.day7 !== undefined && f.prices.days7 === undefined;
        if (alreadyMigrated) continue;
        const oldDay7 = (f.prices && typeof f.prices.days7 === 'number') ? f.prices.days7 : (fallbackDay7ByName[f.name] ?? 50);
        const prices = { day1: Math.round(oldDay7 * 0.22), day3: Math.round(oldDay7 * 0.55), day7: oldDay7 };
        await ProfileFrame.updateOne({ _id: f._id }, { $set: { prices } });
        console.log(`🔧 [MIGRATION] تحويل أسعار الإطار لمدد قصيرة (1/3/7 أيام): ${f.name}`);
    }
}

// ✅ طلب صريح: حذف نهائي (لا تقاعد فقط) لثلاثة إطارات قديمة محدَّدة بالاسم — "قوس قزح"/"ملكي"
// (الجيل الأول المسطّح، أُحيلا للتقاعد سابقاً بـmigrateRetireOldFrames) و"تاج الأساطير"
// (إطار CSS بزخرفة تاج/أجنحة/جواهر خاصة). الحذف الحقيقي (لا isActive:false) يتطلّب أولاً
// سلخ أي مستخدم يملكه/يرتديه فعلياً — وإلا تبقى إشارة مرجعية (ownedFrames.frame/activeFrame)
// معلّقة بلا مستند ProfileFrame حقيقي خلفها، ويظهر الإطار "شبحاً" بصنف CSS محذوف من input.css
async function migrateDeleteRetiredFrames() {
    const namesToDelete = ['إطار قوس قزح', 'إطار ملكي', 'تاج الأساطير'];
    const frames = await ProfileFrame.find({ name: { $in: namesToDelete } });
    if (!frames.length) return;
    const frameIds = frames.map(f => f._id);

    const owners = await User.find({ 'ownedFrames.frame': { $in: frameIds } }).select('ownedFrames activeFrame activeFrameClass activeFrameExpiresAt');
    for (const user of owners) {
        user.ownedFrames = user.ownedFrames.filter(o => !frameIds.some(id => id.equals(o.frame)));
        if (user.activeFrame && frameIds.some(id => id.equals(user.activeFrame))) {
            user.activeFrame = null;
            user.activeFrameClass = null;
            user.activeFrameExpiresAt = null;
        }
        await user.save();
    }

    await ProfileFrame.deleteMany({ _id: { $in: frameIds } });
    console.log(`🗑️ [MIGRATION] تم حذف ${frames.length} إطاراً متقاعداً نهائياً (${owners.length} مستخدماً سُلخ منهم الإطار)`);
}

// ✅ طلب صريح: تقليص فئتي المقاعد 15/24 إلى 13/19 (لمراعاة الإطارات الزخرفية الكبيرة على
// المقعد) — الغرف الموجودة فعلاً بقاعدة البيانات بهذين العددين القديمين يجب تحويلها، وإلا
// تبقى عالقة بعدد لا يطابق enum الجديد (seatCount) ولا أي صنف CSS أعمدة بالواجهة (cols-5/6
// تُربط الآن بـ13/19 فقط). من النادر وجود جالسين فوق المقعد 13/19 لحظة إعادة تشغيل الخادم،
// لكن احتياطاً نُنزل أي جالس برقم مقعد يتجاوز العدد الجديد قبل التقليص
async function migrateRoomSeatTiers() {
    const roomsToShrink = await VoiceRoom.find({ seatCount: { $in: [15, 24] } });
    for (const room of roomsToShrink) {
        const oldCount = room.seatCount;
        const newCount = oldCount === 15 ? 13 : 19;
        room.seats = room.seats.filter(s => s.seatNumber <= newCount);
        room.seatCount = newCount;
        if (room.adminSeatCount > newCount) room.adminSeatCount = newCount;
        await room.save();
        console.log(`🔧 [MIGRATION] تقليص مقاعد الغرفة "${room.name}" من ${oldCount} إلى ${newCount}`);
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
        await migrateFramePricesToShortDurations();
        await migrateGiftImageUrls(); // ✅ جديد
        await migrateGiftFullscreenFlag(); // ✅ هدايا v2
        await seedGiftsIfMissing();
        await seedFanClubExclusiveGiftIfMissing();
        await seedFramesIfMissing();
        await migrateRetireOldFrames(); // ✅ بعد seedFramesIfMissing كي توجد الإطارات الجديدة أولاً كبديل
        await migrateDeleteRetiredFrames(); // ✅ طلب صريح: حذف نهائي لثلاثة منها بالاسم (راجع التعليق أعلى الدالة)
        await migrateRoomSeatTiers(); // ✅ طلب صريح: تحويل غرف 15/24 مقعداً القديمة لـ13/19
        await seedBubbleSkinsIfMissing();
        await require('../models/OneTimeMessageLog').syncIndexes(); // ✅ سبب مشكلة رقم 6 أدناه
    } catch (error) {
        console.error('[AUTO-SEED] خطأ أثناء التهيئة التلقائية:', error);
    }
};

// ✅ لاختبار الوحدة (راجع __tests__/autoSeed.test.js)
module.exports.seedGiftsIfMissing = seedGiftsIfMissing;
module.exports.seedFanClubExclusiveGiftIfMissing = seedFanClubExclusiveGiftIfMissing;
module.exports.seedFramesIfMissing = seedFramesIfMissing;
module.exports.seedBubbleSkinsIfMissing = seedBubbleSkinsIfMissing;
