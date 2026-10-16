const mongoose = require('mongoose');
const Gift = require('../models/Gift');
const GiftLog = require('../models/GiftLog');
const User = require('../models/User');
const PrivateChat = require('../models/PrivateChat');
const PrivateMessage = require('../models/PrivateMessage');
const RoomBattle = require('../models/RoomBattle');
const { addGiftExperience } = require('../utils/experienceManager');
// ✅ نقاط "مستوى المعجب" لكل هدية — منح تراكمي دائم بمعدّل 1:1 مع الكوينز المُنفَقة، ينشئ
// عضوية نادي المعجبين تلقائياً لو لم تكن موجودة (انضمام ضمني بأول هدية حقيقية)
const { awardFanPoints } = require('./fanClubController');

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
    const [payloadA, payloadB] = await Promise.all([
        buildPkScorePayload(battle, 'A'),
        buildPkScorePayload(battle, 'B')
    ]);
    io.to(`room-chat-${battle.roomA}`).emit('pk:score', payloadA);
    io.to(`room-chat-${battle.roomB}`).emit('pk:score', payloadB);
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

// ✅ يضيف قيمة أي هدية أُرسلت داخل غرفة (بغض النظر عن وجود معركة PK نشطة أم لا) كـ"نقاط دعم"
// تراكمية دائمة لتلك الغرفة — هذا ما يرفع مستوى الغرفة (1-5) ويفتح مزايا كتوسيع المقاعد.
// انظر VoiceRoom.addSupportPoints/LEVEL_THRESHOLDS للصيغة الكاملة. لا يُوقف إرسال الهدية أبداً
// حتى لو فشل (الغرفة الرسمية مثلاً بلا نظام مستوى — يُرجع null بأمان ويُتجاهل بصمت)
async function applyGiftToRoomSupport(io, roomId, totalPrice, sender) {
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

    io.to(`room-chat-${roomId}`).emit('room-support-points-updated', {
        roomId: roomId.toString(),
        supportPoints: result.supportPoints,
        sessionSupportPoints: result.sessionSupportPoints,
        level: result.level,
        pointsToNextLevel: VoiceRoom.pointsToNextLevel(result.supportPoints, result.level),
        levelProgressPercent: VoiceRoom.levelProgressPercent(result.supportPoints, result.level),
        ...(topSupporters ? { topSupporters } : {})
    });

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

async function emitSeatDuelScoreNow(io, challenge) {
    const [topA, topB] = await Promise.all([challenge.topSupporters('A', 3), challenge.topSupporters('B', 3)]);
    io.to(`room-chat-${challenge.room}`).emit('seat-duel:score', {
        challengeId: challenge._id.toString(),
        scoreA: challenge.scoreA,
        scoreB: challenge.scoreB,
        participants: challenge.participants.map(p => ({ userId: p.user.toString(), score: p.score })),
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

// جلب متجر الهدايا
exports.getGiftShop = async (req, res) => {
    try {
        const gifts = await Gift.find({ isActive: true }).sort('sortOrder price');
        res.status(200).json({ status: 'success', data: { gifts } });
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

        // ✅ خصم ذري (atomic): الشرط والتحديث ينفذان كعملية واحدة غير قابلة للتجزئة على مستوى القاعدة،
        // فيستحيل خصم أكثر من الرصيد الفعلي حتى لو وصلت طلبات متزامنة بنفس اللحظة تماماً (race condition).
        const updatedSender = await User.findOneAndUpdate(
            { _id: senderId, coins: { $gte: totalPrice } },
            { $inc: { coins: -totalPrice } },
            { new: true }
        );

        if (!updatedSender) {
            return res.status(400).json({ status: 'fail', message: 'رصيد الكوينز غير كافٍ لإرسال هذه الهدية' });
        }
        sender.coins = updatedSender.coins;

        // 🛡️ roomId اختياري وقادم من العميل — يُتحقق من صحته كـ ObjectId فقط، ولا يُمنح أي ثقة
        // إضافية (لا صلاحيات، فقط لربط الهدية بمعركة PK نشطة إن وُجدت لهذي الغرفة تحديداً)
        const cleanRoomId = (roomId && mongoose.Types.ObjectId.isValid(roomId)) ? roomId : null;

        const giftLog = await GiftLog.create({
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
        });

        // ✅ لو الهدية أُرسلت من داخل غرفة بها معركة PK نشطة الآن، تُضاف قيمتها لنقاط صفّها فوراً
        if (cleanRoomId) {
            const ioForRoom = req.app.get('socketio');
            try {
                await applyGiftToActiveBattle(ioForRoom, cleanRoomId, totalPrice, sender, qty, qty);
            } catch (battleError) {
                console.error('[PK BATTLE] Failed to apply gift score:', battleError);
            }
            try {
                await applyGiftToRoomSupport(ioForRoom, cleanRoomId, totalPrice, sender);
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
            io.to(`room-chat-${cleanRoomId}`).emit('room-gift-announcement', {
                roomId: cleanRoomId,
                fromUserId: senderId,
                fromUsername: sender.username,
                fromProfileImage: sender.profileImage,
                toUserId: receiverId,
                toUsername: receiver.username,
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
// ✅ قيم الكمية الوحيدة المسموحة بمحرّك الكومبو (1x/6x/66x/166x/999x — تطابق شريط الاختيار
// بالواجهة حرفياً). 🐛 إصلاح: الإصدار القديم كان يَقبل أي رقم ويُشذِّبه إلى 50 كحد أقصى
// (Math.min(..., 50)) — بما أن الواجهة تعرض ×166 و×999 فعلياً، كان المستخدم يختار ×999
// والسيرفر يُنفِّذ ×50 بصمت (يُسلِّم عداً أقل وبسعر أقل مما يراه بالشاشة). الآن: قيمة غير
// ضمن هذي القائمة تُرفَض صراحة برمز BAD_QTY بدل تشذيبها خطأً
const ALLOWED_COMBO_QTY = new Set([1, 6, 66, 166, 999]);
exports.ALLOWED_COMBO_QTY = ALLOWED_COMBO_QTY;

// ✅ معالجة دفعة كومبو واحدة — المنطق الكامل لإرسال هدية لعدّة مستلمين دفعة واحدة (خصم ذري،
// سجلّات الهدايا، بث الغرفة/رسائل الدردشة الخاصة، نقاط PK/مستوى الغرفة/التحدي، الخبرة، نقاط
// نادي المعجبين). مُستخرَجة من sendGiftBatch (REST) القديمة كمصدر حقيقة واحد يستخدمه الآن
// كلاهما: نقطة REST نفسها (taps=1) ومعالج Socket.IO الجديد gift:combo (راجع socketService.js)
// الذي يُجمِّع عدة "ضغطات" (taps) متتالية من العميل برسالة واحدة بدل نداء HTTP لكل ضغطة.
// taps يُضرَب مباشرة في الكمية — خصم واحد بالإجمالي الصحيح، لا taps نداءً منفصلاً بالتتابع.
// ترمي أخطاء مُصنَّفة ({code}) بدل كتابة رد HTTP مباشرة، كي يُترجمها كل مستدعٍ لصيغته الخاصة
// (status code لـREST، ack({ok:false,code}) لـSocket.IO)
async function processGiftCombo({ io, senderId, giftId, quantity, taps = 1, recipientIds, roomId }) {
    const qty = Number(quantity);
    if (!ALLOWED_COMBO_QTY.has(qty)) {
        throw Object.assign(new Error('كمية غير صالحة'), { code: 'BAD_QTY' });
    }
    const tapCount = Math.max(1, Math.min(parseInt(taps) || 1, 60));

    const cleanRecipientIds = Array.isArray(recipientIds)
        ? [...new Set(recipientIds.map(String))].filter(id => id !== senderId.toString()).slice(0, 80)
        : [];
    if (cleanRecipientIds.length === 0) {
        throw Object.assign(new Error('يجب اختيار مستلم واحد على الأقل'), { code: 'NO_RECIPIENTS' });
    }

    const [sender, gift, receivers] = await Promise.all([
        User.findById(senderId),
        Gift.findById(giftId),
        User.find({ _id: { $in: cleanRecipientIds } }).select('username profileImage socketId blockedUsers isBot')
    ]);

    if (!sender) {
        throw Object.assign(new Error('يرجى تسجيل الدخول من جديد'), { code: 'NO_SENDER' });
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
    const totalCost = totalPrice * validReceivers.length; // الإجمالي الحقيقي المخصوم فعلياً

    // ✅ خصم ذري واحد بكامل التكلفة الحقيقية (عدد المستلمين المقبولين فعلياً بعد الفلترة
    // × الكمية × عدد الضغطات المُجمَّعة) — يستحيل خصم أكثر من الرصيد الفعلي حتى مع طلبات متزامنة
    const updatedSender = await User.findOneAndUpdate(
        { _id: senderId, coins: { $gte: totalCost } },
        { $inc: { coins: -totalCost } },
        { new: true }
    );
    if (!updatedSender) {
        throw Object.assign(new Error(`رصيد الكوينز غير كافٍ (تحتاج ${totalCost} كوينز لهذا العدد)`), { code: 'INSUFFICIENT' });
    }
    sender.coins = updatedSender.coins;

    const cleanRoomId = (roomId && mongoose.Types.ObjectId.isValid(roomId)) ? roomId : null;
    const safeGiftImage = gift.imageUrl || '';

    await GiftLog.insertMany(validReceivers.map(r => ({
        sender: senderId, receiver: r._id, gift: gift._id,
        giftName: gift.name, giftImage: gift.imageUrl,
        quantity: effectiveQty, unitPrice, totalPrice, context: 'private_chat', room: cleanRoomId
    })));

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
            if (io) {
                io.to(`room-chat-${cleanRoomId}`).emit('room-gift-announcement', {
                    roomId: cleanRoomId, fromUserId: senderId, fromUsername: sender.username, fromProfileImage: sender.profileImage,
                    toUserId: receiverId, toUsername: receiver.username, giftName: gift.name,
                    giftImage: safeGiftImage, giftIcon: gift.icon || '🎁', quantity: effectiveQty
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
        }

        if (receiver.socketId && io) {
            io.to(receiver.socketId).emit('giftReceived', giftEventPayload);
        }
    }));

    if (sender.socketId && io) {
        io.to(sender.socketId).emit('balanceUpdate', { newBalance: sender.balance, newCoins: sender.coins });
    }

    // 🐛 إصلاح أداء: نفس نمط التتابع غير الضروري بأعلى — دمج المرسل مع كل المستلمين بنداء
    // Promise.all واحد بدل انتظار المرسل أولاً ثم الدُفعة
    await Promise.all([
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
        message: (!cleanRoomId && savedMessages.length === 1) ? savedMessages[0] : null
    };
}
exports.processGiftCombo = processGiftCombo;

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
                NO_VALID_RECIPIENTS: 400, INSUFFICIENT: 400
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

         // ✅ نفس الخصم الذري المستخدم بالهدايا الخاصة
        const updatedSenderPublic = await User.findOneAndUpdate(
            { _id: senderId, coins: { $gte: totalCost } },
            { $inc: { coins: -totalCost } },
            { new: true }
        );

        if (!updatedSenderPublic) {
            return res.status(400).json({ status: 'fail', message: `رصيدك غير كافٍ (تحتاج ${totalCost} كوينز لهذا العدد)` });
        }
        sender.coins = updatedSenderPublic.coins;

        const receivers = await User.find({ _id: { $in: finalRecipientIds } }).select('username socketId');

        const logs = finalRecipientIds.map(rid => ({
            sender: senderId, receiver: rid, gift: gift._id,
            giftName: gift.name, giftImage: gift.imageUrl,
            quantity: 1, unitPrice, totalPrice: unitPrice, context: 'public_chat'
        }));
        await GiftLog.insertMany(logs);

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
