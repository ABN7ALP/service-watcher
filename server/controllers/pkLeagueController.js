// ملف: server/controllers/pkLeagueController.js
// =====================================================
// ✅ REST لصفحة "دوري PK الأسبوعي" الجديدة — منصّة أفضل 3 + قائمة بتحميل تدريجي (cursor) +
// سطر غرفتي المثبّت دائماً + تفاصيل أي غرفة (LP/سجل/سلسلة/مواجهات معي) + تبويب "الأسبوع
// الماضي". 🛡️ لا حساب أرقام هنا على العميل أبداً — كل رقم (lp/رتبة/سجل) من Mongo مباشرة؛
// الوحيد "المحسوب" بالعميل لاحقاً هو عدّاد تنازلي حي من endsAt الخام المُرسَل هنا (ساعة حائط
// عادية، لا رقم دوري يُعاد اشتقاقه)
// =====================================================

const PkSeason = require('../models/PkSeason');
const PkStanding = require('../models/PkStanding');
const PkHeadToHead = require('../models/PkHeadToHead');
const VoiceRoom = require('../models/VoiceRoom');
const { getWeekBoundsForDate } = require('../utils/pkWeek');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// ✅ "current" يفتح/يضمن موسم هذا الأسبوع (ensureActiveSeason idempotent بذاته)، "previous"
// يبحث فقط (lean، بلا إنشاء) عن موسم الأسبوع الماضي — قد لا يوجد أصلاً لو لم تُسوَّ به أي
// معركة بعد، وهذا احتمال طبيعي تماماً (حالة فراغ، لا خطأ) يتعامل معه كل مسار بالأسفل بأناقة
async function resolveSeason(weekParam) {
    if (weekParam === 'previous') {
        const { weekKey } = getWeekBoundsForDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
        return PkSeason.findOne({ weekKey }).lean();
    }
    const season = await PkSeason.ensureActiveSeason();
    return season.toObject();
}

function seasonMeta(season) {
    if (!season) return null;
    return { weekKey: season.weekKey, startsAt: season.startsAt, endsAt: season.endsAt, status: season.status };
}

function standingRow(standing, rank) {
    return {
        rank,
        room: standing.room ? {
            id: standing.room._id, name: standing.room.name, coverImage: standing.room.coverImage || null
        } : null,
        lp: standing.lp,
        wins: standing.wins,
        losses: standing.losses,
        draws: standing.draws,
        streak: standing.streak,
        bestStreak: standing.bestStreak
    };
}

function encodeCursor(standing) {
    const payload = { lp: standing.lp, wins: standing.wins, lastLpAt: standing.lastLpAt ? new Date(standing.lastLpAt).getTime() : 0 };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor) {
    if (!cursor) return null;
    try {
        const obj = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
        if (typeof obj.lp !== 'number' || typeof obj.wins !== 'number' || typeof obj.lastLpAt !== 'number') return null;
        return obj;
    } catch {
        return null;
    }
}

