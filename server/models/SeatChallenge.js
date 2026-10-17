const mongoose = require('mongoose');

// =====================================================
// ✅ تحدي بين أعضاء داخل نفس الغرفة (بعكس RoomBattle: تحدٍ بين غرفتين مختلفتين) — 1 ضد 1،
// 2 ضد 2، أو 3 ضد 3، ينشئه المضيف أو أحد المسؤولين المساعدين فقط، ولا يشارك فيه إلا من
// دعاهم صراحة عند الإنشاء. نفس فلسفة RoomBattle بالضبط: المستند هو مصدر الحقيقة الوحيد
// (لا حالة بالذاكرة)، فيبقى محفوظاً حتى مع انقطاع اتصال مؤقت أو إعادة تحميل الصفحة، أو حتى
// تعطّل الخادم نفسه أثناء التحدي (راجع finalizeActiveSeatChallenge/sweepOverdueSeatChallenges
// بـsocketService.js — نفس إصلاح التعلّق الثلاثي المطبَّق على معارك PK بالضبط)
// =====================================================

const DURATION_PRESETS_SECONDS = [60, 180, 300]; // 1 / 3 / 5 دقائق
const CHALLENGE_EXPIRY_SECONDS = 30;
const MODES = [1, 2, 3]; // 1v1 / 2v2 / 3v3

// ✅ 🛡️ عقاب الخاسر: مفاتيح لا نص حر (طلب أمني صريح بالمواصفة) — العميل يرسل punishmentKey
// فقط (قيمة enum)، والخادم وحده يملك نصّ العرض العربي؛ لا حقل نصي حر يُقبل أو يُبث أبداً،
// فيستحيل على أي عميل مُعدَّل حقن HTML/نص عشوائي بعقاب يراه الجميع
const PUNISHMENTS = {
    sing: { icon: '🎤', label: 'يغني مقطعاً' },
    truth: { icon: '🙊', label: 'سؤال صراحة' },
    impersonate: { icon: '🎭', label: 'يقلّد شخصاً' },
    photo: { icon: '🖼️', label: 'يغيّر صورته ساعة' },
    none: { icon: '', label: 'بلا عقاب' }
};

const participantSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seatNumber: { type: Number, required: true },
    team: { type: String, enum: ['A', 'B'], required: true },
    // ✅ منشئ التحدي مقبول تلقائياً (لا معنى لأن "يقبل" دعوته هو لنفسه) — الباقون بانتظار ردهم
    accepted: { type: Boolean, default: false },
    declined: { type: Boolean, default: false },
    // ✅ 🛡️ نقاط هذا المشارك تحديداً — تُحسَب من قيمة الهدايا الحقيقية المُرسلة إليه هو بعينه
    // خلال التحدي فقط (راجع giftController.applyGiftToActiveSeatChallenge)، لا تقديرية أبداً
    score: { type: Number, default: 0, min: 0 }
}, { _id: false });

