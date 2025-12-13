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

// أضف هذه الدوال في نهاية الملف:

// 📋 الحصول على جميع طلبات السحب
exports.getAllWithdrawals = [
    adminOnly,
    async (req, res) => {
        try {
            const { status, page = 1, limit = 50 } = req.query;
            
            const query = {};
            if (status) query.status = status;
            
            const withdrawals = await WithdrawalRequest.find(query)
                .populate('userId', 'username email')
                .populate('reviewedBy', 'username')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(parseInt(limit));
            
            const total = await WithdrawalRequest.countDocuments(query);
            
            res.json({
                success: true,
                withdrawals,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: '❌ خطأ في جلب طلبات السحب'
            });
        }
    }
];

// ⚙️ إدارة طلبات السحب
exports.manageWithdrawal = [
    adminOnly,
    async (req, res) => {
        try {
            const { action, requestId, transactionId, notes, adminNotes } = req.body;
            
            if (!['approve', 'reject', 'process', 'complete', 'cancel'].includes(action)) {
                return res.status(400).json({
                    success: false,
                    message: '❌ إجراء غير صالح'
                });
            }
            
            const withdrawal = await WithdrawalRequest.findById(requestId)
                .populate('userId');
            
            if (!withdrawal) {
                return res.status(404).json({
                    success: false,
                    message: '❌ طلب السحب غير موجود'
                });
            }
            
            const session = await User.startSession();
            session.startTransaction();
            
            try {
                let newStatus, userMessage;
                
                switch (action) {
                    case 'approve':
                        newStatus = 'processing';
                        userMessage = '✅ تمت الموافقة على سحبك، جاري المعالجة.';
                        // هنا يمكنك تفعيل الدفع التلقائي إذا كان متاحاً
                        break;
                        
                    case 'reject':
                        newStatus = 'rejected';
                        userMessage = '❌ تم رفض طلب السحب. ' + (notes || '');
                        
                        // إرجاع المبلغ للمستخدم
                        withdrawal.userId.balance += withdrawal.amount;
                        withdrawal.userId.totalWithdrawn -= withdrawal.amount;
                        await withdrawal.userId.save({ session });
                        
                        // تسجيل معاملة الإرجاع
                        const refundTransaction = new Transaction({
                            userId: withdrawal.userId._id,
                            type: 'withdrawal',
                            amount: withdrawal.amount,
                            description: `إرجاع مبلغ سحب مرفوض #${withdrawal._id}`,
                            status: 'completed'
                        });
                        await refundTransaction.save({ session });
                        break;
                        
                    case 'complete':
                        if (withdrawal.status !== 'processing') {
                            throw new Error('لا يمكن إكمال طلب غير قيد المعالجة');
                        }
                        
                        newStatus = 'completed';
                        userMessage = '✅ تم إكمال عملية السحب، تحقق من حسابك.';
                        withdrawal.completedAt = new Date();
                        withdrawal.transactionId = transactionId;
                        
                        // تسجيل المعاملة النهائية
                        const completeTransaction = new Transaction({
                            userId: withdrawal.userId._id,
                            type: 'withdrawal',
                            amount: -withdrawal.amount,
                            description: `سحب ناجح #${withdrawal._id} - ${transactionId}`,
                            status: 'completed',
                            referenceId: transactionId
                        });
                        await completeTransaction.save({ session });
                        break;
                        
                    case 'process':
                        newStatus = 'processing';
                        userMessage = '⏳ جاري معالجة طلب السحب.';
                        break;
                        
                    case 'cancel':
                        newStatus = 'cancelled';
                        userMessage = '⚠️ تم إلغاء طلب السحب.';
                        
                        // إرجاع المبلغ إذا كان مجمداً
                        if (withdrawal.status === 'pending') {
                            withdrawal.userId.balance += withdrawal.amount;
                            withdrawal.userId.totalWithdrawn -= withdrawal.amount;
                            await withdrawal.userId.save({ session });
                        }
                        break;
                }
                
                withdrawal.status = newStatus;
                withdrawal.reviewedBy = req.userId;
                withdrawal.reviewedAt = new Date();
                withdrawal.reviewNotes = notes || '';
                if (adminNotes) {
                    withdrawal.adminNotes = adminNotes;
                }
                
                await withdrawal.save({ session });
                
                // إرسال إشعار للمستخدم
                await addToQueue('notification', 'withdrawal_status', {
                    userId: withdrawal.userId._id,
                    withdrawalId: withdrawal._id,
                    status: newStatus,
                    message: userMessage
                });
                
                await session.commitTransaction();
                session.endSession();
                
                res.json({
                    success: true,
                    message: `✅ تم ${action} طلب السحب بنجاح`,
                    data: {
                        requestId: withdrawal._id,
                        newStatus: withdrawal.status,
                        userMessage
                    }
                });
                
            } catch (error) {
                await session.abortTransaction();
                session.endSession();
                throw error;
            }
            
        } catch (error) {
            console.error('❌ خطأ في إدارة السحب:', error);
            res.status(500).json({
                success: false,
                message: error.message || '❌ حدث خطأ أثناء معالجة الطلب'
            });
        }
    }
];

