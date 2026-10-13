// ملف: server/utils/pkRankingStore.js
// =====================================================
// ✅ طبقة تسريع ترتيب دوري PK — اختيارية بالكامل: Mongo (PkStanding) هو مصدر الحقيقة الوحيد
// دائماً وفي كل مسار كتابة حقيقي؛ هذا الملف فقط "يُعكِس" نقاط كل غرفة في Redis Sorted Set
// (إن كان متاحاً فعلياً — REDIS_URL مضبوط والاتصال نجح) لقراءات ترتيب أسرع لاحقاً، ويمكن
// إعادة بنائه بالكامل من Mongo في أي لحظة (rebuildFromMongo) لو فُقد أو انحرف. أي فشل بأي
// دالة هنا لا يُسقط شيئاً أبداً — يُسجَّل تحذيراً ويُعاد null/false ليعرف المتصل أن يرجع لـMongo
// =====================================================

const { redisClient } = require('../config/redis');

let connectAttempted = false;
async function ensureConnected() {
    if (redisClient.connected) return true;
    if (connectAttempted) return redisClient.connected; // ✅ لا نعيد محاولة الاتصال بكل نداء — مرة واحدة فقط
    connectAttempted = true;
    if (!process.env.REDIS_URL) return false; // ✅ غير مُعدّ أصلاً بهذي البيئة — لا داعٍ لمحاولة اتصال ستفشل حتماً
    try {
        await redisClient.connect();
    } catch (error) {
        console.warn('[PK RANKING] تعذّر الاتصال بـRedis — سيُعتمَد على MongoDB وحده:', error.message);
    }
    return redisClient.connected;
}

const zsetKey = (weekKey) => `pk:season:${weekKey}:lp`;

// ✅ يُحدِّث نقاط غرفة واحدة بالترتيب المُسرَّع — يُستدعى بعد كل تسوية معركة ناجحة
async function syncRoom(weekKey, roomId, lp) {
    try {
        if (!(await ensureConnected())) return false;
        await redisClient.client.zAdd(zsetKey(weekKey), [{ score: lp, value: roomId.toString() }]);
        return true;
    } catch (error) {
        console.warn('[PK RANKING] فشل تحديث Redis (غير حرج):', error.message);
        return false;
    }
}

// ✅ معرّفات أعلى الغرف (الأعلى نقاطاً أولاً) — null يعني "Redis غير متاح، استخدم Mongo"
async function getTopRoomIds(weekKey, offset, limit) {
    try {
        if (!(await ensureConnected())) return null;
        return await redisClient.client.zRange(zsetKey(weekKey), offset, offset + limit - 1, { REV: true });
    } catch (error) {
        console.warn('[PK RANKING] فشل قراءة Redis، يُفترض الرجوع لـMongo:', error.message);
        return null;
    }
}

// ✅ إعادة بناء كاملة من Mongo (مصدر الحقيقة) — تُستدعى عند إنشاء موسم جديد أو يدوياً من الإدارة
async function rebuildFromMongo(seasonMongoId, weekKey) {
    try {
        if (!(await ensureConnected())) return false;
        const PkStanding = require('../models/PkStanding');
        const rows = await PkStanding.find({ season: seasonMongoId }).select('room lp').lean();
        await redisClient.client.del(zsetKey(weekKey));
        if (rows.length > 0) {
            await redisClient.client.zAdd(zsetKey(weekKey), rows.map(r => ({ score: r.lp, value: r.room.toString() })));
        }
        return true;
    } catch (error) {
        console.warn('[PK RANKING] فشلت إعادة بناء Redis (غير حرج، Mongo يبقى مصدر الحقيقة):', error.message);
        return false;
    }
}

module.exports = { syncRoom, getTopRoomIds, rebuildFromMongo, isAvailable: () => redisClient.connected };
