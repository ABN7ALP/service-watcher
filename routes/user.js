// 📁 routes/user.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const WheelSpin = require('../models/WheelSpin');
const Transaction = require('../models/Transaction');

router.use(authMiddleware);

// إحصائيات اليوم
router.get('/stats/today', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const [todaySpins, todayTransactions] = await Promise.all([
            WheelSpin.countDocuments({
                userId: req.userId,
                createdAt: { $gte: today }
            }),
            Transaction.aggregate([
                {
                    $match: {
                        userId: req.userId,
                        type: 'spin',
                        createdAt: { $gte: today }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalWon: {
                            $sum: {
                                $cond: [{ $gt: ['$amount', 0] }, '$amount', 0]
                            }
                        }
                    }
                }
            ])
        ]);
        
        res.json({
            success: true,
            stats: {
                todaySpins,
                todayWon: todayTransactions[0]?.totalWon || 0
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '❌ خطأ في جلب إحصائيات اليوم'
        });
    }
});

// إحصائيات العجلة
router.get('/wheel/stats', async (req, res) => {
    try {
        const [spinStats, transactionStats] = await Promise.all([
            WheelSpin.aggregate([
                { $match: { userId: req.userId } },
                {
                    $group: {
                        _id: null,
                        totalSpins: { $sum: 1 },
                        totalSpent: { $sum: '$cost' },
                        totalWon: { $sum: '$prize' }
                    }
                }
            ]),
            Transaction.aggregate([
                { $match: { userId: req.userId } },
                {
                    $group: {
                        _id: '$type',
                        total: { $sum: '$amount' }
                    }
                }
            ])
        ]);
        
        const stats = spinStats[0] || { totalSpins: 0, totalSpent: 0, totalWon: 0 };
        
        // حساب إجمالي الإيداعات والسحوبات
        let totalDeposited = 0;
        let totalWithdrawn = 0;
        
        transactionStats.forEach(t => {
            if (t._id === 'deposit') totalDeposited += t.total;
            if (t._id === 'withdrawal') totalWithdrawn += Math.abs(t.total);
        });
        
        res.json({
            success: true,
            stats: {
                ...stats,
                totalDeposited,
                totalWithdrawn
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '❌ خطأ في جلب إحصائيات العجلة'
        });
    }
});

// آخر الدورات
router.get('/wheel/recent', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        
        const spins = await WheelSpin.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('prize createdAt');
        
        res.json({
            success: true,
            spins: spins.map(spin => ({
                prize: spin.prize,
                createdAt: spin.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '❌ خطأ في جلب آخر الدورات'
        });
    }
});

// إحصائيات الدعوة
router.get('/referrals/stats', async (req, res) => {
    try {
        // تجميلية - يمكنك إضافة نظام الدعوة لاحقاً
        res.json({
            success: true,
            stats: {
                referralCount: 0,
                referralEarnings: 0
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '❌ خطأ في جلب إحصائيات الدعوة'
        });
    }
});

module.exports = router;
