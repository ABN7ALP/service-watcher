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
    status: {
        type: String,
        enum: ['pending', 'active', 'ended', 'declined', 'expired', 'cancelled'],
        default: 'pending',
        index: true
    },
    scoreA: { type: Number, default: 0 },
    scoreB: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    winner: { type: String, enum: ['A', 'B', 'draw', null], default: null }
}, { timestamps: true });

seatChallengeSchema.statics.CHALLENGE_EXPIRY_SECONDS = 30; // مهلة الرد على الدعوة قبل انتهائها تلقائياً
seatChallengeSchema.statics.DURATION_PRESETS_SECONDS = [60, 120, 180];

// ✅ لا يُسمح بأكثر من تحدٍ مفتوح (بانتظار ردود أو جارٍ فعلياً) بنفس الغرفة بآن واحد
seatChallengeSchema.statics.findOpenForRoom = function (roomId) {
    return this.findOne({ room: roomId, status: { $in: ['pending', 'active'] } });
};

seatChallengeSchema.statics.getActiveForRoomPopulated = function (roomId) {
    return this.findOne({ room: roomId, status: 'active' }).populate('participants.user', 'username profileImage');
};

seatChallengeSchema.methods.allAccepted = function () {
    return this.participants.every(p => p.accepted);
};

module.exports = mongoose.model('SeatChallenge', seatChallengeSchema);
