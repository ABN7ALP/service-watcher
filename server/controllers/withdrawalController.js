const mongoose = require('mongoose');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const walletService = require('../utils/walletService');
const pinService = require('../utils/withdrawalPinService');

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
        const { method, amount, fullName, officeInfo, pin } = req.body;

                const SystemSettings = require('../models/SystemSettings');
        const settings = await SystemSettings.getSettings();
        const minWithdraw = settings.minWithdrawUSD || DEFAULT_MIN_WITHDRAW_USD;

        const { parseMoneyInput } = require('../utils/money');
        const numAmount = parseMoneyInput(amount, { min: minWithdraw, max: 1000000 });
        if (numAmount === null) {
            return res.status(400).json({ status: 'fail', message: `مبلغ غير صالح. الحد الأدنى للسحب هو ${minWithdraw}$` });
        }
        

        // ✅ حد السحب اليومي: نجمع كل طلبات اليوم (المعلّقة والمكتملة، دون المرفوضة) لهذا المستخدم
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const mongoose = require('mongoose');
        const todayWithdrawalsAgg = await Withdrawal.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId), status: { $in: ['pending', 'processing', 'completed'] }, createdAt: { $gte: startOfToday } } },
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

                const pinUser = await User.findById(userId).select('payoutShamCashWallet withdrawalBlockedUntil payoutWalletChangedAt');
        if (!pinUser) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });

        // 🛡️ مراجعة الأمان v2 (البند 2) — الرمز إلزامي لكل طلب سحب، ومحفظة شام كاش تُقرأ من
        // المحفظة المحفوظة (payoutShamCashWallet) لا من حقل حرّ بالطلب — تغييرها فعل منفصل
        // يتطلّب الرمز بنفسه (راجع /payout-wallet)، فلا يمكن تجاوز حظر 48 ساعة بإرسال رقم جديد هنا
        let walletNumber;
        if (method === 'sham_cash') {
            if (!pinUser.payoutShamCashWallet) {
                return res.status(400).json({ status: 'fail', message: 'يرجى حفظ محفظة شام كاش أولاً من صفحة السحب' });
            }
            walletNumber = pinUser.payoutShamCashWallet;
        } else if (method === 'office') {
            if (!officeInfo || !officeInfo.country || !officeInfo.governorate || !officeInfo.area || !officeInfo.phone) {
                return res.status(400).json({ status: 'fail', message: 'يرجى إدخال كل بيانات المكتب المطلوبة' });
            }
        } else {
            return res.status(400).json({ status: 'fail', message: 'طريقة سحب غير صالحة' });
        }

        const block = pinService.isWithdrawalBlocked(pinUser);
        if (block.blocked) {
            return res.status(423).json({
                status: 'fail',
                message: block.reason === 'WALLET_CHANGE_HOLD'
                    ? 'السحب موقوف 48 ساعة بعد تغيير محفظة الصرف'
                    : 'السحب موقوف مؤقتاً بعد تغيير رمز السحب',
                withdrawalBlockedUntil: block.until
            });
        }

        const pinResult = await pinService.verifyWithdrawalPin(userId, pin);
        if (!pinResult.ok) {
            const httpStatus = (pinResult.code === 'LOCKED' || pinResult.code === 'LOCKED_NOW') ? 423 : 400;
            return res.status(httpStatus).json({
                status: 'fail',
                code: pinResult.code,
                message: pinResult.code === 'NOT_SET' ? 'يرجى إنشاء رمز سحب أولاً' : 'رمز السحب غير صحيح',
                lockedUntil: pinResult.lockedUntil || null,
                remainingAttempts: pinResult.remainingAttempts
            });
        }

        // ✅ دفتر الأستاذ (feat/wallet-ledger-v1): الحجز الذرّي (usd_cents) وإنشاء الطلب معاً
        // بمعاملة Mongo واحدة — فشل الإنشاء يُسقِط الحجز تلقائياً (لا حاجة لاسترداد تعويضي
        // يدوي قد يفشل هو نفسه ويترك المبلغ عالقاً، كما كان بالنمط السابق)
        const idemBase = new mongoose.Types.ObjectId();
        const session = await mongoose.startSession();
        let user = null;
        let withdrawal = null;
        try {
            await session.withTransaction(async () => {
                await walletService.post([{
                    user: userId, wallet: 'usd_cents', delta: -Math.round(numAmount * 100), type: 'withdraw',
                    refType: 'Withdrawal', refId: idemBase, idempotencyKey: `${idemBase}:reserve`
                }], session);
                user = await User.findById(userId).select('balance socketId').session(session);

                const docs = await Withdrawal.create([{
                    _id: idemBase,
                    user: userId,
                    method,
                    amount: numAmount,
                    netAmount: numAmount, // يمكن خصم عمولة لاحقاً إذا رغبت
                    fullName: fullName.trim(),
                    walletNumber: method === 'sham_cash' ? walletNumber.trim() : undefined,
                    officeInfo: method === 'office' ? officeInfo : undefined,
                    status: 'pending'
                }], { session });
                withdrawal = docs[0];
            });
        } catch (txError) {
            if (txError.code === 'INSUFFICIENT_FUNDS') {
                return res.status(400).json({ status: 'fail', message: 'رصيدك غير كافٍ لإتمام عملية السحب' });
            }
            console.error('[ERROR] createWithdrawal transaction failed:', txError);
            return res.status(500).json({ status: 'fail', message: 'تعذّر إنشاء طلب السحب' });
        } finally {
            await session.endSession();
        }

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
        if (action !== 'approve' && action !== 'reject') {
            return res.status(400).json({ status: 'fail', message: 'إجراء غير صالح' });
        }

        // 🛡️ إصلاح جذري (مراجعة أمنية — redteam-audit-1، البند #5): كان الفحص (status!=='pending')
        // وتعديل الرصيد لاحقاً (user.balance += ...; save()) عمليتين منفصلتين تماماً بلا أي قفل —
        // أُثبِت فعلياً: طلبا "رفض" متزامنان لنفس الطلب أعادا كلاهما المبلغ (استرداد مزدوج). نفس
        // نمط adminReviewCustomGift (المرجع السليم فعلاً بهذا المشروع): حجز ذرّي واحد
        // (findOneAndUpdate بشرط status:'pending') يضمن أن محاولة ثانية على نفس الطلب تصطدم
        // بفشل الحجز نفسه فوراً — لا فرصة لتنفيذ الاسترداد مرتين إطلاقاً
        const rejectionReason = action === 'reject' ? (reason || 'لم يُحدد سبب') : null;
        const session = await mongoose.startSession();
        let withdrawal = null;
        let user = null;
        try {
            await session.withTransaction(async () => {
                const newStatus = action === 'approve' ? 'completed' : 'rejected';
                const update = {
                    status: newStatus, processedBy: req.admin._id, processedAt: new Date()
                };
                if (newStatus === 'completed') update.completedAt = new Date();
                if (newStatus === 'rejected') update.rejectionReason = rejectionReason;

                withdrawal = await Withdrawal.findOneAndUpdate(
                    { _id: withdrawalId, status: 'pending' },
                    { $set: update },
                    { new: true, session }
                );
                if (!withdrawal) {
                    throw Object.assign(new Error('تمت معالجة هذا الطلب مسبقاً'), { code: 'ALREADY_REVIEWED' });
                }

                if (action === 'reject') {
                    // ✅ استرداد المبلغ المحجوز ذرّياً بنفس المعاملة — لا فرصة لاسترداد مزدوج
                    await walletService.post([{
                        user: withdrawal.user, wallet: 'usd_cents', delta: Math.round(withdrawal.amount * 100), type: 'refund',
                        refType: 'Withdrawal', refId: withdrawal._id, idempotencyKey: `${withdrawal._id}:refund`
                    }], session);
                    user = await User.findById(withdrawal.user).select('balance socketId').session(session);
                } else {
                    user = await User.findById(withdrawal.user).session(session);
                }
            });
        } catch (txError) {
            if (txError.code === 'ALREADY_REVIEWED') {
                return res.status(409).json({ status: 'fail', message: txError.message });
            }
            throw txError;
        } finally {
            await session.endSession();
        }

        const io = req.app.get('socketio');
        if (action === 'reject' && io && user?.socketId) {
            io.to(user.socketId).emit('balanceUpdate', { newBalance: user.balance });
        }

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
        const { sendBotMessage } = require('../utils/botMessenger');
        if (user) {
            
            await sendBotMessage(io, user._id,
                action === 'approve'
                    ? `✅ تمت الموافقة على طلب سحبك بمبلغ ${withdrawal.amount}$`
                    : `❌ تم رفض طلب سحبك (${withdrawal.amount}$). السبب: ${withdrawal.rejectionReason}\nتم إرجاع المبلغ لرصيدك.`
            );
        }

        res.status(200).json({ status: 'success', message: 'تم تحديث حالة الطلب', data: { withdrawal } });

    } catch (error) {
        console.error('[ERROR] in reviewWithdrawal:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};
