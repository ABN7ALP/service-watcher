// ملف: server/utils/frameExpiryJob.js
// ✅ مهمة دورية لإزالة الإطارات المنتهية من كل المستخدمين دفعة واحدة — تجدّد تلقائياً ما طلب
// صاحبه تجديده (ورصيده يكفي)، وتحذف نهائياً من "الصندوق" ما لم يُجدَّد (طلب صريح: لا يبقى
// إطار منتهي الصلاحية ظاهراً للأبد). تُعيد استخدام نفس منطق checkAndExpireActiveFrame
// (مصدر حقيقة واحد مع المسار اللحظي عند فتح المتجر) بدل تكرار الحساب هنا بصيغة مختلفة

const User = require('../models/User');
const { checkAndExpireActiveFrame } = require('../controllers/frameController');

const expireFrames = async (io) => {
    try {
        const now = new Date();

        // ✅ المتأثرون = من لديه إطار نشط انتهى، أو إطار مملوك (مفعَّل سابقاً) انتهى بصمت
        // بالصندوق بلا أن يكون هو النشط حالياً
        const affected = await User.find({
            $or: [
                { activeFrameExpiresAt: { $ne: null, $lt: now } },
                { ownedFrames: { $elemMatch: { activatedAt: { $ne: null }, expiresAt: { $ne: null, $lt: now } } } }
            ]
        }).select('ownedFrames activeFrame activeFrameClass activeFrameExpiresAt coins isAdmin socketId username');

        if (affected.length === 0) return;

        let renewedCount = 0, removedCount = 0;
        for (const user of affected) {
            try {
                const result = await checkAndExpireActiveFrame(user, io);
                if (result.activeFrameRenewed) renewedCount++;
                if (result.activeFrameRemoved) removedCount++;
            } catch (error) {
                console.error(`[FRAME EXPIRY] Failed for user ${user._id}:`, error);
            }
        }

        console.log(`[FRAME EXPIRY] Processed ${affected.length} user(s) — ${renewedCount} auto-renewed, ${removedCount} active frame(s) removed`);
    } catch (error) {
        // لا نُسقط السيرفر بسبب فشل مهمة دورية
        console.error('[FRAME EXPIRY ERROR]:', error);
    }
};

const startFrameExpiryJob = (io) => {
    // تشغيل فوري عند الإقلاع (ينظّف ما انتهى أثناء توقف السيرفر)
    expireFrames(io);
    // ✅ كل دقيقتين بدل 10 — مدد الشراء الآن قصيرة جداً (1/3/7 أيام)، فدقة أعلى تلزم لشعور
    // "فوري" حقيقي بإزالة/تجديد الإطار بلا انتظار طويل بلا داعٍ
    setInterval(() => expireFrames(io), 2 * 60 * 1000);
    console.log('[FRAME EXPIRY] Job started (runs every 2 minutes)');
};

module.exports = { startFrameExpiryJob, expireFrames };
