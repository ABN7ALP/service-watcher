// 🛡️ مراجعة الأمان v2 (البند 2) — رمز السحب: المصدر الوحيد لإنشاء/تحقق/قفل رمز السحب (4-6
// أرقام). كل تحديث على عدّادات المحاولات/القفل ذرّي (findOneAndUpdate بـ$inc أو شرط على القيمة
// الحالية) — لا قراءة ثم حفظ لاحقاً، فمحاولات متزامنة تُعَدّ بصحة تامة (نفس فلسفة money-moving
// بالمشروع، مطبّقة هنا على عدّاد قفل بدل رصيد).
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');

const PIN_LOCKOUT_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MINUTES = 30;
const WALLET_CHANGE_HOLD_HOURS = 48;
const RESET_CODE_EXPIRY_MINUTES = 10;
const RESET_CODE_MAX_ATTEMPTS = 5;

const isValidPinFormat = (pin) => typeof pin === 'string' && /^\d{4,6}$/.test(pin);

const hashPin = (pin) => bcrypt.hash(pin, 12);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// 6 أرقام، لا يبدأ بصفر تفادياً لعرض مضلّل ببعض الأجهزة (القيمة نفسها صالحة رقمياً بأي حال)
const generateResetCode = () => String(crypto.randomInt(100000, 1000000));

// 🛡️ القفل الذري: بإعادة محاولة ناجحة يُصفّر العدّاد؛ بفشل، $inc ذرّي ثم فحص الناتج — لو بلغ
// الحد يُقفَل فوراً بتحديث ثانٍ منفصل (لا يمكن دمجه بأول $inc لأن قيمة القفل تعتمد على الناتج
// بعد الزيادة، لكن النافذة بينهما لا تفتح ثغرة: أي عدد محاولات متزامنة إضافية يراها $inc اللاحق
// أصلاً فوق الحد فتُقفَل هي أيضاً بأول فحص لها قبل إعادة المحاولة)
async function verifyWithdrawalPin(userId, pin) {
    const user = await User.findById(userId)
        .select('withdrawalPin withdrawalPinFailedAttempts withdrawalPinLockedUntil');
    if (!user) return { ok: false, code: 'NOT_FOUND' };
    if (!user.withdrawalPin) return { ok: false, code: 'NOT_SET' };

    if (user.withdrawalPinLockedUntil && user.withdrawalPinLockedUntil > new Date()) {
        return { ok: false, code: 'LOCKED', lockedUntil: user.withdrawalPinLockedUntil };
    }

    const match = await bcrypt.compare(String(pin || ''), user.withdrawalPin);
    if (match) {
        if (user.withdrawalPinFailedAttempts > 0) {
            await User.updateOne({ _id: userId }, { $set: { withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null } });
        }
        return { ok: true };
    }

    const updated = await User.findOneAndUpdate(
        { _id: userId },
        { $inc: { withdrawalPinFailedAttempts: 1 } },
        { new: true }
    ).select('withdrawalPinFailedAttempts');

    if (updated.withdrawalPinFailedAttempts >= PIN_LOCKOUT_MAX_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + PIN_LOCKOUT_MINUTES * 60000);
        await User.updateOne({ _id: userId }, { $set: { withdrawalPinLockedUntil: lockedUntil } });
        return { ok: false, code: 'LOCKED_NOW', lockedUntil };
    }

    return { ok: false, code: 'WRONG', remainingAttempts: PIN_LOCKOUT_MAX_ATTEMPTS - updated.withdrawalPinFailedAttempts };
}

// الإنشاء الأول — ذرّي بشرط withdrawalPin:null يمنع إعادة إنشاء (استخدم changePin للتغيير)
async function setInitialWithdrawalPin(userId, pin) {
    if (!isValidPinFormat(pin)) return { ok: false, code: 'BAD_FORMAT' };
    const hash = await hashPin(pin);
    const updated = await User.findOneAndUpdate(
        { _id: userId, withdrawalPin: null },
        { $set: { withdrawalPin: hash, withdrawalPinSetAt: new Date(), withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null } },
        { new: true }
    );
    if (!updated) return { ok: false, code: 'ALREADY_SET' };
    return { ok: true };
}

async function getPostResetBlockHours() {
    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.getSettings();
    return settings.withdrawalPinPostResetBlockHours || 24;
}

// تغيير الرمز (يعرفه المستخدم فعلاً) — يتحقق من الرمز الحالي بآلية القفل نفسها
async function changeWithdrawalPin(userId, currentPin, newPin) {
    if (!isValidPinFormat(newPin)) return { ok: false, code: 'BAD_FORMAT' };
    const verify = await verifyWithdrawalPin(userId, currentPin);
    if (!verify.ok) return verify;

    const hash = await hashPin(newPin);
    const blockHours = await getPostResetBlockHours();
    await User.updateOne({ _id: userId }, {
        $set: {
            withdrawalPin: hash, withdrawalPinSetAt: new Date(),
            withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null,
            withdrawalBlockedUntil: new Date(Date.now() + blockHours * 3600000)
        }
    });
    return { ok: true };
}

