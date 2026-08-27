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
        { name: 'قلعة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787832073/fantasy-castle-3d-model-illuminated-architecture-with-towers-and-pillars-free-png.webp', price: 400, category: 'legendary', animation: 'float', sortOrder: 11 },
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

async function seedFramesIfMissing() {
    const frames = [
        { name: 'إطار الترحيب', cssClass: 'profile-frame-welcome', isActive: false, sortOrder: 0, prices: { days7: 0, days30: 0, days365: 0 } },
        { name: 'إطار ذهبي كلاسيكي', cssClass: 'profile-frame-classic-gold', isActive: true, sortOrder: 1, prices: { days7: 50, days30: 150, days365: 1200 } },
        { name: 'إطار نيون بنفسجي', cssClass: 'profile-frame-neon-purple', isActive: true, sortOrder: 2, prices: { days7: 90, days30: 280, days365: 2200 } },
        { name: 'إطار قوس قزح', cssClass: 'profile-frame-rainbow', isActive: true, sortOrder: 3, prices: { days7: 150, days30: 450, days365: 3500 } },
        { name: 'إطار ناري', cssClass: 'profile-frame-fire', isActive: true, sortOrder: 4, prices: { days7: 200, days30: 600, days365: 4800 } },
        { name: 'إطار جليدي', cssClass: 'profile-frame-ice', isActive: true, sortOrder: 5, prices: { days7: 200, days30: 600, days365: 4800 } },
        { name: 'إطار ملكي', cssClass: 'profile-frame-royal', isActive: true, sortOrder: 6, prices: { days7: 350, days30: 1000, days365: 8000 } }
    ];
    for (const f of frames) {
        const exists = await ProfileFrame.findOne({ name: f.name });
        if (!exists) {
            await ProfileFrame.create(f);
            console.log(`🖼️ [AUTO-SEED] تمت إضافة الإطار: ${f.name}`);
        }
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

module.exports = async function autoSeed() {
    try {
        await migrateLegacyOwnedFrames();
        await migrateLegacyFramePrices(); // ✅ يجب أن تُنفَّذ قبل seedFramesIfMissing
        await seedGiftsIfMissing();
        await seedFramesIfMissing();
        await seedBubbleSkinsIfMissing();
    } catch (error) {
        console.error('[AUTO-SEED] خطأ أثناء التهيئة التلقائية:', error);
    }
};
