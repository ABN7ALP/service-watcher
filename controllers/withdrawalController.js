// 📁 controllers/withdrawalController.js
const WithdrawalRequest = require('../models/WithdrawalRequest');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { addToQueue } = require('../services/queueService');
const wheelService = require('../services/wheelService');
const NotificationService = require('../services/notificationService');

// 📤 تقديم طلب سحب جديد
exports.createWithdrawalRequest = async (req, res) => {
    const session = await User.startSession();
    session.startTransaction();
    
    try {
        const userId = req.userId;
        const { amount, paymentMethod, accountDetails } = req.body;
        const minWithdrawal = wheelService.wheelConfig.minWithdrawal || 10;
        
        // 1. التحقق من البيانات
        if (!amount || !paymentMethod || !accountDetails) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: '❌ جميع البيانات مطلوبة: المبلغ، طريقة الدفع، وبيانات الحساب'
            });
        }
        
        const withdrawalAmount = parseFloat(amount);
        
        // 2. التحقق من الحد الأدنى للسحب
        if (withdrawalAmount < minWithdrawal) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: `❌ الحد الأدنى للسحب هو ${minWithdrawal} دولار`
            });
        }
        
        // 3. الحصول على بيانات المستخدم والتحقق
        const user = await User.findById(userId).session(session);
        
        if (user.balance < withdrawalAmount) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: '❌ رصيدك غير كافي للسحب',
                balance: user.balance,
                required: withdrawalAmount
            });
        }
        
        // 4. التحقق من الحد اليومي للسحب
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (user.lastWithdrawalDate && user.lastWithdrawalDate >= today) {
            const withdrawnToday = await WithdrawalRequest.aggregate([
                {
                    $match: {
                        userId: user._id,
                        status: { $in: ['completed', 'processing'] },
                        createdAt: { $gte: today }
                    }
                },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            
            const totalWithdrawnToday = withdrawnToday[0]?.total || 0;
            
            if (totalWithdrawnToday + withdrawalAmount > user.withdrawalLimit) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({
                    success: false,
                    message: `❌ تجاوزت الحد اليومي للسحب (${user.withdrawalLimit}$)`,
                    withdrawnToday: totalWithdrawnToday,
                    remaining: user.withdrawalLimit - totalWithdrawnToday
                });
            }
        }
        
        // 5. تجميد المبلغ (خصم مؤقت)
        user.balance -= withdrawalAmount;
        user.totalWithdrawn += withdrawalAmount;
        user.lastWithdrawalDate = new Date();
        await user.save({ session });
        
        // 6. تسجيل معاملة التجميد
        const freezeTransaction = new Transaction({
            userId: user._id,
            type: 'withdrawal',
            amount: -withdrawalAmount,
            description: `تجميد مبلغ للسحب - ${paymentMethod}`,
            status: 'pending'
        });
        await freezeTransaction.save({ session });
        
        // 7. إنشاء طلب السحب
        const withdrawal = new WithdrawalRequest({
            userId: user._id,
            amount: withdrawalAmount,
            paymentMethod,
            accountDetails,
            status: 'pending'
        });
        
        await withdrawal.save({ session });
        
        // 8. إضافة للطابور للمعالجة
        await addToQueue('withdrawal', 'notify_withdrawal_request', { withdrawalId: withdrawal._id });
        
        // 9. تأكيد العملية
        await session.commitTransaction();
        session.endSession();
        
        res.json({
            success: true,
            message: '✅ تم استلام طلب السحب بنجاح',
            notice: '⏳ سيتم مراجعة طلبك خلال 24 ساعة',
            data: {
                requestId: withdrawal._id,
                amount: withdrawal.amount,
                paymentMethod: withdrawal.paymentMethod,
                currentBalance: user.balance,
                estimatedTime: '24 ساعة',
                status: withdrawal.status
            }
        });
        
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        
        console.error('❌ خطأ في طلب السحب:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء إنشاء طلب السحب',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 📋 الحصول على طلبات السحب الخاصة بي
exports.getMyWithdrawals = async (req, res) => {
    try {
        const userId = req.userId;
        const { status, limit = 20, page = 1 } = req.query;
        
        const query = { userId };
        if (status) query.status = status;
        
        const withdrawals = await WithdrawalRequest.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .select('-adminNotes');
        
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
};

// ❌ إلغاء طلب سحب (إذا كان pending)
exports.cancelWithdrawal = async (req, res) => {
    const session = await User.startSession();
    session.startTransaction();
    
    try {
        const withdrawal = await WithdrawalRequest.findById(req.params.id)
            .populate('userId');
        
        if (!withdrawal) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                message: '❌ طلب السحب غير موجود'
            });
        }
        
        // التحقق من الملكية
        if (withdrawal.userId._id.toString() !== req.userId.toString()) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({
                success: false,
                message: '❌ ليس لديك صلاحية لإلغاء هذا الطلب'
            });
        }
        
        // يمكن الإلغاء فقط إذا كان pending
        if (withdrawal.status !== 'pending') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: `❌ لا يمكن إلغاء الطلب في حالة "${withdrawal.status}"`
            });
        }
        
        // إرجاع المبلغ المجمد
        withdrawal.userId.balance += withdrawal.amount;
        withdrawal.userId.totalWithdrawn -= withdrawal.amount;
        await withdrawal.userId.save({ session });
        
        // تحديث حالة الطلب
        withdrawal.status = 'cancelled';
        withdrawal.reviewedAt = new Date();
        withdrawal.reviewNotes = 'تم الإلغاء من قبل المستخدم';
        await withdrawal.save({ session });
        
        // تسجيل المعاملة
        const transaction = new Transaction({
            userId: withdrawal.userId._id,
            type: 'withdrawal',
            amount: withdrawal.amount,
            description: `إلغاء طلب سحب #${withdrawal._id}`,
            status: 'cancelled'
        });
        await transaction.save({ session });
        
        await session.commitTransaction();
        session.endSession();
        
        res.json({
            success: true,
            message: '✅ تم إلغاء طلب السحب بنجاح',
            data: {
                amountReturned: withdrawal.amount,
                newBalance: withdrawal.userId.balance
            }
        });
        
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        
        console.error('❌ خطأ في إلغاء السحب:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء الإلغاء'
        });
    }
};

// 📊 الحصول على إحصائيات السحب
exports.getWithdrawalStats = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const withdrawnToday = await WithdrawalRequest.aggregate([
            {
                $match: {
                    userId: user._id,
                    status: { $in: ['completed', 'processing'] },
                    createdAt: { $gte: today }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const stats = {
            minWithdrawal: wheelService.wheelConfig.minWithdrawal || 10,
            maxDailyWithdrawal: user.withdrawalLimit,
            withdrawnToday: withdrawnToday[0]?.total || 0,
            remainingToday: user.withdrawalLimit - (withdrawnToday[0]?.total || 0),
            totalWithdrawn: user.totalWithdrawn,
            currentBalance: user.balance
        };
        
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
};
