// ملف: server/controllers/fanClubController.js
//
// ✅ نظام "نادي المعجبين" — مستوى معجب تراكمي دائم (1-20) لكل علاقة (معجب↔صاحب نادٍ) مبني على
// "نقاط معجب" حقيقية. تصميم الشارة (الفئة/التدرّج اللوني) يُحدَّد تلقائياً من المستوى.
// 🛡️ fanclub-v2 (مراجعة كود كاملة، راجع docs/specs/fanclub-v2.md للتفصيل الكامل): هذي مراجعة
// جوهرية تصحّح 8 ثغرات/أخطاء وُجدت بالنسخة السابقة — أرقام غير مضخَّمة (سعر انضمام/مهام/سقف
// مستوى)، حسابات مرتبطة بالمالك تكسب نقاطاً وتفوز بإطار المساهم وتُضخِّم لوحة الصدارة، ثلاثة
// تقاويم مختلفة (يوم UTC/أسبوع الاثنين UTC/نافذة 7 أيام متدحرجة)، لوحة الصدارة تُجمِّع كل
// العضويات بكل طلب، بث عام للجميع عند كل انضمام، لا مغادرة ولا خمول ولا فحص ألفاظ لاسم النادي،
// الانضمام لا يتطلّب متابعة مسبقة، وسجل GiftLog الانضمام خارج معاملة المحفظة.
const mongoose = require('mongoose');
const User = require('../models/User');
const Gift = require('../models/Gift');
const GiftLog = require('../models/GiftLog');
const Follow = require('../models/Follow');
const FanClubMembership = require('../models/FanClubMembership');
const FanClubWeekly = require('../models/FanClubWeekly');
const FanClubDailyProgress = require('../models/FanClubDailyProgress');
const { computeFanLevelInfo } = require('../utils/fanClubLevels');
const walletService = require('../utils/walletService');
const linkageService = require('../utils/linkageService');
const { containsProfanity } = require('../utils/profanityFilter');
// 🛡️ fanclub-v2: تقويم واحد فقط بكل الملف — نفس تقويم مسبح المضيفين الأسبوعي بالضبط (دمشق،
// الأسبوع يبدأ أحداً) — لا تقويم منفصل يُخترع لنادي المعجبين (كان فيه 3 تقاويم مختلفة سابقاً)
const { getCurrentWeekBounds, getWeekBoundsForDate, getCurrentDayStart } = require('../utils/poolWeek');

// 🛡️ fanclub-v2: تذكرة الانضمام = 100 كوينز (كانت 10 — غير مضخَّمة إطلاقاً مع تضخيم كل أسعار
// الكوينز ×10 سابقاً، أي $0.01 فعلياً). منفصلة تماماً عن سعر الوردة الحقيقي بمتجر الهدايا العام
const JOIN_PRICE = 100;

const FAN_CLUB_COLOR_IDS = ['pink', 'yellow', 'purple', 'blue', 'orange'];

// 🛡️ fanclub-v2: قيم المهام أُعيد ضبطها بالكامل على معدّل 1 كوينز = 1 نقطة (كانت 15-50 نقطة
// ثابتة بصرف النظر عن هذا المعدّل — غير متّسقة إطلاقاً معه). "هدية اليوم" (25 نقطة سابقاً)
// أُزيلت تماماً — الهدية تُحسَب 1:1 بالفعل عبر مسارها العادي، لا حاجة لمكافأة يومية فوقها
const DAILY_CHECKIN_BONUS = 50;
const CHAT_BONUS = 50;
const CHAT_MSGS_REQUIRED = 3;
const LISTEN_POINTS_PER_MIN = 10;
const LISTEN_DAILY_CAP_MINUTES = 30;
const FOLLOW_BONUS = 100;

// 🛡️ feat/fanclub-v2-ui: عتبات مزايا الغرفة (كوزمتيكية بحتة) — راجع docs/specs/fanclub-v2.md
// لا تغيّر توزيع المستويات/الفئات نفسه (fanClubLevels.js)، فقط أي مستوى يفتح أي ميزة بغرفة المالك
const BADGE_MIN_LEVEL = 1;
const NAME_COLOR_MIN_LEVEL = 5;
const ENTRANCE_ANNOUNCE_MIN_LEVEL = 9;
const EXCLUSIVE_GIFT_MIN_LEVEL = 13;
const LEGEND_FRAME_MIN_LEVEL = 17;

// ✅ "غير نشط" = لا نقطة من أي نوع خلال 7 أيام — لا خصم نقاط أبداً، أي نقطة جديدة تُعيد التنشيط فوراً
const INACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
function isInactive(lastPointAt) {
    if (!lastPointAt) return true;
    return (Date.now() - new Date(lastPointAt).getTime()) > INACTIVITY_WINDOW_MS;
}
exports.isInactive = isInactive;
// ✅ نفس حد isInactive أعلاه، كتاريخ قطع جاهز لاستعلامات lastPointAt:{$gte: activeCutoff()} —
// "نشط" لا يُخزَّن كعدّاد أبداً (راجع مراجعة #156)، يُحسَب حياً من هذا التاريخ وحده في كل مكان
function activeCutoff() {
    return new Date(Date.now() - INACTIVITY_WINDOW_MS);
}

