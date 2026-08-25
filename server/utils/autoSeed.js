const Gift = require('../models/Gift');
const ProfileFrame = require('../models/ProfileFrame');

async function seedGiftsIfMissing() {
    const gifts = [
        { name: 'وردة', description: 'هدية بسيطة تعبر عن الإعجاب', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1765562034/eko4jseig8lpiednkiim.jpg', price: 3, category: 'common', animation: 'heartbeat', isActive: true, sortOrder: 1 },
        { name: 'ثعلب', description: 'هدية مميزة وأنيقة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1765562034/eko4jseig8lpiednkiim.jpg', price: 15, category: 'rare', animation: 'sparkle', isActive: true, sortOrder: 2 },
        { name: 'حديقة', description: 'هدية فاخرة للمناسبات الخاصة', imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1765562034/eko4jseig8lpiednkiim.jpg', price: 80, category: 'epic', animation: 'glow', isActive: true, sortOrder: 3 }
    ];

    for (const g of gifts) {
        const exists = await Gift.findOne({ name: g.name });
        if (!exists) {
            await Gift.create(g);
            console.log(`🎁 [AUTO-SEED] تمت إضافة الهدية: ${g.name}`);
        }
    }
}

async function seedFramesIfMissing() {
    const frames = [
        { name: 'إطار ذهبي', price: 50, cssClass: 'profile-frame-classic-gold', isActive: true }
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
