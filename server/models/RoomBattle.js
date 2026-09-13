const mongoose = require('mongoose');

// =====================================================
// ✅ معركة PK بين غرفتين — التحدي بمرحلتين: طلب معلّق (pending) بانتظار رد مضيف الغرفة
// الأخرى، ثم معركة فعلية (active) لمدة محددة تُحسب فيها قيمة الهدايا المُرسلة داخل كل
// غرفة كنقاط لصفّها. المستند هو مصدر الحقيقة الوحيد (لا حالة بالذاكرة) حتى تصمد
// المعركة لو أعاد أحد فتح الغرفة أو أعاد تحميل الصفحة أثناءها.
// =====================================================

const DURATION_PRESETS_SECONDS = [180, 300, 600]; // 3 / 5 / 10 دقائق
const CHALLENGE_EXPIRY_SECONDS = 30;

const roomBattleSchema = new mongoose.Schema({
    roomA: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceRoom', required: true, index: true },
    roomB: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceRoom', required: true, index: true },
    challengedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // مضيف roomA دائماً
    durationSeconds: { type: Number, enum: DURATION_PRESETS_SECONDS, required: true },
    status: {
        type: String,
        enum: ['pending', 'active', 'ended', 'declined', 'expired', 'cancelled'],
        default: 'pending',
        index: true
    },
    scoreA: { type: Number, default: 0, min: 0 },
    scoreB: { type: Number, default: 0, min: 0 },
    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    winner: { type: String, enum: ['A', 'B', 'draw', null], default: null },
}, { timestamps: true });

// ✅ يمنع أي غرفة (سواء طرفها A أو B) من الدخول بأكثر من معركة معلّقة/فعلية بنفس الوقت
roomBattleSchema.statics.findOpenForRoom = async function (roomId) {
    return this.findOne({
        $or: [{ roomA: roomId }, { roomB: roomId }],
        status: { $in: ['pending', 'active'] }
    });
};

// ✅ يجلب المعركة النشطة/المعلّقة الحالية لغرفة معينة، مع بيانات الغرفتين لعرضها بالواجهة
roomBattleSchema.statics.getOpenForRoomPopulated = async function (roomId) {
    return this.findOne({
        $or: [{ roomA: roomId }, { roomB: roomId }],
        status: { $in: ['pending', 'active'] }
    })
        .populate('roomA', 'name coverImage')
        .populate('roomB', 'name coverImage');
};

module.exports = mongoose.model('RoomBattle', roomBattleSchema);
module.exports.DURATION_PRESETS_SECONDS = DURATION_PRESETS_SECONDS;
module.exports.CHALLENGE_EXPIRY_SECONDS = CHALLENGE_EXPIRY_SECONDS;
