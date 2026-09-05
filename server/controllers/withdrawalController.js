const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');

// ✅ القيمة الافتراضية fallback فقط — القيمة الفعلية تُقرأ من SystemSettings عند كل طلب
const DEFAULT_MIN_WITHDRAW_USD = 5;

// جلب طلبات السحب الخاصة بالمستخدم
exports.getMyWithdrawals = async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find({ user: req.user.id }).sort('-createdAt');
        res.status(200).json({ status: 'success', data: { withdrawals } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// إنشاء طلب سحب (شام كاش أو مكتب)
exports.createWithdrawal = async (req, res) => {
    try {
        const userId = req.user.id;
        const { method, amount, fullName, walletNumber, officeInfo } = req.body;

                const SystemSettings = require('../models/SystemSettings');
        const settings = await SystemSettings.getSettings();
        const minWithdraw = settings.minWithdrawUSD || DEFAULT_MIN_WITHDRAW_USD;

                const SystemSettings = require('../models/SystemSettings');
        const settings = await SystemSettings.getSettings();
        const minWithdraw = settings.minWithdrawUSD || DEFAULT_MIN_WITHDRAW_USD;

        const numAmount = parseFloat(amount);
        if (!numAmount || numAmount < minWithdraw) {
            return res.status(400).json({ status: 'fail', message: `الحد الأدنى للسحب هو ${minWithdraw}$` });
        }

        // ✅ حد السحب اليومي: نجمع كل طلبات اليوم (المعلّقة والمكتملة، دون المرفوضة) لهذا المستخدم
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const todayWithdrawalsAgg = await Withdrawal.aggregate([
            { $match: { user: require('mongoose').Types.ObjectId(userId), status: { $in: ['pending', 'processing', 'completed'] }, createdAt: { $gte: startOfToday } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const todayTotal = todayWithdrawalsAgg[0]?.total || 0;
        const dailyLimit = settings.maxDailyWithdrawalUSD || 500;
        if (todayTotal + numAmount > dailyLimit) {
            return res.status(400).json({
                status: 'fail',
                message: `تجاوزت الحد الأقصى للسحب اليومي (${dailyLimit}$). المتبقي المتاح اليوم: ${Math.max(dailyLimit - todayTotal, 0).toFixed(2)}$`
            });
        }

        if (!fullName || fullName.trim().length < 3) {
            return res.status(400).json({ status: 'fail', message: 'يرجى إدخال الاسم الكامل' });
        }

        const user = await User.findById(userId);

        // ✅ التحقق الدقيق من كفاية الرصيد
        if (user.balance < numAmount) {
            return res.status(400).json({ status: 'fail', message: 'رصيدك غير كافٍ لإتمام عملية السحب' });
        }

        if (method === 'sham_cash') {
            if (!walletNumber || walletNumber.trim().length < 3) {
                return res.status(400).json({ status: 'fail', message: 'يرجى إدخال رابط محفظة شام كاش' });
            }
        } else if (method === 'office') {
            if (!officeInfo || !officeInfo.country || !officeInfo.governorate || !officeInfo.area || !officeInfo.phone) {
                return res.status(400).json({ status: 'fail', message: 'يرجى إدخال كل بيانات المكتب المطلوبة' });
            }
        } else {
            return res.status(400).json({ status: 'fail', message: 'طريقة سحب غير صالحة' });
        }

        // ✅ حماية من التلاعب: نحجز المبلغ فوراً من رصيد المستخدم عند إنشاء الطلب
        // بحيث لا يقدر يفتح عدة طلبات سحب متتالية تتجاوز رصيده الفعلي
        user.balance -= numAmount;
        await user.save();

        const withdrawal = await Withdrawal.create({
            user: userId,
            method,
            amount: numAmount,
            netAmount: numAmount, // يمكن خصم عمولة لاحقاً إذا رغبت
            fullName: fullName.trim(),
            walletNumber: method === 'sham_cash' ? walletNumber.trim() : undefined,
            officeInfo: method === 'office' ? officeInfo : undefined,
            status: 'pending'
        });

        const io = req.app.get('socketio');
        if (io && user.socketId) {
            io.to(user.socketId).emit('balanceUpdate', { newBalance: user.balance });
        }

        const etaMessage = method === 'sham_cash'
            ? 'ستتم معالجة طلبك خلال ساعة إلى 3 ساعات'
            : 'ستتم معالجة طلبك خلال يوم إلى 3 أيام';

        res.status(201).json({
            status: 'success',
            message: `تم استلام طلب السحب بنجاح. ${etaMessage}`,
            data: { withdrawal }
        });

    } catch (error) {
        console.error('[ERROR] in createWithdrawal:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ===== لوحة التحكم =====
exports.getAllWithdrawals = async (req, res) => {
    try {
        const { status } = req.query;
        const query = {};
        if (status && status !== 'all') query.status = status;

        const withdrawals = await Withdrawal.find(query)
            .populate('user', 'username profileImage customId')
            .sort('-createdAt')
            .limit(200);

        res.status(200).json({ status: 'success', data: { withdrawals } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.reviewWithdrawal = async (req, res) => {
    try {
        const { withdrawalId } = req.params;
        const { action, reason } = req.body; // action: 'approve' | 'reject'

        const withdrawal = await Withdrawal.findById(withdrawalId);
        if (!withdrawal) return res.status(404).json({ status: 'fail', message: 'الطلب غير موجود' });
        if (withdrawal.status !== 'pending') {
            return res.status(400).json({ status: 'fail', message: 'تمت معالجة هذا الطلب مسبقاً' });
        }

        const io = req.app.get('socketio');
        const user = await User.findById(withdrawal.user);

        if (action === 'approve') {
            withdrawal.status = 'completed';
            withdrawal.completedAt = new Date();
        } else if (action === 'reject') {
            withdrawal.status = 'rejected';
            withdrawal.rejectionReason = reason || 'لم يُحدد سبب';
            // ✅ إعادة المبلغ المحجوز فور الرفض
            if (user) {
                user.balance += withdrawal.amount;
                await user.save();
                if (io && user.socketId) {
                    io.to(user.socketId).emit('balanceUpdate', { newBalance: user.balance });
                }
            }
        } else {
            return res.status(400).json({ status: 'fail', message: 'إجراء غير صالح' });
        }

                withdrawal.processedBy = req.admin._id;
        withdrawal.processedAt = new Date();
        await withdrawal.save();

        const AdminLog = require('../models/AdminLog');
        await AdminLog.logAction({
            admin: req.admin._id,
            action: action === 'approve' ? 'approve_withdrawal' : 'reject_withdrawal',
            targetUser: withdrawal.user,
            targetEntity: 'withdrawal',
            entityId: withdrawal._id,
            details: { amount: withdrawal.amount, reason: withdrawal.rejectionReason || null },
            severity: 'warning',
            ipAddress: req.ip
        });

        if (io && user?.socketId) {
            io.to(user.socketId).emit('withdrawalStatusUpdated', {
                withdrawalId: withdrawal._id,
                status: withdrawal.status,
                reason: withdrawal.rejectionReason || null
            });
        }

        res.status(200).json({ status: 'success', message: 'تم تحديث حالة الطلب', data: { withdrawal } });

    } catch (error) {
        console.error('[ERROR] in reviewWithdrawal:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};
