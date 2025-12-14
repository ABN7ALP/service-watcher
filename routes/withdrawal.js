// 📁 routes/withdrawal.js
const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawalController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// 📤 تقديم طلب سحب جديد
router.post('/request', withdrawalController.createWithdrawalRequest);

// 📋 طلبات السحب الخاصة بي
router.get('/my-requests', withdrawalController.getMyWithdrawals);

// 📊 إحصائيات السحب
router.get('/stats', withdrawalController.getWithdrawalStats);

// ❌ إلغاء طلب سحب
router.post('/:id/cancel', withdrawalController.cancelWithdrawal);

module.exports = router;



// 📁 routes/withdrawal.js - أضف هذه المسارات

// إحصائيات السحب
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const [monthStats, todayStats, allWithdrawals] = await Promise.all([
            // إحصائيات الشهر
            WithdrawalRequest.aggregate([
                {
                    $match: {
                        userId: req.userId,
                        createdAt: { 
                            $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                        },
                        status: { $in: ['completed', 'processing'] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        monthlyRequests: { $sum: 1 },
                        monthlyAmount: { $sum: '$amount' }
                    }
                }
            ]),
            
            // إحصائيات اليوم
            WithdrawalRequest.aggregate([
                {
                    $match: {
                        userId: req.userId,
                        createdAt: { $gte: today },
                        status: { $in: ['completed', 'processing'] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        todayWithdrawn: { $sum: '$amount' }
                    }
                }
            ]),
            
            // جميع السحوبات لحساب متوسط الوقت
            WithdrawalRequest.find({
                userId: req.userId,
                status: 'completed',
                completedAt: { $exists: true }
            })
        ]);
        
        const stats = {
            monthlyRequests: monthStats[0]?.monthlyRequests || 0,
            monthlyAmount: monthStats[0]?.monthlyAmount || 0,
            todayWithdrawn: todayStats[0]?.todayWithdrawn || 0,
            dailyLimit: user?.withdrawalLimit || 1000,
            minWithdrawal: 10, // ثابت
            avgProcessingTime: '24 ساعة',
            completionRate: '100%'
        };
        
        // حساب متوسط وقت المعالجة
        if (allWithdrawals.length > 0) {
            const totalProcessingTime = allWithdrawals.reduce((sum, w) => {
                if (w.completedAt && w.createdAt) {
                    return sum + (w.completedAt - w.createdAt);
                }
                return sum;
            }, 0);
            
            const avgTime = totalProcessingTime / allWithdrawals.length;
            const avgHours = Math.round(avgTime / (1000 * 60 * 60));
            stats.avgProcessingTime = `${avgHours} ساعة`;
            
            // حساب نسبة الإكمال
            const totalRequests = await WithdrawalRequest.countDocuments({ userId: req.userId });
            const completedRequests = await WithdrawalRequest.countDocuments({ 
                userId: req.userId, 
                status: 'completed' 
            });
            
            if (totalRequests > 0) {
                stats.completionRate = `${Math.round((completedRequests / totalRequests) * 100)}%`;
            }
        }
        
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '❌ خطأ في جلب إحصائيات السحب'
        });
    }
});

// آخر طلبات السحب
router.get('/my-requests', authMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        
        const withdrawals = await WithdrawalRequest.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('amount status createdAt');
        
        res.json({
            success: true,
            withdrawals
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '❌ خطأ في جلب طلبات السحب'
        });
    }
});
