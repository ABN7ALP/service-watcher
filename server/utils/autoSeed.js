const Gift = require('../models/Gift');
const ProfileFrame = require('../models/ProfileFrame');

async function seedGiftsIfMissing() {
    const gifts = [
        { name: 'وردة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787752572/red-rose-3d-rendering-icon-illustration-png.png', price: 10, category: 'common', animation: 'float', sortOrder: 1 },
        { name: 'قلب', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787752780/3d-rendering-red-heart-shape-icon-3d-render-a-sign-of-love-or-life-icon-png.webp', price: 15, category: 'common', animation: 'float', sortOrder: 2 },
        { name: 'نجمة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1787753112/magnificent-modern-yellow-star-isolated-with-five-points-high-quality-png.webp', price: 12, category: 'common', animation: 'float', sortOrder: 3 },
        { name: 'بالون', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1/gifts/balloon.png', price: 10, category: 'rare', animation: 'float', sortOrder: 4 },
        { name: 'ثعلب', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1/gifts/fox.png', price: 15, category: 'rare', animation: 'float', sortOrder: 5 },
        { name: 'قوس قزح', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1/gifts/rainbow.png', price: 20, category: 'rare', animation: 'float', sortOrder: 6 },
        { name: 'تاج', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1/gifts/crown.png', price: 35, category: 'epic', animation: 'float', sortOrder: 7 },
        { name: 'حديقة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1/gifts/garden.png', price: 80, category: 'epic', animation: 'float', sortOrder: 8 },
        { name: 'ألماسة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1/gifts/diamond.png', price: 120, category: 'epic', animation: 'float', sortOrder: 9 },
        { name: 'يخت', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1/gifts/yacht.png', price: 250, category: 'legendary', animation: 'float', sortOrder: 10 },
        { name: 'قلعة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1/gifts/castle.png', price: 400, category: 'legendary', animation: 'float', sortOrder: 11 },
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
        { name: 'إطار ذهبي كلاسيكي', price: 50, cssClass: 'profile-frame-classic-gold', isActive: true, sortOrder: 1 },
        { name: 'إطار نيون بنفسجي', price: 90, cssClass: 'profile-frame-neon-purple', isActive: true, sortOrder: 2 },
        { name: 'إطار قوس قزح', price: 150, cssClass: 'profile-frame-rainbow', isActive: true, sortOrder: 3 },
        { name: 'إطار ناري', price: 200, cssClass: 'profile-frame-fire', isActive: true, sortOrder: 4 },
        { name: 'إطار جليدي', price: 200, cssClass: 'profile-frame-ice', isActive: true, sortOrder: 5 },
        { name: 'إطار ملكي', price: 350, cssClass: 'profile-frame-royal', isActive: true, sortOrder: 6 }
    ];

    for (const f of frames) {
        const exists = await ProfileFrame.findOne({ name: f.name });
        if (!exists) {
            await ProfileFrame.create(f);
            console.log(`🖼️ [AUTO-SEED] تمت إضافة الإطار: ${f.name}`);
        }
    }
}

module.exports = async function autoSeed() {
    try {
        await seedGiftsIfMissing();
        await seedFramesIfMissing();
    } catch (error) {
        console.error('[AUTO-SEED] خطأ أثناء التهيئة التلقائية:', error);
    }
};
