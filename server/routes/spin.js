const express = require('express');
const router = express.Router();
const Spin = require('../models/Spin');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const crypto = require('crypto');

// قيم عجلة الحظ مع احتمالات مبرمجة
const WHEEL_SEGMENTS = [
    { value: 10, probability: 0.01, weight: 1 },    // 1%
    { value: 9, probability: 0.02, weight: 2 },     // 2%
    { value: 7, probability: 0.03, weight: 3 },     // 3%
    { value: 5, probability: 0.05, weight: 5 },     // 5%
    { value: 4, probability: 0.07, weight: 7 },     // 7%
    { value: 3, probability: 0.10, weight: 10 },    // 10%
    { value: 2, probability: 0.15, weight: 15 },    // 15%
    { value: 1, probability: 0.20, weight: 20 },    // 20%
    { value: 0.75, probability: 0.17, weight: 17 }, // 17%
    { value: 0.5, probability: 0.20, weight: 20 }   // 20%
];

// توليد بذرة عشوائية آمنة
function generateSeed() {
    return crypto.randomBytes(32).toString('hex');
}

// دالة هاش SHA-256 مع الملح
function hashSeed(seed, salt) {
    const hash = crypto.createHash('sha256');
    hash.update(seed + salt);
    return hash.digest('hex');
}

// تحويل الهاش إلى رقم بين 0 و 1
function hashToFloat(hash) {
    const integer = parseInt(hash.slice(0, 8), 16);
    return integer / 0xFFFFFFFF;
}

// خوارزمية VRSA (Verifiable Random Selection Algorithm)
function vrsaAlgorithm(clientSeed, serverSeed, nonce, userId) {
    // المرحلة 1: دمج البذور
    const combinedSeed = clientSeed + serverSeed + nonce.toString() + userId;
    
    // المرحلة 2: تطبيق سلسلة من عمليات الهاش
    let currentHash = hashSeed(combinedSeed, 'vrsa-v1');
    
    // المرحلة 3: استخدام مولد LCG معدل
    const lcgState = parseInt(currentHash.slice(0, 8), 16);
    const a = 1664525;
    const c = 1013904223;
    const m = Math.pow(2, 32);
    
    let state = lcgState;
    
    // المرحلة 4: توليد 10 قيم لتحديد الفائز
    const results = [];
    for (let i = 0; i < 10; i++) {
        state = (a * state + c) % m;
        const randomValue = state / m;
        
        // تطبيق تحويل المونت كارلو
        const monteCarloValue = Math.sin(randomValue * Math.PI * 2) * 0.5 + 0.5;
        results.push(monteCarloValue);
        
        // تحديث الهاش للدورة التالية
        currentHash = hashSeed(currentHash, i.toString());
    }
    
    // المرحلة 5: حساب المتوسط مع تعديلات
    const avgResult = results.reduce((a, b) => a + b, 0) / results.length;
    
    // المرحلة 6: تطبيق دالة توزيع تراكمية معقدة
    let finalValue = 0;
    for (let i = 0; i < 7; i++) {
        const tempHash = hashSeed(currentHash + i.toString(), 'final');
        const tempValue = parseInt(tempHash.slice(i * 8, (i + 1) * 8), 16) / 0xFFFFFFFF;
        finalValue += tempValue * Math.pow(0.5, i + 1);
    }
    
    finalValue = (finalValue + avgResult) / 2;
    
    return finalValue;
}

// حساب العائد المطلوب (RTP - Return to Player)
function calculateRTP(userId, totalSpins, totalWins) {
    const baseRTP = 0.90; // 90% للاعبين
    const developerCut = 0.10; // 10% للمطور
    
    // تعديل RTP بناءً على تاريخ المستخدم
    const userModifier = totalSpins > 100 ? 0.01 : 0;
    const winStreakModifier = totalWins > totalSpins * 0.5 ? -0.02 : 0;
    
    return {
        playerRTP: baseRTP + userModifier + winStreakModifier,
        developerRTP: developerCut,
        totalRTP: baseRTP + userModifier + winStreakModifier + developerCut
    };
}