// =====================================================
// ✅ GET /api/pk-league/standings?week=current|previous&cursor=&limit= — منصّة أفضل 3 (دائماً
// بالصفحة الأولى فقط، cursor فارغ) + قائمة مُرقَّمة بالتحميل التدريجي بعدها، بنفس معيار كسر
// التعادل (lp ثم wins ثم أسبقية الوصول) بكل مكان آخر بدوري PK
// =====================================================
exports.getStandings = async (req, res) => {
    try {
        const weekParam = req.query.week === 'previous' ? 'previous' : 'current';
        const season = await resolveSeason(weekParam);
        if (!season) {
            return res.json({ status: 'success', season: null, podium: [], rows: [], nextCursor: null, myRoom: null });
        }

        const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE));
        const cursor = decodeCursor(req.query.cursor);

        const baseQuery = { season: season._id };
        if (cursor) {
            baseQuery.$or = [
                { lp: { $lt: cursor.lp } },
                { lp: cursor.lp, wins: { $lt: cursor.wins } },
                { lp: cursor.lp, wins: cursor.wins, lastLpAt: { $gt: new Date(cursor.lastLpAt) } }
            ];
        }

        const pageRows = await PkStanding.find(baseQuery)
            .sort({ lp: -1, wins: -1, lastLpAt: 1 })
            .limit(limit + 1)
            .populate('room', 'name coverImage')
            .lean();

        const hasMore = pageRows.length > limit;
        const pageSlice = hasMore ? pageRows.slice(0, limit) : pageRows;
        const startRank = cursor ? null : 1; // ✅ فقط الصفحة الأولى (بلا cursor) رتبتها معروفة مباشرة بترتيبها بالقائمة

        let podium = [];
        let rows = [];
        if (!cursor) {
            podium = pageSlice.slice(0, 3).map((s, i) => standingRow(s, i + 1));
            rows = pageSlice.slice(3).map((s, i) => standingRow(s, i + 4));
        } else {
            // ✅ الصفحات التالية: الرتبة الحقيقية لكل صفّ عبر getRank (دقيقة ولو تغيّر الترتيب
            // بين الطلبين) بدل افتراض تسلسل متتابع قد ينحرف لو حدثت تسوية معركة بالتزامن
            rows = await Promise.all(pageSlice.map(async (s) => standingRow(s, await PkStanding.getRank(season._id, s))));
        }

        const nextCursor = hasMore ? encodeCursor(pageSlice[pageSlice.length - 1]) : null;

        // ✅ سطر غرفتي — مثبّت دائماً بالأسفل بواجهة العميل بصرف النظر عن الصفحة الحالية
        let myRoom = null;
        if (req.user?.id) {
            const myRoomDoc = await VoiceRoom.findOne({ host: req.user.id, status: 'active' }).select('_id').lean();
            if (myRoomDoc) {
                const myStanding = await PkStanding.findOne({ season: season._id, room: myRoomDoc._id }).populate('room', 'name coverImage').lean();
                if (myStanding) {
                    const myRank = await PkStanding.getRank(season._id, myStanding);
                    myRoom = standingRow(myStanding, myRank);
                }
            }
        }

        res.json({ status: 'success', season: seasonMeta(season), podium, rows, nextCursor, myRoom });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// =====================================================
// ✅ GET /api/pk-league/my-room?week=current|previous — سطر غرفتي بمفرده (لتحديث سريع بلا
// إعادة تحميل القائمة الكاملة) — null لو لا أملك غرفة، أو لم تُسجَّل لها معركة محتسَبة بعد هذا الأسبوع
// =====================================================
exports.getMyStanding = async (req, res) => {
    try {
        const weekParam = req.query.week === 'previous' ? 'previous' : 'current';
        const season = await resolveSeason(weekParam);
        if (!season) return res.json({ status: 'success', season: null, myRoom: null });

        const myRoomDoc = await VoiceRoom.findOne({ host: req.user.id, status: 'active' }).select('_id').lean();
        if (!myRoomDoc) return res.json({ status: 'success', season: seasonMeta(season), myRoom: null });

        const myStanding = await PkStanding.findOne({ season: season._id, room: myRoomDoc._id }).populate('room', 'name coverImage').lean();
        if (!myStanding) return res.json({ status: 'success', season: seasonMeta(season), myRoom: null });

        const myRank = await PkStanding.getRank(season._id, myStanding);
        res.json({ status: 'success', season: seasonMeta(season), myRoom: standingRow(myStanding, myRank) });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// =====================================================
// ✅ GET /api/pk-league/room/:roomId?week=current|previous — تفاصيل غرفة عند الضغط عليها:
// LP/سجلها/سلسلتها + سجل مواجهاتها معي تحديداً (null لو لا أملك غرفة، أو لم تواجهها هذا الموسم)
// =====================================================
exports.getRoomStanding = async (req, res) => {
    try {
        const weekParam = req.query.week === 'previous' ? 'previous' : 'current';
        const season = await resolveSeason(weekParam);
        if (!season) return res.json({ status: 'success', season: null, room: null, headToHead: null });

        const standing = await PkStanding.findOne({ season: season._id, room: req.params.roomId }).populate('room', 'name coverImage').lean();
        if (!standing) return res.json({ status: 'success', season: seasonMeta(season), room: null, headToHead: null });

        const rank = await PkStanding.getRank(season._id, standing);

        let headToHead = null;
        const myRoomDoc = await VoiceRoom.findOne({ host: req.user.id, status: 'active' }).select('_id').lean();
        if (myRoomDoc && myRoomDoc._id.toString() !== req.params.roomId) {
            headToHead = await PkHeadToHead.getForRoomPair(season._id, myRoomDoc._id, req.params.roomId);
        }

        res.json({ status: 'success', season: seasonMeta(season), room: standingRow(standing, rank), headToHead });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