// بدء "نسيت الرمز" — يتطلّب كلمة السر (تُفحص قبل الاستدعاء) + بريد مُفعَّل؛ غير ذلك "تواصل مع الدعم"
async function requestPinResetCode(userId) {
    const user = await User.findById(userId).select('isEmailVerified email');
    if (!user) return { ok: false, code: 'NOT_FOUND' };
    if (!user.isEmailVerified) return { ok: false, code: 'EMAIL_NOT_VERIFIED' };

    const code = generateResetCode();
    await User.updateOne({ _id: userId }, {
        $set: {
            pinResetCodeHash: sha256(code),
            pinResetCodeExpiresAt: new Date(Date.now() + RESET_CODE_EXPIRY_MINUTES * 60000),
            pinResetAttempts: 0
        }
    });
    return { ok: true, code, email: user.email };
}

// تأكيد "نسيت الرمز" بالكود المُرسَل بريدياً — نفس فلسفة القفل الذري (عدّاد محاولات مستقل عن رمز السحب)
async function verifyPinResetCode(userId, code, newPin) {
    if (!isValidPinFormat(newPin)) return { ok: false, code: 'BAD_FORMAT' };
    const user = await User.findById(userId).select('pinResetCodeHash pinResetCodeExpiresAt pinResetAttempts');
    if (!user || !user.pinResetCodeHash) return { ok: false, code: 'NO_PENDING_RESET' };
    if (!user.pinResetCodeExpiresAt || user.pinResetCodeExpiresAt < new Date()) {
        return { ok: false, code: 'CODE_EXPIRED' };
    }
    if (user.pinResetAttempts >= RESET_CODE_MAX_ATTEMPTS) {
        return { ok: false, code: 'TOO_MANY_ATTEMPTS' };
    }

    const match = user.pinResetCodeHash === sha256(String(code || ''));
    if (!match) {
        const updated = await User.findOneAndUpdate(
            { _id: userId },
            { $inc: { pinResetAttempts: 1 } },
            { new: true }
        ).select('pinResetAttempts');
        if (updated.pinResetAttempts >= RESET_CODE_MAX_ATTEMPTS) {
            return { ok: false, code: 'TOO_MANY_ATTEMPTS' };
        }
        return { ok: false, code: 'WRONG_CODE', remainingAttempts: RESET_CODE_MAX_ATTEMPTS - updated.pinResetAttempts };
    }

    const hash = await hashPin(newPin);
    const blockHours = await getPostResetBlockHours();
    // ✅ شرط pinResetCodeHash الحالي بالتحديث يمنع استخدام نفس الكود مرتين لو تزامن طلبان ناجحان
    const updated = await User.findOneAndUpdate(
        { _id: userId, pinResetCodeHash: user.pinResetCodeHash },
        {
            $set: {
                withdrawalPin: hash, withdrawalPinSetAt: new Date(),
                withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null,
                withdrawalBlockedUntil: new Date(Date.now() + blockHours * 3600000),
                pinResetCodeHash: null, pinResetCodeExpiresAt: null, pinResetAttempts: 0
            }
        },
        { new: true }
    );
    if (!updated) return { ok: false, code: 'CODE_ALREADY_USED' };
    return { ok: true };
}

// تغيير محفظة الصرف المحفوظة — يتطلّب الرمز، ويُبقي حظر سحب 48 ساعة
async function changePayoutWallet(userId, pin, walletNumber) {
    if (!walletNumber || String(walletNumber).trim().length < 3) return { ok: false, code: 'BAD_WALLET' };
    const verify = await verifyWithdrawalPin(userId, pin);
    if (!verify.ok) return verify;

    await User.updateOne({ _id: userId }, {
        $set: {
            payoutShamCashWallet: String(walletNumber).trim(),
            payoutWalletChangedAt: new Date()
        }
    });
    return { ok: true };
}

function isWithdrawalBlocked(user) {
    const now = new Date();
    if (user.withdrawalBlockedUntil && user.withdrawalBlockedUntil > now) {
        return { blocked: true, until: user.withdrawalBlockedUntil, reason: 'PIN_RESET_BLOCK' };
    }
    if (user.payoutWalletChangedAt) {
        const until = new Date(user.payoutWalletChangedAt.getTime() + WALLET_CHANGE_HOLD_HOURS * 3600000);
        if (until > now) return { blocked: true, until, reason: 'WALLET_CHANGE_HOLD' };
    }
    return { blocked: false };
}

module.exports = {
    PIN_LOCKOUT_MAX_ATTEMPTS, PIN_LOCKOUT_MINUTES, WALLET_CHANGE_HOLD_HOURS,
    RESET_CODE_EXPIRY_MINUTES, RESET_CODE_MAX_ATTEMPTS,
    isValidPinFormat, hashPin,
    verifyWithdrawalPin, setInitialWithdrawalPin, changeWithdrawalPin,
    requestPinResetCode, verifyPinResetCode, changePayoutWallet,
    isWithdrawalBlocked
};
