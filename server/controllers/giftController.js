const mongoose = require('mongoose');
const Gift = require('../models/Gift');
const GiftLog = require('../models/GiftLog');
const User = require('../models/User');
const PrivateChat = require('../models/PrivateChat');
const PrivateMessage = require('../models/PrivateMessage');
const RoomBattle = require('../models/RoomBattle');
const { addGiftExperience, calculateRequiredXp, REQUIRED_XP_PER_LEVEL, GIFT_XP_SENDER_DIVISOR } = require('../utils/experienceManager');
const VoiceRoom = require('../models/VoiceRoom');
// ✅ نقاط "مستوى المعجب" لكل هدية — منح تراكمي دائم بمعدّل 1:1 مع الكوينز المُنفَقة، ينشئ
// عضوية نادي المعجبين تلقائياً لو لم تكن موجودة (انضمام ضمني بأول هدية حقيقية)
const { awardFanPoints } = require('./fanClubController');
// 🛡️ طلب صريح بمراجعة PR: عداد دعم المقعد (roomSupportTally) يُحدَّث هنا مباشرة الآن —
// داخل مسار الهدية الفعلي بعد الخصم الذري — بدل حدث socket منفصل يثق بقيمة من العميل
// (راجع applyGiftToRoomSupport أدناه وتعليق الحذف بـsocketService.js)
const { addRoomSupportTotal } = require('../utils/roomSupportTally');

// ✅ يُضيف قيمة هدية كنقاط لصف الغرفة التي أُرسلت منها لو كانت طرفاً بمعركة PK نشطة الآن —
// تحديث ذرّي واحد (findOneAndUpdate + $inc/$set) يمنع فقدان نقاط عند إرسال هدايا متزامنة بسرعة.
// 🛡️ مضاعف "القفاز" (battleMultiplier) يُطبَّق هنا فقط على ما يُضاف لـscoreA/scoreB وبطاقة
// الداعم — القيمة الممرَّرة totalPrice نفسها لا تُعدَّل أبداً وتبقى كما هي للمتصل (يستمر بإرسالها
// كاملة وحقيقية إلى applyGiftToRoomSupport/applyGiftToActiveSeatChallenge بنفس الاستدعاء، وإلى
// realSupportA/B هنا أيضاً) — فالمضاعفة مرئية على "الشريط" وتصنيف الداعمين فقط، لا تصل الكوينز
// أو نقاط الدعم الحقيقية أو أي نظام ترتيب خارجي (كدوري PK الأسبوعي) أبداً. sender اختياري: يُستخدم
// لتحديث "أفضل 3 داعمين لهذا التحدي" — هوية الداعم (username/profileImage) تُجمَّد هنا مباشرة في
// نفس التحديث الذرّي (بدل انتظار العميل يراها بمكان آخر) كي تظهر لكل الجمهور فوراً لا للمُرسِل فقط
// ✅ giftUnitsDelta/comboSize لنافذة النتيجة فقط (زينة): giftUnitsDelta = كم قطعة هدية حقيقية
// وصلت بهذا النداء (تراكمي، تُجمع كل مرة)، comboSize = حجم هذا الكومبو بعينه (×999 مثلاً، لا
// يُجمَع بل يُسجَّل الأعلى فقط عبر $max) — راجع RoomBattle.totalGiftUnits/highestCombo
async function applyGiftToActiveBattle(io, roomId, totalPrice, sender, giftUnitsDelta = 1, comboSize = 1) {
    const battle = await RoomBattle.findOne({
        $or: [{ roomA: roomId }, { roomB: roomId }],
        status: 'active'
    });
    if (!battle) return;

    const isRoomA = battle.roomA.toString() === roomId.toString();
    const side = isRoomA ? 'A' : 'B';
    const multiplier = battle.battleMultiplier(side);
    const scoreDelta = totalPrice * multiplier;

    const inc = isRoomA
        ? { scoreA: scoreDelta, realSupportA: totalPrice, totalGiftUnits: giftUnitsDelta }
        : { scoreB: scoreDelta, realSupportB: totalPrice, totalGiftUnits: giftUnitsDelta };
    const update = { $inc: inc, $max: { highestCombo: comboSize } };
    if (sender) {
        const uid = sender._id.toString();
        inc[`supporters${side}.${uid}.points`] = scoreDelta;
        // ✅ 🛡️ نسخة غير مُضخَّمة بالقفاز من مساهمة هذا الداعم بعينه — نفس فلسفة realSupportA/B
        // تماماً لكن لكل داعم على حدة، كي يُحدَّد "أكبر داعم" بدوري PK (pk:result.mvp) بالكوينز
        // الحقيقية التي أرسلها لا بنقاط الشريط المحفَّزة لحظياً (راجع pickMvp بـsocketService.js)
        inc[`supporters${side}.${uid}.realCoins`] = totalPrice;
        update.$set = {
            [`supporters${side}.${uid}.username`]: sender.username,
            [`supporters${side}.${uid}.profileImage`]: sender.profileImage
        };
    }

    const updated = await RoomBattle.findOneAndUpdate(
        { _id: battle._id, status: 'active' },
        update,
        { new: true }
    );
    if (!updated || !io) return;

    // ✅ قلب النتيجة يُكتشَف من الخادم فوراً هنا (لا يُستنتج من العميل أبداً) — نطرح الدلتا التي
    // طبّقناها بالتحديث الذرّي أعلى من الرقم الجديد لنعرف مَن كان متقدّماً *قبل* هذي الهدية
    // بالضبط، بلا أي قراءة إضافية أو حالة بالذاكرة قد تتسابق مع هدية أخرى متزامنة بنفس اللحظة
    const prevScoreA = isRoomA ? updated.scoreA - scoreDelta : updated.scoreA;
    const prevScoreB = isRoomA ? updated.scoreB : updated.scoreB - scoreDelta;
    const prevLeader = prevScoreA === prevScoreB ? null : (prevScoreA > prevScoreB ? 'A' : 'B');
    const newLeader = updated.scoreA === updated.scoreB ? null : (updated.scoreA > updated.scoreB ? 'A' : 'B');
    if (newLeader && prevLeader && newLeader !== prevLeader) {
        emitPkLeadChange(io, updated, newLeader);
    }

    schedulePkScoreEmit(io, updated);
}

// ✅ حالتا الدفعة لكل معركة بذاكرة العملية — تكفي بلا قاعدة بيانات لأن كلتيهما مجرد تحكّم بمعدّل
// البثّ (throttle/rate-limit)، والقيمة الحقيقية (RoomBattle بقاعدة البيانات) محدَّثة ذرّياً بالفعل
// أعلى بصرف النظر عنهما تماماً؛ مرجع معركة منتهية يبقى هنا بأثر تافه حتى إعادة تشغيل الخادم
const pkScoreThrottle = new Map(); // battleId -> { timer, lastEmitAt, latestBattle }
const pkLeadChangeGuard = new Map(); // battleId -> lastEmitAt (ms)

const PK_SCORE_THROTTLE_MS = 300; // ✅ طلب صريح: "كل 300ms كحد أقصى"
const PK_LEAD_CHANGE_MIN_GAP_MS = 3000; // ✅ طلب صريح: "امنع تكرار الانفجار أكثر من مرة كل 3 ثوانٍ"

// ✅ حافة أمامية+خلفية (leading+trailing): أول هدية بعد فترة هدوء تُبثّ فوراً، وأي هدية تالية
// خلال نافذة الـ300ms تُحدِّث فقط "أحدث حالة" دون تمديد المؤقّت، فتُبثّ لحظة انتهاء النافذة
// بأحدث رقم فعلي حتى لو تغيّر عدة مرات أثناءها — لا بثّ منفصل لكل هدية مهما كانت سرعتها
function schedulePkScoreEmit(io, battle) {
    const battleId = battle._id.toString();
    let state = pkScoreThrottle.get(battleId);
    if (!state) {
        state = { timer: null, lastEmitAt: 0, latestBattle: null };
        pkScoreThrottle.set(battleId, state);
    }
    state.latestBattle = battle;
    if (state.timer) return; // ✅ الحافة الخلفية مجدولة بالفعل — ستُبثّ أحدث حالة عند حلولها

    const elapsed = Date.now() - state.lastEmitAt;
    if (elapsed >= PK_SCORE_THROTTLE_MS) {
        state.lastEmitAt = Date.now();
        emitPkScoreNow(io, state.latestBattle);
        return;
    }
    state.timer = setTimeout(() => {
        state.timer = null;
        state.lastEmitAt = Date.now();
        const latest = state.latestBattle;
        if (latest) emitPkScoreNow(io, latest);
    }, PK_SCORE_THROTTLE_MS - elapsed);
}

// ✅ 🛡️ طلب صريح بمراجعة PR: تُستدعى من finalizeActiveBattle (socketService.js) فور إنهاء
// المعركة — تُلغي أي مؤقّت بثّ مؤجَّل (الحافة الخلفية) لم يُطلَق بعد وتحذف مدخل المعركة من
// الخريطة، فلا يبثّ pk:score متأخراً بعد وصول pk:result أصلاً (كان سيُربك العميل: نقاط
// "حيّة" تصل بعد عرض النافذة النهائية). راجع أيضاً فحص الحالة الدفاعي بـemitPkScoreNow أدناه
// (الحماية الثانية المستقلة — تمنع البثّ حتى لو فات أوان هذا الإلغاء لأي سبب)
function clearPkScoreThrottle(battleId) {
    const key = battleId.toString();
    const state = pkScoreThrottle.get(key);
    if (state?.timer) clearTimeout(state.timer);
    pkScoreThrottle.delete(key);
}
exports.clearPkScoreThrottle = clearPkScoreThrottle;

// ✅ حدث قلب النتيجة — مرّة واحدة كحد أقصى كل 3 ثوانٍ لكل معركة (راجع PK_LEAD_CHANGE_MIN_GAP_MS)
// كي لا يتكرّر الانفجار البصري بجنون لو تبادل الصفّان التقدّم عدة مرات بثوانٍ متقاربة. leader
// يُرسَل بمنظور كل غرفة (us/them) بنفس أسلوب pk:score تماماً، لا A/B خام
function emitPkLeadChange(io, battle, newLeaderSide) {
    const battleId = battle._id.toString();
    const now = Date.now();
    const lastEmit = pkLeadChangeGuard.get(battleId) || 0;
    if (now - lastEmit < PK_LEAD_CHANGE_MIN_GAP_MS) return;
    pkLeadChangeGuard.set(battleId, now);

    io.to(`room-chat-${battle.roomA}`).emit('pk:leadChange', { battleId, leader: newLeaderSide === 'A' ? 'us' : 'them' });
    io.to(`room-chat-${battle.roomB}`).emit('pk:leadChange', { battleId, leader: newLeaderSide === 'B' ? 'us' : 'them' });
}

// ✅ يبثّ لقطة النقاط لكل غرفة بحمولتها الخاصة بمنظورها (us/them) — إن كان أحد الصفّين قد رمى
// "ضباباً" فعّالاً الآن، يرى جمهور الغرفة الأخرى رقمه كـnull (محجوب من الخادم نفسه، لا مجرد
// إخفاء بالواجهة فقط) بينما يبقى صفّه هو حقيقياً له؛ راجع RoomBattle.buildAudiencePayload.
// leader لا يُعتَّم عمداً (قرار مصمَّم): يبقى التشويق اللحظي لمن يتقدّم ظاهراً حتى أثناء نافذة
// الضباب، بينما الرقم الحقيقي وحده محجوب — العميل يُجمِّد تقييم الإيموجي أصلاً حين them=null
async function emitPkScoreNow(io, battle) {
    // 🛡️ طلب صريح بمراجعة PR: لا نثق باللقطة المحفوظة بنافذة التحكّم بالمعدّل (قد التُقطت
    // قبل انتهاء المعركة فعلياً، والمؤقّت المؤجَّل يبثّ لاحقاً بعد الانتهاء لو فات أوان
    // clearPkScoreThrottle لأي سبب) — نقرأ الحالة الحقيقية الآن مباشرة قبل أي بثّ؛ معركة
    // لم تعد active (انتهت/أُلغيت) لا تبثّ pk:score إطلاقاً بعد وصول pk:result أصلاً
    const RoomBattle = require('../models/RoomBattle');
    const fresh = await RoomBattle.findById(battle._id);
    if (!fresh || fresh.status !== 'active') return;
    const [payloadA, payloadB] = await Promise.all([
        buildPkScorePayload(fresh, 'A'),
        buildPkScorePayload(fresh, 'B')
    ]);
    io.to(`room-chat-${fresh.roomA}`).emit('pk:score', payloadA);
    io.to(`room-chat-${fresh.roomB}`).emit('pk:score', payloadB);
}

