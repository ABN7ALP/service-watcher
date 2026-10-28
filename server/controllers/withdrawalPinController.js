// 🛡️ مراجعة الأمان v2 (البند 2) — رمز السحب: نقاط النهاية الوحيدة لإنشاء/تغيير/تصفير الرمز
// ومحفظة الصرف المحفوظة. كل التحقق الفعلي (القفل الذري، الرمز، كلمة السر) يعيش بـ
// withdrawalPinService.js — هذا الملف فقط يُترجم نتائجه إلى استجابات HTTP + إشعارات.
const User = require('../models/User');
const pinService = require('../utils/withdrawalPinService');
const { sendBotMessage } = require('../utils/botMessenger');

const SECURITY_NOTICE = 'تم تغيير رمز السحب. إن لم تكن أنت، تواصل مع الدعم فوراً';

async function notifyPinChanged(req, userId) {
    const io = req.app.get('socketio');
    await sendBotMessage(io, userId, SECURITY_NOTICE);
}

const PIN_ERROR_MESSAGES = {
    NOT_FOUND: 'المستخدم غير موجود',
    NOT_SET: 'لم تُنشئ رمز سحب بعد',
    ALREADY_SET: 'لديك رمز سحب فعلاً، استخدم تغيير الرمز',
    BAD_FORMAT: 'الرمز يجب أن يكون من 4 إلى 6 أرقام',
    WRONG: 'رمز غير صحيح',
    LOCKED: 'تم قفل رمز السحب مؤقتاً لكثرة المحاولات الخاطئة',
    LOCKED_NOW: 'تم قفل رمز السحب 30 دقيقة لكثرة المحاولات الخاطئة',
    EMAIL_NOT_VERIFIED: 'بريدك غير مفعّل. تواصل مع الدعم',
    NO_PENDING_RESET: 'لا يوجد طلب إعادة تعيين قيد الانتظار',
    CODE_EXPIRED: 'انتهت صلاحية الرمز، اطلب رمزاً جديداً',
    WRONG_CODE: 'رمز التحقق غير صحيح',
    TOO_MANY_ATTEMPTS: 'محاولات كثيرة جداً، اطلب رمزاً جديداً',
    CODE_ALREADY_USED: 'تم استخدام هذا الرمز مسبقاً',
    BAD_WALLET: 'رقم محفظة غير صالح'
};

function failFromCode(res, result, httpStatus = 400) {
    return res.status(result.code === 'LOCKED' || result.code === 'LOCKED_NOW' ? 423 : httpStatus).json({
        status: 'fail',
        code: result.code,
        message: PIN_ERROR_MESSAGES[result.code] || 'تعذّر إتمام العملية',
        lockedUntil: result.lockedUntil || null,
        remainingAttempts: result.remainingAttempts
    });
}