// ✅ يبثّ احتفال "ارتقاء المستوى" للعضو فقط لو تجاوزت النقاط عتبة مستوى جديدة فعلياً —
// pointsBefore محسوبة حسابياً (pointsAfter - delta) بلا أي قراءة إضافية، فتبقى العملية ذرّية
async function notifyIfLeveledUp(io, ownerId, memberId, pointsAfter, delta) {
    if (!io || delta <= 0) return;
    const afterInfo = computeFanLevelInfo(pointsAfter);
    const beforeInfo = computeFanLevelInfo(pointsAfter - delta);
    if (afterInfo.level <= beforeInfo.level) return;
    try {
        const [owner, member] = await Promise.all([
            User.findById(ownerId).select('username'),
            User.findById(memberId).select('socketId username')
        ]);
        if (member?.socketId) {
            io.to(member.socketId).emit('fanclub-level-up', {
                ownerId: ownerId.toString(),
                ownerUsername: owner?.username || '',
                newLevel: afterInfo.level,
                tierName: afterInfo.tierName,
                levelInfo: afterInfo
            });
            // 🛡️ feat/fanclub-v2-ui: احتفال إضافي يظهر للجميع داخل دردشة غرفة المالك الحيّة —
            // فقط لو العضو حاضر فعلياً بها الآن (عضو حقيقي بقناة دردشتها، لا بصرف النظر عن
            // وجوده الفعلي). غرفة المالك "الحيّة" الواحدة فقط (isLive:true) — لا تاريخه كاملاً
            const VoiceRoom = require('../models/VoiceRoom');
            const liveRoom = await VoiceRoom.findOne({ host: ownerId, isLive: true }).select('_id');
            if (liveRoom) {
                const channel = `room-chat-${liveRoom._id}`;
                const memberSocket = io.sockets.sockets.get(member.socketId);
                if (memberSocket && memberSocket.rooms.has(channel)) {
                    io.to(channel).emit('fanclub-member-levelup-in-room', {
                        roomId: liveRoom._id.toString(),
                        memberUsername: member.username || '',
                        newLevel: afterInfo.level,
                        tierName: afterInfo.tierName
                    });
                }
            }
        }
    } catch (error) {
        console.error('[FAN CLUB] notifyIfLeveledUp error:', error);
    }
}

// 🛡️ fanclub-v2: نقطة الدخول الوحيدة لمنح أي نقطة معجب من أي مصدر (هدية/حضور/دردشة/استماع/
// متابعة) — موضع واحد يفحص الربط بالمالك (بند 2 بالمراجعة: حساب مرتبط بالمالك = صفر نقاط
// دوماً، بصرف النظر عن المصدر) ويُزيد كلاً من النقاط الدائمة (FanClubMembership.points) ونقاط
// هذا الأسبوع (FanClubWeekly، أساس "نجم الأسبوع" ولوحة الصدارة الآن). لا يُنشئ عضوية جديدة
// أبداً — فقط لعضوية موجودة فعلاً (الانضمام هو الطريق الوحيد لإنشاء عضوية، راجع joinFanClub)
async function awardFanClubPoints(io, ownerId, memberId, pointsDelta, source) {
    if (!ownerId || !memberId || String(ownerId) === String(memberId) || pointsDelta <= 0) return null;
    try {
        if (await linkageService.areLinked(memberId, ownerId)) return null;
        const now = new Date();
        const membership = await FanClubMembership.findOneAndUpdate(
            { owner: ownerId, member: memberId },
            { $inc: { points: pointsDelta }, $set: { lastPointAt: now } },
            { new: true }
        );
        if (!membership) return null;
        const { weekStart } = getCurrentWeekBounds();
        await FanClubWeekly.addPoints(ownerId, memberId, weekStart, pointsDelta);
        notifyIfLeveledUp(io, ownerId, memberId, membership.points, pointsDelta);
        return membership;
    } catch (error) {
        console.error(`[FAN CLUB] awardFanClubPoints(${source}) error:`, error);
        return null;
    }
}

// ✅ نقاط الهدايا — تُستدعى من giftController بمعدّل 1:1 مع الكوينز المُنفَقة (fire-and-forget
// من طرف المستدعي دوماً). الاسم القديم محفوظ (3 نداءات بـgiftController تستخدمه بالفعل)
async function awardFanPoints(io, ownerId, memberId, pointsDelta) {
    return awardFanClubPoints(io, ownerId, memberId, pointsDelta, 'gift');
}
exports.awardFanPoints = awardFanPoints;

// ✅ مكافأة الدردشة — 50 نقطة بعد 3 رسائل بغرفة صاحب النادي باليوم (لا كل رسالة كسابقاً).
// خطوتان ذرّيّتان منفصلتان (العدّاد أولاً عبر upsert بلا شرط مقيِّد، ثم الادّعاء بلا upsert) —
// لا نداء upsert واحد بشرط مقيِّد (chatMsgCount/chatBonusAwarded) قد يتصادم مع الفهرس الفريد
// لو حاول إدراج مستند جديد بينما المستند الحقيقي موجود فعلاً بقيمة لا تطابق شرط الفلتر
async function creditDailyChat(io, ownerId, memberId) {
    if (!ownerId || !memberId || String(ownerId) === String(memberId)) return;
    try {
        const membershipExists = await FanClubMembership.exists({ owner: ownerId, member: memberId });
        if (!membershipExists) return;
        const day = getCurrentDayStart();
        await FanClubDailyProgress.findOneAndUpdate(
            { owner: ownerId, member: memberId, day },
            { $inc: { chatMsgCount: 1 }, $setOnInsert: { owner: ownerId, member: memberId, day } },
            { upsert: true }
        );
        const claimed = await FanClubDailyProgress.findOneAndUpdate(
            { owner: ownerId, member: memberId, day, chatMsgCount: { $gte: CHAT_MSGS_REQUIRED }, chatBonusAwarded: false },
            { $set: { chatBonusAwarded: true } },
            { new: true }
        );
        if (claimed) await awardFanClubPoints(io, ownerId, memberId, CHAT_BONUS, 'chat');
    } catch (error) {
        console.error('[FAN CLUB] creditDailyChat error:', error);
    }
}
exports.creditDailyChat = creditDailyChat;

// ✅ مكافأة متابعة صاحب النادي — لمرة واحدة فقط لكل علاقة (followBonusClaimed)، لا تُنشئ
// عضوية جديدة (يجب أن يكون عضواً بالفعل — نفس شرط awardFanClubPoints الداخلي)
async function creditFollowBonus(io, ownerId, memberId) {
    if (!ownerId || !memberId || String(ownerId) === String(memberId)) return;
    try {
        const membership = await FanClubMembership.findOneAndUpdate(
            { owner: ownerId, member: memberId, followBonusClaimed: false },
            { $set: { followBonusClaimed: true } },
            { new: true }
        );
        if (!membership) return;
        await awardFanClubPoints(io, ownerId, memberId, FOLLOW_BONUS, 'follow');
    } catch (error) {
        console.error('[FAN CLUB] creditFollowBonus error:', error);
    }
}
exports.creditFollowBonus = creditFollowBonus;