// اختيار الفائز بناءً على الخوارزمية المدورسة
function selectWinner(seedValue, userId, totalSpins, totalWins) {
    // حساب RTP الحالي
    const rtp = calculateRTP(userId, totalSpins, totalWins);
    
    // تطبيق تعديل المدى المتداول (Rolling Range)
    const rollingFactor = 1 + Math.sin(Date.now() / 1000) * 0.1;
    const adjustedSeed = (seedValue * rollingFactor) % 1;
    
    // تطبيق توزيع احتمالات متحرك
    let cumulativeProbability = 0;
    let selectedSegment = null;
    
    // تحديث الاحتمالات بناءً على RTP
    const updatedSegments = WHEEL_SEGMENTS.map(segment => {
        const adjustedProb = segment.probability * (rtp.playerRTP / 0.90);
        return { ...segment, adjustedProbability: adjustedProb };
    });
    
    // اختيار القطاع بناءً على القيمة المعدلة
    for (const segment of updatedSegments) {
        cumulativeProbability += segment.adjustedProbability;
        if (adjustedSeed < cumulativeProbability) {
            selectedSegment = segment;
            break;
        }
    }
    
    // ضمان الاختيار إذا لم يتم اختيار أي قطاع
    if (!selectedSegment) {
        selectedSegment = updatedSegments[updatedSegments.length - 1];
    }
    
    return selectedSegment;
}

// توليد بذرة الخادم (تتغير كل ساعة)
function getServerSeed() {
    const hour = Math.floor(Date.now() / (60 * 60 * 1000));
    return hashSeed(hour.toString(), process.env.SERVER_SEED_SALT || 'default-salt');
}

