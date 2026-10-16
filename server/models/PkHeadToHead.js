const mongoose = require('mongoose');

// =====================================================
// ✅ سجل المواجهات بين غرفتين بعينهما خلال موسم واحد — صفّ واحد فقط لكل زوج غرف (roomA/roomB
// مرتّبتان دوماً بمقارنة نصّية على الـObjectId، بصرف النظر عن أيّهما بدأ التحدي فعلياً) كي لا
// يُنشأ صفّان متعاكسان لنفس الزوج بالخطأ. aWins/aDraws تخص roomA تحديداً دوماً (bWins = فوز
// roomB)، والعميل يقرأ الجانب الصحيح حسب غرفته هو وقت العرض
// =====================================================
const pkHeadToHeadSchema = new mongoose.Schema({
    season: { type: mongoose.Schema.Types.ObjectId, ref: 'PkSeason', required: true, index: true },
    roomA: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceRoom', required: true },
    roomB: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceRoom', required: true },
    aWins: { type: Number, default: 0 },
    bWins: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    matches: { type: Number, default: 0 },
    // ✅ 🛡️ نفس فلسفة PkStanding.appliedBattleIds بالضبط — recordMatch كانت $inc صرفاً بلا أي
    // حارس، فتُعيد احتساب نفس المعركة مرتين لو أُعيد استدعاء settleBattleBody كاملاً بعد فشل
    // جزئي سابق (طلب صريح: idempotent حقيقي لكل أثر جانبي بالتسوية، لا نقاط الغرفتين فقط)
    appliedBattleIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RoomBattle' }], default: () => [] }
}, { timestamps: true });

pkHeadToHeadSchema.index({ season: 1, roomA: 1, roomB: 1 }, { unique: true });

// ✅ يُرتّب أي زوج غرف بترتيب ثابت (نصّي) دوماً، ويُرجع الجانب الصحيح (هل كانت غرفتي A أو B
// بهذا الترتيب) كي يعرف المتصل كيف يُحدِّث aWins/bWins بشكل صحيح بغض النظر عمّن بدأ التحدي
function orderPair(roomIdX, roomIdY) {
    const [x, y] = [roomIdX.toString(), roomIdY.toString()];
    return x < y ? { roomA: roomIdX, roomB: roomIdY, xIsA: true } : { roomA: roomIdY, roomB: roomIdX, xIsA: false };
}

// ✅ battleId مطلوب الآن (طلب صريح): يحرس السجل من الاحتساب المضاعف لو استُدعيت settleBattleBody
// كاملة مرتين لنفس المعركة (فشل جزئي ثم إعادة محاولة) — راجع appliedBattleIds أعلى الملف
pkHeadToHeadSchema.statics.recordMatch = async function (seasonId, roomXId, roomYId, outcomeForX, battleId) {
    // outcomeForX: 'win' | 'loss' | 'draw' من منظور roomX تحديداً
    const { roomA, roomB, xIsA } = orderPair(roomXId, roomYId);
    const inc = { matches: 1 };
    if (outcomeForX === 'draw') inc.draws = 1;
    else if ((outcomeForX === 'win') === xIsA) inc.aWins = 1;
    else inc.bWins = 1;

    // ✅ يضمن وجود المستند أولاً (بلا أي $inc) — آمن للتكرار دوماً
    await this.findOneAndUpdate(
        { season: seasonId, roomA, roomB },
        { $setOnInsert: {} },
        { upsert: true, setDefaultsOnInsert: true }
    );
    // 🛡️ الزيادة الفعلية مشروطة بعدم تطبيق هذي المعركة من قبل — idempotent حقيقي
    await this.updateOne(
        { season: seasonId, roomA, roomB, appliedBattleIds: { $ne: battleId } },
        { $inc: inc, $push: { appliedBattleIds: battleId } }
    );
    return this.findOne({ season: seasonId, roomA, roomB });
};

// ✅ لقطة جاهزة للعرض من منظور غرفة معيّنة ("أنا") ضد خصم معيّن
pkHeadToHeadSchema.statics.getForRoomPair = async function (seasonId, myRoomId, opponentRoomId) {
    const { roomA, roomB, xIsA } = orderPair(myRoomId, opponentRoomId);
    const doc = await this.findOne({ season: seasonId, roomA, roomB }).lean();
    if (!doc) return { myWins: 0, opponentWins: 0, draws: 0, matches: 0 };
    return {
        myWins: xIsA ? doc.aWins : doc.bWins,
        opponentWins: xIsA ? doc.bWins : doc.aWins,
        draws: doc.draws,
        matches: doc.matches
    };
};

module.exports = mongoose.model('PkHeadToHead', pkHeadToHeadSchema);
