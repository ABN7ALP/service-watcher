require('dotenv').config();
const mongoose = require('mongoose');
const Gift = require('../models/Gift');

const gifts = [
    {
        name: 'وردة',
        description: 'هدية بسيطة تعبر عن الإعجاب',
        imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1/gifts/rose.png',
        price: 3,
        category: 'common',
        animation: 'heartbeat',
        isActive: true,
        sortOrder: 1
    },
    {
        name: 'ثعلب',
        description: 'هدية مميزة وأنيقة',
        imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1/gifts/fox.png',
        price: 15,
        category: 'rare',
        animation: 'sparkle',
        isActive: true,
        sortOrder: 2
    },
    {
        name: 'حديقة',
        description: 'هدية فاخرة للمناسبات الخاصة',
        imageUrl: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1/gifts/garden.png',
        price: 80,
        category: 'epic',
        animation: 'glow',
        isActive: true,
        sortOrder: 3
    }
];

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        for (const giftData of gifts) {
            const exists = await Gift.findOne({ name: giftData.name });
            if (exists) {
                console.log(`⏭️  الهدية "${giftData.name}" موجودة بالفعل، تم التخطي`);
                continue;
            }
            await Gift.create(giftData);
            console.log(`✅ تمت إضافة الهدية: ${giftData.name}`);
        }

        console.log('🎉 اكتملت عملية إضافة الهدايا');
        process.exit(0);
    } catch (error) {
        console.error('❌ خطأ:', error);
        process.exit(1);
    }
}

seed();