// 🛡️ fanclub-v2: نقاط الاستماع — تُستدعى من socketService.js runLiveHoursTick لكل مستمع
// حقيقي حاضر وقت نجاح "ادّعاء الدقيقة" نفسه (updatedSession && qualifies) — نفس الحماية التي
// تمنع ازدواج ساعات المضيف (HostDailyStat) تماماً، لا آلية منفصلة. خطوتان ذرّيّتان (تأكيد وجود
// مستند اليوم، ثم $inc بشرط السقف <30 بلا upsert) لنفس سبب creditDailyChat أعلاه بالضبط
async function awardListeningMinute(io, ownerId, memberId, day) {
    if (!ownerId || !memberId || String(ownerId) === String(memberId)) return;
    try {
        const membershipExists = await FanClubMembership.exists({ owner: ownerId, member: memberId });
        if (!membershipExists) return;
        await FanClubDailyProgress.findOneAndUpdate(
            { owner: ownerId, member: memberId, day },
            { $setOnInsert: { owner: ownerId, member: memberId, day } },
            { upsert: true }
        );
        const claimed = await FanClubDailyProgress.findOneAndUpdate(
            { owner: ownerId, member: memberId, day, listenMinutes: { $lt: LISTEN_DAILY_CAP_MINUTES } },
            { $inc: { listenMinutes: 1 } },
            { new: true }
        );
        if (claimed) await awardFanClubPoints(io, ownerId, memberId, LISTEN_POINTS_PER_MIN, 'listen');
    } catch (error) {
        console.error('[FAN CLUB] awardListeningMinute error:', error);
    }
}
exports.awardListeningMinute = awardListeningMinute;

// ✅ "نجم الأسبوع" لنادٍ واحد — أعلى نقاط FanClubWeekly بهذا الأسبوع، باستبعاد أي مرشَّح مرتبط
// بالمالك نفسه (دفاع إضافي فوق الاستبعاد الأصلي وقت منح النقاط بـawardFanClubPoints — يحمي من
// حالة أصبح العضو مرتبطاً بالمالك *بعد* كسب نقاط حقيقية سابقاً بنفس الأسبوع)
async function computeWeeklyLeader(ownerId, weekStart) {
    const candidates = await FanClubWeekly.find({ owner: ownerId, weekStart })
        .sort({ points: -1, member: 1 }).limit(10).lean();
    if (candidates.length === 0) return null;
    const ownerIdStr = ownerId.toString();
    const groupKey = await linkageService.groupLinkedAccounts([ownerIdStr, ...candidates.map(c => c.member.toString())]);
    const ownerGroup = groupKey.get(ownerIdStr);
    const top = candidates.find(c => groupKey.get(c.member.toString()) !== ownerGroup);
    if (!top) return null;
    const user = await User.findById(top.member).select('username profileImage');
    if (!user) return null;
    return { userId: top.member, username: user.username, profileImage: user.profileImage, points: top.points };
}

// 🛡️ feat/fanclub-v2-ui: نفس منطق computeWeeklyLeader أعلاه (استبعاد الحسابات المرتبطة
// بالمالك) لكن تُعيد أعلى limit مساهم بدل واحد فقط — لبطاقة "أكثر المساهمين هذا الأسبوع"
// بالواجهة. دالة منفصلة عمداً (لا تُعدِّل computeWeeklyLeader الأصلية المُختبَرة فعلاً)
async function computeTopWeeklyContributors(ownerId, weekStart, limit = 3) {
    const candidates = await FanClubWeekly.find({ owner: ownerId, weekStart })
        .sort({ points: -1, member: 1 }).limit(10).lean();
    if (candidates.length === 0) return [];
    const ownerIdStr = ownerId.toString();
    const groupKey = await linkageService.groupLinkedAccounts([ownerIdStr, ...candidates.map(c => c.member.toString())]);
    const ownerGroup = groupKey.get(ownerIdStr);
    const eligible = candidates.filter(c => groupKey.get(c.member.toString()) !== ownerGroup).slice(0, limit);
    if (eligible.length === 0) return [];
    const users = await User.find({ _id: { $in: eligible.map(c => c.member) } }).select('username profileImage');
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    return eligible
        .map(c => {
            const user = userMap.get(c.member.toString());
            return user ? { userId: c.member, username: user.username, profileImage: user.profileImage, points: c.points } : null;
        })
        .filter(Boolean);
}

// ✅ نفس منطق computeWeeklyLeader أعلاه لكن لكل النوادي النشطة بأسبوع معيّن معاً بنداء واحد —
// تُستخدَم من fanClubWeeklyFrameJob.js لمنح إطار المساهم لكل الفائزين دفعة واحدة
async function getWeeklyWinnersMap(weekStart) {
    // 🛡️ مراجعة #156: $topN (بدل $push لكل عضو بكل نادٍ ثم slice(0,10) بالذاكرة) — يُبقي أعلى 10
    // فقط لكل مالك ضمن التجميع نفسه، بصرف النظر عن عدد أعضاء النادي الحقيقي
    const rows = await FanClubWeekly.aggregate([
        { $match: { weekStart } },
        { $group: { _id: '$owner', candidates: { $topN: { output: '$member', sortBy: { points: -1, member: 1 }, n: 10 } } } }
    ]);
    const winners = new Map();
    for (const row of rows) {
        const ownerIdStr = row._id.toString();
        const candidateIds = row.candidates.map(String);
        const groupKey = await linkageService.groupLinkedAccounts([ownerIdStr, ...candidateIds]);
        const ownerGroup = groupKey.get(ownerIdStr);
        const winnerId = candidateIds.find(id => groupKey.get(id) !== ownerGroup);
        if (winnerId) winners.set(ownerIdStr, winnerId);
    }
    return winners;
}
exports.getWeeklyWinnersMap = getWeeklyWinnersMap;

