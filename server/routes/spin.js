// المكان: server/routes/spin.js

const express = require('express');
const router = express.Router();
const Spin = require('../models/Spin');
const Transaction = require('../models/Transaction');
const SystemStats = require('../models/SystemStats'); // <-- إضافة جديدة

const WHEEL_SEGMENTS = [0.5, 0.75, 1, 2, 3, 4, 5, 7, 9, 10];
const SPIN_COST = 1;
const TARGET_RTP = 0.90;

// دالة لاختيار الجائزة بناءً على الاحتمالات الموزونة
function getWeightedSpinResult(stats) { // <-- الآن تستقبل الإحصائيات
    const { totalSpins, totalWins } = stats;
    const actualRTP = totalSpins > 0 ? totalWins / (totalSpins * SPIN_COST) : TARGET_RTP;
    const adjustmentFactor = (TARGET_RTP - actualRTP) * 10;

    const baseWeights = { 0.5: 30, 0.75: 25, 1: 20, 2: 10, 3: 5, 4: 3, 5: 2, 7: 1.5, 9: 1, 10: 0.5 };
    const adjustedWeights = {};
    let totalWeight = 0;

    WHEEL_SEGMENTS.forEach(segment => {
        let weight = baseWeights[segment];
        if (segment > SPIN_COST) {
            weight += adjustmentFactor * Math.log(segment);
        }
        adjustedWeights[segment] = Math.max(0.1, weight);
        totalWeight += adjustedWeights[segment];
    });

    const randomWeight = Math.random() * totalWeight;
    let weightSum = 0;
    for (const segment of WHEEL_SEGMENTS) {
        weightSum += adjustedWeights[segment];
        if (randomWeight <= weightSum) {
            return segment;
        }
    }
    return WHEEL_SEGMENTS[0];
}

// إدارة العجلة
router.post('/', async (req, res) => {
    try {
        const user = req.user;
        if (user.balance < SPIN_COST) {
            return res.status(400).json({ message: 'رصيدك غير كافٍ' });
        }

        // --- بداية التعديل: استخدام قاعدة البيانات للإحصائيات ---
        // 1. جلب أو إنشاء وثيقة الإحصائيات
        let stats = await SystemStats.findById('main_stats');
        if (!stats) {
            stats = new SystemStats();
        }

        // 2. الحصول على نتيجة الدوران بناءً على الإحصائيات الحالية
        const winAmount = getWeightedSpinResult(stats);
        
        const netResult = winAmount - SPIN_COST;
        const status = netResult >= 0 ? 'win' : 'lose';

        // 3. تحديث رصيد المستخدم
        user.balance -= SPIN_COST;
        if (winAmount > 0) {
            user.balance += winAmount;
        }
        
        // 4. تحديث الإحصائيات في قاعدة البيانات
        // نستخدم $inc لضمان التحديث الآمن حتى مع وجود طلبات متزامنة
        const updatedStats = await SystemStats.findByIdAndUpdate(
            'main_stats',
            { 
                $inc: { 
                    totalSpins: 1, 
                    totalWins: winAmount 
                } 
            },
            { upsert: true, new: true } // upsert: أنشئ الوثيقة إذا لم تكن موجودة
        );
        
        // 5. حفظ جميع التغييرات (المستخدم، الدوران، المعاملة)
        await user.save();

        const spin = new Spin({ user: user._id, amount: winAmount, cost: SPIN_COST, status, netResult });
        await spin.save();

        const transaction = new Transaction({ user: user._id, type: 'spin', amount: SPIN_COST, status, note: status === 'win' ? `ربحت $${winAmount} من عجلة الحظ` : 'دوران عجلة الحظ' });
        await transaction.save();
        // --- نهاية التعديل ---

        res.json({
            amount: winAmount,
            cost: SPIN_COST,
            netResult: netResult,
            status: status,
            newBalance: user.balance
        });

    } catch (error) {
        console.error('Spin error:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

module.exports = router;
