// ملف: server/models/FanClubMembership.js
//
// ✅ عضوية "نادي المعجبين" — صف واحد لكل (مالك النادي، عضو) — createdAt يمثّل وقت الانضمام.
// فهرس فريد مركّب يمنع الانضمام المكرر (ويحمي من سباق نقرتين متزامنتين تخصمان الكوينز مرتين)
//
// ✅ points تراكمية دائمة (لا تُصفَّر أبداً) — هي أساس نظام "مستوى المعجب" (1-20) بهذا النادي
// تحديداً، بنفس فلسفة تطبيقات البث المشهورة (Bigo/TikTok): كل كوينز يُنفَق كهدية لصاحب النادي
// = نقطة واحدة، بالإضافة لمكافآت صغيرة من المهام اليومية (حضور/دردشة/هدية اليوم) ومكافأة لمرة
// واحدة عند المتابعة. حقول lastXAt/Claimed تمنع استغلال نفس المهمة أكثر من مرة/يوم
const mongoose = require('mongoose');

const fanClubMembershipSchema = new mongoose.Schema({
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    points: { type: Number, default: 0, min: 0 },
    lastCheckInClaimedAt: { type: Date, default: null },
    lastChatCreditAt: { type: Date, default: null },
    lastGiftCreditAt: { type: Date, default: null },
    followBonusClaimed: { type: Boolean, default: false }
}, { timestamps: true });

fanClubMembershipSchema.index({ owner: 1, member: 1 }, { unique: true });
fanClubMembershipSchema.index({ owner: 1, createdAt: -1 });
fanClubMembershipSchema.index({ owner: 1, points: -1 });

module.exports = mongoose.model('FanClubMembership', fanClubMembershipSchema);