async function buildPkScorePayload(battle, side) {
    const other = side === 'A' ? 'B' : 'A';
    const audience = battle.buildAudiencePayload(side);
    const us = side === 'A' ? audience.scoreA : audience.scoreB;
    const them = side === 'A' ? audience.scoreB : audience.scoreA;
    const [topUs, topThem] = await Promise.all([battle.topSupporters(side, 3), battle.topSupporters(other, 3)]);
    const leader = battle.scoreA === battle.scoreB ? null : (battle.scoreA > battle.scoreB ? 'A' : 'B');
    return {
        battleId: battle._id.toString(),
        roomA: battle.roomA.toString(),
        roomB: battle.roomB.toString(),
        us, them,
        topFans: { us: topUs, them: topThem },
        leader: leader === null ? null : (leader === side ? 'us' : 'them')
    };
}

// ✅ حافة أمامية+خلفية (leading+trailing)، نفس أسلوب schedulePkScoreEmit أدناه بالضبط: أول
// تحديث بعد فترة هدوء يُبثّ فوراً، وأي تحديث تالٍ خلال نافذة الـ500ms يُحدِّث فقط "أحدث حالة"
// بلا تمديد المؤقّت، فتُبثّ لحظة انتهاء النافذة بأحدث لقطة فعلية — طلب صريح بمراجعة PR (بند 1):
// "room-support-points-updated مرة كل 500ms كحد أقصى لكل غرفة" (سيل هدايا 300/10 ثوانٍ)
const roomSupportPointsThrottle = new Map(); // roomId → { timer, lastEmitAt, latestPayload }
const ROOM_SUPPORT_POINTS_THROTTLE_MS = 500;

function emitRoomSupportPointsUpdated(io, roomId, payload) {
    const key = roomId.toString();
    let state = roomSupportPointsThrottle.get(key);
    if (!state) {
        state = { timer: null, lastEmitAt: 0, latestPayload: null };
        roomSupportPointsThrottle.set(key, state);
    }
    state.latestPayload = payload;
    if (state.timer) return; // ✅ الحافة الخلفية مجدولة بالفعل — ستُبثّ أحدث حالة عند حلولها

    const elapsed = Date.now() - state.lastEmitAt;
    if (elapsed >= ROOM_SUPPORT_POINTS_THROTTLE_MS) {
        state.lastEmitAt = Date.now();
        io.to(`room-chat-${key}`).emit('room-support-points-updated', state.latestPayload);
        return;
    }
    state.timer = setTimeout(() => {
        state.timer = null;
        state.lastEmitAt = Date.now();
        io.to(`room-chat-${key}`).emit('room-support-points-updated', state.latestPayload);
    }, ROOM_SUPPORT_POINTS_THROTTLE_MS - elapsed);
}

// ✅ نفس فلسفة emitRoomSupportPointsUpdated أعلاه بالضبط (حافة أمامية+خلفية، 500ms كحد أقصى)
// لكن لعداد الدعم الفردي أسفل كل مقعد (room-support-updated) — طلب صريح بمراجعة PR: كان هذا
// الحدث يُبثّ مع كل هدية بلا أي تجميع (بعكس room-support-points-updated أعلاه المُجمَّع فعلاً)،
// فسيل هدايا سريع لنفس المستلِم يُغرِق المستمعين بعشرات البثّات/ثانية لمجرد تحديث رقم واحد.
// المفتاح `roomId:userId` (لا roomId فقط) لأن كل مستلِم بالغرفة له عدّاده المستقل أسفل مقعده؛
// القيمة المبثوثة هي المجموع التراكمي الحالي دوماً (لا دلتا)، فبثّ "أحدث حالة" فقط عند حلول
// النافذة صحيح بطبيعته بلا فقدان أي تحديث فعلي للرقم المعروض
const roomSupportUpdatedThrottle = new Map(); // "roomId:userId" → { timer, lastEmitAt, latestPayload }
const ROOM_SUPPORT_UPDATED_THROTTLE_MS = 500;

function emitRoomSupportUpdated(io, roomId, userId, value) {
    if (!io) return;
    const roomKey = roomId.toString();
    const key = `${roomKey}:${userId.toString()}`;
    let state = roomSupportUpdatedThrottle.get(key);
    if (!state) {
        state = { timer: null, lastEmitAt: 0, latestPayload: null };
        roomSupportUpdatedThrottle.set(key, state);
    }
    state.latestPayload = { roomId: roomKey, userId: userId.toString(), value };
    if (state.timer) return; // ✅ الحافة الخلفية مجدولة بالفعل — ستُبثّ أحدث حالة عند حلولها

    const elapsed = Date.now() - state.lastEmitAt;
    if (elapsed >= ROOM_SUPPORT_UPDATED_THROTTLE_MS) {
        state.lastEmitAt = Date.now();
        io.to(`room-chat-${roomKey}`).emit('room-support-updated', state.latestPayload);
        return;
    }
    state.timer = setTimeout(() => {
        state.timer = null;
        state.lastEmitAt = Date.now();
        io.to(`room-chat-${roomKey}`).emit('room-support-updated', state.latestPayload);
    }, ROOM_SUPPORT_UPDATED_THROTTLE_MS - elapsed);
}

// ✅ طلب صريح بمراجعة PR (بند 1): "اجمع إعلانات الهدايا لكل غرفة في نافذة 250ms: نفس
// المرسل+الهدية+المستلم تُدمج في حدث واحد بالكمية الكلية" — سيل هدايا (300/10 ثوانٍ من عدة
// مرسلين) كان يُشغِّل appendRoomGiftChatMessage/showRoomGiftSideBanner/showGiftFloatingAnimation
// بالعميل لكل هدية بلا تجميع، فيتجمّد المضيف. المفتاح (مرسل+هدية+مستلم) يُحدَّد لكل غرفة على
// حدة؛ تركيبات مختلفة بنفس الغرفة بنفس النافذة تُبثّ كل واحدة بحدثها المستقل (لا دمج عشوائي
// بين مرسلين/هدايا مختلفة) — فقط التكرار الفعلي لنفس (مرسل، هدية، مستلم) يُجمَع بعدّاد الكمية
const pendingGiftAnnouncements = new Map(); // roomId → Map(mergeKey → { payload, timer })
const GIFT_ANNOUNCE_BATCH_MS = 250;

function queueRoomGiftAnnouncement(io, payload) {
    if (!io || !payload.roomId) return;
    const roomKey = payload.roomId.toString();
    const mergeKey = `${payload.fromUserId}:${payload.giftId}:${payload.toUserId}`;
    let roomMap = pendingGiftAnnouncements.get(roomKey);
    if (!roomMap) {
        roomMap = new Map();
        pendingGiftAnnouncements.set(roomKey, roomMap);
    }
    const existing = roomMap.get(mergeKey);
    if (existing) {
        existing.payload.quantity += payload.quantity; // ✅ نفس المرسل+الهدية+المستلم خلال النافذة — دمج الكمية فقط
        return;
    }
    const entry = { payload: { ...payload } };
    entry.timer = setTimeout(() => {
        roomMap.delete(mergeKey);
        if (roomMap.size === 0) pendingGiftAnnouncements.delete(roomKey);
        io.to(`room-chat-${roomKey}`).emit('room-gift-announcement', entry.payload);
    }, GIFT_ANNOUNCE_BATCH_MS);
    roomMap.set(mergeKey, entry);
}

// ✅ يضيف قيمة أي هدية أُرسلت داخل غرفة (بغض النظر عن وجود معركة PK نشطة أم لا) كـ"نقاط دعم"
// تراكمية دائمة لتلك الغرفة — هذا ما يرفع مستوى الغرفة (1-5) ويفتح مزايا كتوسيع المقاعد.
// انظر VoiceRoom.addSupportPoints/LEVEL_THRESHOLDS للصيغة الكاملة. لا يُوقف إرسال الهدية أبداً
// حتى لو فشل (الغرفة الرسمية مثلاً بلا نظام مستوى — يُرجع null بأمان ويُتجاهل بصمت)
// receiverId اختياري: مُستلِم الهدية الفعلي الجالس على مقعد (غير مُمرَّر لشراء أدوات معركة PK
// مثلاً — لا "مستلِم" حقيقي هناك) — طلب صريح بمراجعة PR (بند 6): عداد الدعم أسفل مقعده
// يُحدَّث هنا فقط، بعد الخصم الذري الحقيقي مباشرة، لا من أي حدث socket يثق بقيمة العميل
async function applyGiftToRoomSupport(io, roomId, totalPrice, sender, receiverId = null) {
    const VoiceRoom = require('../models/VoiceRoom');
    const result = await VoiceRoom.addSupportPoints(roomId, totalPrice);
    if (!result || !io) return;

    // ✅ أعلى 3 داعمين بهذي الجلسة (طلب صريح) — نفس استدعاء الهدية بالضبط، عملية ذرّية
    // منفصلة لا تُوقف تحديث مستوى الغرفة أبداً لو فشلت لأي سبب (fire-and-forget آمن)
    let topSupporters = null;
    if (sender) {
        try {
            topSupporters = await VoiceRoom.addSupporterPoints(roomId, sender, totalPrice);
        } catch (supporterError) {
            console.error('[ROOM SUPPORTERS] Failed to apply supporter points:', supporterError);
        }
    }

    emitRoomSupportPointsUpdated(io, roomId, {
        roomId: roomId.toString(),
        supportPoints: result.supportPoints,
        sessionSupportPoints: result.sessionSupportPoints,
        level: result.level,
        pointsToNextLevel: VoiceRoom.pointsToNextLevel(result.supportPoints, result.level),
        levelProgressPercent: VoiceRoom.levelProgressPercent(result.supportPoints, result.level),
        ...(topSupporters ? { topSupporters } : {})
    });

    // ✅ عداد المقعد الفردي أسفله مُجمَّع الآن أيضاً (500ms، نفس نافذة room-support-points-updated
    // أعلاه) — راجع emitRoomSupportUpdated لتفاصيل سبب التجميع (سيل هدايا سريع لنفس المستلِم)
    if (receiverId) {
        const total = addRoomSupportTotal(roomId.toString(), receiverId.toString(), totalPrice);
        emitRoomSupportUpdated(io, roomId, receiverId, total);
    }

    if (result.leveledUp) {
        io.to(`room-chat-${roomId}`).emit('room-leveled-up', {
            roomId: roomId.toString(),
            newLevel: result.level,
            unlockedSeatCounts: result.unlockedSeatCounts
        });
    }
}

// ✅ يضيف قيمة هدية كنقاط لفريق المستلِم ولنقاطه الشخصية لو كان طرفاً بتحدٍ نشط الآن داخل
// نفس الغرفة (تحدٍ بين أعضاء، وليس معركة PK بين غرفتين — راجع applyGiftToActiveBattle أعلاه
// لتلك). 🛡️ نقاط كل مشارك (participants.$.score) تُحسَب هنا حصراً من الهدايا الحقيقية
// المُرسلة إليه هو بعينه (طلب صريح — بند 10)، ونفس المُرسِل يُسجَّل داعماً لفريق مستلِمه
// (supportersA/B، نفس شكل RoomBattle.supportersA/B بالضبط). مثل بقية خطّافات الهدايا: لا
// يُوقف إرسالها أبداً حتى لو فشل (لا تحدٍ نشط غالباً — يُتجاهل بصمت)
async function applyGiftToActiveSeatChallenge(io, roomId, receiverId, totalPrice, sender) {
    const SeatChallenge = require('../models/SeatChallenge');
    const challenge = await SeatChallenge.findOne({ room: roomId, status: 'active', 'participants.user': receiverId });
    if (!challenge) return;

    const participantIdx = challenge.participants.findIndex(p => p.user.toString() === receiverId.toString());
    if (participantIdx === -1) return;
    const team = challenge.participants[participantIdx].team;
    const isTeamA = team === 'A';

    const inc = {
        [isTeamA ? 'scoreA' : 'scoreB']: totalPrice,
        [`participants.${participantIdx}.score`]: totalPrice
    };
    const update = { $inc: inc };
    if (sender) {
        const uid = sender._id.toString();
        const side = isTeamA ? 'A' : 'B';
        inc[`supporters${side}.${uid}.points`] = totalPrice;
        update.$set = {
            [`supporters${side}.${uid}.username`]: sender.username,
            [`supporters${side}.${uid}.profileImage`]: sender.profileImage
        };
    }

    const updated = await SeatChallenge.findOneAndUpdate(
        { _id: challenge._id, status: 'active' },
        update,
        { new: true }
    );
    if (!updated || !io) return;

    scheduleSeatDuelScoreEmit(io, updated);
}

