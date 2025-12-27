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

module.exports = { addExperience, calculateRequiredXp };