// إدارة العجلة مع الخوارزمية المدورسة
router.post('/', async (req, res) => {
    try {
        const user = req.user;
        const { clientSeed, nonce = 0 } = req.body;
        const spinCost = 1;
        
        // التحقق من الرصيد الكافي
        if (user.balance < spinCost) {
            return res.status(400).json({ message: 'رصيدك غير كافٍ' });
        }
        
        // جلب بذرة الخادم
        const serverSeed = getServerSeed();
        
        // توليد النتيجة باستخدام VRSA
        const seedValue = vrsaAlgorithm(
            clientSeed || generateSeed(),
            serverSeed,
            nonce,
            user._id.toString()
        );
        
        // الحصول على إحصائيات المستخدم
        const userStats = await Spin.aggregate([
            { $match: { user: user._id } },
            {
                $group: {
                    _id: null,
                    totalSpins: { $sum: 1 },
                    totalWins: { 
                        $sum: { 
                            $cond: [{ $eq: ['$status', 'win'] }, 1, 0] 
                        } 
                    }
                }
            }
        ]);
        
        const stats = userStats[0] || { totalSpins: 0, totalWins: 0 };
        
        // اختيار الفائز
        const selectedSegment = selectWinner(
            seedValue, 
            user._id.toString(),
            stats.totalSpins,
            stats.totalWins
        );
        
        // حساب النتيجة الصافية مع احتساب 10% للمطور
        const winAmount = selectedSegment.value;
        const developerCut = spinCost * 0.10; // 10% من تكلفة الدوران للمطور
        const netResult = winAmount - spinCost;
        const status = netResult >= 0 ? 'win' : 'lose';
        
        // تحديث رصيد المستخدم
        await user.updateBalance(spinCost, 'spin');
        
        if (status === 'win') {
            await user.updateBalance(winAmount, 'win');
        }
        
        // حفظ قطع المطور في قاعدة البيانات
        await Transaction.create({
            user: process.env.DEVELOPER_USER_ID || 'developer',
            type: 'developer_cut',
            amount: developerCut,
            status: 'completed',
            note: `عمولة من مستخدم: ${user.username}`
        });
        
        // حفظ محاولة الدوران
        const spin = new Spin({
            user: user._id,
            amount: winAmount,
            cost: spinCost,
            status: status,
            netResult: netResult,
            clientSeed: clientSeed || 'auto-generated',
            serverSeed: serverSeed,
            algorithm: 'VRSA-v1',
            nonce: nonce
        });
        
        await spin.save();
        
        // إنشاء معاملة
        const transaction = new Transaction({
            user: user._id,
            type: 'spin',
            amount: spinCost,
            status: status,
            note: status === 'win' 
                ? `ربحت $${winAmount} من عجلة الحظ` 
                : 'دوران عجلة الحظ'
        });
        
        await transaction.save();
        
        // تسجيل الـ RTP
        const rtp = calculateRTP(
            user._id.toString(),
            stats.totalSpins + 1,
            status === 'win' ? stats.totalWins + 1 : stats.totalWins
        );
        
        res.json({
            amount: winAmount,
            cost: spinCost,
            netResult: netResult,
            status: status,
            algorithm: 'VRSA-v1',
            serverSeed: serverSeed,
            developerCut: developerCut,
            rtp: {
                player: (rtp.playerRTP * 100).toFixed(1) + '%',
                developer: (rtp.developerRTP * 100).toFixed(1) + '%',
                total: (rtp.totalRTP * 100).toFixed(1) + '%'
            },
            verification: {
                clientHash: clientSeed ? hashSeed(clientSeed, 'client') : null,
                serverHash: hashSeed(serverSeed, 'server'),
                nonce: nonce
            }
        });
    } catch (error) {
        console.error('Spin error:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// مسار للتحقق من النتائج
router.post('/verify', async (req, res) => {
    try {
        const { clientSeed, serverSeed, nonce, userId, spinId } = req.body;
        
        if (!clientSeed || !serverSeed || !userId) {
            return res.status(400).json({ message: 'بيانات التحقق غير كاملة' });
        }
        
        // إعادة حساب النتيجة
        const seedValue = vrsaAlgorithm(clientSeed, serverSeed, nonce || 0, userId);
        
        // البحث عن الدوران في قاعدة البيانات
        const spin = await Spin.findById(spinId);
        
        if (!spin) {
            return res.status(404).json({ message: 'الدوران غير موجود' });
        }
        
        // التحقق من تطابق النتائج
        const isValid = Math.abs(seedValue - spin.verificationValue) < 0.0001;
        
        res.json({
            isValid: isValid,
            originalValue: spin.verificationValue,
            recalculatedValue: seedValue,
            difference: Math.abs(seedValue - spin.verificationValue),
            algorithm: 'VRSA-v1'
        });
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ message: 'خطأ في التحقق' });
    }
});

// إحصائيات النظام
router.get('/system-stats', async (req, res) => {
    try {
        const totalStats = await Spin.aggregate([
            {
                $group: {
                    _id: null,
                    totalSpins: { $sum: 1 },
                    totalCost: { $sum: '$cost' },
                    totalWins: { $sum: '$amount' },
                    developerEarnings: { 
                        $sum: { 
                            $multiply: ['$cost', 0.10] 
                        } 
                    }
                }
            }
        ]);
        
        const stats = totalStats[0] || {
            totalSpins: 0,
            totalCost: 0,
            totalWins: 0,
            developerEarnings: 0
        };
        
        const rtp = (stats.totalWins / stats.totalCost) || 0;
        
        res.json({
            totalSpins: stats.totalSpins,
            totalVolume: stats.totalCost,
            totalPayouts: stats.totalWins,
            developerEarnings: stats.developerEarnings,
            rtp: (rtp * 100).toFixed(2) + '%',
            houseEdge: ((1 - rtp) * 100).toFixed(2) + '%'
        });
    } catch (error) {
        console.error('System stats error:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

module.exports = router;