// 👤 إدارة المستخدمين
exports.manageUsers = [
    adminOnly,
    async (req, res) => {
        try {
            const { userId, action, data } = req.body;
            
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: '❌ المستخدم غير موجود'
                });
            }
            
            switch (action) {
                case 'update_balance':
                    const { amount, type, reason } = data;
                    if (!amount || !type || !reason) {
                        return res.status(400).json({
                            success: false,
                            message: '❌ البيانات ناقصة'
                        });
                    }
                    
                    const session = await User.startSession();
                    session.startTransaction();
                    
                    try {
                        if (type === 'add') {
                            user.balance += parseFloat(amount);
                        } else if (type === 'subtract') {
                            user.balance -= parseFloat(amount);
                        } else {
                            throw new Error('نوع العملية غير صالح');
                        }
                        
                        if (user.balance < 0) {
                            throw new Error('لا يمكن أن يصبح الرصيد سالباً');
                        }
                        
                        await user.save({ session });
                        
                        // تسجيل المعاملة
                        const transaction = new Transaction({
                            userId: user._id,
                            type: type === 'add' ? 'bonus' : 'penalty',
                            amount: type === 'add' ? parseFloat(amount) : -parseFloat(amount),
                            description: `تعديل يدوي من الأدمن: ${reason}`,
                            status: 'completed',
                            metadata: { adminId: req.userId }
                        });
                        await transaction.save({ session });
                        
                        await session.commitTransaction();
                        session.endSession();
                        
                        res.json({
                            success: true,
                            message: `✅ تم ${type === 'add' ? 'إضافة' : 'خصم'} ${amount}$ للمستخدم`,
                            newBalance: user.balance
                        });
                        
                    } catch (error) {
                        await session.abortTransaction();
                        session.endSession();
                        throw error;
                    }
                    break;
                    
                case 'toggle_active':
                    user.isActive = !user.isActive;
                    await user.save();
                    
                    res.json({
                        success: true,
                        message: `✅ تم ${user.isActive ? 'تفعيل' : 'تعطيل'} حساب المستخدم`,
                        isActive: user.isActive
                    });
                    break;
                    
                case 'update_role':
                    if (!['user', 'admin'].includes(data.role)) {
                        return res.status(400).json({
                            success: false,
                            message: '❌ الدور غير صالح'
                        });
                    }
                    
                    user.role = data.role;
                    await user.save();
                    
                    res.json({
                        success: true,
                        message: `✅ تم تحديث دور المستخدم إلى ${data.role}`,
                        role: user.role
                    });
                    break;
                    
                default:
                    return res.status(400).json({
                        success: false,
                        message: '❌ إجراء غير معروف'
                    });
            }
            
        } catch (error) {
            console.error('❌ خطأ في إدارة المستخدم:', error);
            res.status(500).json({
                success: false,
                message: error.message || '❌ حدث خطأ'
            });
        }
    }
];

