const cloudinary = require('cloudinary').v2;
const jwt = require('jsonwebtoken');

// Generate random string
exports.generateRandomString = (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Generate transaction ID
exports.generateTransactionId = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `TX${timestamp}${random}`;
};

// Format currency
exports.formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('ar-SA', {
        style: 'currency',
        currency: currency === 'USD' ? 'USD' : 'SAR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
};

// Calculate level from experience
exports.calculateLevel = (experience) => {
    let level = 1;
    let requiredExp = 100;
    
    while (experience >= requiredExp) {
        level++;
        requiredExp += requiredExp * 1.5; // 150% increase per level
    }
    
    return {
        level,
        currentExp: experience,
        nextLevelExp: requiredExp,
        progress: ((experience / requiredExp) * 100).toFixed(2)
    };
};

// Upload file to Cloudinary
exports.uploadToCloudinary = async (file, folder = 'uploads') => {
    try {
        const result = await cloudinary.uploader.upload(file.path, {
            folder,
            resource_type: 'auto'
        });
        return result;
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw new Error('فشل رفع الملف');
    }
};

// Delete file from Cloudinary
exports.deleteFromCloudinary = async (publicId) => {
    try {
        await cloudinary.uploader.destroy(publicId);
        return true;
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        return false;
    }
};

// Validate phone number (for Sham Kash)
exports.validatePhoneNumber = (phone) => {
    // Simple validation for Syrian numbers
    const regex = /^(\+963|0)?9\d{8}$/;
    return regex.test(phone);
};

// Calculate withdrawal fee
exports.calculateWithdrawalFee = (amount) => {
    const feePer10USD = 0.50;
    const numberOf10s = Math.floor(amount / 10);
    return numberOf10s * feePer10USD;
};

// Format date
exports.formatDate = (date, format = 'ar-SA') => {
    return new Date(date).toLocaleDateString(format, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// Check if user is online
exports.checkOnlineStatus = (lastActive) => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(lastActive) > fiveMinutesAgo;
};

// Generate JWT token
exports.generateToken = (payload, expiresIn = '7d') => {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

// Verify JWT token
exports.verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return null;
    }
};

// Calculate battle prize
exports.calculateBattlePrize = (totalBet, playersCount) => {
    const commission = totalBet * 0.10; // 10% commission
    const prizePool = totalBet - commission;
    return {
        prizePool,
        commission,
        prizePerWinner: prizePool / (playersCount / 2) // Assuming teams are equal
    };
};

// Get gender from voice (mock function - in production use AI service)
exports.detectGenderFromVoice = async (voiceUrl) => {
    // This is a mock function
    // In production, integrate with an AI service like Google Cloud Speech-to-Text
    // or a gender detection API
    
    return new Promise((resolve) => {
        setTimeout(() => {
            // Mock detection - 80% accuracy for female voices
            const isFemale = Math.random() > 0.2;
            resolve({
                gender: isFemale ? 'female' : 'male',
                confidence: isFemale ? 0.85 : 0.60
            });
        }, 1000);
    });
};

// Validate username
exports.validateUsername = (username) => {
    const regex = /^[a-zA-Z0-9_\u0600-\u06FF]{3,20}$/;
    if (!regex.test(username)) {
        return 'اسم المستخدم يجب أن يكون بين 3 و20 حرفاً ويمكن أن يحتوي على أحرف عربية وإنجليزية وأرقام وشرطة سفلية';
    }
    
    // Check for inappropriate words
    const inappropriateWords = [
        'admin', 'administrator', 'mod', 'moderator',
        'sex', 'porn', 'xxx', 'fuck', 'shit', 'بورن', 'سكس'
    ];
    
    const lowerUsername = username.toLowerCase();
    for (const word of inappropriateWords) {
        if (lowerUsername.includes(word)) {
            return 'اسم المستخدم يحتوي على كلمات غير مناسبة';
        }
    }
    
    return null;
};

// Generate leaderboard data
exports.generateLeaderboard = async (type = 'deposits', limit = 10) => {
    const User = require('../models/User');
    
    let sortField;
    switch (type) {
        case 'deposits':
            sortField = 'totalDeposited';
            break;
        case 'gifts':
            sortField = 'totalGifted';
            break;
        case 'wins':
            sortField = 'totalWon';
            break;
        case 'level':
            sortField = 'level';
            break;
        default:
            sortField = 'totalDeposited';
    }
    
    const users = await User.find({ [sortField]: { $gt: 0 } })
        .sort({ [sortField]: -1 })
        .limit(limit)
        .select('username profileImage level ' + sortField);
    
    return users.map((user, index) => ({
        rank: index + 1,
        username: user.username,
        profileImage: user.profileImage,
        level: user.level,
        value: user[sortField],
        type
    }));
};
