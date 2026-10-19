const User = require('../models/User');

// ✅ مُصدَّر (هدايا v2): giftController يحتاجها حرفياً بـrules.requiredXpPerLevel بواجهة
// المتجر — مصدر حقيقة واحد بدل تكرار الرقم 1500 بملف آخر قد ينحرف عنه لاحقاً
const REQUIRED_XP_PER_LEVEL = 1500;

const calculateRequiredXp = (level) => {
    return level * REQUIRED_XP_PER_LEVEL;
};

// --- ✅ الدالة المحدثة ---
const addExperience = async (io, userId, amountInUSD, reason = 'loss') => {
    try {
        const user = await User.findById(userId);
        if (!user) return;

        let xpGained = 0;
        if (reason === 'loss') {
            // عند الخسارة، يحصل على كامل نقاط الخبرة للمبلغ
            xpGained = Math.floor(amountInUSD * 100);
        } else if (reason === 'win') {
            // عند الفوز، يحصل على نقاط رمزية
            xpGained = 10;
        }

        if (xpGained <= 0) return;

        user.experience += xpGained;

        let requiredXp = calculateRequiredXp(user.level);
        let levelUp = false;

        while (user.experience >= requiredXp) {
            levelUp = true;
            user.level += 1;
            user.experience -= requiredXp;
            requiredXp = calculateRequiredXp(user.level);
        }

        await user.save();

            if (user.socketId) {
            io.to(user.socketId).emit('experienceUpdate', {
                level: user.level, experience: user.experience, requiredXp, xpGained
            });
        }
        if (levelUp) {
            const { sendBotMessage } = require('./botMessenger');
            await sendBotMessage(io, user._id, `🎉 مبروك! لقد وصلت إلى المستوى ${user.level}`);
        }

    } catch (error) {
        console.error(`Error adding experience for user ${userId}:`, error);
    }
};

// ✅ خبرة الهدايا: نظام مستقل تماماً عن نظام win/loss (كان فيه خلل يجعل المستقبل يحصل دائماً على 10 XP ثابتة)
// المرسل: كل 3 كوينز يُنفقها = 1 XP → هدية بـ 30 كوينز (مثال: 3 ورود بـ10 كوينز) تعطي 10 XP بالضبط
// المستقبل: نصف معدل المرسل تقريباً (كل 6 كوينز = 1 XP) — تشجيع الاستقبال دون فتح باب واسع للتلاعب
// 🛡️ طلب صريح (هدايا v2): سقف GIFT_XP_MAX_PER_TRANSACTION حُذف للمُرسِل فقط — خبرة "مستوى
// الثروة" (wealthXp) تعكس الإنفاق الحقيقي كاملاً بلا حدّ أقصى، حتى لهدية/كومبو ضخم دفعة واحدة.
// قاعدة المستقبِل تبقى كما هي تماماً (نفس القسمة، نفس السقف) — لم تتغيّر إطلاقاً
const GIFT_XP_SENDER_DIVISOR = 3;
const GIFT_XP_RECEIVER_DIVISOR = 6;
const GIFT_XP_MAX_PER_TRANSACTION = 500;

// ✅ يُرجع الحالة النهائية (level/experience/requiredXp) بعد المنح — طلب صريح (هدايا v2):
// ack محرّك الكومبو يحتاج wealthLevel/wealthXp/requiredXp الحقيقية بعد المنح الفعلي، لا تقديراً
const grantGiftXp = async (io, userId, xpGained) => {
    try {
        if (xpGained <= 0) return null;
        const user = await User.findById(userId);
        if (!user) return null;

        user.experience += xpGained;

        let requiredXp = calculateRequiredXp(user.level);
        let levelUp = false;

        while (user.experience >= requiredXp) {
            levelUp = true;
            user.level += 1;
            user.experience -= requiredXp;
            requiredXp = calculateRequiredXp(user.level);
        }

        await user.save();

                if (user.socketId) {
            io.to(user.socketId).emit('experienceUpdate', { level: user.level, experience: user.experience, requiredXp, xpGained });
        }
        if (levelUp) {
            const { sendBotMessage } = require('./botMessenger');
            await sendBotMessage(io, user._id, `🎉 مبروك! لقد وصلت إلى المستوى ${user.level}`);
        }
        return { level: user.level, experience: user.experience, requiredXp };
    } catch (error) {
        console.error(`Error granting gift XP for user ${userId}:`, error);
        return null;
    }
};

const addGiftExperience = async (io, userId, coinsSpent, role = 'sender') => {
    if (role === 'sender') {
        // ✅ طلب صريح بالحرف: "Sender XP = floor(totalCoins / 3)" — بلا حدّ أدنى (1) ولا سقف
        // أقصى، خلافاً للمستقبِل أدناه. أسعار الهدايا (حدّ أدنى 10 كوينز) تضمن عملياً XP≥3 دوماً
        const xpGained = Math.floor(coinsSpent / GIFT_XP_SENDER_DIVISOR);
        return grantGiftXp(io, userId, xpGained);
    }
    const rawXp = Math.max(1, Math.round(coinsSpent / GIFT_XP_RECEIVER_DIVISOR));
    const xpGained = Math.min(rawXp, GIFT_XP_MAX_PER_TRANSACTION);
    return grantGiftXp(io, userId, xpGained);
};

module.exports = {
    addExperience, calculateRequiredXp, addGiftExperience,
    REQUIRED_XP_PER_LEVEL, GIFT_XP_SENDER_DIVISOR
};
