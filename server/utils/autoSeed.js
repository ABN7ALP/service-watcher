const Gift = require('../models/Gift');
const ProfileFrame = require('../models/ProfileFrame');
const ChatBubbleSkin = require('../models/ChatBubbleSkin');
const User = require('../models/User');
const VoiceRoom = require('../models/VoiceRoom');

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
        { name: 'إطار الترحيب', cssClass: 'profile-frame-welcome', isActive: false, sortOrder: 0, prices: { day1: 0, day3: 0, day7: 0 } },
        { name: 'الحلقة الفضية', cssClass: 'profile-frame-silver-elegant', isActive: false, sortOrder: 1, prices: { day1: 9, day3: 22, day7: 40 } },
        { name: 'جوهرة الزمرد', cssClass: 'profile-frame-emerald-facet', isActive: false, sortOrder: 2, prices: { day1: 26, day3: 66, day7: 120 } },
        { name: 'إعصار اللهب', cssClass: 'profile-frame-flame-vortex', isActive: false, sortOrder: 3, prices: { day1: 55, day3: 138, day7: 250 } },
        // ✅ "تاج الأساطير" (profile-frame-golden-legend) أُزيل من هذي القائمة نهائياً — طلب
        // صريح بحذفه حذفاً دائماً (راجع migrateDeleteRetiredFrames أدناه)؛ إبقاؤه هنا كان
        // يُعيد خلقه عند كل إقلاع خادم فقط ليحذفه migrateDeleteRetiredFrames فوراً بعده
        // ✅ إطارات-صورة حقيقية بالمتجر (overlay حقيقي فوق الصورة الشخصية، راجع
        // IMAGE_OVERLAY_FRAMES بـapp.js) — مجموعة أولى من تسعة، مُسعَّرة بتدرّج حسب
        // الندرة الظاهرة من اسم كل صورة (ملكي/تاج أساسي → أسطوري/مخلوقات أسطورية). طلب صريح
        // لاحق: 3 مدد قصيرة فقط (1/3/7 أيام) بدل الطويلة — سعر 7 أيام = سعر "days7" القديم
        // نفسه (بلا تغيير قيمة)، و3/1 أيام نسبة تقريبية 55%/22% منه
        { name: 'الإطار الفاخر', cssClass: 'profile-frame-luxury-01', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790887531/luxury_frame_512px.gif', isActive: true, sortOrder: 1, prices: { day1: 88, day3: 220, day7: 400 } },
        { name: 'الإطار الملكي', cssClass: 'profile-frame-royal-01', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790892729/royal_frame_600px.gif', isActive: true, sortOrder: 2, prices: { day1: 33, day3: 83, day7: 150 } },
        { name: 'إطار التاج', cssClass: 'profile-frame-crown-01', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790894895/crown_frame_600px.gif', isActive: true, sortOrder: 3, prices: { day1: 33, day3: 83, day7: 150 } },
        { name: 'التاج الأسود والذهبي', cssClass: 'profile-frame-black-gold-crown', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790895602/black_gold_crown_frame_600px.webp', isActive: true, sortOrder: 4, prices: { day1: 55, day3: 138, day7: 250 } },
        { name: 'الإطار القوطي الملكي', cssClass: 'profile-frame-gothic-royal', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790896169/gothic_royal_frame.webp', isActive: true, sortOrder: 5, prices: { day1: 55, day3: 138, day7: 250 } },
        { name: 'إطار الجمشت الملكي', cssClass: 'profile-frame-amethyst-royal', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790896497/amethyst_royal_frame.webp', isActive: true, sortOrder: 6, prices: { day1: 66, day3: 165, day7: 300 } },
        { name: 'إطار تنانين النار', cssClass: 'profile-frame-fire-dragons', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790897430/fire_dragons_frame.webp', isActive: true, sortOrder: 7, prices: { day1: 99, day3: 248, day7: 450 } },
        { name: 'إطار الأسد والنحلة والياقوت', cssClass: 'profile-frame-lion-bee-sapphire', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790897852/lion_bee_sapphire_frame.webp', isActive: true, sortOrder: 8, prices: { day1: 99, day3: 248, day7: 450 } },
        { name: 'إطار فارس بيغاسوس', cssClass: 'profile-frame-pegasus-warrior', previewImage: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790898291/pegasus_warrior_frame.webp', isActive: true, sortOrder: 9, prices: { day1: 110, day3: 275, day7: 500 } },
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
        await seedGiftsIfMissing();
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