// ✅ نفس فلسفة pkScoreThrottle/schedulePkScoreEmit أعلى حرفياً (حافة أمامية+خلفية، 300ms
// كحد أقصى) لكن لتحدي المقاعد — يبثّ نقاط كل مشارك + أفضل 3 داعمين لكل فريق معاً دفعة واحدة
const seatDuelScoreThrottle = new Map(); // challengeId -> { timer, lastEmitAt, latest }
function scheduleSeatDuelScoreEmit(io, challenge) {
    const challengeId = challenge._id.toString();
    let state = seatDuelScoreThrottle.get(challengeId);
    if (!state) {
        state = { timer: null, lastEmitAt: 0, latest: null };
        seatDuelScoreThrottle.set(challengeId, state);
    }
    state.latest = challenge;
    if (state.timer) return;

    const elapsed = Date.now() - state.lastEmitAt;
    if (elapsed >= PK_SCORE_THROTTLE_MS) {
        state.lastEmitAt = Date.now();
        emitSeatDuelScoreNow(io, state.latest);
        return;
    }
    state.timer = setTimeout(() => {
        state.timer = null;
        state.lastEmitAt = Date.now();
        const latest = state.latest;
        if (latest) emitSeatDuelScoreNow(io, latest);
    }, PK_SCORE_THROTTLE_MS - elapsed);
}

// ✅ 🛡️ طلب صريح بمراجعة PR: تُستدعى من finalizeActiveSeatChallenge (socketService.js) فور
// إنهاء التحدي — تُلغي أي مؤقّت بثّ مؤجَّل (الحافة الخلفية) لم يُطلَق بعد وتحذف مدخل التحدي
// من الخريطة، فلا يبثّ seat-duel:score متأخراً بعد وصول النتيجة النهائية أصلاً. راجع أيضاً
// فحص الحالة الدفاعي بـemitSeatDuelScoreNow أدناه (الحماية الثانية المستقلة)
function clearSeatDuelScoreThrottle(challengeId) {
    const key = challengeId.toString();
    const state = seatDuelScoreThrottle.get(key);
    if (state?.timer) clearTimeout(state.timer);
    seatDuelScoreThrottle.delete(key);
}
exports.clearSeatDuelScoreThrottle = clearSeatDuelScoreThrottle;

async function emitSeatDuelScoreNow(io, challenge) {
    // 🛡️ طلب صريح بمراجعة PR: لا نثق باللقطة المحفوظة (قد التُقطت قبل انتهاء التحدي فعلياً،
    // والمؤقّت المؤجَّل يبثّ لاحقاً بعد الانتهاء لو فات أوان clearSeatDuelScoreThrottle لأي
    // سبب) — نقرأ الحالة الحقيقية الآن مباشرة قبل أي بثّ؛ تحدٍ لم يعد active لا يبثّ
    // seat-duel:score إطلاقاً بعد إعلان النتيجة أصلاً
    const SeatChallenge = require('../models/SeatChallenge');
    const fresh = await SeatChallenge.findById(challenge._id);
    if (!fresh || fresh.status !== 'active') return;
    const [topA, topB] = await Promise.all([fresh.topSupporters('A', 3), fresh.topSupporters('B', 3)]);
    io.to(`room-chat-${fresh.room}`).emit('seat-duel:score', {
        challengeId: fresh._id.toString(),
        scoreA: fresh.scoreA,
        scoreB: fresh.scoreB,
        participants: fresh.participants.map(p => ({ userId: p.user.toString(), score: p.score })),
        topFans: { A: topA, B: topB }
    });
}

// ✅ يبثّ تحديث "مستوى الثروة" (سابقاً "مستوى الدعم") لحظياً لأي واجهة مفتوحة حالياً لهذا
// المستخدم — بث عام خفيف الحمل (نفس نمط follow-changed) بدل نظام اشتراك مخصّص لكل شخص؛ لا
// يُنتظَر (fire-and-forget) كي لا يبطئ استجابة إرسال الهدية نفسها، ولا يُفشلها أبداً لو حدث
// خطأ هنا. 🗑️ طلب صريح: آلية "مستوى التلقي" (receiving) أُزيلت بالكامل — هذه الدالة تُستدعى
// الآن فقط للمُرسِل (kind='giving')، لا للمستقبِل
async function broadcastSupportLevelUpdate(io, userId, kind, delta) {
    if (!io || !userId || kind !== 'giving') return;
    try {
        const { computeSupportLevels } = require('./userController');
        const { computeSupportLevelInfo } = require('../utils/supportLevels');
        const { giving } = await computeSupportLevels(userId);
        io.emit('support-level-updated', { userId: userId.toString(), giving });

        if (delta > 0) {
            const beforeInfo = computeSupportLevelInfo(Math.max(0, giving.points - delta));
            if (giving.level > beforeInfo.level) {
                const user = await User.findById(userId).select('socketId');
                if (user?.socketId) {
                    io.to(user.socketId).emit('support-level-up', {
                        kind,
                        newLevel: giving.level,
                        tierName: giving.tierName,
                        tierIcon: giving.tierIcon,
                        tierGradient: giving.tierGradient
                    });
                }
            }
        }
    } catch (error) {
        console.error('[SUPPORT LEVEL] Failed to broadcast update:', error);
    }
}
exports.broadcastSupportLevelUpdate = broadcastSupportLevelUpdate;

// ✅ حماية بسيطة من إرسال الهدايا بمعدل غير طبيعي (استدعاء الـ API مباشرة بمعزل عن الواجهة)
// ملاحظة: هذا حل مناسب لخادم واحد (single instance). عند التوسع لعدة خوادم لاحقاً يفضل نقل هذا لـ Redis
const giftRateMap = new Map(); // userId -> [timestamps]
const GIFT_RATE_WINDOW_MS = 2000;
// ✅ رُفعت من 12 إلى 20: أقصى تسارع طبيعي من واجهة الإرسال السريع (ضغط مستمر) يصل تقريباً
// لـ14 نداء/ثانيتين عند أعلى سرعة — رقم أقل من ذلك كان يعطّل استخدامات شرعية عادية بلا داعٍ
const GIFT_RATE_MAX_REQUESTS = 20;

function isGiftRateLimited(userId) {
    const now = Date.now();
    const key = userId.toString();
    const timestamps = (giftRateMap.get(key) || []).filter(t => now - t < GIFT_RATE_WINDOW_MS);
    timestamps.push(now);
    giftRateMap.set(key, timestamps);
    return timestamps.length > GIFT_RATE_MAX_REQUESTS;
}

setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of giftRateMap.entries()) {
        const filtered = timestamps.filter(t => now - t < GIFT_RATE_WINDOW_MS);
        if (filtered.length === 0) giftRateMap.delete(key);
        else giftRateMap.set(key, filtered);
    }
}, 30 * 1000);

// ✅ طلب صريح (هدايا v2): ترتيب الفئات الثابت بالواجهة — شائعة←مميزة←ملحمية←أسطورية←مخصّصة.
// فئة مستقبلية غير معروفة (لن تحدث فعلياً طالما enum النموذج محدود بهذي الخمسة) تسقط بأمان
// بصندوق "شائعة" بدل أن تختفي بصمت من الرد بالكامل
const GIFT_CATEGORY_ORDER = ['common', 'rare', 'epic', 'legendary', 'custom'];

