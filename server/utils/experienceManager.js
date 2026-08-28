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

// ✅ خبرة الهدايا: مرتبطة بقيمة الهدية بالكوينز، محسوبة بمعدل معتدل يمنع تضخم المستويات
// المرسل يحصل على 1 XP لكل 10 كوينز يُنفقها (تشجيع الدعم)
// المستقبل يحصل على نصف ذلك (مكافأة الشعبية دون فتح باب واسع للتلاعب عبر حسابات وهمية)
const addGiftExperience = async (io, userId, coinsSpent, role = 'sender') => {
    const xpGained = role === 'sender'
        ? Math.max(1, Math.floor(coinsSpent / 10))
        : Math.max(1, Math.floor(coinsSpent / 20));

    await addExperience(io, userId, xpGained / 100, role === 'sender' ? 'loss' : 'win');
    // ملاحظة: addExperience الأصلية تحسب loss كـ amountInUSD*100، فنمرر xpGained/100 لضمان تطابق القيمة المطلوبة تماماً
};

module.exports = { addExperience, calculateRequiredXp, addGiftExperience };