exports.getStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('withdrawalPin withdrawalPinLockedUntil withdrawalBlockedUntil payoutShamCashWallet payoutWalletChangedAt isEmailVerified');
        if (!user) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });

        const block = pinService.isWithdrawalBlocked(user);
        res.status(200).json({
            status: 'success',
            data: {
                hasPin: !!user.withdrawalPin,
                pinLockedUntil: (user.withdrawalPinLockedUntil && user.withdrawalPinLockedUntil > new Date()) ? user.withdrawalPinLockedUntil : null,
                withdrawalBlocked: block.blocked,
                withdrawalBlockedUntil: block.blocked ? block.until : null,
                payoutShamCashWallet: user.payoutShamCashWallet || null,
                canUseEmailReset: !!user.isEmailVerified
            }
        });
    } catch (error) {
        console.error('[ERROR] in withdrawalPin.getStatus:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.setup = async (req, res) => {
    try {
        const { pin, confirmPin } = req.body;
        if (!pin || pin !== confirmPin) {
            return res.status(400).json({ status: 'fail', message: 'الرمزان غير متطابقين' });
        }
        const result = await pinService.setInitialWithdrawalPin(req.user.id, pin);
        if (!result.ok) return failFromCode(res, result);

        res.status(200).json({ status: 'success', message: 'تم إنشاء رمز السحب' });
        await notifyPinChanged(req, req.user.id);
    } catch (error) {
        console.error('[ERROR] in withdrawalPin.setup:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.change = async (req, res) => {
    try {
        const { currentPin, newPin, confirmPin } = req.body;
        if (!newPin || newPin !== confirmPin) {
            return res.status(400).json({ status: 'fail', message: 'الرمزان غير متطابقين' });
        }
        const result = await pinService.changeWithdrawalPin(req.user.id, currentPin, newPin);
        if (!result.ok) return failFromCode(res, result);

        res.status(200).json({ status: 'success', message: 'تم تغيير رمز السحب' });
        await notifyPinChanged(req, req.user.id);
    } catch (error) {
        console.error('[ERROR] in withdrawalPin.change:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.requestResetCode = async (req, res) => {
    try {
        const { password } = req.body;
        const user = await User.findById(req.user.id).select('+password');
        if (!user || !password || !(await user.comparePassword(password))) {
            return res.status(401).json({ status: 'fail', message: 'كلمة السر غير صحيحة' });
        }

        const result = await pinService.requestPinResetCode(req.user.id);
        if (!result.ok) return failFromCode(res, result, 403);

        const { sendPinResetCodeEmail } = require('../utils/emailService');
        await sendPinResetCodeEmail(result.email, result.code);

        res.status(200).json({ status: 'success', message: 'تم إرسال رمز التحقق إلى بريدك' });
    } catch (error) {
        console.error('[ERROR] in withdrawalPin.requestResetCode:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.verifyResetCode = async (req, res) => {
    try {
        const { password, code, newPin, confirmPin } = req.body;
        if (!newPin || newPin !== confirmPin) {
            return res.status(400).json({ status: 'fail', message: 'الرمزان غير متطابقين' });
        }
        const user = await User.findById(req.user.id).select('+password');
        if (!user || !password || !(await user.comparePassword(password))) {
            return res.status(401).json({ status: 'fail', message: 'كلمة السر غير صحيحة' });
        }

        const result = await pinService.verifyPinResetCode(req.user.id, code, newPin);
        if (!result.ok) return failFromCode(res, result);

        res.status(200).json({ status: 'success', message: 'تم إعادة تعيين رمز السحب' });
        await notifyPinChanged(req, req.user.id);
    } catch (error) {
        console.error('[ERROR] in withdrawalPin.verifyResetCode:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.setPayoutWallet = async (req, res) => {
    try {
        const { pin, walletNumber } = req.body;
        const result = await pinService.changePayoutWallet(req.user.id, pin, walletNumber);
        if (!result.ok) return failFromCode(res, result);

        res.status(200).json({ status: 'success', message: 'تم حفظ محفظة الصرف. السحب موقوف 48 ساعة لحمايتك' });
        await notifyPinChanged(req, req.user.id);
    } catch (error) {
        console.error('[ERROR] in withdrawalPin.setPayoutWallet:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ===== لوحة التحكم: إعادة تعيين رمز السحب لمستخدم بلا بريد مفعّل (لا يملك مسار "نسيت الرمز") =====
exports.adminResetPin = async (req, res) => {
    try {
        const { userId } = req.params;
        const SystemSettings = require('../models/SystemSettings');
        const settings = await SystemSettings.getSettings();
        const blockHours = settings.withdrawalPinPostResetBlockHours || 24;
        const user = await User.findByIdAndUpdate(userId, {
            $set: {
                withdrawalPin: null, withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null,
                withdrawalBlockedUntil: new Date(Date.now() + blockHours * 3600000)
            }
        }, { new: true });
        if (!user) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });

        const AdminLog = require('../models/AdminLog');
        await AdminLog.logAction({
            admin: req.admin._id,
            action: 'reset_withdrawal_pin',
            targetUser: user._id,
            targetEntity: 'user',
            entityId: user._id,
            details: {},
            severity: 'warning',
            ipAddress: req.ip
        });

        res.status(200).json({ status: 'success', message: 'تم تصفير رمز السحب — سيُطلب من المستخدم إنشاء رمز جديد' });
        const io = req.app.get('socketio');
        await sendBotMessage(io, user._id, SECURITY_NOTICE);
    } catch (error) {
        console.error('[ERROR] in withdrawalPin.adminResetPin:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};
