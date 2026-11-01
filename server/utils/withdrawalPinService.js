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

// 🛡️ مراجعة أمنية (تدقيق ما بعد الفتح): كان الفحص (مقفل؟) وbcrypt (~250ms) وزيادة العدّاد ثلاث
// عمليات منفصلة — N طلب متزامن تعبر فحص القفل معاً (لا شيء مقفلاً بعد) فتُنفِّذ N مقارنة bcrypt
// بالتوازي، فيتجاوز العدد الفعلي للتخمينات حد الـ5 تماماً (رمز 4 أرقام = 10,000 احتمال فقط).
// الإصلاح: "الحجز" (زيادة العدّاد ذرّياً) يسبق أي bcrypt دوماً — لا مقارنة إطلاقاً قبل معرفة أن
// العدّاد بعد الزيادة ما زال دون الحد. خطوتان ذرّيتان منفصلتان لا تفتحان ثغرة: الأولى (تصفير
// قفل منتهي) مطلقة لا نسبية (idempotent بصرف النظر عن تكرارها بالتزامن)، والثانية ($inc حقيقي)
// هي الضامن الوحيد لتفرّد رقم كل محاولة متزامنة — المقارنة الباهظة (bcrypt) لا تُنفَّذ إلا بعد
// أن يرى الطلب رقمه الفريد دون الحد. 3 عمليات قفل خلال 24 ساعة تنتقل لقفل نهائي (hardLocked)
// لا يرتفع تلقائياً، يتطلّب تدخّل الدعم/الإدارة (adminResetPin) صراحة + تنبيه بوت فوري للمستخدم
async function verifyWithdrawalPin(userId, pin, io = null) {
    const now = new Date();

    // ✅ خطوة تطبيع مطلقة (لا $inc) — لو القفل منتهياً فعلاً، صفّر العدّاد والقفل معاً. تكرارها
    // بالتزامن بلا أي ضرر (كل استدعاء يكتب نفس القيمتين الثابتتين 0/null بصرف النظر عن الترتيب)
    // — $ne:null صريح إلزامي: بدونه ستُطابِق $lte حقول null أيضاً (ترتيب BSON) فيُصفَّر عدّاد
    // مستخدم غير مقفل أصلاً بكل محاولة، فيُلغي العدّ بالكامل
    await User.updateOne(
        { _id: userId, withdrawalPinHardLocked: { $ne: true }, withdrawalPinLockedUntil: { $ne: null, $lte: now } },
        { $set: { withdrawalPinLockedUntil: null, withdrawalPinFailedAttempts: 0 } }
    );

    const reserved = await User.findOneAndUpdate(
        {
            _id: userId,
            withdrawalPin: { $ne: null },
            withdrawalPinHardLocked: { $ne: true },
            $or: [{ withdrawalPinLockedUntil: null }, { withdrawalPinLockedUntil: { $lte: now } }]
        },
        { $inc: { withdrawalPinFailedAttempts: 1 } },
        { new: true }
    ).select('withdrawalPin withdrawalPinFailedAttempts');

    if (!reserved) {
        // ✅ لا قرار أمني هنا — الحجز أعلاه هو الحارس الحقيقي. هذي القراءة فقط لصياغة سبب الرفض
        const user = await User.findById(userId).select('withdrawalPin withdrawalPinHardLocked withdrawalPinLockedUntil');
        if (!user) return { ok: false, code: 'NOT_FOUND' };
        if (user.withdrawalPinHardLocked) return { ok: false, code: 'HARD_LOCKED' };
        if (!user.withdrawalPin) return { ok: false, code: 'NOT_SET' };
        if (user.withdrawalPinLockedUntil && user.withdrawalPinLockedUntil > now) {
            return { ok: false, code: 'LOCKED', lockedUntil: user.withdrawalPinLockedUntil };
        }
        return { ok: false, code: 'WRONG' }; // سباق نادر جداً بين القراءتين — إعادة المحاولة تكفي
    }

    // ✅ العدّاد بلغ الحد بهذا الحجز نفسه — نقفل فوراً دون أي مقارنة bcrypt إطلاقاً، حتى لو كان
    // هذا الرمز المُدخَل صحيحاً فعلياً (مقايضة متعمَّدة: محاولة واحدة أقل مقابل إغلاق الثغرة كلياً).
    // === (لا >=) عمداً: $inc ذرّي يضمن انتقالاً وحيداً فريداً بالضبط للقيمة 5 مهما بلغ عدد
    // المحاولات المتزامنة المنفجرة معاً — فقط ذاك الطلب الوحيد يُنفِّذ منطق القفل (سجلّ الأحداث/
    // تنبيه البوت/القفل النهائي)، فلا تُحتسَب "انفجارة" تزامن واحدة كعدة أحداث قفل منفصلة خطأً
    if (reserved.withdrawalPinFailedAttempts === PIN_LOCKOUT_MAX_ATTEMPTS) {
        return lockOutUser(userId, io);
    }
    if (reserved.withdrawalPinFailedAttempts > PIN_LOCKOUT_MAX_ATTEMPTS) {
        const user = await User.findById(userId).select('withdrawalPinLockedUntil withdrawalPinHardLocked');
        if (user?.withdrawalPinHardLocked) return { ok: false, code: 'HARD_LOCKED' };
        return { ok: false, code: 'LOCKED_NOW', lockedUntil: user?.withdrawalPinLockedUntil || new Date(Date.now() + PIN_LOCKOUT_MINUTES * 60000) };
    }

    const match = await bcrypt.compare(String(pin || ''), reserved.withdrawalPin);
    if (match) {
        await User.updateOne({ _id: userId }, { $set: { withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null } });
        return { ok: true };
    }

    return { ok: false, code: 'WRONG', remainingAttempts: PIN_LOCKOUT_MAX_ATTEMPTS - reserved.withdrawalPinFailedAttempts };
}

