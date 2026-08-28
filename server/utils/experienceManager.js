const User = require('../models/User');

const calculateRequiredXp = (level) => {
    return level * 1500;
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
            // --- ✅ إرسال مقدار الخبرة المكتسبة مع التحديث ---
            io.to(user.socketId).emit('experienceUpdate', {
                level: user.level,
                experience: user.experience,
                requiredXp: requiredXp,
                xpGained: xpGained // <-- الإضافة الجديدة
            });

            if (levelUp) {
                io.to(user.socketId).emit('levelUp', { newLevel: user.level });
            }
        }

    } catch (error) {
        console.error(`Error adding experience for user ${userId}:`, error);
    }
};

// ✅ خبرة الهدايا: نظام مستقل تماماً عن نظام win/loss (كان فيه خلل يجعل المستقبل يحصل دائماً على 10 XP ثابتة)
// المرسل: كل 3 كوينز يُنفقها = 1 XP → هدية بـ 30 كوينز (مثال: 3 ورود بـ10 كوينز) تعطي 10 XP بالضبط
// المستقبل: نصف معدل المرسل تقريباً (كل 6 كوينز = 1 XP) — تشجيع الاستقبال دون فتح باب واسع للتلاعب
// سقف أقصى للحماية من استغلال هدية ضخمة دفعة واحدة لتضخيم المستوى بشكل غير متوازن
const GIFT_XP_SENDER_DIVISOR = 3;
const GIFT_XP_RECEIVER_DIVISOR = 6;
const GIFT_XP_MAX_PER_TRANSACTION = 500;

const grantGiftXp = async (io, userId, xpGained) => {
    try {
        if (xpGained <= 0) return;
        const user = await User.findById(userId);
        if (!user) return;

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
                level: user.level,
                experience: user.experience,
                requiredXp,
                xpGained
            });
            if (levelUp) {
                io.to(user.socketId).emit('levelUp', { newLevel: user.level });
            }
        }
    } catch (error) {
        console.error(`Error granting gift XP for user ${userId}:`, error);
    }
};

const addGiftExperience = async (io, userId, coinsSpent, role = 'sender') => {
    const divisor = role === 'sender' ? GIFT_XP_SENDER_DIVISOR : GIFT_XP_RECEIVER_DIVISOR;
    const rawXp = Math.max(1, Math.round(coinsSpent / divisor));
    const xpGained = Math.min(rawXp, GIFT_XP_MAX_PER_TRANSACTION);
    await grantGiftXp(io, userId, xpGained);
};

module.exports = { addExperience, calculateRequiredXp, addGiftExperience };
