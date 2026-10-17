// ✅ مجموع "الدعم" التراكمي لكل (مستخدم + غرفة) — إشارة عرض بصري فقط أسفل المقعد، مرتبطة
// بالشخص داخل هذي الجلسة بالغرفة تحديداً (لا برقم المقعد نفسه)، فتبقى كما هي لو وقف ثم عاد
// وجلس (بنفس المقعد أو غيره)، ولا تُصفَّر إلا لو غادر الغرفة فعلياً ثم عاد. بالذاكرة فقط
// (ephemeral) — ليست قيمة دائمة بقاعدة البيانات. مستخرجة لملف مستقل (كانت أصلاً بـsocketService.js)
// كي يقدر giftController الوصول إليها مباشرة بمسار الهدية الفعلي بلا استيراد دائري بين الملفين
// (راجع addRoomSupportTotal هناك — طلب صريح بمراجعة PR: إصلاح ثغرة أمنية).
// roomId(string) → Map(userId(string) → total(number))
const roomSupportTally = new Map();

function getRoomSupportTotal(roomId, userId) {
    return roomSupportTally.get(roomId)?.get(userId) || 0;
}

function addRoomSupportTotal(roomId, userId, value) {
    if (!roomSupportTally.has(roomId)) roomSupportTally.set(roomId, new Map());
    const roomMap = roomSupportTally.get(roomId);
    const updated = (roomMap.get(userId) || 0) + value;
    roomMap.set(userId, updated);
    return updated;
}

function clearRoomSupportTotal(roomId, userId) {
    roomSupportTally.get(roomId)?.delete(userId);
}

module.exports = { getRoomSupportTotal, addRoomSupportTotal, clearRoomSupportTotal };
