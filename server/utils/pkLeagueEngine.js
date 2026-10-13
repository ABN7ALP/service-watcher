// ملف: server/utils/pkLeagueEngine.js
// =====================================================
// ✅ "دوري PK الأسبوعي" — محرّك التسوية الكامل: مكافحة التلاعب، صيغة نقاط الدوري (LP)،
// تحديث الترتيب/سجل المواجهات ذرّياً، وحساب الرتبة قبل/بعد والجيران بنفس الشكل الذي يتوقّعه
// نموذج التصميم الإلزامي (docs/design/pk-result-window-prototype.html).
//
// 🛡️ idempotent بمعرّف التحدي: finalizeActiveBattle بـsocketService.js يُثبّت status:'ended'
// ذرّياً قبل أي نداء هنا أصلاً (findOneAndUpdate بشرط status:'active' الحالي)، فيستحيل أن
// يُستدعى settleBattle مرتين لنفس المعركة من مسارين متزامنين. lpSettled هنا طبقة حماية ثانية
// مستقلة خاصة بدوري PK تحديداً (قد تُستدعى settleBattle لاحقاً من أداة إدارية لإعادة المحاولة
// مثلاً — هذا العلم يمنع الاحتساب المضاعف حتى بذلك السيناريو)
// =====================================================

const mongoose = require('mongoose');
const PkSeason = require('../models/PkSeason');
const PkStanding = require('../models/PkStanding');
const PkHeadToHead = require('../models/PkHeadToHead');
const VoiceRoom = require('../models/VoiceRoom');
const SystemSettings = require('../models/SystemSettings');
const pkRankingStore = require('./pkRankingStore');

// ✅ ضع رابط الكأس هنا بعد رفعه (طلب صريح بالمواصفة) — يبقى null فيُخفي العميل عنصر البطل
// بأناقة بدل صورة مكسورة، لا توقف أي شيء آخر بانتظاره
const PK_HERO_TROPHY_URL = null; // مثال لاحقاً: 'https://res.cloudinary.com/dntlt5xry/image/upload/.../winner-trophy-animated-512.webp'

// =====================================================
// ✅ مكافحة التلاعب — كل الشروط يجب أن تتحقق معاً كي تُحتسَب نقاط الدوري لهذي المعركة
// =====================================================
async function checkEligibility(battle, settings) {
    const durationSeconds = battle.startedAt && battle.endsAt
        ? Math.round((new Date(battle.endsAt).getTime() - new Date(battle.startedAt).getTime()) / 1000)
        : battle.durationSeconds;
    if (durationSeconds < settings.pkMinDurationSeconds) {
        return { eligible: false, reason: `duration_too_short:${durationSeconds}s` };
    }

    const totalRealSupport = (battle.realSupportA || 0) + (battle.realSupportB || 0);
    if (totalRealSupport < settings.pkMinSupportCoins) {
        return { eligible: false, reason: `support_too_low:${totalRealSupport}` };
    }

    // ✅ تواطؤ: لا LP لو مالك إحدى الغرفتين نفسه، أو مشرفاً/مالكاً بالغرفة الأخرى
    const [roomA, roomB] = await Promise.all([
        VoiceRoom.findById(battle.roomA).select('host moderators'),
        VoiceRoom.findById(battle.roomB).select('host moderators')
    ]);
    if (!roomA || !roomB) return { eligible: false, reason: 'room_missing' };
    const hostA = roomA.host?.toString();
    const hostB = roomB.host?.toString();
    const modsA = (roomA.moderators || []).map(m => m.toString());
    const modsB = (roomB.moderators || []).map(m => m.toString());
    if (hostA === hostB || modsA.includes(hostB) || modsB.includes(hostA)) {
        return { eligible: false, reason: 'staff_collusion' };
    }

    // ✅ حد يومي: نفس زوج الغرفتين (بغض النظر عن ترتيبهما) لا يُحتسَب له أكثر من N معارك/يوم
    const RoomBattle = mongoose.model('RoomBattle');
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const countedToday = await RoomBattle.countDocuments({
        _id: { $ne: battle._id },
        lpCounted: true,
        createdAt: { $gte: startOfDay },
        $or: [
            { roomA: battle.roomA, roomB: battle.roomB },
            { roomA: battle.roomB, roomB: battle.roomA }
        ]
    });
    if (countedToday >= settings.pkMaxDailyMatchesPerPair) {
        return { eligible: false, reason: `daily_pair_cap_reached:${countedToday}` };
    }

    return { eligible: true, reason: null };
}