// 🛡️ feat/fanclub-v2-ui: دفعة واحدة لكل "لقطة غرفة" (مقاعد/مشاهدين/رسائل دردشة) — لا طلب
// منفصل لكل مستخدم حاضر. يُستخدَم من voiceRoomController.js (المقاعد/المشاهدون/سجل الدردشة
// الأولي) وsocketService.js (رسالة دردشة حيّة + دخول الغرفة) لإرفاق شارة نادي معجبين (إن
// وُجدت) لكل مستخدم حاضر بنادي مضيف هذي الغرفة تحديداً. يُعيد Map فاضية بصمت لو لا مضيف/لا معرّفات
async function getFanClubBadgeMap(ownerId, memberIds) {
    const ids = [...new Set((memberIds || []).map(String))].filter(id => ownerId && id !== String(ownerId));
    if (!ownerId || ids.length === 0) return new Map();
    const memberships = await FanClubMembership.find({ owner: ownerId, member: { $in: ids } }).select('member points lastPointAt').lean();
    if (memberships.length === 0) return new Map();
    // ✅ اسم النادي يُقرَأ فقط لو يوجد عضو واحد فعلاً بهذي اللقطة — يوفّر استعلاماً كاملاً
    // بالحالة الأشيع (أغلب الحاضرين ليسوا أعضاءً بنادي هذا المضيف تحديداً)
    const owner = await User.findById(ownerId).select('fanClub.name').lean();
    const clubName = owner?.fanClub?.name || null;
    const map = new Map();
    for (const m of memberships) {
        const levelInfo = computeFanLevelInfo(m.points);
        map.set(m.member.toString(), {
            level: levelInfo.level,
            tierName: levelInfo.tierName,
            tierGradient: levelInfo.tierGradient,
            tierIcon: levelInfo.tierIcon,
            clubName,
            active: !isInactive(m.lastPointAt)
        });
    }
    return map;
}
exports.getFanClubBadgeMap = getFanClubBadgeMap;

// 🛡️ feat/fanclub-v2-ui: نقطة الفحص الوحيدة لأهلية إرسال "هدية النادي" الحصرية — تُستدعى من
// كل مسار إرسال هدية حقيقي (sendGift/prepareGiftComboSend/sendPublicGift بـgiftController.js)
// قبل أي خصم. لا تفعل شيئاً لأي هدية عادية (isFanClubExclusive غير مضبوط) — فقط هذي الهدية
// الواحدة المحدَّدة بالاسم (راجع autoSeed.js) تخضع لهذا الفحص. ترمي خطأً مُهيَّأً (code
// FAN_CLUB_EXCLUSIVE_DENIED) بدل إرجاع قيمة — كل مسارات الإرسال الثلاثة ترجمه بالفعل لرفض 4xx
async function assertFanClubExclusiveGiftEligible(gift, senderId, receiverId) {
    if (!gift || !gift.isFanClubExclusive) return;
    const deny = (msg) => { throw Object.assign(new Error(msg), { code: 'FAN_CLUB_EXCLUSIVE_DENIED' }); };
    if (String(senderId) === String(receiverId)) deny('لا يمكنك إرسال هذي الهدية لنفسك');
    if (await linkageService.areLinked(senderId, receiverId)) deny('هدية النادي الحصرية غير متاحة لهذا الحساب');
    const membership = await FanClubMembership.findOne({ owner: receiverId, member: senderId }).select('points lastPointAt');
    if (!membership) deny('هدية النادي الحصرية متاحة فقط لأعضاء النادي');
    if (isInactive(membership.lastPointAt)) deny('هدية النادي الحصرية غير متاحة — عضويتك غير نشطة حالياً');
    if (computeFanLevelInfo(membership.points).level < EXCLUSIVE_GIFT_MIN_LEVEL) {
        deny(`هدية النادي الحصرية تُفتح من المستوى ${EXCLUSIVE_GIFT_MIN_LEVEL}`);
    }
}
exports.assertFanClubExclusiveGiftEligible = assertFanClubExclusiveGiftEligible;
exports.BADGE_MIN_LEVEL = BADGE_MIN_LEVEL;
exports.NAME_COLOR_MIN_LEVEL = NAME_COLOR_MIN_LEVEL;
exports.ENTRANCE_ANNOUNCE_MIN_LEVEL = ENTRANCE_ANNOUNCE_MIN_LEVEL;
exports.EXCLUSIVE_GIFT_MIN_LEVEL = EXCLUSIVE_GIFT_MIN_LEVEL;
exports.LEGEND_FRAME_MIN_LEVEL = LEGEND_FRAME_MIN_LEVEL;

