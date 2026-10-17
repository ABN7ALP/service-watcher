const mongoose = require('mongoose');

// =====================================================
// ✅ ترتيب غرفة واحدة بموسم أسبوعي واحد — مستند لكل (season, room). هذا هو مصدر الحقيقة
// الوحيد لدوري PK (Mongo دائماً، وRedis طبقة تسريع اختيارية فوقه فقط — راجع pkRankingStore.js)
// lastLpAt يُستخدم ككسر تعادل أخير: من وصل لنفس النقاط أولاً يتصدّر (طلب صريح)
// =====================================================
const pkStandingSchema = new mongoose.Schema({
    season: { type: mongoose.Schema.Types.ObjectId, ref: 'PkSeason', required: true, index: true },
    weekKey: { type: String, required: true, index: true }, // مُكرَّر عمداً من الموسم لاستعلامات مباشرة بلا populate
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceRoom', required: true, index: true },
    lp: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    supportCoins: { type: Number, default: 0 }, // إجمالي الدعم الحقيقي المحتسَب خلال الموسم (غير مُضخَّم بالقفاز أبداً)
    streak: { type: Number, default: 0 }, // موجب = سلسلة فوز حالية، سالب = سلسلة خسارة، صفر = لا شيء/تعادل
    bestStreak: { type: Number, default: 0 },
    lastLpAt: { type: Date, default: null },
    // ✅ 🛡️ علم منح مكافأة إغلاق الموسم — ذرّي ومستقل لكل صفّ (غرفة+موسم) بعينه، بنفس فلسفة
    // RoomBattle.lpSettled تماماً: يضمن استحالة منح كوينز مكافأة هذا الصف مرتين حتى لو تعطّلت
    // مهمة إغلاق الموسم بمنتصف منح 100 مركز وأُعيدت المحاولة من الصفر (راجع pkSeasonCloseJob.js)
    rewardGranted: { type: Boolean, default: false },
    // ✅ 🛡️ idempotent حقيقي لكل غرفة على حدة (طلب صريح بمراجعة PR): معرّفات المعارك التي
    // طُبِّق أثرها على نقاط *هذا الصف تحديداً* بالفعل. lpSettled بـRoomBattle يحمي من إعادة
    // التسوية الكاملة، لكن لو فشلت الغرفة الأخرى فقط بمحاولة سابقة (بلا دعم معاملات حقيقية)،
    // كانت نقاط هذي الغرفة (التي نجحت) ستُضاف مجدداً عند إعادة المحاولة الكاملة — المصفوفة
    // هنا تمنع ذلك تحديداً: كل $inc لنقاط معركة مشروط بعدم وجود معرّفها هنا مسبقاً (راجع
    // pkLeagueEngine.settleBattleBody)
    appliedBattleIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RoomBattle' }], default: () => [] }
}, { timestamps: true });

pkStandingSchema.index({ season: 1, room: 1 }, { unique: true });
// ✅ فهرس الترتيب نفسه — نفس معيار كسر التعادل تماماً (lp ثم wins ثم أسبقية الوصول)
pkStandingSchema.index({ season: 1, lp: -1, wins: -1, lastLpAt: 1 });

// ✅ رتبة غرفة بنقاطها الحالية — عدّ من يتفوّقون عليها بنفس معيار كسر التعادل، بدل فرز الكل
pkStandingSchema.statics.getRank = async function (seasonId, standing) {
    if (!standing) return null;
    const higherCount = await this.countDocuments({
        season: seasonId,
        $or: [
            { lp: { $gt: standing.lp } },
            { lp: standing.lp, wins: { $gt: standing.wins } },
            { lp: standing.lp, wins: standing.wins, lastLpAt: { $lt: standing.lastLpAt || new Date(0) } }
        ]
    });
    return higherCount + 1;
};

module.exports = mongoose.model('PkStanding', pkStandingSchema);