function computeLp(outcome, realSupport, settings) {
    const base = outcome === 'win' ? settings.pkWinLp : (outcome === 'loss' ? settings.pkLossLp : settings.pkDrawLp);
    const supportBonus = Math.floor((realSupport || 0) / settings.pkSupportLpDivisor);
    return Math.min(base + supportBonus, settings.pkLpCapPerBattle);
}

// ✅ الجيران حول الرتبة الجديدة — بنفس الترتيب "بدوني أنا" الذي تتوقّعه حركة السلّم بالنموذج.
// 🛡️ الشكل (3 جيران بلا صفّي، أو 2 جيران + صفّي الاصطناعي) يُحدَّد بـ"تحسّن الرتبة فعلياً"
// (improved) لا بنتيجة الفوز/الخسارة — فوز قد لا يُحسِّن الرتبة لو تقدّمت غرف أخرى أكثر بالتزامن،
// وخسارة قد لا تُسوِّئها (الخسارة نفسها تمنح LP موجباً أيضاً). العميل يفرّع حركة السلّم بنفس
// المعيار تماماً (راجع pkResultLadderUp بـapp.js) فيستحيل انحراف شكل المصفوفة عن الحركة المعروضة
async function getNeighbours(seasonId, myRoomId, rankAfter, improved, myStanding) {
    const skip = improved ? Math.max(0, rankAfter - 2) : Math.max(0, rankAfter - 3);
    const limit = improved ? 3 : 2;
    const rows = await PkStanding.find({ season: seasonId, room: { $ne: myRoomId } })
        .sort({ lp: -1, wins: -1, lastLpAt: 1 })
        .skip(skip).limit(limit)
        .populate('room', 'name coverImage')
        .lean();
    const neighbours = rows.filter(r => r.room).map((r, i) => ({
        r: skip + i + 1, n: r.room.name, s: r.lp, img: r.room.coverImage
    }));
    if (!improved) {
        const myRoom = await VoiceRoom.findById(myRoomId).select('name coverImage').lean();
        neighbours.push({ r: rankAfter, n: myRoom?.name || '', s: myStanding.lp, img: myRoom?.coverImage || '', me: true });
    }
    return neighbours;
}

// ✅ "تجاوزتكم N غرفة · ينقصكم X نقطة لـ#rankBefore" — تلميح يظهر فقط لمن تراجع ترتيبه فعلياً
// (رتبة أسوأ رقمياً = أكبر) ولديه رتبة سابقة معروفة أصلاً (ليس جديداً بالدوري هذا الأسبوع)
async function getRankDropHint(seasonId, rankBefore, rankAfter, currentLp) {
    if (rankBefore == null || rankAfter <= rankBefore) return null;
    const passedBy = rankAfter - rankBefore;
    const oldPositionRoom = await PkStanding.findOne({ season: seasonId })
        .sort({ lp: -1, wins: -1, lastLpAt: 1 })
        .skip(rankBefore - 1).limit(1).lean();
    const gapToOld = oldPositionRoom ? Math.max(0, oldPositionRoom.lp - currentLp) : null;
    return { passedBy, gapToOld };
}