// ✅ يُسجِّل حدث قفل (30 دقيقة) ويفحص: 3 أحداث قفل خلال آخر 24 ساعة ⇐ قفل نهائي (hardLocked)
// لا يرفعه الوقت أبداً — فقط adminResetPin الصريح. $slice:-10 يمنع نمو المصفوفة بلا حدود
// (10 أحداث قفل كافية جداً لإثبات أي نافذة 24 ساعة ممكنة، أقدم منها غير ذي صلة أصلاً)
async function lockOutUser(userId, io) {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + PIN_LOCKOUT_MINUTES * 60000);
    const updated = await User.findOneAndUpdate(
        { _id: userId },
        {
            $set: { withdrawalPinLockedUntil: lockedUntil },
            $push: { withdrawalPinLockoutHistory: { $each: [now], $slice: -10 } }
        },
        { new: true }
    ).select('withdrawalPinLockoutHistory');

    const recentLockouts = (updated?.withdrawalPinLockoutHistory || [])
        .filter(t => now.getTime() - new Date(t).getTime() < 24 * 3600000);

    if (recentLockouts.length >= 3) {
        await User.updateOne({ _id: userId }, { $set: { withdrawalPinHardLocked: true } });
        if (io) {
            const { sendBotMessage } = require('./botMessenger');
            await sendBotMessage(io, userId, '🔒 تم قفل رمز السحب نهائياً لكثرة محاولات القفل خلال 24 ساعة. إن لم تكن أنت، تواصل مع الدعم فوراً — الإعادة تتطلّب تدخّلاً من فريق الدعم.');
        }
        return { ok: false, code: 'HARD_LOCKED', lockedUntil };
    }
    return { ok: false, code: 'LOCKED_NOW', lockedUntil };
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
async function changeWithdrawalPin(userId, currentPin, newPin, io = null) {
    if (!isValidPinFormat(newPin)) return { ok: false, code: 'BAD_FORMAT' };
    const verify = await verifyWithdrawalPin(userId, currentPin, io);
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
async function changePayoutWallet(userId, pin, walletNumber, io = null) {
    if (!walletNumber || String(walletNumber).trim().length < 3) return { ok: false, code: 'BAD_WALLET' };
    const verify = await verifyWithdrawalPin(userId, pin, io);
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
