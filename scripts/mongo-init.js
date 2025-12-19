// Initialize MongoDB with initial data
db = db.getSiblingDB('battle-platform');

// Create indexes for better performance
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ phone: 1 }, { unique: true });
db.users.createIndex({ isOnline: 1, lastActive: -1 });
db.users.createIndex({ level: -1 });
db.users.createIndex({ totalDeposited: -1 });
db.users.createIndex({ totalWon: -1 });

db.battles.createIndex({ status: 1, createdAt: -1 });
db.battles.createIndex({ 'teamA.user': 1, 'teamB.user': 1 });
db.battles.createIndex({ chatRoom: 1 }, { unique: true });

db.transactions.createIndex({ user: 1, createdAt: -1 });
db.transactions.createIndex({ type: 1, status: 1 });
db.transactions.createIndex({ transactionId: 1 }, { unique: true });

db.chats.createIndex({ roomId: 1 }, { unique: true });
db.chats.createIndex({ participants: 1 });
db.chats.createIndex({ 'messages.expiresAt': 1 }, { expireAfterSeconds: 0 });

db.withdrawals.createIndex({ user: 1, status: 1, createdAt: -1 });
db.withdrawals.createIndex({ status: 1, createdAt: 1 });
db.withdrawals.createIndex({ transactionId: 1 }, { unique: true });

db.adminlogs.createIndex({ admin: 1, createdAt: -1 });
db.adminlogs.createIndex({ action: 1, createdAt: -1 });
db.adminlogs.createIndex({ targetUser: 1, createdAt: -1 });

db.reports.createIndex({ status: 1, priority: -1, createdAt: -1 });
db.reports.createIndex({ reporter: 1, createdAt: -1 });
db.reports.createIndex({ reportedUser: 1, createdAt: -1 });

// Create admin user (change password in production!)
db.users.insertOne({
    username: 'admin',
    email: 'admin@battle-platform.com',
    phone: '+963999999999',
    password: '$2a$10$YourHashedPasswordHere', // Hash of 'admin123'
    profileImage: 'admin-avatar.png',
    gender: 'male',
    balance: 0,
    coins: 0,
    level: 100,
    isAdmin: true,
    adminPermissions: [
        'ban', 'mute', 'kick', 'lock_seat', 
        'manage_users', 'manage_withdrawals', 
        'manage_deposits', 'manage_gifts', 
        'view_logs', 'update_settings'
    ],
    isOnline: false,
    agreedToTerms: true,
    emailVerified: true,
    phoneVerified: true,
    createdAt: new Date(),
    updatedAt: new Date()
});

// Insert sample gifts
const gifts = [
    {
        name: 'قلب صغير',
        description: 'هدية بسيطة تعبر عن الإعجاب',
        imageUrl: 'https://res.cloudinary.com/your-cloud/image/upload/v1/gifts/small_heart.png',
        price: 10,
        category: 'common',
        animation: 'heartbeat',
        sound: 'heart_sound.mp3',
        isActive: true,
        discount: 0,
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        name: 'نجمة ذهبية',
        description: 'هدية مميزة للمتميزين',
        imageUrl: 'https://res.cloudinary.com/your-cloud/image/upload/v1/gifts/gold_star.png',
        price: 50,
        category: 'rare',
        animation: 'sparkle',
        sound: 'star_sound.mp3',
        isActive: true,
        discount: 0,
        sortOrder: 2,
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        name: 'تاج الملك',
        description: 'للأفضل والأقوى',
        imageUrl: 'https://res.cloudinary.com/your-cloud/image/upload/v1/gifts/king_crown.png',
        price: 100,
        category: 'epic',
        animation: 'glow',
        sound: 'crown_sound.mp3',
        isActive: true,
        discount: 10,
        sortOrder: 3,
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        name: 'سيف الأسطورة',
        description: 'أقوى هدية في المنصة',
        imageUrl: 'https://res.cloudinary.com/your-cloud/image/upload/v1/gifts/legend_sword.png',
        price: 500,
        category: 'legendary',
        animation: 'fire',
        sound: 'sword_sound.mp3',
        isActive: true,
        discount: 20,
        sortOrder: 4,
        createdAt: new Date(),
        updatedAt: new Date()
    }
];

db.gifts.insertMany(gifts);

// Create system stats record
db.systemstats.insertOne({
    date: new Date(new Date().setHours(0, 0, 0, 0)),
    totalUsers: 1,
    newUsers: 0,
    activeUsers: 0,
    bannedUsers: 0,
    totalDeposits: { amount: 0, count: 0 },
    totalWithdrawals: { amount: 0, count: 0 },
    pendingDeposits: { amount: 0, count: 0 },
    pendingWithdrawals: { amount: 0, count: 0 },
    totalCommission: 0,
    totalFees: 0,
    totalBattles: 0,
    completedBattles: 0,
    cancelledBattles: 0,
    totalBetAmount: 0,
    totalPrizes: 0,
    giftsSent: 0,
    giftsReceived: 0,
    totalGiftValue: 0,
    messagesSent: 0,
    imagesSent: 0,
    voiceMessagesSent: 0,
    averageResponseTime: 0,
    errorCount: 0,
    serverUptime: 0,
    peakHour: { hour: 0, users: 0 },
    dailyRevenue: 0,
    conversionRate: 0,
    averageDeposit: 0,
    averageWithdrawal: 0,
    userRetention: 0,
    updatedAt: new Date(),
    createdAt: new Date()
});

print('✅ Database initialized successfully!');