// ✅ يُسوّي معركة محسومة بالكامل: مكافحة التلاعب، صيغة LP، تحديث الترتيب/المواجهات ذرّياً
// (معاملة MongoDB إن كانت قاعدة البيانات مجموعة نسخ تدعمها، وإلا تحديثات ذرّية متتالية آمنة
// بمفردها كل واحدة — راجع التعليق أسفل الدالة)، وحساب كل ما تحتاجه نافذة النتيجة بالضبط
async function settleBattle(battle, winner) {
    // 🛡️ حماية مضاعفة مستقلة خاصة بدوري PK (راجع التعليق أعلى الملف)
    const claimed = await mongoose.model('RoomBattle').findOneAndUpdate(
        { _id: battle._id, lpSettled: false },
        { $set: { lpSettled: true } },
        { new: false }
    );
    if (!claimed) return null; // ✅ سُوِّيت من قبل بالفعل — لا شيء جديد لفعله

    const settings = await SystemSettings.getSettings();
    const season = await PkSeason.ensureActiveSeason();
    const { eligible, reason } = await checkEligibility(battle, settings);

    await mongoose.model('RoomBattle').updateOne(
        { _id: battle._id },
        { $set: { lpCounted: eligible, lpSkippedReason: eligible ? null : reason } }
    );
    if (!eligible) {
        console.log(`[PK LEAGUE] Battle ${battle._id} skipped LP: ${reason}`);
        return { eligible: false, reason };
    }

    const outcomeA = winner === 'A' ? 'win' : (winner === 'B' ? 'loss' : 'draw');
    const outcomeB = winner === 'B' ? 'win' : (winner === 'A' ? 'loss' : 'draw');
    const lpDeltaA = computeLp(outcomeA, battle.realSupportA, settings);
    const lpDeltaB = computeLp(outcomeB, battle.realSupportB, settings);

    const applyUpdates = async (session) => {
        const opts = session ? { session } : {};
        const [beforeA, beforeB] = await Promise.all([
            PkStanding.findOne({ season: season._id, room: battle.roomA }, null, opts),
            PkStanding.findOne({ season: season._id, room: battle.roomB }, null, opts)
        ]);
        const nextStreak = (prevStreak, outcome) => {
            if (outcome === 'draw') return 0;
            if (outcome === 'win') return prevStreak >= 0 ? prevStreak + 1 : 1;
            return prevStreak <= 0 ? prevStreak - 1 : -1;
        };
        const streakA = nextStreak(beforeA?.streak || 0, outcomeA);
        const streakB = nextStreak(beforeB?.streak || 0, outcomeB);
        const now = new Date();

        const buildUpdate = (outcome, lpDelta, realSupport, streak, prevBest) => ({
            $inc: {
                lp: lpDelta,
                wins: outcome === 'win' ? 1 : 0,
                losses: outcome === 'loss' ? 1 : 0,
                draws: outcome === 'draw' ? 1 : 0,
                supportCoins: realSupport || 0
            },
            $set: { streak, lastLpAt: now, bestStreak: Math.max(prevBest || 0, streak) }
        });

        const [afterA, afterB] = await Promise.all([
            PkStanding.findOneAndUpdate(
                { season: season._id, room: battle.roomA },
                { ...buildUpdate(outcomeA, lpDeltaA, battle.realSupportA, streakA, beforeA?.bestStreak), $setOnInsert: { weekKey: season.weekKey } },
                { upsert: true, new: true, setDefaultsOnInsert: true, ...opts }
            ),
            PkStanding.findOneAndUpdate(
                { season: season._id, room: battle.roomB },
                { ...buildUpdate(outcomeB, lpDeltaB, battle.realSupportB, streakB, beforeB?.bestStreak), $setOnInsert: { weekKey: season.weekKey } },
                { upsert: true, new: true, setDefaultsOnInsert: true, ...opts }
            ),
            PkHeadToHead.recordMatch(season._id, battle.roomA, battle.roomB, outcomeA)
        ]);
        return { beforeA, beforeB, afterA, afterB };
    };

    // ✅ معاملة واحدة إن كانت قاعدة البيانات تدعمها (مجموعة نسخ/Atlas) — وإلا تحديثات ذرّية
    // متتالية بأمان (كل تحديث مُفرَد ذرّي بمفرده أصلاً عبر findOneAndUpdate، فلا فساد بيانات
    // حتى بتعطّل منتصف التسلسل، فقط نافذة تعادل قصيرة جداً وغير حرجة بين تحديث غرفة والأخرى)
    let result;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(() => applyUpdates(session).then(r => { result = r; }));
    } catch (txError) {
        const unsupported = /Transaction numbers are only allowed|IllegalOperation|requires replica set/i.test(txError.message || '');
        if (!unsupported) throw txError;
        console.warn('[PK LEAGUE] MongoDB بلا دعم معاملات (ليست مجموعة نسخ) — تحديث ذرّي متتالٍ بديل');
        result = await applyUpdates(null);
    } finally {
        session.endSession();
    }

    const { beforeA, beforeB, afterA, afterB } = result;
    const [rankBeforeA, rankBeforeB, rankAfterA, rankAfterB] = await Promise.all([
        beforeA ? PkStanding.getRank(season._id, beforeA) : Promise.resolve(null),
        beforeB ? PkStanding.getRank(season._id, beforeB) : Promise.resolve(null),
        PkStanding.getRank(season._id, afterA),
        PkStanding.getRank(season._id, afterB)
    ]);

    await Promise.all([
        pkRankingStore.syncRoom(season.weekKey, battle.roomA.toString(), afterA.lp),
        pkRankingStore.syncRoom(season.weekKey, battle.roomB.toString(), afterB.lp)
    ]);

    const h2h = await PkHeadToHead.getForRoomPair(season._id, battle.roomA, battle.roomB);

    // ✅ "تحسّنت" = رتبة جديدة لأول مرة (دخول الدوري، دائماً "صعود" بالسرد البصري) أو رقم رتبة
    // أصغر فعلياً من قبل (الأصغر = الأفضل) — راجع تعليق getNeighbours لسبب عدم استخدام الفوز/الخسارة
    const improvedA = rankBeforeA == null || rankAfterA < rankBeforeA;
    const improvedB = rankBeforeB == null || rankAfterB < rankBeforeB;
    const [neighboursA, neighboursB, hintA, hintB] = await Promise.all([
        getNeighbours(season._id, battle.roomA, rankAfterA, improvedA, afterA),
        getNeighbours(season._id, battle.roomB, rankAfterB, improvedB, afterB),
        getRankDropHint(season._id, rankBeforeA, rankAfterA, afterA.lp),
        getRankDropHint(season._id, rankBeforeB, rankAfterB, afterB.lp)
    ]);

    return {
        eligible: true,
        season,
        A: {
            outcome: outcomeA, standing: afterA,
            rankBefore: rankBeforeA, rankAfter: rankAfterA,
            lpBefore: afterA.lp - lpDeltaA, lpAfter: afterA.lp,
            record: { wins: afterA.wins, losses: afterA.losses, draws: afterA.draws },
            neighbours: neighboursA, hint: hintA,
            headToHead: { myWins: h2h.myWins, opponentWins: h2h.opponentWins, draws: h2h.draws }
        },
        B: {
            outcome: outcomeB, standing: afterB,
            rankBefore: rankBeforeB, rankAfter: rankAfterB,
            lpBefore: afterB.lp - lpDeltaB, lpAfter: afterB.lp,
            record: { wins: afterB.wins, losses: afterB.losses, draws: afterB.draws },
            neighbours: neighboursB, hint: hintB,
            headToHead: { myWins: h2h.opponentWins, opponentWins: h2h.myWins, draws: h2h.draws }
        }
    };
}

module.exports = { settleBattle, checkEligibility, computeLp, getNeighbours, PK_HERO_TROPHY_URL };
