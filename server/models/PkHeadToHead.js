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
    matches: { type: Number, default: 0 }
}, { timestamps: true });

pkHeadToHeadSchema.index({ season: 1, roomA: 1, roomB: 1 }, { unique: true });

// ✅ يُرتّب أي زوج غرف بترتيب ثابت (نصّي) دوماً، ويُرجع الجانب الصحيح (هل كانت غرفتي A أو B
// بهذا الترتيب) كي يعرف المتصل كيف يُحدِّث aWins/bWins بشكل صحيح بغض النظر عمّن بدأ التحدي
function orderPair(roomIdX, roomIdY) {
    const [x, y] = [roomIdX.toString(), roomIdY.toString()];
    return x < y ? { roomA: roomIdX, roomB: roomIdY, xIsA: true } : { roomA: roomIdY, roomB: roomIdX, xIsA: false };
}

pkHeadToHeadSchema.statics.recordMatch = async function (seasonId, roomXId, roomYId, outcomeForX) {
    // outcomeForX: 'win' | 'loss' | 'draw' من منظور roomX تحديداً
    const { roomA, roomB, xIsA } = orderPair(roomXId, roomYId);
    const inc = { matches: 1 };
    if (outcomeForX === 'draw') inc.draws = 1;
    else if ((outcomeForX === 'win') === xIsA) inc.aWins = 1;
    else inc.bWins = 1;

    return this.findOneAndUpdate(
        { season: seasonId, roomA, roomB },
        { $inc: inc },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
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