// 📈 تقارير متقدمة
exports.getAdvancedReports = [
    adminOnly,
    async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            
            const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const end = endDate ? new Date(endDate) : new Date();
            
            // إحصائيات مالية
            const financialReport = await Transaction.aggregate([
                {
                    $match: {
                        createdAt: { $gte: start, $lte: end },
                        status: 'completed'
                    }
                },
                {
                    $group: {
                        _id: '$type',
                        totalAmount: { $sum: '$amount' },
                        count: { $sum: 1 }
                    }
                }
            ]);
            
            // إحصائيات العجلة
            const wheelReport = await WheelSpin.aggregate([
                {
                    $match: {
                        createdAt: { $gte: start, $lte: end }
                    }
                },
                {
                    $group: {
                        _id: '$resultIndex',
                        count: { $sum: 1 },
                        totalPrize: { $sum: '$prize' },
                        totalCost: { $sum: '$cost' }
                    }
                },
                {
                    $sort: { '_id': 1 }
                }
            ]);
            
            // أفضل اللاعبين
            const topPlayers = await WheelSpin.aggregate([
                {
                    $match: {
                        createdAt: { $gte: start, $lte: end }
                    }
                },
                {
                    $group: {
                        _id: '$userId',
                        totalSpins: { $sum: 1 },
                        totalSpent: { $sum: '$cost' },
                        totalWon: { $sum: '$prize' },
                        netProfit: { $sum: { $subtract: ['$prize', '$cost'] } }
                    }
                },
                {
                    $sort: { totalSpins: -1 }
                },
                { $limit: 10 }
            ]);
            
            // تحميل بيانات المستخدمين للأفضل
            const topPlayerIds = topPlayers.map(p => p._id);
            const users = await User.find({ _id: { $in: topPlayerIds } });
            
            const topPlayersWithNames = topPlayers.map(player => {
                const user = users.find(u => u._id.equals(player._id));
                return {
                    ...player,
                    username: user ? user.username : 'Unknown',
                    email: user ? user.email : 'Unknown'
                };
            });
            
            res.json({
                success: true,
                report: {
                    period: { start, end },
                    financial: financialReport,
                    wheel: wheelReport,
                    topPlayers: topPlayersWithNames,
                    summary: {
                        totalUsers: await User.countDocuments({ createdAt: { $gte: start, $lte: end } }),
                        activeUsers: await User.countDocuments({ lastLogin: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
                        totalRevenue: financialReport.find(f => f._id === 'spin')?.totalAmount || 0,
                        platformProfit: Math.abs(financialReport.find(f => f._id === 'spin')?.totalAmount || 0) - 
                                      (financialReport.find(f => f._id === 'withdrawal')?.totalAmount || 0)
                    }
                }
            });
            
        } catch (error) {
            console.error('❌ خطأ في التقارير:', error);
            res.status(500).json({
                success: false,
                message: '❌ خطأ في توليد التقارير'
            });
        }
    }
];

// 📁 controllers/adminController.js - أضف هذه الدوال

// 📋 الحصول على جميع طلبات الإيداع
exports.getAllDeposits = [
    adminOnly,
    async (req, res) => {
        try {
            const { status, page = 1, limit = 50 } = req.query;
            
            const query = {};
            if (status) query.status = status;
            
            const deposits = await DepositRequest.find(query)
                .populate('userId', 'username email')
                .populate('reviewedBy', 'username')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(parseInt(limit));
            
            const total = await DepositRequest.countDocuments(query);
            
            res.json({
                success: true,
                deposits,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: '❌ خطأ في جلب طلبات الإيداع'
            });
        }
    }
];

// 👥 الحصول على جميع المستخدمين
exports.getAllUsers = [
    adminOnly,
    async (req, res) => {
        try {
            const { search, page = 1, limit = 50 } = req.query;
            
            const query = {};
            if (search) {
                query.$or = [
                    { username: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ];
            }
            
            const users = await User.find(query)
                .select('-password')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(parseInt(limit));
            
            const total = await User.countDocuments(query);
            
            res.json({
                success: true,
                users,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: '❌ خطأ في جلب المستخدمين'
            });
        }
    }
];

// ⚙️ الحصول على إعدادات العجلة
exports.getWheelSettings = [
    adminOnly,
    async (req, res) => {
        try {
            res.json({
                success: true,
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
            res.status(500).json({
                success: false,
                message: '❌ خطأ في جلب إعدادات العجلة'
            });
        }
    }
];

// 📊 إحصائيات الطوابير
exports.getQueueStats = [
    adminOnly,
    async (req, res) => {
        try {
            const queueService = require('../services/queueService');
            const stats = await queueService.getQueueStats();
            
            res.json({
                success: true,
                stats
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: '❌ خطأ في جلب إحصائيات الطوابير'
            });
        }
    }
];

// 🧹 تنظيف النظام
exports.systemCleanup = [
    adminOnly,
    async (req, res) => {
        try {
            const { action } = req.body;
            
            if (action === 'clear_old_transactions') {
                // حذف المعاملات الأقدم من 30 يوم
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                const deleted = await Transaction.deleteMany({
                    createdAt: { $lt: thirtyDaysAgo },
                    type: { $in: ['spin', 'bonus', 'penalty'] }
                });
                
                res.json({
                    success: true,
                    message: `✅ تم حذف ${deleted.deletedCount} معاملة قديمة`
                });
            } else if (action === 'recalculate_balances') {
                // إعادة حساب الأرصدة
                const users = await User.find();
                let updated = 0;
                
                for (const user of users) {
                    const transactions = await Transaction.aggregate([
                        { $match: { userId: user._id, status: 'completed' } },
                        { $group: { _id: null, total: { $sum: '$amount' } } }
                    ]);
                    
                    const newBalance = transactions[0]?.total || 0;
                    if (user.balance !== newBalance) {
                        user.balance = newBalance;
                        await user.save();
                        updated++;
                    }
                }
                
                res.json({
                    success: true,
                    message: `✅ تم تحديث ${updated} حساب`
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: '❌ إجراء غير معروف'
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                message: '❌ خطأ في التنظيف'
            });
        }
    }
];

