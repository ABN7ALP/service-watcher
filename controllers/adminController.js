// 📁 controllers/adminController.js
const DepositRequest = require('../models/DepositRequest');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const WheelSpin = require('../models/WheelSpin');
const wheelService = require('../services/wheelService');

// التحقق من صلاحيات الأدمن
const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: '❌ صلاحية الدخول مرفوضة. الأدمن فقط'
        });
    }
    next();
};

// 📊 إحصائيات الموقع
exports.getDashboardStats = [
    adminOnly,
    async (req, res) => {
        try {
            // احصائيات سريعة
            const [
                totalUsers,
                totalDeposits,
                totalWithdrawals,
                totalSpins,
                pendingDeposits,
                pendingWithdrawals,
                todayRevenue,
                todaySpins
            ] = await Promise.all([
                User.countDocuments(),
                Transaction.aggregate([
                    { $match: { type: 'deposit', status: 'completed' } },
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ]),
                Transaction.aggregate([
                    { $match: { type: 'withdrawal', status: 'completed' } },
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ]),
                WheelSpin.countDocuments(),
                DepositRequest.countDocuments({ status: 'pending' }),
                // WithdrawalRequest.countDocuments({ status: 'pending' }), // سنضيفه لاحقاً
                Transaction.aggregate([
                    { 
                        $match: { 
                            type: 'spin',
                            createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) }
                        } 
                    },
                    { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
                ]),
                WheelSpin.countDocuments({
                    createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) }
                })
            ]);
            
            res.json({
                success: true,
                stats: {
                    users: {
                        total: totalUsers,
                        active: await User.countDocuments({ isActive: true }),
                        newToday: await User.countDocuments({
                            createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) }
                        })
                    },
                    financial: {
                        totalDeposits: totalDeposits[0]?.total || 0,
                        totalWithdrawals: totalWithdrawals[0]?.total || 0,
                        platformBalance: (totalDeposits[0]?.total || 0) - (totalWithdrawals[0]?.total || 0),
                        todayRevenue: todayRevenue[0]?.total || 0
                    },
                    spins: {
                        total: totalSpins,
                        today: todaySpins,
                        expectedProfit: wheelService.calculateExpectedProfit(totalSpins)
                    },
                    pending: {
                        deposits: pendingDeposits,
                        withdrawals: 0 // pendingWithdrawals
                    }
                }
            });
        } catch (error) {
            console.error('❌ خطأ في إحصائيات الأدمن:', error);
            res.status(500).json({
                success: false,
                message: '❌ خطأ في جلب الإحصائيات'
            });
        }
    }
];

// 📋 إدارة طلبات الإيداع
exports.manageDeposits = [
    adminOnly,
    async (req, res) => {
        try {
            const { action, requestId, notes } = req.body;
            
            if (!['approve', 'reject', 'cancel'].includes(action)) {
                return res.status(400).json({
                    success: false,
                    message: '❌ إجراء غير صالح'
                });
            }
            
            const deposit = await DepositRequest.findById(requestId)
                .populate('userId');
            
            if (!deposit) {
                return res.status(404).json({
                    success: false,
                    message: '❌ طلب الإيداع غير موجود'
                });
            }
            
            // بدء جلسة للمعاملات
            const session = await User.startSession();
            session.startTransaction();
            
            try {
                // تحديث حالة الطلب
                let newStatus, userMessage, transactionAmount;
                
                if (action === 'approve') {
                    newStatus = 'approved';
                    userMessage = '✅ تمت الموافقة على إيداعك، تم إضافة الرصيد لحسابك.';
                    transactionAmount = deposit.amount;
                    
                    // إضافة الرصيد للمستخدم
                    deposit.userId.balance += deposit.amount;
                    deposit.userId.totalDeposited += deposit.amount;
                    await deposit.userId.save({ session });
                    
                    // تسجيل المعاملة
                    const transaction = new Transaction({
                        userId: deposit.userId._id,
                        type: 'deposit',
                        amount: deposit.amount,
                        description: `إيداع عبر شام كاش - ${deposit.transactionId}`,
                        status: 'completed',
                        referenceId: deposit.transactionId
                    });
                    await transaction.save({ session });
                    
                } else if (action === 'reject') {
                    newStatus = 'rejected';
                    userMessage = '❌ تم رفض طلب الإيداع. ' + (notes || 'يرجى التحقق من البيانات.');
                    
                } else {
                    newStatus = 'cancelled';
                    userMessage = '⚠️ تم إلغاء طلب الإيداع.';
                }
                
                deposit.status = newStatus;
                deposit.reviewedBy = req.userId;
                deposit.reviewedAt = new Date();
                deposit.reviewNotes = notes || '';
                if (req.body.adminNotes) {
                    deposit.adminNotes = req.body.adminNotes;
                }
                
                await deposit.save({ session });
                
                // تأكيد العملية
                await session.commitTransaction();
                session.endSession();
                
                res.json({
                    success: true,
                    message: `✅ تم ${action === 'approve' ? 'الموافقة على' : action === 'reject' ? 'رفض' : 'إلغاء'} الطلب`,
                    data: {
                        requestId: deposit._id,
                        newStatus: deposit.status,
                        userMessage
                    }
                });
                
            } catch (error) {
                await session.abortTransaction();
                session.endSession();
                throw error;
            }
            
        } catch (error) {
            console.error('❌ خطأ في إدارة الإيداع:', error);
            res.status(500).json({
                success: false,
                message: '❌ حدث خطأ أثناء معالجة الطلب'
            });
        }
    }
];

// ⚙️ التحكم في إعدادات العجلة
exports.updateWheelSettings = [
    adminOnly,
    async (req, res) => {
        try {
            const { weights, spinCost, minWithdrawal } = req.body;
            
            let updateMessage = '';
            
            // تحديث الأوزان إذا أرسلت
            if (weights && Array.isArray(weights) && weights.length === 10) {
                const result = wheelService.updateWeights(weights);
                updateMessage += result.message + ' ';
            }
            
            // تحديث سعر الدوران
            if (spinCost && spinCost >= 0.1) {
                wheelService.wheelConfig.spinCost = parseFloat(spinCost);
                updateMessage += `✅ سعر الدوران الجديد: ${spinCost}$ `;
            }
            
            // تحديث الحد الأدنى للسحب
            if (minWithdrawal && minWithdrawal >= 1) {
                wheelService.wheelConfig.minWithdrawal = parseFloat(minWithdrawal);
                updateMessage += `✅ الحد الأدنى للسحب الجديد: ${minWithdrawal}$ `;
            }
            
            res.json({
                success: true,
                message: updateMessage || '✅ لا توجد تغييرات',
                config: {
                    prizes: wheelService.prizes,
                    weights: wheelService.weights,
                    spinCost: wheelService.wheelConfig.spinCost,
                    minWithdrawal: wheelService.wheelConfig.minWithdrawal,
                    expectedValue: wheelService.calculateExpectedValue(),
                    lastUpdated: wheelService.wheelConfig.lastUpdated
                }
            });
            
        } catch (error) {
            console.error('❌ خطأ في تحديث إعدادات العجلة:', error);
            res.status(400).json({
                success: false,
                message: error.message || '❌ خطأ في التحديث'
            });
        }
    }
];
