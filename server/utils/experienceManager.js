const User = require('../models/User');

// --- المعادلة الأساسية لحساب متطلبات اللفل ---
const calculateRequiredXp = (level) => {
    // XP المطلوبة للوصول من 'level' إلى 'level + 1'
    // (اللفل الحالي * 1500)
    return level * 1500;
};

// --- الدالة المركزية لإضافة الخبرة ---
const addExperience = async (io, userId, amountInUSD) => {
    try {
        const user = await User.findById(userId);
        if (!user) return;

        const xpGained = Math.floor(amountInUSD * 100); // 1$ = 100 XP
        if (xpGained <= 0) return;

        user.experience += xpGained;

        let requiredXp = calculateRequiredXp(user.level);
        let levelUp = false;

        // التحقق من إمكانية رفع المستوى (قد يرتفع عدة مستويات مرة واحدة)
        while (user.experience >= requiredXp) {
            levelUp = true;
            user.level += 1;
            user.experience -= requiredXp;
            requiredXp = calculateRequiredXp(user.level);
        }

        await user.save();

        // إرسال إشعار فوري للمستخدم بالتحديثات
        if (user.socketId) {
            // إرسال تحديث للخبرة واللفل
            io.to(user.socketId).emit('experienceUpdate', {
                level: user.level,
                experience: user.experience,
                requiredXp: calculateRequiredXp(user.level) // إرسال المطلوب للفل التالي
            });

            // إذا ارتفع المستوى، أرسل إشعارًا خاصًا
            if (levelUp) {
                io.to(user.socketId).emit('levelUp', { newLevel: user.level });
            }
        }

    } catch (error) {
        console.error(`Error adding experience for user ${userId}:`, error);
    }
};

module.exports = { addExperience, calculateRequiredXp };