const seatChallengeSchema = new mongoose.Schema({
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceRoom', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mode: { type: Number, enum: MODES, required: true },
    participants: { type: [participantSchema], validate: v => v.length >= 2 && v.length <= 6 },
    durationSeconds: { type: Number, enum: DURATION_PRESETS_SECONDS, required: true },
    // ✅ 🛡️ المفتاح وحده يُخزَّن ويُبثّ — النص المعروض يُشتَقّ دوماً من PUNISHMENTS أعلى عند
    // البناء، فلا نص حر من عميل مُعدَّل يصل لأي مستخدم آخر إطلاقاً
    punishmentKey: { type: String, enum: [...Object.keys(PUNISHMENTS)], default: 'none' },
    // 'finalizing' حالة انتقالية ذرّية بين active وended — راجع تعليق finalizeActiveSeatChallenge
    status: {
        type: String,
        enum: ['pending', 'active', 'finalizing', 'ended', 'declined', 'expired', 'cancelled'],
        default: 'pending',
        index: true
    },
    scoreA: { type: Number, default: 0 },
    scoreB: { type: Number, default: 0 },
    // ✅ أفضل 3 داعمين لكل فريق (نفس Map/شكل RoomBattle.supportersA/B بالضبط) — الداعم هو
    // مُرسِل الهدية (لمن يدعم فريقه الذي صوّت له)، لا المشارك المُستقبِل نفسه
    supportersA: { type: Map, of: mongoose.Schema.Types.Mixed, default: () => new Map() },
    supportersB: { type: Map, of: mongoose.Schema.Types.Mixed, default: () => new Map() },
    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    // ✅ وقت انتهاء صلاحية الدعوة المعلّقة — مصدر الحقيقة الوحيد لعدّاد الـ30 ثانية بالعميل
    // (طلب صريح: "المهلة 30 ثانية من expiresAt في الخادم")، لا عدّاد نسبي محلي قد ينحرف
    expiresAt: { type: Date, default: null },
    winner: { type: String, enum: ['A', 'B', 'draw', null], default: null },
    // ✅ وقت آخر ادّعاء لمرحلة finalizing — لاكتشاف ادّعاء "علق" (تعطّل الخادم قبل الوصول
    // لـstatus:'ended') فتُعاد محاولته بعد مهلة قصيرة فقط
    finalizingAt: { type: Date, default: null },
    // ✅ 🛡️ حمولة seat-challenge-ended الجاهزة محفوظة بالمستند نفسه فور الحسم — مصدر الحقيقة
    // لمسار GET /api/voice-room/seat-challenge/:challengeId/result لمن فاته البثّ اللحظي
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    finalizedAt: { type: Date, default: null },
    // ✅ "ثأر فوري" (طلب صريح — بند 11) يفتح إنشاءً جديداً بنفس الفريقين: يحتاج تتبّع تحدي
    // الأصل فقط للزينة/التحليلات لاحقاً، لا منطق فعلي يعتمد عليه هنا
    rematchOf: { type: mongoose.Schema.Types.ObjectId, ref: 'SeatChallenge', default: null }
}, { timestamps: true });

seatChallengeSchema.statics.CHALLENGE_EXPIRY_SECONDS = CHALLENGE_EXPIRY_SECONDS;
seatChallengeSchema.statics.DURATION_PRESETS_SECONDS = DURATION_PRESETS_SECONDS;
seatChallengeSchema.statics.MODES = MODES;
seatChallengeSchema.statics.PUNISHMENTS = PUNISHMENTS;

// ✅ لا يُسمح بأكثر من تحدٍ مفتوح (بانتظار ردود أو جارٍ فعلياً) بنفس الغرفة بآن واحد
seatChallengeSchema.statics.findOpenForRoom = function (roomId) {
    return this.findOne({ room: roomId, status: { $in: ['pending', 'active'] } });
};

seatChallengeSchema.statics.getActiveForRoomPopulated = function (roomId) {
    return this.findOne({ room: roomId, status: 'active' }).populate('participants.user', 'username profileImage activeFrameClass');
};

// ✅ آخر تحدٍ انتهى بهذي الغرفة خلال نافذة زمنية قصيرة (افتراضياً 60 ثانية) — يستخدمها
// join-room-chat/إعادة الاتصال لإرسال النتيجة لمن فاته بثّ seat-challenge-ended اللحظي
seatChallengeSchema.statics.findRecentlyEndedForRoom = function (roomId, windowMs = 60000) {
    return this.findOne({
        room: roomId,
        status: 'ended',
        finalizedAt: { $gte: new Date(Date.now() - windowMs) }
    }).sort({ finalizedAt: -1 });
};

seatChallengeSchema.methods.allResponded = function () {
    return this.participants.every(p => p.accepted || p.declined);
};

seatChallengeSchema.methods.allAccepted = function () {
    return this.participants.every(p => p.accepted);
};

// ✅ أعلى 3 داعمين لفريق معيّن — نفس RoomBattle.topSupporters حرفياً (راجع تعليقها هناك)
seatChallengeSchema.methods.topSupporters = async function (team, limit = 3) {
    const map = team === 'A' ? this.supportersA : this.supportersB;
    if (!map || map.size === 0) return [];
    const top = Array.from(map.entries())
        .map(([userId, data]) => ({
            userId,
            username: data?.username || '',
            profileImage: data?.profileImage || '',
            points: data?.points || 0
        }))
        .sort((a, b) => b.points - a.points)
        .slice(0, limit);
    if (top.length === 0) return top;
    const User = require('./User');
    const liveUsers = await User.find({ _id: { $in: top.map(s => s.userId) } }).select('activeFrameClass').lean();
    const frameByUserId = new Map(liveUsers.map(u => [u._id.toString(), u.activeFrameClass || '']));
    return top.map(s => ({ ...s, activeFrameClass: frameByUserId.get(s.userId) || '' }));
};

module.exports = mongoose.model('SeatChallenge', seatChallengeSchema);