// جلب متجر الهدايا — طلب صريح (هدايا v2): الآن مُجمَّعة حسب الفئة (كل مجموعة بترتيب sortOrder
// نفسه)، مع me (رصيد المستخدم الحالي + مستوى/خبرة الثروة) وrules (كل القيم الثابتة التي يحتاجها
// العميل ليحسب معاينة شريط الثروة بنفسه — بلا أي رقم مكتوب يدوياً بالواجهة). مصدر حقيقة واحد:
// GIFT_XP_SENDER_DIVISOR/REQUIRED_XP_PER_LEVEL من experienceManager، ALLOWED_COMBO_QTY أدناه
// 🛡️ إصلاح جذري (الموثوقية والسرعة — السبب الجذري هـ): الكتالوج (أسماء/صور/أسعار/فئات
// الهدايا + rules الإدارية) شبه ثابت فعلياً — لا يتغيّر إلا بتدخّل إداري نادر جداً، بعكس me
// (الرصيد/الخبرة/هدايا المستخدم المخصّصة) الذي يجب أن يبقى حيّاً دوماً. يُحسَب الكتالوج أولاً
// وحده (بلا انتظار me/customGifts الخاصين بالمستخدم) فيمكن حساب بصمته (ETag) ومقارنتها بـ
// If-None-Match قبل أي استعلام آخر إطلاقاً — تطابق تام = 304 فوري بلا حتى استعلام me/customGifts
// (العميل أصلاً لا يحتاج تحديثهما من هنا تحديداً — يصلانه حيّين عبر أحداث socket منفصلة بالفعل:
// coinsUpdated/experienceUpdate/customGiftStatusUpdated، راجع مستمعاتها بالعميل)
exports.getGiftShop = async (req, res) => {
    try {
        const CustomGift = require('../models/CustomGift');
        const SystemSettings = require('../models/SystemSettings');
        const crypto = require('crypto');

        const [gifts, settings] = await Promise.all([
            Gift.find({ isActive: true }).sort('sortOrder price'),
            SystemSettings.getSettings()
        ]);

        const grouped = {};
        for (const cat of GIFT_CATEGORY_ORDER) grouped[cat] = [];
        for (const g of gifts) {
            const cat = Object.prototype.hasOwnProperty.call(grouped, g.category) ? g.category : 'common';
            grouped[cat].push({
                id: g._id,
                name: g.name,
                description: g.description,
                imageUrl: g.imageUrl,
                price: g.price,
                discount: g.discount,
                discountedPrice: g.discountedPrice,
                category: g.category,
                animation: g.animation,
                // ✅ طلب صريح: احتياط صريح هنا بدل الاعتماد على افتراضي Mongoose الضمني وقت
                // القراءة (قد يُفلت لو استُخدمت .lean() بأي تعديل مستقبلي — راجع تعليق الهجرة
                // بـautoSeed.js)
                animationUrl: g.animationUrl || null,
                isFullscreen: typeof g.isFullscreen === 'boolean' ? g.isFullscreen : (g.category === 'legendary'),
                sortOrder: g.sortOrder
            });
        }
        // ✅ طلب صريح بالحرف: "The client must compute the wealth-bar preview ONLY from
        // these server values" — لا رقم ثابت مكتوب بالعميل، كل شيء من هنا
        const rules = {
            senderXpDivisor: GIFT_XP_SENDER_DIVISOR,
            requiredXpPerLevel: REQUIRED_XP_PER_LEVEL,
            quantities: [...COMBO_QUANTITIES],
            comboWindowMs: COMBO_WINDOW_MS,
            flushMs: GIFT_ANNOUNCE_BATCH_MS,
            // ✅ طلب صريح: "values from the server" لمودال "صمّم هديتك" — لا رقم ثابت بالعميل
            customGiftDesignFee: settings.customGiftDesignFeeCoins,
            customGiftSendPrice: settings.customGiftSendPriceCoins
        };

        const catalogEtag = '"' + crypto.createHash('sha1').update(JSON.stringify({ gifts: grouped, rules })).digest('hex') + '"';
        res.set('Cache-Control', 'private, max-age=0, must-revalidate');
        res.set('ETag', catalogEtag);
        if (req.headers['if-none-match'] === catalogEtag) {
            return res.status(304).end();
        }

        const [me, myCustomGifts] = await Promise.all([
            User.findById(req.user.id).select('coins level experience'),
            // ✅ طلب صريح (هدايا v2 — المرحلة 4): هداياي المخصّصة فقط (قيد المراجعة/مقبولة —
            // المرفوضة استُرد رسمها بالفعل ولا تظهر بتبويب "مخصصة" بعد الآن)، لا هدايا أي مستخدم آخر
            CustomGift.find({ owner: req.user.id, status: { $in: ['pending', 'approved'] } }).sort('-createdAt')
        ]);

        const wealthLevel = me ? me.level : 1;
        res.status(200).json({
            status: 'success',
            data: {
                gifts: grouped,
                me: {
                    balance: me ? me.coins : 0,
                    wealthLevel,
                    wealthXp: me ? me.experience : 0,
                    requiredXp: calculateRequiredXp(wealthLevel),
                    // ✅ طلب صريح (هدايا v2 — المرحلة 4): هدايا المستخدم المخصّصة الخاصة به فقط —
                    // التبويب الجديد بشيت الهدايا يعرضها مباشرة بلا نداء شبكة إضافي منفصل
                    customGifts: myCustomGifts.map(cg => ({
                        id: cg._id, name: cg.name, imageUrl: cg.imageUrl, status: cg.status,
                        createCost: cg.createCost, sendPrice: cg.sendPrice
                    }))
                },
                rules
            }
        });
    } catch (error) {
        console.error('[ERROR] in getGiftShop:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// إرسال هدية لمستخدم آخر
exports.sendGift = async (req, res) => {
    try {
        const senderId = req.user.id;
        const { receiverId, giftId, quantity = 1, context = 'private_chat', roomId } = req.body;

        if (isGiftRateLimited(senderId)) {
            return res.status(429).json({ status: 'fail', message: 'أنت ترسل الهدايا بسرعة كبيرة جداً، انتظر لحظة' });
        }

        if (senderId === receiverId) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكنك إرسال هدية لنفسك' });
        }

        const qty = Math.max(1, Math.min(parseInt(quantity) || 1, 50));

        const [sender, receiver, gift] = await Promise.all([
            User.findById(senderId),
            User.findById(receiverId).select('username profileImage socketId coins level blockedUsers isBot'),
            Gift.findById(giftId)
        ]);

        // 🛡️ sender نادراً ما يكون null (حساب حُذف بلحظة بين إصدار التوكن وهذا الطلب مثلاً)،
        // لكن بدون هذا التحقق كانت القراءات اللاحقة (sender.username...) ترمي خطأ غير
        // متوقع — كانت أحد الأسباب المحتملة لتعطّل الخادم بالكامل (راجع unhandledRejection بـ server.js)
        if (!sender) {
            return res.status(401).json({ status: 'fail', message: 'يرجى تسجيل الدخول من جديد' });
        }
        if (!receiver) {
            return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        }
        if (receiver.isBot) {
            return res.status(403).json({ status: 'fail', message: 'لا يمكنك إرسال هدية لهذا الحساب' });
        }
        if (!gift || !gift.isActive) {
            return res.status(404).json({ status: 'fail', message: 'الهدية غير متوفرة حالياً' });
        }

        const senderBlocked = sender.blockedUsers.map(id => id.toString());
        const receiverBlocked = (receiver.blockedUsers || []).map(id => id.toString());
        if (senderBlocked.includes(receiverId) || receiverBlocked.includes(senderId)) {
            return res.status(403).json({ status: 'fail', message: 'لا يمكنك إرسال هدية لهذا المستخدم' });
        }

        const unitPrice = gift.discountedPrice || gift.price;
        const totalPrice = unitPrice * qty;

        // 🛡️ إصلاح جذري (مراجعة أمنية — redteam-audit-1، البند المعروف #1): الخصم وGiftLog
        // (سجلّ قيمة المُستلِم الحقيقية القابلة للاستبدال نقداً عبر giftRedemptionController)
        // كانا عمليتين منفصلتين تماماً بلا معاملة تجمعهما — انهيار/إعادة تشغيل السيرفر بين
        // الخصم ونجاح GiftLog.create كان يُخصِم المُرسِل فعلياً بلا أي سجلّ مقابل للمستلِم، بلا
        // تعافٍ ممكن (نفس فئة الثغرة المُصلَحة بمسار gift:combo — راجع buildGiftLogEntries).
        // نفس العلاج هنا: معاملة Mongo واحدة تحوي الخصم الذرّي + إنشاء GiftLog معاً فقط —
        // بقية الآثار (PK/دعم/تحدي/دردشة/خبرة/نادي معجبين) تبقى بعدها best-effort كما كانت
        const cleanRoomId = (roomId && mongoose.Types.ObjectId.isValid(roomId)) ? roomId : null;
        const session = await mongoose.startSession();
        let updatedSender;
        let giftLog;
        try {
            await session.withTransaction(async () => {
                updatedSender = await User.findOneAndUpdate(
                    { _id: senderId, coins: { $gte: totalPrice } },
                    { $inc: { coins: -totalPrice } },
                    { new: true, session }
                );
                if (!updatedSender) {
                    throw Object.assign(new Error('رصيد الكوينز غير كافٍ لإرسال هذه الهدية'), { code: 'INSUFFICIENT' });
                }
                const created = await GiftLog.create([{
                    sender: senderId,
                    receiver: receiverId,
                    gift: gift._id,
                    giftName: gift.name,
                    giftImage: gift.imageUrl,
                    quantity: qty,
                    unitPrice: unitPrice,
                    totalPrice: totalPrice,
                    context: context,
                    room: cleanRoomId
                }], { session });
                giftLog = created[0];
            });
        } catch (txError) {
            if (txError.code === 'INSUFFICIENT') {
                return res.status(400).json({ status: 'fail', message: txError.message });
            }
            throw txError;
        } finally {
            await session.endSession();
        }
        sender.coins = updatedSender.coins;

        // ✅ لو الهدية أُرسلت من داخل غرفة بها معركة PK نشطة الآن، تُضاف قيمتها لنقاط صفّها فوراً
        if (cleanRoomId) {
            const ioForRoom = req.app.get('socketio');
            try {
                await applyGiftToActiveBattle(ioForRoom, cleanRoomId, totalPrice, sender, qty, qty);
            } catch (battleError) {
                console.error('[PK BATTLE] Failed to apply gift score:', battleError);
            }
            try {
                await applyGiftToRoomSupport(ioForRoom, cleanRoomId, totalPrice, sender, receiverId);
            } catch (supportError) {
                console.error('[ROOM LEVEL] Failed to apply support points:', supportError);
            }
            try {
                await applyGiftToActiveSeatChallenge(ioForRoom, cleanRoomId, receiverId, totalPrice, sender);
            } catch (challengeError) {
                console.error('[SEAT CHALLENGE] Failed to apply gift score:', challengeError);
            }
        }

        const io = req.app.get('socketio');
        const safeGiftImage = gift.imageUrl || '';

        const giftEventPayload = {
            giftId: gift._id,
            giftName: gift.name,
            giftImage: safeGiftImage,
            quantity: qty,
            fromUserId: senderId,
            fromUsername: sender.username,
            fromProfileImage: sender.profileImage,
            animation: gift.animation,
            context: context, // ✅ جديد: يميّز الواجهة بين هدية خاصة وهدية عامة
            timestamp: new Date().toISOString()
        };

        // ✅ الإصلاح الجوهري: ننشئ رسالة حقيقية بالمحادثة الخاصة (تُحفظ بقاعدة البيانات وتصل فوراً للطرف الآخر)
        // — لكن ليس لهدايا الغرفة: هذي تظهر كإعلان داخل دردشة الغرفة نفسها (فقاعة ذهبية)، لا كرسالة
        // خاصة ولا فقاعة إشعار عائمة فوق الغرفة (كان هذا هو السلوك المزعج سابقاً)
        let savedMessage = null;
        let unreadCountForReceiver = 0;

        if (context === 'private_chat' && !cleanRoomId) {
            const participants = [senderId.toString(), receiverId.toString()].sort();
            const chatId = participants.join('_');

            // 🐛 إصلاح تسابق نظري: find-then-create غير ذرّي — لو نُفِّذ نداءان لنفس المحادثة
            // بالتوازي (ممكن الآن بما أن دفعات الكومبو لا تُسلسَل تطبيقياً بعد الآن، راجع
            // processGiftCombo)، كلاهما يجد null فيحاولان الإنشاء معاً فيصطدم أحدهما بفهرس
            // unique على chatId. upsert ذرّي على مستوى القاعدة يغلق هذا تماماً بغض النظر عن التزامن
            const chat = await PrivateChat.findOneAndUpdate(
                { chatId },
                {
                    $setOnInsert: {
                        chatId,
                        participants,
                        participantData: [
                            { userId: senderId, username: sender.username, profileImage: sender.profileImage },
                            { userId: receiverId, username: receiver.username, profileImage: receiver.profileImage }
                        ]
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            const newMessage = await PrivateMessage.create({
                chatId,
                sender: senderId,
                receiver: receiverId,
                type: 'gift',
                content: `${gift.name}${qty > 1 ? ' × ' + qty : ''}`,
                metadata: {
                    giftId: gift._id,
                    giftImage: safeGiftImage,
                    giftPrice: totalPrice,
                    giftQuantity: qty
                }
            });

            chat.lastMessage = `🎁 هدية ${gift.name}`;
            chat.lastMessageAt = new Date();
            chat.lastMessageBy = senderId;
            chat.messageCount += 1;
            const currentUnread = chat.unreadCount.get(receiverId.toString()) || 0;
            chat.unreadCount.set(receiverId.toString(), currentUnread + 1);
            chat.hiddenBy = chat.hiddenBy.filter(id =>
                id.toString() !== senderId.toString() && id.toString() !== receiverId.toString()
            );
            await chat.save();

            savedMessage = await PrivateMessage.findById(newMessage._id)
                .populate('sender', 'username profileImage')
                .lean();

            unreadCountForReceiver = chat.unreadCount.get(receiverId.toString()) || 0;

            if (receiver.socketId && io) {
                io.to(receiver.socketId).emit('privateMessageReceived', {
                    message: savedMessage,
                    chatId: chat.chatId,
                    senderId: senderId,
                    senderName: sender.username
                });
            }
        }

        // ✅ إعلان الهدية داخل دردشة الغرفة نفسها (فقاعة ذهبية) — بديل الرسالة الخاصة/الإشعار
        // العائم السابقين، بنفس أسلوب "فلان أرسل هدية لفلان" بالتطبيقات المشهورة
        if (cleanRoomId && io) {
            queueRoomGiftAnnouncement(io, {
                roomId: cleanRoomId,
                fromUserId: senderId,
                fromUsername: sender.username,
                fromProfileImage: sender.profileImage,
                toUserId: receiverId,
                toUsername: receiver.username,
                giftId: gift._id.toString(),
                giftName: gift.name,
                giftImage: safeGiftImage,
                giftIcon: gift.icon || '🎁',
                quantity: qty
            });
        }

        if (sender.socketId && io) {
            io.to(sender.socketId).emit('balanceUpdate', { newBalance: sender.balance, newCoins: sender.coins });
        }

        if (receiver.socketId && io) {
            io.to(receiver.socketId).emit('giftReceived', giftEventPayload);
        }
        if (sender.socketId && io) {
            io.to(sender.socketId).emit('giftSentConfirmation', giftEventPayload);
        }

                // 🐛 إصلاح أداء: كانا يُنتظران بالتتابع (await فقرة فقرة) — كل واحد يقرأ ويحفظ مستند
        // مستخدم كامل بشكل منفصل، فيتضاعف زمن استجابة إرسال الهدية بلا فائدة بما أنهما يعدّلان
        // مستخدمين مختلفين تماماً (لا تعارض بينهما). تشغيلهما معاً يقلّص هذا الجزء من التأخير
        // إلى النصف تقريباً — وهو أحد أسباب "تعليق زر الإرسال لحظة" بالإعجاب السريع بالواجهة
        await Promise.all([
            addGiftExperience(io, senderId, totalPrice, 'sender'),
            addGiftExperience(io, receiverId, totalPrice, 'receiver')
        ]);
        // ✅ لا يُنتظَر (fire-and-forget) — تحديث الشارات لا يجب أن يؤخّر استجابة إرسال الهدية
        broadcastSupportLevelUpdate(io, senderId, 'giving', totalPrice);
        awardFanPoints(io, receiverId, senderId, totalPrice);

        res.status(201).json({
            status: 'success',
            message: `تم إرسال هدية ${gift.name} بنجاح`,
            data: {
                giftLog,
                newSenderCoins: sender.coins,
                message: savedMessage,
                unreadCount: unreadCountForReceiver
            }
        });

    } catch (error) {
        console.error('[ERROR] in sendGift:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء إرسال الهدية' });
    }
};

// =====================================================
// ✅ قيم الكمية الوحيدة المسموحة بمحرّك الكومبو — طلب صريح (هدايا v2): ×1/×10/×66/×99/×188/
// ×520/×1314 (تطابق rules.quantities بواجهة المتجر وshop prototype حرفياً؛ كانت ×1/×6/×66/
// ×166/×999 بالإصدار السابق). 🐛 إصلاح قديم لا يزال سارياً: قيمة غير ضمن هذي القائمة تُرفَض
// صراحة برمز BAD_QTY بدل تشذيبها لحدّ أقصى صامت (كان يُسلِّم عداً أقل وبسعر أقل مما يراه العميل)
// ✅ القائمة المُعلَنة فقط بـrules.quantities — العميل الجديد (شيت الهدايا v2) لا يرى أو
// يستخدم إطلاقاً القيم القديمة أدناه
const COMBO_QUANTITIES = [1, 10, 66, 99, 188, 520, 1314];
// 🛡️ طلب صريح بمراجعة PR #106: توافق خلفي مؤقت — عملاء لا يزالون يشغّلون نسخة الواجهة
// المخبّأة (Service Worker/CDN/متصفح) قبل نشر هدايا v2 قد يرسلون كمياتها القديمة
// ×6/×166/×999 حتى يُحدَّثوا فعلياً لاحقاً. القبول هنا فقط — لا تظهر هذي القيم بـrules.quantities
// إطلاقاً (القائمة المُعلَنة أعلاه هي الجديدة فقط)، فالعميل الجديد لا يرسلها أصلاً، وأي عميل
// قديم متبقٍ يستمر بالعمل بصمت حتى يُحدَّث
// TODO(gifts-v2): حذف 6/166/999 من هذي القائمة بعد أسبوع كامل من نشر هدايا v2 فعلياً —
// لن يبقى عميل قديم متصل بعد هذي المهلة
const ALLOWED_COMBO_QTY = new Set([...COMBO_QUANTITIES, 6, 166, 999]);
exports.ALLOWED_COMBO_QTY = ALLOWED_COMBO_QTY;

// ✅ طلب صريح (هدايا v2): مهلة انتهاء جلسة الكومبو بعد آخر ضغطة — رقم إعلاني فقط بواجهة
// rules.comboWindowMs (العميل هو من يُطبِّقها فعلياً بعدّاد دائرة الكومبو)، لا إنفاذ خادمي
// مباشر لها حالياً — راجع أيضاً GIFT_ANNOUNCE_BATCH_MS أعلى الملف (rules.flushMs: نفس
// القيمة 250ms بالتصميم، يُعاد استخدام الثابت نفسه بدل تكرار الرقم بمكانين قد ينحرفان)
const COMBO_WINDOW_MS = 3000;

// 🛡️ طلب صريح بمراجعة PR #106: مستلمو الهدية داخل غرفة لا يقتصرون على الجالسين على مقعد —
// مستمع (لم يجلس بعد) متصل حالياً بقناة دردشة الغرفة (room-chat-<roomId>، نفس العضوية التي
// يعتمد عليها getRoomViewers/broadcastRoomViewerCount بـsocketService.js) صالح أيضاً كمستلم.
// للقراءة فقط — io.sockets.adapter.rooms محلي بهذي العملية (لا Redis adapter هنا)، فمزامن
// بالكامل بلا حاجة لـfetchSockets غير المتزامنة
function getConnectedRoomUserIds(io, roomId) {
    const ids = new Set();
    if (!io) return ids;
    const socketIds = io.sockets.adapter.rooms.get(`room-chat-${roomId}`);
    if (!socketIds) return ids;
    for (const socketId of socketIds) {
        const s = io.sockets.sockets.get(socketId);
        if (s?.user?.id) ids.add(s.user.id.toString());
    }
    return ids;
}

// 🛡️ إصلاح جذري (الموثوقية والسرعة — السبب الجذري أ): كانت كل هذي القراءات/التحقّقات (الغرفة،
// المستلمون، المُرسِل، الهدية، المستلمون الصالحون) + سجلّ الهدايا تُنفَّذ كلها داخل نفس معاملة
// Mongo التي تحمل الخصم الذري — فتطول مدة المعاملة الفعلية كثيراً، وأي دفعتين متزامنتين لنفس
// المُرسِل (كانتا ممكنتين فعلياً قبل هذا الإصلاح — راجع تعليق createComboSender بالعميل)
// تتضاربان على القراءة قبل الكتابة فتتسبّبان بإعادة محاولات Mongo (write conflict retries)
// تتجاوز أحياناً مهلة الـ6 ثوانٍ بالعميل. الآن: كل هذا التحضير (prepareGiftComboSend) قراءات
// بحتة بلا أي معاملة إطلاقاً — تُنفَّذ قبل بدء أي معاملة، ونتيجتها (التكلفة الإجمالية فقط)
// تُمرَّر لاحقاً لعملية الخصم الذرّية الوحيدة الحرجة مالياً (applyGiftComboDeduct). سجلّ الهدايا
// (GiftLog) لم يعد جزءاً من أي معاملة أيضاً — انتقل لـrunGiftComboSideEffects كأثر جانبي
// best-effort (راجع تعليقها) — فمعاملة مسار gift:combo الآن لا تحمل إطلاقاً أي شيء عدا حجز
// GiftComboTx + الخصم الذرّي نفسه (راجع settleGiftComboClaim بـsocketService.js الجديد)
// 🛡️ طلب صريح بمراجعة PR #106: io مطلوب (للقراءة فقط — فحص عضوية قناة الغرفة الحيّة)
// ✅ audience اختياري ('all'|'selected') — فقط لمسار البث العام (الدردشة العامة، بلا roomId):
// 'all' يُحِل المستلمين من عضوية قناة 'public-room' الحيّة بالسيرفر نفسه (لا يُوثَق بأي قائمة
// من العميل، تماماً كمسار REST القديم sendPublicGift)، 'selected'/افتراضي يستخدم recipientIds
// من العميل بحدّ 20 (نفس حدّ sendPublicGift). بلا audience: السلوك الأصلي (غرفة صوت أو دردشة
// خاصة مباشرة) بلا أي تغيير
async function prepareGiftComboSend({ senderId, giftId, quantity, taps = 1, recipientIds, roomId, audience, io }) {
    const qty = Number(quantity);
    if (!ALLOWED_COMBO_QTY.has(qty)) {
        throw Object.assign(new Error('كمية غير صالحة'), { code: 'BAD_QTY' });
    }
    const tapCount = Math.max(1, Math.min(parseInt(taps) || 1, 60));

    let seatFilteredRecipientIds;
    let cleanRoomId = null;

    if (audience) {
        // ✅ مسار البث العام (دردشة عامة، بلا غرفة صوت) — نفس منطق/حماية sendPublicGift تماماً
        if (audience === 'all') {
            const ids = [];
            const room = io ? io.sockets.adapter.rooms.get('public-room') : null;
            if (room) {
                for (const socketId of room) {
                    const s = io.sockets.sockets.get(socketId);
                    if (s?.user?.id && s.user.id.toString() !== senderId.toString()) ids.push(s.user.id.toString());
                }
            }
            seatFilteredRecipientIds = [...new Set(ids)];
        } else {
            seatFilteredRecipientIds = Array.isArray(recipientIds)
                ? [...new Set(recipientIds.map(String))].filter(id => id !== senderId.toString()).slice(0, 20)
                : [];
        }
        if (seatFilteredRecipientIds.length === 0) {
            throw Object.assign(new Error('لا يوجد مستلمون متاحون حالياً'), { code: 'NO_RECIPIENTS' });
        }
    } else {
        // 🛡️ طلب صريح (هدايا v2): roomId مُرسَل يجب أن يحل لغرفة نشطة حقيقية فعلاً — بخلاف
        // السابق (أي ObjectId غير صالح كان يُعامَل بصمت كـ"بلا غرفة")، رفض صريح NO_ROOM الآن.
        // يمنع عميلاً مُعدَّلاً من إرسال roomId وهمي لتفادي فحص "المقعد الحقيقي" أدناه بالكامل
        let room = null;
        cleanRoomId = (roomId && mongoose.Types.ObjectId.isValid(roomId)) ? roomId : null;
        if (roomId && !cleanRoomId) {
            throw Object.assign(new Error('معرّف غرفة غير صالح'), { code: 'NO_ROOM' });
        }
        if (cleanRoomId) {
            room = await VoiceRoom.findOne({ _id: cleanRoomId, status: 'active' }).select('seats.user');
            if (!room) {
                throw Object.assign(new Error('الغرفة غير موجودة أو أُغلقت'), { code: 'NO_ROOM' });
            }
        }

        // 🛡️ طلب صريح: recipientIds تُقبَل فقط لمن هو فعلياً بهذي الغرفة تحديداً الآن (لا أي معرّف
        // مستخدم اعتباطي كالسابق) حين تُرسَل من داخل غرفة — من هو خارج الغرفة كلياً يُستبعَد بصمت
        // (نفس فلسفة استبعاد المحظورين/الحسابات الآلية أدناه، لا رفض الطلب كاملاً لمجرد مستلم
        // واحد غير صالح بينهم). بلا roomId (دردشة خاصة): السلوك القديم كما هو، بلا فحص عضوية
        // 🛡️ طلب صريح بمراجعة PR #106: "مشغول مقعد فعلياً" كان صارماً أكثر من اللازم — إهداء
        // مستمع من ملفه الشخصي (لم يجلس على مقعد بعد) كان يُرفَض خطأً. مقبول الآن أيضاً من هو
        // متصل حالياً بقناة دردشة الغرفة (مستمع)، لا الجالسين فقط — لا يزال مَن هو خارج الغرفة
        // كلياً (لا جالس ولا متصل بقناتها) مرفوضاً تماماً كالسابق
        const seatedUserIds = room ? new Set(room.seats.filter(s => s.user).map(s => s.user.toString())) : null;
        const connectedUserIds = room ? getConnectedRoomUserIds(io, cleanRoomId) : null;
        const cleanRecipientIds = Array.isArray(recipientIds)
            ? [...new Set(recipientIds.map(String))].filter(id => id !== senderId.toString()).slice(0, 80)
            : [];
        seatFilteredRecipientIds = seatedUserIds
            ? cleanRecipientIds.filter(id => seatedUserIds.has(id) || connectedUserIds.has(id))
            : cleanRecipientIds;
        if (seatFilteredRecipientIds.length === 0) {
            throw Object.assign(new Error('يجب اختيار مستلم واحد على الأقل'), { code: 'NO_RECIPIENTS' });
        }
    }

    const [sender, catalogGift, receivers] = await Promise.all([
        User.findById(senderId),
        Gift.findById(giftId),
        User.find({ _id: { $in: seatFilteredRecipientIds } }).select('username profileImage socketId blockedUsers isBot')
    ]);

    if (!sender) {
        throw Object.assign(new Error('يرجى تسجيل الدخول من جديد'), { code: 'NO_SENDER' });
    }

    // ✅ طلب صريح (هدايا v2 — المرحلة 4): giftId قد يكون هدية مخصّصة (CustomGift) لا هدية
    // كتالوج عادية — يُحاوَل أولاً كـGift عادية (الحالة الأشيع بفارق كبير)، وفقط لو لم توجد
    // تُفحَص كـCustomGift. مملوكة لي + "approved" فقط قابلة للإرسال. تُطبَّع هنا لنفس الشكل
    // الذي يتوقعه بقية هذي الدالة (و runGiftComboSideEffects بعدها) — فلا يحتاج أي كود لاحق
    // معرفة مصدرها إطلاقاً (name/imageUrl/price بدل name/imageUrl/discountedPrice+sendPrice)
    let gift = catalogGift;
    if (!gift) {
        const CustomGift = require('../models/CustomGift');
        const customGift = await CustomGift.findById(giftId);
        if (customGift) {
            if (customGift.owner.toString() !== senderId.toString()) {
                throw Object.assign(new Error('لا يمكنك إرسال هدية مخصّصة ليست لك'), { code: 'NO_GIFT' });
            }
            if (customGift.status !== 'approved') {
                throw Object.assign(new Error('هذي الهدية المخصّصة ما زالت قيد المراجعة أو مرفوضة'), { code: 'NO_GIFT' });
            }
            gift = {
                _id: customGift._id, name: customGift.name, imageUrl: customGift.imageUrl,
                category: 'custom', isActive: true, discountedPrice: null, price: customGift.sendPrice,
                animation: null
            };
        }
    }
    if (!gift || !gift.isActive) {
        throw Object.assign(new Error('الهدية غير متوفرة حالياً'), { code: 'NO_GIFT' });
    }

    // 🛡️ استبعاد أي علاقة حظر (بأي اتجاه) والحسابات الآلية — نفس حماية الإرسال الفردي بالضبط
    const senderBlocked = new Set((sender.blockedUsers || []).map(id => id.toString()));
    const validReceivers = receivers.filter(r =>
        !r.isBot &&
        !senderBlocked.has(r._id.toString()) &&
        !(r.blockedUsers || []).map(id => id.toString()).includes(senderId.toString())
    );
    if (validReceivers.length === 0) {
        throw Object.assign(new Error('لا يوجد مستلمون متاحون للإرسال'), { code: 'NO_VALID_RECIPIENTS' });
    }

    const unitPrice = gift.discountedPrice || gift.price;
    const effectiveQty = qty * tapCount;
    const totalPrice = unitPrice * effectiveQty; // لكل مستلم (تشمل كل الضغطات المُجمَّعة بهذي الدفعة)
    const totalCost = totalPrice * validReceivers.length; // الإجمالي الحقيقي المخصوم فعلياً = price × taps × quantity × recipients.length
    const safeGiftImage = gift.imageUrl || '';

    return { sender, gift, validReceivers, unitPrice, totalPrice, totalCost, effectiveQty, cleanRoomId, safeGiftImage };
}
exports.prepareGiftComboSend = prepareGiftComboSend;

// ✅ العملية الذرّية الوحيدة الحرجة مالياً — خصم شرطي واحد بكامل التكلفة الحقيقية المُحضَّرة
// مسبقاً (prepareGiftComboSend)، بمعاملة Mongo الممرَّرة. رصيد غير كافٍ يُسقِط كل كتابة سبقته
// بهذي المعاملة تلقائياً (لا خصم جزئي أبداً) — {code,balance,needed} تُترجَم مباشرة لصيغة
// ack({ok:false,...}) المطلوبة بمعالج Socket.IO
async function applyGiftComboDeduct({ session, senderId, totalCost, preReadCoins }) {
    const updatedSender = await User.findOneAndUpdate(
        { _id: senderId, coins: { $gte: totalCost } },
        { $inc: { coins: -totalCost } },
        { new: true, session }
    );
    if (!updatedSender) {
        throw Object.assign(new Error(`رصيد الكوينز غير كافٍ (تحتاج ${totalCost} كوينز لهذا العدد)`), {
            code: 'INSUFFICIENT', balance: preReadCoins, needed: totalCost
        });
    }
    return updatedSender;
}
exports.applyGiftComboDeduct = applyGiftComboDeduct;

// 🛡️ إصلاح جذري (مراجعة أمنية — سجلّ الهدايا هو سجل القيمة المالية الحقيقي للمُستلِم، لا
// مجرّد أثر عرض): GiftLog هو ما يقرأه giftRedemptionController لحساب المبلغ القابل للاستبدال
// فعلياً (راجع GiftLog.find({receiver, redeemed:false}) هناك) — أي عملية إهداء ناجحة (خصم
// المُرسِل التزم بالفعل) يجب أن تُنتج سجلّ GiftLog مطابقاً لها ذرّياً بنفس المعاملة، لا كأثر
// جانبي best-effort بعد الـack كبقية الآثار (دردشة/PK/دعم/خبرة/نادي معجبين — تلك عروض/تنافس
// قابلة لإعادة الحساب، بلا مسار استبدال نقدي مباشر، فيبقى تأجيلها آمناً تماماً). لو انهار
// السيرفر أو أُعيد تشغيله بين التزام الخصم وتشغيل الأثر الجانبي، المُرسِل كان سيُخصَم فعلياً
// بينما المُستلِم لا يحصل على سجلّه أبداً — فقدان قيمة حقيقي بلا أي أثر يسمح بالتعافي
function buildGiftLogEntries({ senderId, gift, validReceivers, effectiveQty, unitPrice, totalPrice, cleanRoomId }) {
    return validReceivers.map(r => ({
        sender: senderId, receiver: r._id, gift: gift._id,
        giftName: gift.name, giftImage: gift.imageUrl,
        quantity: effectiveQty, unitPrice, totalPrice, context: 'private_chat', room: cleanRoomId
    }));
}

// ✅ غلاف رقيق يحافظ على نفس السلوك الخارجي القديم بالضبط (تحضير + خصم + سجلّ الهدايا، كله
// بنفس المعاملة المُمرَّرة) — تستخدمه processGiftCombo (مسار REST/sendGiftBatch) فقط الآن؛
// مسار gift:combo الحيّ (settleGiftComboClaim) يستدعي prepareGiftComboSend وapplyGiftComboDeduct
// منفصلتين (التحضير خارج أي معاملة، الخصم + سجلّ الهدايا معاً داخلها) — راجع التعليق أعلى
// prepareGiftComboSend
async function reserveGiftCombo({ session, senderId, giftId, quantity, taps = 1, recipientIds, roomId, audience, io }) {
    const prepared = await prepareGiftComboSend({ senderId, giftId, quantity, taps, recipientIds, roomId, audience, io });
    const updatedSender = await applyGiftComboDeduct({ session, senderId, totalCost: prepared.totalCost, preReadCoins: prepared.sender.coins });
    prepared.sender.coins = updatedSender.coins;
    await GiftLog.insertMany(buildGiftLogEntries({
        senderId, gift: prepared.gift, validReceivers: prepared.validReceivers, effectiveQty: prepared.effectiveQty,
        unitPrice: prepared.unitPrice, totalPrice: prepared.totalPrice, cleanRoomId: prepared.cleanRoomId
    }), { session });
    return prepared;
}
exports.reserveGiftCombo = reserveGiftCombo;

// ✅ طلب صريح (هدايا v2): كل "الأثر الجانبي" غير الحرج مالياً — بثّ الغرفة/الدردشة الخاصة،
// نقاط PK/مستوى الغرفة/التحدي، الخبرة (wealthLevel/wealthXp)، نقاط نادي المعجبين — يُنفَّذ
// هنا فقط بعد نجاح التزام معاملة reserveGiftCombo/settleGiftComboClaimInner فعلياً، لا قبله
// ولا ضمن نفس المعاملة (لا حاجة لضمانها ذرّياً مع الخصم نفسه — fire-and-forget/best-effort
// كما كانت دوماً بهذا المشروع؛ كلها قابلة لإعادة الحساب وبلا مسار استبدال نقدي مباشر، بعكس
// سجلّ الهدايا GiftLog الذي التزم بالفعل داخل المعاملة نفسها — راجع buildGiftLogEntries)
// 🛡️ طلب صريح بمراجعة واجهات الكومبو: comboId اختياري (موجود فقط لمسار gift:combo عبر
// Socket.IO — راجع socketService.js؛ REST/processGiftCombo بلا مفهوم جلسة كومبو أصلاً) —
// يُضاف لحمولة room-gift-announcement كي يُجمِّع العميل كل إعلانات نفس الجلسة (حتى لو كانت
// لعدّة مستلمين، كل واحد بحدث منفصل) بشريط/سطر دردشة واحد متحدِّث بدل عنصر جديد لكل حدث
async function runGiftComboSideEffects({ io, sender, gift, validReceivers, unitPrice, totalCost, totalPrice, effectiveQty, cleanRoomId, safeGiftImage, comboId }) {
    const senderId = sender._id;

    if (cleanRoomId) {
        try {
            await applyGiftToActiveBattle(io, cleanRoomId, totalCost, sender, effectiveQty * validReceivers.length, effectiveQty);
        } catch (battleError) {
            console.error('[PK BATTLE] Failed to apply gift score:', battleError);
        }
        try {
            await applyGiftToRoomSupport(io, cleanRoomId, totalCost, sender);
        } catch (supportError) {
            console.error('[ROOM LEVEL] Failed to apply support points:', supportError);
        }
        // 🛡️ إصلاح جذري (الموثوقية والسرعة — السبب الجذري د): الأسطورية كانت تصل للآخرين فقط
        // عبر room-gift-announcement المُجمَّع (نافذة 250ms) — تأخير حقيقي قبل أن يرى أي
        // مشاهد آخر مؤثر ملء الشاشة. حدث مخصَّص الآن (gift:legendary)، يصل فوراً بلا انتظار أي
        // تجميع — مرة واحدة للغرفة كلها (لا لكل مستلم)، لا علاقة له بـroom-gift-announcement
        // (الذي يبقى كما هو للشريط الجانبي/سطر الدردشة فقط). راجع gfxUpdateSideBanner/
        // المستمع الجديد socket.on('gift:legendary') بالعميل
        if (io && gift.category === 'legendary') {
            io.to(`room-chat-${cleanRoomId}`).emit('gift:legendary', {
                roomId: cleanRoomId, comboId, fromUserId: senderId, fromUsername: sender.username,
                giftImage: safeGiftImage, giftIcon: gift.icon || '🎁', giftName: gift.name,
                toLabel: validReceivers.length > 1 ? `${validReceivers.length} مقاعد` : (validReceivers[0]?.username || '')
            });
        }
    }

    // ✅ لكل مستلم بالتوازي: إعلان الغرفة (لو بغرفة) أو رسالة دردشة خاصة حقيقية (لو بلا سياق
    // غرفة — نفس سلوك الإرسال الفردي بالضبط)، ثم بث الحدث اللحظي — الكل بنفس اللحظة تقريباً.
    // savedMessages تُجمَع لإرجاع صدى الرسالة للمرسل نفسه (محادثة 1:1 بلا غرفة فقط — راجع
    // استخدامها بمعالج gift:combo كي يُظهر العميل فقاعة الهدية بنافذة محادثته المفتوحة فوراً)
    const savedMessages = [];
    await Promise.all(validReceivers.map(async (receiver) => {
        const receiverId = receiver._id.toString();
        const giftEventPayload = {
            giftId: gift._id, giftName: gift.name, giftImage: safeGiftImage, quantity: effectiveQty,
            fromUserId: senderId, fromUsername: sender.username, fromProfileImage: sender.profileImage,
            animation: gift.animation, context: 'private_chat', timestamp: new Date().toISOString()
        };

        if (cleanRoomId) {
            // ✅ تحدي الأعضاء يُحسَب لكل مستلم على حدة (بعكس PK/مستوى الغرفة أعلاه، المحسوبين
            // إجمالاً) — مستلمو الإرسال الجماعي قد يكونون بفريقين مختلفين، فلا يصح تجميعهم
            try {
                await applyGiftToActiveSeatChallenge(io, cleanRoomId, receiverId, totalPrice, sender);
            } catch (challengeError) {
                console.error('[SEAT CHALLENGE] Failed to apply gift score:', challengeError);
            }
            // 🛡️ طلب صريح بمراجعة PR (بند 6): عداد دعم مقعد كل مستلم على حدة — بنفس قيمته
            // الحقيقية بهذي الدفعة (totalPrice لكل مستلم، لا totalCost الإجمالي أعلاه)، ومُجمَّع
            // الآن بنفس نافذة 500ms (راجع emitRoomSupportUpdated)
            if (io) {
                const total = addRoomSupportTotal(cleanRoomId.toString(), receiverId, totalPrice);
                emitRoomSupportUpdated(io, cleanRoomId, receiverId, total);
            }
            if (io) {
                queueRoomGiftAnnouncement(io, {
                    roomId: cleanRoomId, fromUserId: senderId, fromUsername: sender.username, fromProfileImage: sender.profileImage,
                    toUserId: receiverId, toUsername: receiver.username, giftId: gift._id.toString(), giftName: gift.name,
                    giftImage: safeGiftImage, giftIcon: gift.icon || '🎁', quantity: effectiveQty, comboId
                });
            }
        } else {
            const participants = [senderId.toString(), receiverId].sort();
            const chatId = participants.join('_');
            // 🐛 إصلاح تسابق فعلي: find-then-create غير ذرّي — بما أن دفعات الكومبو المتعددة لنفس
            // المرسل لا تُسلسَل تطبيقياً بعد الآن (راجع الشرح بـsocketService.js/gift:combo)،
            // يمكن لدفعتين متتاليتين بنفس المحادثة أن تُنفَّذا بالتوازي فعلياً، فيجد كلاهما
            // null ويحاولان الإنشاء معاً، فيصطدم أحدهما بفهرس unique على chatId ويفشل الطلب
            // كاملاً رغم أن الخصم نجح فعلاً قبله — هذا بالضبط أحد أسباب "الهدية لا تصل والرصيد
            // يُخصَم". upsert ذرّي على مستوى القاعدة يغلق هذا تماماً بغض النظر عن التزامن
            const chat = await PrivateChat.findOneAndUpdate(
                { chatId },
                {
                    $setOnInsert: {
                        chatId, participants,
                        participantData: [
                            { userId: senderId, username: sender.username, profileImage: sender.profileImage },
                            { userId: receiverId, username: receiver.username, profileImage: receiver.profileImage }
                        ]
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            const newMessage = await PrivateMessage.create({
                chatId, sender: senderId, receiver: receiverId, type: 'gift',
                content: `${gift.name}${effectiveQty > 1 ? ' × ' + effectiveQty : ''}`,
                metadata: { giftId: gift._id, giftImage: safeGiftImage, giftPrice: totalPrice, giftQuantity: effectiveQty }
            });
            chat.lastMessage = `🎁 هدية ${gift.name}`;
            chat.lastMessageAt = new Date();
            chat.lastMessageBy = senderId;
            chat.messageCount += 1;
            const currentUnread = chat.unreadCount.get(receiverId) || 0;
            chat.unreadCount.set(receiverId, currentUnread + 1);
            chat.hiddenBy = chat.hiddenBy.filter(id => id.toString() !== senderId.toString() && id.toString() !== receiverId);
            await chat.save();
            const populatedMessage = await PrivateMessage.findById(newMessage._id)
                .populate('sender', 'username profileImage')
                .lean();
            savedMessages.push(populatedMessage);
            if (receiver.socketId && io) {
                io.to(receiver.socketId).emit('privateMessageReceived', {
                    message: populatedMessage, chatId: chat.chatId, senderId, senderName: sender.username
                });
            }
            // 🛡️ إصلاح جذري (الموثوقية والسرعة — السبب الجذري ب): صدى فقاعة هديتي بنافذة
            // محادثتي المفتوحة كان يصل فقط عبر res.message بالـack — الذي أصبح يُرسَل فوراً
            // الآن قبل وصولنا هنا (راجع معالج gift:combo بـsocketService.js). حدث مخصَّص جديد
            // لصدى المُرسِل نفسه (لا privateMessageReceived — ذاك للمستلم الحقيقي فقط ومبني
            // على افتراض "رسالة من شخص آخر")، يصل خلال الأثر الجانبي بلا حاجة لانتظار الـack
            if (sender.socketId && io) {
                io.to(sender.socketId).emit('privateMessageSentEcho', {
                    message: populatedMessage, chatId: chat.chatId, receiverId
                });
            }
        }

        if (receiver.socketId && io) {
            io.to(receiver.socketId).emit('giftReceived', giftEventPayload);
        }
    }));

    if (sender.socketId && io) {
        io.to(sender.socketId).emit('balanceUpdate', { newBalance: sender.balance, newCoins: sender.coins });
    }

    // 🐛 إصلاح أداء: نفس نمط التتابع غير الضروري بأعلى — دمج المرسل مع كل المستلمين بنداء
    // Promise.all واحد بدل انتظار المرسل أولاً ثم الدُفعة. senderWealth = أول عنصر دوماً
    // (المرسل أول مدخل بالمصفوفة) — طلب صريح: wealthLevel/wealthXp/requiredXp الحقيقية
    // بعد منح الخبرة الفعلي (لا سقف أقصى للمرسل بعد اليوم، راجع addGiftExperience)
    const [senderWealth] = await Promise.all([
        addGiftExperience(io, senderId, totalCost, 'sender'),
        ...validReceivers.map(r => addGiftExperience(io, r._id, totalPrice, 'receiver'))
    ]);
    // ✅ لا يُنتظَر — تحديث الشارات لا يجب أن يؤخّر استجابة إرسال الهدية
    broadcastSupportLevelUpdate(io, senderId, 'giving', totalCost);
    validReceivers.forEach(r => {
        awardFanPoints(io, r._id, senderId, totalPrice); // ✅ totalPrice = لكل مستلم على حدة (وليس totalCost الإجمالي)
    });

    return {
        balance: sender.coins,
        recipientCount: validReceivers.length,
        giftName: gift.name,
        // ✅ صدى الرسالة فقط لحالة الإرسال الخاص الفردي (مستلم واحد بلا غرفة) — نفس حالة
        // الاستخدام الوحيدة التي تحتاجه العميل فعلياً (محادثة 1:1 مفتوحة)
        message: (!cleanRoomId && savedMessages.length === 1) ? savedMessages[0] : null,
        // ✅ احتياط (grantGiftXp يُرجع null نادراً — خطأ غير متوقع بالمنح نفسه فقط، راجع تعليقه)
        // بقيمة sender الحالية بدل قيمة مضلِّلة
        wealthLevel: senderWealth ? senderWealth.level : sender.level,
        wealthXp: senderWealth ? senderWealth.experience : sender.experience,
        requiredXp: senderWealth ? senderWealth.requiredXp : calculateRequiredXp(sender.level)
    };
}
exports.runGiftComboSideEffects = runGiftComboSideEffects;

// ✅ طلب صريح (هدايا v2): الواجهة الخارجية لمسار REST (sendGiftBatch) — بلا GiftComboTx (لا
// idempotency-key لنداء HTTP مباشر، خلاف معالج gift:combo)، فتدير معاملتها الخاصة هنا فقط
// حول reserveGiftCombo، ثم تُشغِّل الأثر الجانبي بعد الالتزام مباشرة. يحافظ على نفس التوقيع
// الخارجي بالضبط الذي كان عليه processGiftCombo قبل الفصل — sendGiftBatch لا يتغيّر إطلاقاً
async function processGiftCombo({ io, senderId, giftId, quantity, taps = 1, recipientIds, roomId }) {
    const session = await mongoose.startSession();
    let reserved;
    try {
        await session.withTransaction(async () => {
            reserved = await reserveGiftCombo({ session, senderId, giftId, quantity, taps, recipientIds, roomId, io });
        });
    } finally {
        await session.endSession();
    }
    return runGiftComboSideEffects({ io, ...reserved });
}
exports.processGiftCombo = processGiftCombo;

// 🛡️ إصلاح جذري (الموثوقية والسرعة — السبب الجذري أ): طابور داخل العملية لكل مُرسِل — يُسلسِل
// محاولات settleGiftComboClaim لنفس المستخدم (يغطي حتى عدّة تبويبات مفتوحة بنفس الحساب) كي لا
// تتنافس معاملتان على نفس وثيقة المستخدم بنفس اللحظة. بخلاف محاولة سابقة بهذا المشروع استخدمت
// قفلاً مشابهاً (راجع تعليقها المحذوف أعلى isGiftComboRateLimited) وتسبّبت بتراكم تأخير حقيقي:
// تلك كانت تُسلسِل "دفعة ثقيلة" (قراءات الغرفة/الهدية/المستلمين + الخصم + سجلّ الهدايا كلها
// معاً) — الآن "القسم الحرج" المُسلسَل هنا صغير جداً (تحضير سريع + خصم ذرّي واحد فقط، لا سجلّ
// هدايا ولا أي أثر جانبي)، فإضافته هنا لا تُراكم تأخيراً محسوساً حتى مع ضغط مستمر سريع. أيضاً
// مع العميل الجديد بعمق أنبوب 1 (pipeline depth 1 — دفعة واحدة فقط معلّقة بأي لحظة لكل جلسة
// كومبو)، هذا الطابور نادراً ما يُسلسِل أي شيء فعلياً بالاستخدام العادي (تبويب واحد) — يبقى فقط
// كحارس ضد تبويبات متعددة/أي عميل مُعدَّل يحاول إرسال دفعات متوازية فعلياً
const giftComboUserQueues = new Map(); // senderId(string) → Promise (ذيل آخر مهمة مجدولة)
function enqueueGiftCombo(senderId, taskFn) {
    const key = senderId.toString();
    const prev = giftComboUserQueues.get(key) || Promise.resolve();
    const result = prev.then(taskFn, taskFn); // ✅ تُنفَّذ المهمة بصرف النظر عن نجاح/فشل سابقتها
    const tracked = result.catch(() => {}).finally(() => {
        if (giftComboUserQueues.get(key) === tracked) giftComboUserQueues.delete(key); // ✅ لا تسرّب ذاكرة لمستخدمين غير نشطين
    });
    giftComboUserQueues.set(key, tracked);
    return result;
}

// ✅ طلب صريح (هدايا v2): يُغلِّف حجز GiftComboTx (idempotency) + الخصم الذرّي معاً بمعاملة
// Mongo حقيقية واحدة — يستخدمها معالج gift:combo بـsocketService.js حصراً (REST/sendGiftBatch
// لا idempotency-key له، يستخدم processGiftCombo أعلاه مباشرة). لا تلمس io/البث إطلاقاً
// (المستدعي يُشغِّل runGiftComboSideEffects بنفسه بعد نجاح الاستدعاء وبعد إرسال الـack فوراً —
// راجع socketService.js). مُصدَّرة منفصلة كي تُختبَر مباشرة بلا أي حاجة لمحاكاة Socket.IO كاملة
async function settleGiftComboClaim({ key, senderId, comboId, seq, giftId, quantity, taps, recipientIds, roomId, audience, io }) {
    return enqueueGiftCombo(senderId, () => settleGiftComboClaimInner({ key, senderId, comboId, seq, giftId, quantity, taps, recipientIds, roomId, audience, io }));
}
exports.settleGiftComboClaim = settleGiftComboClaim;

async function settleGiftComboClaimInner({ key, senderId, comboId, seq, giftId, quantity, taps, recipientIds, roomId, audience, io }) {
    const GiftComboTx = require('../models/GiftComboTx');

    // 🛡️ إصلاح جذري: التحضير (فحص الغرفة/المستلمين/الهدية، حساب التكلفة) قراءات بحتة الآن —
    // تُنفَّذ قبل بدء أي معاملة إطلاقاً (راجع تعليق prepareGiftComboSend الكامل)
    const prepared = await prepareGiftComboSend({ senderId, giftId, quantity, taps, recipientIds, roomId, audience, io });

    const session = await mongoose.startSession();
    let updatedSender = null;
    let txError = null;
    try {
        await session.withTransaction(async () => {
            // ✅ حجز "ذرّي" لمفتاح هذي الدفعة أولاً، بنفس المعاملة — فهرس unique على key يضمن
            // أن إدراجين لنفس المفتاح بالتوازي، أحدهما فقط ينجح دائماً بغض النظر عن ترتيب
            // التنفيذ، فيُغلق تسابق "فحص ثم تنفيذ" بلا أي قفل تطبيقي. تضارب المفتاح يُسقِط
            // المعاملة بالكامل (لا حجز "شبحي" متبقٍ لو فشل الخصم لاحقاً بنفسه أيضاً)
            let claim;
            try {
                const created = await GiftComboTx.create([{ key, sender: senderId, comboId, seq, balanceAfter: 0 }], { session });
                claim = created[0];
            } catch (claimError) {
                if (claimError && claimError.code === 11000) {
                    throw Object.assign(new Error('duplicate seq'), { code: 'DUPLICATE_SEQ' });
                }
                throw claimError;
            }

            // 🛡️ إصلاح جذري: هذي المعاملة لا تحمل عدا حجز GiftComboTx أعلاه + الخصم الذرّي +
            // سجلّ الهدايا (GiftLog — قيمة المُستلِم الحقيقية، راجع تعليق buildGiftLogEntries
            // لسبب عودته لداخل المعاملة) — لا قراءات غرفة/مستلمين/هدية هنا (سبقتها خارج
            // المعاملة بـprepareGiftComboSend). إدراج واحد فقط (insertMany) فلا يُثقِل زمن
            // الالتزام محسوساً؛ بقية الآثار (دردشة/PK/دعم/خبرة/نادي معجبين) تبقى بعد الـack
            updatedSender = await applyGiftComboDeduct({ session, senderId, totalCost: prepared.totalCost, preReadCoins: prepared.sender.coins });
            claim.balanceAfter = updatedSender.coins;
            await claim.save({ session });
            await GiftLog.insertMany(buildGiftLogEntries({
                senderId, gift: prepared.gift, validReceivers: prepared.validReceivers, effectiveQty: prepared.effectiveQty,
                unitPrice: prepared.unitPrice, totalPrice: prepared.totalPrice, cleanRoomId: prepared.cleanRoomId
            }), { session });
        });
    } catch (e) {
        txError = e;
    } finally {
        await session.endSession();
    }

    if (txError) {
        if (txError.code === 'DUPLICATE_SEQ') {
            // ✅ إعادة محاولة حقيقية بنفس comboId+seq (بعد انقطاع شبكة قبل استلام ack مثلاً، أو
            // إعادة محاولة العميل التلقائية بعد مهلة — راجع createComboSender بالعميل) —
            // المعاملة الأصلية التزمت فعلاً، نُرجع نفس balanceAfter المخزَّن بدل تنفيذ الخصم
            // ثانية. تُقرَأ بعد إغلاق الجلسة تماماً — لا علاقة لها بالمعاملة المُجهَضة أعلاه
            const existing = await GiftComboTx.findOne({ key }).select('balanceAfter').lean();
            return { duplicate: true, balanceAfter: existing ? existing.balanceAfter : 0 };
        }
        throw txError;
    }
    prepared.sender.coins = updatedSender.coins;
    return { duplicate: false, reserved: prepared };
}

// =====================================================
// ✅ إرسال هدية لعدّة مستلمين دفعة واحدة (غرفة/دردشة خاصة) — الآن غلاف HTTP رقيق فقط حول
// processGiftCombo أعلاه (taps=1)؛ كل منطق الخصم/البث/السجلّات موحَّد بمكان واحد يشاركه
// محرّك الكومبو الجديد عبر Socket.IO (gift:combo بـsocketService.js)
// =====================================================
exports.sendGiftBatch = async (req, res) => {
    try {
        const senderId = req.user.id;
        const { recipientIds, giftId, quantity = 1, roomId } = req.body;

        if (isGiftRateLimited(senderId)) {
            return res.status(429).json({ status: 'fail', message: 'أنت ترسل الهدايا بسرعة كبيرة جداً، انتظر لحظة' });
        }

        const io = req.app.get('socketio');
        const result = await processGiftCombo({ io, senderId, giftId, quantity, taps: 1, recipientIds, roomId });

        res.status(201).json({
            status: 'success',
            message: `تم إرسال هدية ${result.giftName} بنجاح`,
            data: { newSenderCoins: result.balance, recipientCount: result.recipientCount, message: result.message }
        });

    } catch (error) {
        if (error && error.code) {
            const statusMap = {
                BAD_QTY: 400, NO_RECIPIENTS: 400, NO_SENDER: 401, NO_GIFT: 404,
                NO_VALID_RECIPIENTS: 400, INSUFFICIENT: 400, NO_ROOM: 404
            };
            return res.status(statusMap[error.code] || 400).json({ status: 'fail', message: error.message });
        }
        console.error('[ERROR] in sendGiftBatch:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء إرسال الهدية' });
    }
};

// المتصدرين: أكثر شخص أرسل هدايا هذا الشهر
function getDateRange(range) {
    const now = new Date();
    if (range === 'week') {
        const start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);
        return { start, end: now };
    }
    if (range === 'year') {
        return { start: new Date(now.getFullYear(), 0, 1), end: now };
    }
    if (range === 'all') {
        return { start: new Date(2000, 0, 1), end: now };
    }
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }; // month (افتراضي)
}

exports.getTopSendersThisMonth = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query.range);
        const topSenders = await GiftLog.getTopSenders(start, end, 20);
        res.status(200).json({ status: 'success', data: { leaders: topSenders } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.getTopReceiversThisMonth = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query.range);
        const topReceivers = await GiftLog.getTopReceivers(start, end, 20);
        res.status(200).json({ status: 'success', data: { leaders: topReceivers } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ✅ ملخص الهدايا المستلمة لمستخدم محدد (لعرضها بصفحة الملف الشخصي الكامل) — يشمل الآن أيضاً
// تفصيلاً حسب نوع الهدية (صورة/اسم/عدد) لعرضه كشريط فيلم قابل للسحب بلوحة الشرف (طلب صريح)،
// بلا تقييد بـcontext (كل هدية استلمها من أي مكان بالتطبيق، بعكس getUserContributors المقيَّد بـ'profile')
exports.getUserGiftsSummary = async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        const targetObjId = new mongoose.Types.ObjectId(targetUserId);
        const [summary, giftsBreakdown] = await Promise.all([
            GiftLog.aggregate([
                { $match: { receiver: targetObjId } },
                { $group: { _id: null, totalGiftsCount: { $sum: '$quantity' }, totalCoinsValue: { $sum: '$totalPrice' } } }
            ]),
            GiftLog.aggregate([
                { $match: { receiver: targetObjId } },
                { $group: { _id: '$gift', giftName: { $first: '$giftName' }, giftImage: { $first: '$giftImage' }, totalCount: { $sum: '$quantity' } } },
                { $sort: { totalCount: -1 } },
                { $limit: 30 }
            ])
        ]);
        const data = summary[0] || { totalGiftsCount: 0, totalCoinsValue: 0 };
        res.status(200).json({
            status: 'success',
            data: {
                totalGiftsCount: data.totalGiftsCount,
                totalCoinsValue: data.totalCoinsValue,
                gifts: giftsBreakdown.map(g => ({ giftId: g._id, name: g.giftName, image: g.giftImage, count: g.totalCount }))
            }
        });
    } catch (error) {
        console.error('[ERROR] in getUserGiftsSummary:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ✅ مساهمون (من دعم هذا المستخدم بالهدايا) + الهدايا المتلقّاة — لعرض بطاقة "المساهمون
// والهدايا" بنافذة الإعجاب السريع بالملف الشخصي (اضغط عدد الداعمين → قائمة مساهمين + تبويب هدايا)
exports.getUserContributors = async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف مستخدم غير صالح' });
        }
        const targetObjId = new mongoose.Types.ObjectId(targetUserId);

        // ✅ يُحتسب فقط من هدايا "الإعجاب السريع" (context: profile) — أي عبر هذا الزر تحديداً
        // بالملف الشخصي، وليس كل هدايا المستخدم من كل مكان بالتطبيق
        const [contributors, totalAgg, giftsBreakdown] = await Promise.all([
            GiftLog.aggregate([
                { $match: { receiver: targetObjId, context: 'profile' } },
                { $group: { _id: '$sender', totalContributed: { $sum: '$totalPrice' }, giftsCount: { $sum: '$quantity' } } },
                { $sort: { totalContributed: -1 } },
                { $limit: 50 },
                { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
                { $unwind: '$user' },
                { $project: {
                    userId: '$_id', username: '$user.username', profileImage: '$user.profileImage',
                    activeFrameClass: '$user.activeFrameClass', totalContributed: 1, giftsCount: 1
                } }
            ]),
            GiftLog.aggregate([
                { $match: { receiver: targetObjId, context: 'profile' } },
                { $group: { _id: null, totalGiftsCount: { $sum: '$quantity' }, totalCoinsValue: { $sum: '$totalPrice' } } }
            ]),
            GiftLog.aggregate([
                { $match: { receiver: targetObjId, context: 'profile' } },
                { $group: { _id: '$gift', giftName: { $first: '$giftName' }, giftImage: { $first: '$giftImage' }, totalCount: { $sum: '$quantity' } } },
                { $sort: { totalCount: -1 } },
                { $limit: 30 }
            ])
        ]);

        const totals = totalAgg[0] || { totalGiftsCount: 0, totalCoinsValue: 0 };
        res.status(200).json({
            status: 'success',
            data: {
                contributorsCount: contributors.length,
                totalGiftsCount: totals.totalGiftsCount,
                totalCoinsValue: totals.totalCoinsValue,
                contributors,
                gifts: giftsBreakdown.map(g => ({ giftId: g._id, name: g.giftName, image: g.giftImage, count: g.totalCount }))
            }
        });
    } catch (error) {
        console.error('[ERROR] in getUserContributors:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// إرسال هدية جماعية بالشات العام (لأشخاص محددين أو للجميع)
exports.sendPublicGift = async (req, res) => {
    try {
        const senderId = req.user.id;
        const { giftId, recipientIds, audience } = req.body; // audience: 'all' | 'selected'

        if (isGiftRateLimited(senderId)) {
            return res.status(429).json({ status: 'fail', message: 'أنت ترسل الهدايا بسرعة كبيرة جداً، انتظر لحظة' });
        }

        const sender = await User.findById(senderId);
        if (!sender) return res.status(401).json({ status: 'fail', message: 'يرجى تسجيل الدخول من جديد' });
        const gift = await Gift.findById(giftId);
        if (!gift || !gift.isActive) return res.status(404).json({ status: 'fail', message: 'الهدية غير متوفرة' });

        const io = req.app.get('socketio');
        let finalRecipientIds = [];

        if (audience === 'all') {
            const room = io.sockets.adapter.rooms.get('public-room');
            if (room) {
                for (const socketId of room) {
                    const s = io.sockets.sockets.get(socketId);
                    if (s?.user?.id && s.user.id.toString() !== senderId.toString()) {
                        finalRecipientIds.push(s.user.id.toString());
                    }
                }
            }
            finalRecipientIds = [...new Set(finalRecipientIds)];
        } else {
            finalRecipientIds = (recipientIds || [])
                .filter(id => id !== senderId)
                .slice(0, 20);
        }

        // ✅ حماية جديدة: استبعاد أي علاقة حظر (بأي اتجاه) من قائمة المستلمين
        const blockedSet = new Set([
            ...(sender.blockedUsers || []).map(id => id.toString()),
            ...(sender.blockedBy || []).map(id => id.toString())
        ]);
        finalRecipientIds = finalRecipientIds.filter(id => !blockedSet.has(id.toString()));

        if (finalRecipientIds.length === 0) {
            return res.status(400).json({ status: 'fail', message: 'لا يوجد مستلمون متاحون حالياً' });
        }

        const unitPrice = gift.discountedPrice || gift.price;
        const totalCost = unitPrice * finalRecipientIds.length;

        const receivers = await User.find({ _id: { $in: finalRecipientIds } }).select('username socketId');

        // 🛡️ إصلاح جذري (مراجعة أمنية — redteam-audit-1، البند المعروف #1): نفس علّة sendGift
        // بالضبط — الخصم وGiftLog كانا عمليتين منفصلتين بلا معاملة تجمعهما. معاملة واحدة الآن
        // تحوي الخصم الذرّي + إدراج كل سجلّات GiftLog معاً فقط (راجع تعليق sendGift الكامل أعلاه)
        const session = await mongoose.startSession();
        let updatedSenderPublic;
        try {
            await session.withTransaction(async () => {
                updatedSenderPublic = await User.findOneAndUpdate(
                    { _id: senderId, coins: { $gte: totalCost } },
                    { $inc: { coins: -totalCost } },
                    { new: true, session }
                );
                if (!updatedSenderPublic) {
                    throw Object.assign(new Error(`رصيدك غير كافٍ (تحتاج ${totalCost} كوينز لهذا العدد)`), { code: 'INSUFFICIENT' });
                }
                const logs = finalRecipientIds.map(rid => ({
                    sender: senderId, receiver: rid, gift: gift._id,
                    giftName: gift.name, giftImage: gift.imageUrl,
                    quantity: 1, unitPrice, totalPrice: unitPrice, context: 'public_chat'
                }));
                await GiftLog.insertMany(logs, { session });
            });
        } catch (txError) {
            if (txError.code === 'INSUFFICIENT') {
                return res.status(400).json({ status: 'fail', message: txError.message });
            }
            throw txError;
        } finally {
            await session.endSession();
        }
        sender.coins = updatedSenderPublic.coins;

                receivers.forEach(r => {
            if (r.socketId) {
                io.to(r.socketId).emit('giftReceived', {
                    giftId: gift._id, giftName: gift.name, giftImage: gift.imageUrl,
                    quantity: 1, fromUserId: senderId, fromUsername: sender.username,
                    fromProfileImage: sender.profileImage, animation: gift.animation,
                    context: 'public_chat', // ✅ جديد
                    timestamp: new Date().toISOString()
                });
            }
        });

        // ✅ منح الخبرة: المرسل حسب إجمالي ما أنفقه، وكل مستلم حسب قيمة الهدية التي استلمها فعلياً
        // 🐛 إصلاح أداء: كانت حلقة for تنتظر مستلماً تلو الآخر بالتتابع (نداء قاعدة بيانات كامل
        // لكل واحد) — بطيء جداً مع جمهور كبير. الآن الكل بالتوازي بنداء Promise.all واحد
        await Promise.all([
            addGiftExperience(io, senderId, totalCost, 'sender'),
            ...finalRecipientIds.map(rid => addGiftExperience(io, rid, unitPrice, 'receiver'))
        ]);
        // ✅ لا يُنتظَر — نفس مبدأ نقاط المعجب بالإرسال الفردي/الجماعي، لكل مستلم بقيمة ما استلمه فعلياً
        finalRecipientIds.forEach(rid => awardFanPoints(io, rid, senderId, unitPrice));
        // 🐛 إصلاح: كان هذا المسار (الشات العام) الوحيد الذي لا يستدعي broadcastSupportLevelUpdate
        // إطلاقاً — فمستوى "الثروة" (supportGiving، المختلف تماماً عن نظام الخبرة addGiftExperience
        // أعلاه) لا يتحدّث لا بالشارات ولا بمعاينة نافذة الهدايا لمن يرسل من الشات العام تحديداً،
        // رغم عمله بشكل سليم بالإرسال الخاص/الغرفة
        broadcastSupportLevelUpdate(io, senderId, 'giving', totalCost);

        const audienceText = audience === 'all'
            ? `للجميع (${finalRecipientIds.length} شخص)`
            : (finalRecipientIds.length === 1 ? `لـ ${receivers[0]?.username || 'شخص'}` : `لـ ${finalRecipientIds.length} أشخاص`);

        io.to('public-room').emit('publicGiftAnnouncement', {
            senderUsername: sender.username,
            senderProfileImage: sender.profileImage,
            giftName: gift.name,
            giftImage: gift.imageUrl,
            audienceText,
            timestamp: new Date()
        });

        res.status(200).json({ status: 'success', message: 'تم إرسال الهدية بنجاح', data: { newCoins: sender.coins } });

    } catch (error) {
        console.error('[ERROR] in sendPublicGift:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء إرسال الهدية' });
    }
};

// ✅ يُصدِّر خطّافات الهدية-للمعركة/الدعم لإعادة استخدامها من socketService.js — متجر أدوات
// المعركة (قفاز/ضباب، pk-item-throw) يُعامِل القفاز "مثل الهدية حرفياً" (طلب المستخدم صراحة):
// يستدعي نفس هذي الدوال الحقيقية بدل إعادة كتابة منطق خصم/بث موازٍ قد ينحرف عنها لاحقاً
module.exports.applyGiftToActiveBattle = applyGiftToActiveBattle;
module.exports.applyGiftToRoomSupport = applyGiftToRoomSupport;
module.exports.applyGiftToActiveSeatChallenge = applyGiftToActiveSeatChallenge;
// ✅ تُستدعى مباشرة من pk-item-throw (ضباب) لإعادة بثّ لقطة النقاط فوراً فتُعتِّم رقم الخصم
// بلا انتظار الدفعة التالية — نفس المسار الحقيقي بالضبط (pk:score)، لا بثّ موازٍ منفصل
module.exports.schedulePkScoreEmit = schedulePkScoreEmit;
// ✅ تُصدَّران فقط لاختبارات مراجعة PR (سيل الهدايا، البند 1-3) — راجع
// __tests__/giftController.giftFloodBatching.test.js؛ لا مستهلك إنتاجي خارج هذا الملف نفسه
module.exports.queueRoomGiftAnnouncement = queueRoomGiftAnnouncement;
module.exports.emitRoomSupportPointsUpdated = emitRoomSupportPointsUpdated;
module.exports.emitRoomSupportUpdated = emitRoomSupportUpdated;
