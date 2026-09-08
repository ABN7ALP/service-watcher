// ملف: server/utils/frameExpiryJob.js
// ✅ مهمة دورية لإزالة الإطارات المنتهية من كل المستخدمين دفعة واحدة

const User = require('../models/User');

const expireFrames = async (io) => {
    try {
        const now = new Date();

        // نجلب المتأثرين أولاً (فقط المتصلين نحتاج إشعارهم)
        const affected = await User.find({
            activeFrameExpiresAt: { $ne: null, $lt: now }
        }).select('_id socketId username').lean();

        if (affected.length === 0) return;

        // ✅ تحديث جماعي واحد بدل حلقة حفظ (أسرع بكثير وأقل ضغطاً على القاعدة)
        const result = await User.updateMany(
            { activeFrameExpiresAt: { $ne: null, $lt: now } },
             { $set: { activeFrame: null, activeFrameClass: null, activeFrameExpiresAt: null } }
        );

        console.log(`[FRAME EXPIRY] Expired frames for ${result.modifiedCount} user(s)`);

        // إشعار المتصلين فقط ليُحدّثوا واجهتهم فوراً
        if (io) {
            for (const u of affected) {
                if (u.socketId) {
                    io.to(u.socketId).emit('frameExpired', {
                        message: 'انتهت صلاحية إطارك. يمكنك تجديده من المتجر.'
                    });
                    io.to(u.socketId).emit('forceRefreshUserData', { reason: 'frame_expired' });
                }
            }
        }
    } catch (error) {
        // لا نُسقط السيرفر بسبب فشل مهمة دورية
        console.error('[FRAME EXPIRY ERROR]:', error);
    }
};

const startFrameExpiryJob = (io) => {
    // تشغيل فوري عند الإقلاع (ينظّف ما انتهى أثناء توقف السيرفر)
    expireFrames(io);
    // ثم كل 10 دقائق — دقة كافية بلا عبء يُذكر
    setInterval(() => expireFrames(io), 10 * 60 * 1000);
    console.log('[FRAME EXPIRY] Job started (runs every 10 minutes)');
};

module.exports = { startFrameExpiryJob, expireFrames };
