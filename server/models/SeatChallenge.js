const mongoose = require('mongoose');

// =====================================================
// ✅ تحدي بين مستخدمين داخل نفس الغرفة (بعكس RoomBattle: تحدٍ بين غرفتين مختلفتين) — بين
// شخصين (1 ضد 1) أو أربعة (2 ضد 2)، ينشئه المضيف أو أحد المسؤولين المساعدين فقط، ولا يشارك
// فيه إلا من دعاهم صراحة عند الإنشاء. نفس فلسفة RoomBattle بالضبط: المستند هو مصدر الحقيقة
// الوحيد (لا حالة بالذاكرة)، فيبقى محفوظاً حتى مع انقطاع اتصال مؤقت أو إعادة تحميل الصفحة
// =====================================================

const participantSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seatNumber: { type: Number, required: true },
    team: { type: String, enum: ['A', 'B'], required: true },
    // ✅ منشئ التحدي مقبول تلقائياً (لا معنى لأن "يقبل" دعوته هو لنفسه) — الباقون بانتظار ردهم
    accepted: { type: Boolean, default: false }
}, { _id: false });

const seatChallengeSchema = new mongoose.Schema({
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceRoom', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    participants: [participantSchema],
    durationSeconds: { type: Number, enum: [60, 120, 180], required: true },
    // ✅ 'finalizing' حالة انتقالية ذرّية بين active وended — نفس نمط RoomBattle بالضبط
    // (راجع تعليق finalizeActiveSeatChallenge بـsocketService.js): الادّعاء الذرّي لهذي
    // الحالة بعينها يمنع تكرار الإنهاء حتى مع نداءات متزامنة أو عدة نسخ خادم
    status: {
        type: String,
        enum: ['pending', 'active', 'finalizing', 'ended', 'declined', 'expired', 'cancelled'],
        default: 'pending',
        index: true
    },
    scoreA: { type: Number, default: 0 },
    scoreB: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    winner: { type: String, enum: ['A', 'B', 'draw', null], default: null },
    // ✅ وقت آخر ادّعاء لمرحلة finalizing — لاكتشاف ادّعاء "علق" (تعطّل الخادم قبل الوصول
    // لـstatus:'ended') فتُعاد محاولته بعد مهلة قصيرة فقط
    finalizingAt: { type: Date, default: null },
    // ✅ 🛡️ حمولة seat-challenge-ended الجاهزة محفوظة بالمستند نفسه فور الحسم — مصدر الحقيقة
    // لمسار GET /api/voice-room/seat-challenge/:challengeId/result لمن فاته البثّ اللحظي
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    finalizedAt: { type: Date, default: null }
}, { timestamps: true });

seatChallengeSchema.statics.CHALLENGE_EXPIRY_SECONDS = 30; // مهلة الرد على الدعوة قبل انتهائها تلقائياً
seatChallengeSchema.statics.DURATION_PRESETS_SECONDS = [60, 120, 180];

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

seatChallengeSchema.methods.allAccepted = function () {
    return this.participants.every(p => p.accepted);
};

module.exports = mongoose.model('SeatChallenge', seatChallengeSchema);