// ✅ أهلية "هدية النادي" الحصرية للمستخدم الحالي تحديداً بنادي ownerId — تُستهلَك من واجهة
// اختيار الهدايا بغرفة المالك (عرض/إخفاء البطاقة قبل أي محاولة إرسال فعلية). قراءة فقط،
// لا تُكرِّر منطق assertFanClubExclusiveGiftEligible (نفس عتبات isInactive/computeFanLevelInfo)
exports.getExclusiveGiftEligibility = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        const memberId = req.user.id;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const [gift, membership, linked, owner] = await Promise.all([
            Gift.findOne({ isFanClubExclusive: true, isActive: true }),
            FanClubMembership.findOne({ owner: ownerId, member: memberId }).select('points lastPointAt'),
            linkageService.areLinked(memberId, ownerId),
            User.findById(ownerId).select('fanClub.giftColorId')
        ]);
        if (!gift) return res.status(200).json({ status: 'success', data: { eligible: false, gift: null } });
        const level = membership ? computeFanLevelInfo(membership.points).level : 0;
        const active = membership ? !isInactive(membership.lastPointAt) : false;
        const eligible = !linked && !!membership && active && level >= EXCLUSIVE_GIFT_MIN_LEVEL;
        res.status(200).json({
            status: 'success',
            data: {
                eligible,
                minLevel: EXCLUSIVE_GIFT_MIN_LEVEL,
                myLevel: level,
                // ✅ لون هدية نادي المالك — يُستخدَم لتلوين صورة الهدية الحصرية بالعميل (نفس فلتر
                // CSS المُستخدَم أصلاً لوردة زر الانضمام — راجع FAN_CLUB_COLORS بـapp.js)
                giftColorId: owner?.fanClub?.giftColorId || 'pink',
                gift: eligible ? { id: gift._id, name: gift.name, imageUrl: gift.imageUrl, price: gift.discountedPrice || gift.price } : null
            }
        });
    } catch (error) {
        console.error('[FAN CLUB] getExclusiveGiftEligibility error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

exports.getSummary = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const [owner, membership, activeCount, isFollowing] = await Promise.all([
            User.findById(ownerId).select('username profileImage activeFrameClass fanClub'),
            FanClubMembership.findOne({ owner: ownerId, member: req.user.id }),
            // 🛡️ مراجعة #156: activeCount محسوب حياً من lastPointAt هنا (لا عدّاد مخزَّن — حقل زمني
            // كـ"نشط" لا يمكن أن يصحّ كعدّاد يُلمَس فقط عند الانضمام/المغادرة: لا يُنقَص تلقائياً
            // حين يصمت أحدهم، ولا يُزاد حين يعود) — راجع تعليق الفهرس {owner:1, lastPointAt:-1} بالنموذج
            FanClubMembership.countDocuments({ owner: ownerId, lastPointAt: { $gte: activeCutoff() } }),
            // 🛡️ feat/fanclub-v2-ui: تمكِّن العميل من إظهار زر "تابع أولاً" بدل زر الانضمام مباشرة
            // لمن لا يتابع بعد — الانضمام الحقيقي سيُرفَض بالخادم أصلاً بلا متابعة سابقة (بند 7 من
            // docs/specs/fanclub-v2.md)، هذا فقط يمنع محاولة مرفوضة مسبقاً بالواجهة
            Follow.exists({ follower: req.user.id, followee: ownerId })
        ]);
        if (!owner) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });

        const { weekStart } = getCurrentWeekBounds();
        const [currentLeader, topWeeklyContributors] = await Promise.all([
            computeWeeklyLeader(ownerId, weekStart),
            computeTopWeeklyContributors(ownerId, weekStart, 3)
        ]);

        res.status(200).json({
            status: 'success',
            data: {
                ownerId,
                ownerUsername: owner.username,
                ownerProfileImage: owner.profileImage,
                ownerActiveFrameClass: owner.activeFrameClass || '',
                clubName: owner.fanClub?.name || null,
                emblemColorId: owner.fanClub?.emblemColorId || 'pink',
                giftColorId: owner.fanClub?.giftColorId || 'pink',
                isOwner: ownerId === req.user.id.toString(),
                // ✅ من العدّاد المُصان ضمن معاملة الانضمام/المغادرة (لا عدّ مباشر لكل طلب) — راجع
                // User.fanClub.memberCount بتعليق النموذج. activeCount أعلاه حياً دوماً (ليس عدّاداً)
                memberCount: owner.fanClub?.memberCount || 0,
                activeCount,
                isMember: !!membership,
                isFollowing: !!isFollowing,
                myLevelInfo: membership ? computeFanLevelInfo(membership.points) : null,
                myInactive: membership ? isInactive(membership.lastPointAt) : null,
                joinPrice: JOIN_PRICE,
                currentLeader,
                topWeeklyContributors
            }
        });
    } catch (error) {
        console.error('[FAN CLUB] getSummary error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ تخصيص النادي — الاسم (حد أقصى 13 حرفاً، بلا ألفاظ مسيئة الآن)، ولون كل من الشعار وهدية
// الانضمام (قيمة من قائمة مغلقة فقط — لا نص حر إطلاقاً هنا لمنع أي حقن)
exports.updateSettings = async (req, res) => {
    try {
        const { name, emblemColorId, giftColorId } = req.body;
        const update = {};

        if (name !== undefined) {
            const trimmed = String(name || '').trim();
            if (trimmed.length > 13) {
                return res.status(400).json({ status: 'fail', message: 'اسم النادي يجب ألا يتجاوز 13 حرفاً' });
            }
            if (trimmed && containsProfanity(trimmed)) {
                return res.status(400).json({ status: 'fail', message: 'اسم النادي يحتوي على ألفاظ غير لائقة' });
            }
            update['fanClub.name'] = trimmed || null;
        }
        if (emblemColorId !== undefined) {
            if (!FAN_CLUB_COLOR_IDS.includes(emblemColorId)) {
                return res.status(400).json({ status: 'fail', message: 'لون غير صالح' });
            }
            update['fanClub.emblemColorId'] = emblemColorId;
        }
        if (giftColorId !== undefined) {
            if (!FAN_CLUB_COLOR_IDS.includes(giftColorId)) {
                return res.status(400).json({ status: 'fail', message: 'لون غير صالح' });
            }
            update['fanClub.giftColorId'] = giftColorId;
        }
        if (Object.keys(update).length === 0) {
            return res.status(400).json({ status: 'fail', message: 'لا يوجد ما يُحدَّث' });
        }

        const updated = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true }).select('fanClub');
        res.status(200).json({
            status: 'success',
            data: {
                clubName: updated.fanClub?.name || null,
                emblemColorId: updated.fanClub?.emblemColorId || 'pink',
                giftColorId: updated.fanClub?.giftColorId || 'pink'
            }
        });
    } catch (error) {
        console.error('[FAN CLUB] updateSettings error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// 🛡️ fanclub-v2: الانضمام يتطلّب الآن متابعة صاحب النادي مسبقاً، ويرفض الحسابات المرتبطة
// بالمالك صراحةً *قبل* أي محاولة دفع (لا تُترك لتفشل لاحقاً بكسب نقاط صفر فقط) — كلا الفحصين
// قبل فتح المعاملة، فلا أثر جانبي لمحاولة مرفوضة إطلاقاً
exports.joinFanClub = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        const memberId = req.user.id;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        if (ownerId === memberId) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكنك الانضمام لناديك الخاص' });
        }

        const alreadyMember = await FanClubMembership.exists({ owner: ownerId, member: memberId });
        if (alreadyMember) {
            const owner = await User.findById(ownerId).select('fanClub.memberCount');
            return res.status(200).json({ status: 'success', data: { alreadyMember: true, memberCount: owner?.fanClub?.memberCount || 0 } });
        }

        const [owner, rose, isFollowing, linked] = await Promise.all([
            User.findById(ownerId).select('username profileImage socketId isBot fanClub'),
            Gift.findOne({ name: 'وردة' }),
            Follow.exists({ follower: memberId, followee: ownerId }),
            linkageService.areLinked(memberId, ownerId)
        ]);
        if (!owner) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        if (owner.isBot) return res.status(403).json({ status: 'fail', message: 'لا يمكن الانضمام لهذا الحساب' });
        if (!isFollowing) return res.status(403).json({ status: 'fail', message: 'يجب متابعة صاحب النادي أولاً' });
        if (linked) return res.status(403).json({ status: 'fail', message: 'لا يمكن الانضمام لهذا النادي' });

        // ✅ دفتر الأستاذ: الانضمام "مثل الهدية حرفياً" — نفس buildGiftWalletEntries الحقيقي
        // (بونص أولاً، تقسيم beans_w/beans_p). linkedFlags:[false] دوماً هنا — الانضمام
        // المرتبط مرفوض فوق قبل أي محاولة دفع، فلا حاجة لإعادة فحص الربط داخل المعاملة.
        // 🛡️ fanclub-v2: سجل GiftLog الآن *داخل* هذي المعاملة نفسها (كان خارجها سابقاً — عطل
        // بين التزام المحفظة وكتابة السجل كان يترك دفعة ناجحة بلا سجل هدية مطابق)، وعدّاد
        // fanClub.memberCount يُزاد هنا أيضاً معاً (activeCount لم يَعُد عدّاداً مخزَّناً — راجع
        // مراجعة #156، يُحسَب حياً من lastPointAt بكل قراءة بدل هذا)
        const { buildGiftWalletEntries } = require('./giftController');
        const session = await mongoose.startSession();
        let updatedMember = null;
        let txError = null;
        try {
            await session.withTransaction(async () => {
                const idemBase = new mongoose.Types.ObjectId();
                const entries = await buildGiftWalletEntries({
                    senderId: memberId, receiverIds: [ownerId], totalCost: JOIN_PRICE, session, idemBase, linkedFlags: [false]
                });
                await walletService.post(entries, session);

                const now = new Date();
                try {
                    // 🛡️ fanclub-v2: الانضمام يتطلّب متابعة سابقة فعلاً (الفحص أعلى الدالة) — إذن
                    // مكافأة المتابعة (مرة واحدة) مُحقَّقة بالفعل لحظة الانضمام نفسها، فتُمنَح هنا
                    // مباشرة (followBonusClaimed:true من الإنشاء) بدل انتظار حدث متابعة لاحق لن
                    // يحدث أبداً بما أن المتابعة سبقت الانضمام دوماً الآن. creditFollowBonus (عبر
                    // followController) يبقى مطلوباً فقط لعضويات قديمة سابقة لهذي المراجعة انضمّت
                    // دون متابعة مسبقة ولم تُحقِّق المكافأة بعد — يتعامل معها لو تابعوا لاحقاً
                    await FanClubMembership.create([{
                        owner: ownerId, member: memberId, points: JOIN_PRICE + FOLLOW_BONUS,
                        followBonusClaimed: true, lastPointAt: now
                    }], { session });
                } catch (dupError) {
                    if (dupError.code === 11000) {
                        throw Object.assign(new Error('عضو بالفعل'), { code: 'ALREADY_MEMBER' });
                    }
                    throw dupError;
                }

                if (rose) {
                    await GiftLog.create([{
                        sender: memberId, receiver: ownerId, gift: rose._id, giftName: rose.name, giftImage: rose.imageUrl,
                        quantity: 1, unitPrice: JOIN_PRICE, totalPrice: JOIN_PRICE, context: 'fanclub_join'
                    }], { session });
                }

                await User.updateOne(
                    { _id: ownerId },
                    { $inc: { 'fanClub.memberCount': 1 } },
                    { session }
                );

                updatedMember = await User.findById(memberId).select('username profileImage coins balance').session(session);
            });
        } catch (e) {
            txError = e;
        } finally {
            await session.endSession();
        }

        if (txError) {
            if (txError.code === 'INSUFFICIENT') {
                return res.status(400).json({ status: 'fail', message: 'رصيد الكوينز غير كافٍ للانضمام' });
            }
            if (txError.code === 'ALREADY_MEMBER') {
                const freshOwner = await User.findById(ownerId).select('fanClub.memberCount');
                return res.status(200).json({ status: 'success', data: { alreadyMember: true, memberCount: freshOwner?.fanClub?.memberCount || 0 } });
            }
            throw txError;
        }

        // ✅ نقاط الانضمام الأسبوعية (أفضل مجهود، خارج المعاملة — نفس تعليل FanClubWeekly
        // بالمواصفة: ليست مالاً، انحراف نادر هنا لا يحتاج معاملة متعددة المستندات)
        try {
            const { weekStart } = getCurrentWeekBounds();
            await FanClubWeekly.addPoints(ownerId, memberId, weekStart, JOIN_PRICE + FOLLOW_BONUS);
        } catch (error) {
            console.error('[FAN CLUB] join weekly points error:', error);
        }

        const memberCount = (owner.fanClub?.memberCount || 0) + 1;
        const io = req.app.get('socketio');
        if (io) {
            io.to(`fanclub:${ownerId}`).emit('fanclub-member-count-updated', { ownerId, memberCount });
            const { broadcastSupportLevelUpdate } = require('./giftController');
            const joinDelta = rose ? JOIN_PRICE : 0;
            broadcastSupportLevelUpdate(io, memberId, 'giving', joinDelta);
            if (owner.socketId) {
                io.to(owner.socketId).emit('fanclub-new-member', {
                    memberId, memberUsername: updatedMember.username, memberProfileImage: updatedMember.profileImage, memberCount
                });
            }
        }

        res.status(201).json({
            status: 'success',
            data: { alreadyMember: false, memberCount, newCoins: updatedMember.coins }
        });
    } catch (error) {
        console.error('[FAN CLUB] joinFanClub error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// 🛡️ fanclub-v2: مغادرة النادي — جديدة بالكامل. تحذف العضوية وكل تقدّمها اليومي/الأسبوعي، وتُنقِص
// عدّاد المالك (memberCount فقط — activeCount ليس عدّاداً مخزَّناً، راجع مراجعة #156) ضمن نفس المعاملة.
// النقاط تُحذَف لا تُحفَظ — إعادة الانضمام تبدأ من الصفر (100 نقطة الانضمام) كعضوية جديدة تماماً.
// تأكيد العميل ("متأكد من المغادرة؟") خارج نطاق هذا الـPR (خادم فقط) — لا خطوة تأكيد هنا، المتصل مسؤول عنها
exports.leaveFanClub = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        const memberId = req.user.id;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }

        const session = await mongoose.startSession();
        let left = false;
        let txError = null;
        try {
            await session.withTransaction(async () => {
                const membership = await FanClubMembership.findOneAndDelete({ owner: ownerId, member: memberId }, { session });
                if (!membership) return; // لم يكن عضواً أصلاً — idempotent، لا خطأ
                left = true;
                await FanClubDailyProgress.deleteMany({ owner: ownerId, member: memberId }, { session });
                await FanClubWeekly.deleteMany({ owner: ownerId, member: memberId }, { session });
                await User.updateOne({ _id: ownerId }, { $inc: { 'fanClub.memberCount': -1 } }, { session });
            });
        } catch (e) {
            txError = e;
        } finally {
            await session.endSession();
        }
        if (txError) throw txError;

        if (left) {
            const io = req.app.get('socketio');
            const owner = await User.findById(ownerId).select('fanClub.memberCount');
            if (io && owner) {
                io.to(`fanclub:${ownerId}`).emit('fanclub-member-count-updated', { ownerId, memberCount: owner.fanClub?.memberCount || 0 });
            }
        }

        res.status(200).json({ status: 'success', data: { left } });
    } catch (error) {
        console.error('[FAN CLUB] leaveFanClub error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ "أعلى المعجبين" — الأعضاء مرتَّبون حسب نقاط المعجب التراكمية الدائمة، الأعلى أولاً + علم
// "غير نشط" لكل عضو (راجع isInactive أعلى الملف)
exports.getMembers = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const skip = Math.max(parseInt(req.query.skip) || 0, 0);

        const memberships = await FanClubMembership.find({ owner: ownerId })
            .populate('member', 'username profileImage customId activeFrameClass')
            .sort({ points: -1 })
            .skip(skip)
            .limit(limit);

        const members = memberships
            .filter(m => m.member)
            .map(m => {
                const levelInfo = computeFanLevelInfo(m.points);
                return {
                    userId: m.member._id,
                    username: m.member.username,
                    profileImage: m.member.profileImage,
                    activeFrameClass: m.member.activeFrameClass,
                    joinedAt: m.createdAt,
                    points: m.points,
                    level: levelInfo.level,
                    tierName: levelInfo.tierName,
                    tierIcon: levelInfo.tierIcon,
                    tierGradient: levelInfo.tierGradient,
                    inactive: isInactive(m.lastPointAt)
                };
            });

        res.status(200).json({ status: 'success', data: { members } });
    } catch (error) {
        console.error('[FAN CLUB] getMembers error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ مهام المعجب — حالة العضو الحالي فقط بهذا النادي. "تسجيل الحضور" يدوي (زر مطالبة صريح)،
// "الدردشة"/"الاستماع" تلقائيتان من مسارات أخرى (هذا المسار للعرض فقط)
exports.getMissions = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        const memberId = req.user.id;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const membership = await FanClubMembership.findOne({ owner: ownerId, member: memberId });
        if (!membership) {
            return res.status(200).json({ status: 'success', data: { isMember: false, missions: [] } });
        }
        const day = getCurrentDayStart();
        const progress = await FanClubDailyProgress.findOne({ owner: ownerId, member: memberId, day });

        res.status(200).json({
            status: 'success',
            data: {
                isMember: true,
                levelInfo: computeFanLevelInfo(membership.points),
                inactive: isInactive(membership.lastPointAt),
                missions: [
                    { id: 'checkin', title: 'تسجيل الحضور اليومي', icon: 'fa-calendar-check', points: DAILY_CHECKIN_BONUS, claimed: !!progress?.checkinAwarded, manual: true, oneTime: false },
                    { id: 'chat', title: `الدردشة في غرفة صاحب النادي (${CHAT_MSGS_REQUIRED} رسائل)`, icon: 'fa-comments', points: CHAT_BONUS, claimed: !!progress?.chatBonusAwarded, progress: progress?.chatMsgCount || 0, target: CHAT_MSGS_REQUIRED, manual: false, oneTime: false },
                    { id: 'listen', title: 'الاستماع ببث صاحب النادي المباشر', icon: 'fa-headphones', pointsPerMinute: LISTEN_POINTS_PER_MIN, progressMinutes: progress?.listenMinutes || 0, targetMinutes: LISTEN_DAILY_CAP_MINUTES, manual: false, oneTime: false },
                    { id: 'follow', title: 'متابعة صاحب النادي', icon: 'fa-heart', points: FOLLOW_BONUS, claimed: !!membership.followBonusClaimed, manual: false, oneTime: true }
                ]
            }
        });
    } catch (error) {
        console.error('[FAN CLUB] getMissions error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

exports.claimCheckIn = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        const memberId = req.user.id;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const membershipExists = await FanClubMembership.exists({ owner: ownerId, member: memberId });
        if (!membershipExists) {
            return res.status(400).json({ status: 'fail', message: 'انضم للنادي أولاً' });
        }
        const day = getCurrentDayStart();
        // ✅ خطوتان ذرّيّتان منفصلتان لنفس سبب creditDailyChat أعلاه بالضبط — لا upsert بشرط مقيِّد
        await FanClubDailyProgress.findOneAndUpdate(
            { owner: ownerId, member: memberId, day },
            { $setOnInsert: { owner: ownerId, member: memberId, day } },
            { upsert: true }
        );
        const claimed = await FanClubDailyProgress.findOneAndUpdate(
            { owner: ownerId, member: memberId, day, checkinAwarded: false },
            { $set: { checkinAwarded: true } },
            { new: true }
        );
        if (!claimed) {
            return res.status(400).json({ status: 'fail', message: 'سجّلت حضورك اليوم بالفعل' });
        }
        const io = req.app.get('socketio');
        const membership = await awardFanClubPoints(io, ownerId, memberId, DAILY_CHECKIN_BONUS, 'checkin');
        res.status(200).json({
            status: 'success',
            data: { levelInfo: computeFanLevelInfo(membership?.points ?? 0), pointsGained: DAILY_CHECKIN_BONUS }
        });
    } catch (error) {
        console.error('[FAN CLUB] claimCheckIn error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ "نجم النادي الأسبوعي" — شارة دائمة لمن حلّ بالمركز الأول بأسبوع ماضٍ مكتمل. من FanClubWeekly
// الآن (كان GiftLog مباشرة بلا أي استبعاد للحسابات المرتبطة بالمالك — بند 2 بالمراجعة)
exports.getWeeklyWins = async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const isOwner = req.user?.id && req.user.id === userId;
        if (!isOwner) {
            const target = await User.findById(userId).select('fanClubBadgesVisible');
            if (target && target.fanClubBadgesVisible === false) {
                return res.status(200).json({ status: 'success', data: { wins: [] } });
            }
        }
        const ownerIds = await FanClubMembership.find({ member: userId }).distinct('owner');
        if (ownerIds.length === 0) {
            return res.status(200).json({ status: 'success', data: { wins: [] } });
        }
        const { weekStart: currentWeekStart } = getCurrentWeekBounds();
        const { weekStart: lastWeekStart } = getWeekBoundsForDate(new Date(currentWeekStart.getTime() - 86400000));
        const rows = await FanClubWeekly.aggregate([
            { $match: { owner: { $in: ownerIds }, weekStart: lastWeekStart } },
            { $sort: { points: -1, member: 1 } },
            { $group: { _id: '$owner', topMember: { $first: '$member' } } }
        ]);
        const winningOwnerIds = rows
            .filter(r => r.topMember.toString() === userId.toString())
            .map(r => r._id);
        if (winningOwnerIds.length === 0) {
            return res.status(200).json({ status: 'success', data: { wins: [] } });
        }
        const owners = await User.find({ _id: { $in: winningOwnerIds } }).select('username profileImage');
        res.status(200).json({
            status: 'success',
            data: {
                wins: owners.map(o => ({ ownerId: o._id, ownerUsername: o.username, ownerProfileImage: o.profileImage }))
            }
        });
    } catch (error) {
        console.error('[FAN CLUB] getWeeklyWins error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// 🛡️ fanclub-v2 (بند 4): كان يُجمِّع كل مستندات FanClubMembership بكل طلب — الآن كاش ذاكرة
// بسيط (لا Redis، نفس تعليل contributorsCache بـvoiceRoomController.js) يُحدَّث كل 10 دقائق
// كحد أقصى، لا بكل طلب. الترتيب الآن: الأعضاء النشطون أولاً، نقاط الأسبوع فاصلاً — لا "اليوم/
// الأسبوع" منفصلين كسابقاً (كانا تقويماً ثالثاً مختلفاً، راجع تعليق أعلى الملف)
const LEADERBOARD_CACHE_TTL_MS = 10 * 60 * 1000;
let leaderboardCache = null; // { rows, expiresAt }

async function computeFullLeaderboard() {
    const { weekStart } = getCurrentWeekBounds();
    // 🛡️ مراجعة #156: activeCount ليس عدّاداً مخزَّناً — يُحسَب هنا حياً لكل مالك بتجميع واحد عبر
    // lastPointAt (الفهرس {owner:1, lastPointAt:-1} بالنموذج يخدم هذا التجميع تحديداً)
    const [weeklyAgg, activeAgg, owners] = await Promise.all([
        FanClubWeekly.aggregate([
            { $match: { weekStart } },
            { $group: { _id: '$owner', weeklyPoints: { $sum: '$points' } } }
        ]),
        FanClubMembership.aggregate([
            { $match: { lastPointAt: { $gte: activeCutoff() } } },
            { $group: { _id: '$owner', activeCount: { $sum: 1 } } }
        ]),
        User.find({ 'fanClub.memberCount': { $gt: 0 } }).select('username profileImage fanClub.memberCount').lean()
    ]);
    const weeklyByOwner = new Map(weeklyAgg.map(r => [r._id.toString(), r.weeklyPoints]));
    const activeByOwner = new Map(activeAgg.map(r => [r._id.toString(), r.activeCount]));
    return owners.map(o => ({
        ownerId: o._id.toString(),
        username: o.username,
        profileImage: o.profileImage,
        activeCount: activeByOwner.get(o._id.toString()) || 0,
        memberCount: o.fanClub?.memberCount || 0,
        weeklyPoints: weeklyByOwner.get(o._id.toString()) || 0
    })).sort((a, b) => (b.activeCount - a.activeCount) || (b.weeklyPoints - a.weeklyPoints));
}

async function getCachedLeaderboardRows() {
    if (leaderboardCache && leaderboardCache.expiresAt > Date.now()) return leaderboardCache.rows;
    const rows = await computeFullLeaderboard();
    leaderboardCache = { rows, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS };
    return rows;
}
// ✅ تصدير للاختبارات فقط — إعادة ضبط الكاش بين حالات اختبار مستقلة
exports._resetLeaderboardCacheForTests = () => { leaderboardCache = null; };

exports.getLeaderboard = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const myId = req.user.id;
        const rows = await getCachedLeaderboardRows();
        const leaders = rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
        const myIndex = rows.findIndex(r => r.ownerId === myId);
        const myRank = myIndex === -1 ? null : { rank: myIndex + 1, ...rows[myIndex], inTop: myIndex < limit };
        res.status(200).json({ status: 'success', data: { leaders, myRank } });
    } catch (error) {
        console.error('[FAN CLUB] getLeaderboard error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};
