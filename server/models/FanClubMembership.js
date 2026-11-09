// ملف: server/models/FanClubMembership.js
//
// ✅ عضوية "نادي المعجبين" — صف واحد لكل (مالك النادي، عضو) — createdAt يمثّل وقت الانضمام.
// فهرس فريد مركّب يمنع الانضمام المكرر (ويحمي من سباق نقرتين متزامنتين تخصمان الكوينز مرتين)
//
// ✅ points تراكمية دائمة (لا تُصفَّر أبداً) — هي أساس نظام "مستوى المعجب" (1-20) بهذا النادي
// تحديداً، بنفس فلسفة تطبيقات البث المشهورة (Bigo/TikTok): كل كوينز يُنفَق كهدية لصاحب النادي
// = نقطة واحدة (الحسابات المرتبطة بالمالك = صفر، راجع fanClubController.awardFanClubPoints)،
// بالإضافة لمكافآت صغيرة من المهام اليومية/الأسبوعية ومكافأة لمرة واحدة عند المتابعة.
// 🛡️ fanclub-v2: lastGiftCreditAt/lastChatCreditAt/lastCheckInClaimedAt (مهام يومية) أُزيلت من
// هنا — سقوفها اليومية الآن ذرّية عبر مستند منفصل لكل يوم (FanClubDailyProgress، بنفس فلسفة
// HostDailyStat/AgentDailyCounter: يوم جديد = مستند جديد، لا منطق "تصفير عند الحدود" يمكن أن
// يُخطئ). lastGiftCreditAt نفسها كانت تدفع مكافأة "هدية اليوم" المحذوفة بالكامل بهذي المراجعة
// (الهدية تُحسَب 1:1 بالفعل عبر مسارها العادي، لا حاجة لمكافأة يومية إضافية فوقها)
const mongoose = require('mongoose');

const fanClubMembershipSchema = new mongoose.Schema({
    // ✅ علم استئناف تضخيم ×10 لهذا المستند
    redenominatedV1: { type: Boolean, default: false },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    points: { type: Number, default: 0, min: 0 },
    // 🛡️ fanclub-v2: مصدر علم "غير نشط" الوحيد — الآن منذ آخر نقطة من أي نوع (لا 7 أيام =
    // نشط). يُحدَّث فقط من awardFanClubPoints، بنفس استدعاء $inc النقاط ذاته
    lastPointAt: { type: Date, default: Date.now },
    followBonusClaimed: { type: Boolean, default: false }
}, { timestamps: true });

fanClubMembershipSchema.index({ owner: 1, member: 1 }, { unique: true });
fanClubMembershipSchema.index({ owner: 1, createdAt: -1 });
fanClubMembershipSchema.index({ owner: 1, points: -1 });
// ✅ مراجعة #156: يخدم عدّ "النشطين" الحيّ لكل مالك (getSummary) — lastPointAt:{$gte:cutoff}
// بفلتر owner=هذا المالك تحديداً، لا عدّاد مخزَّن بعد الآن
fanClubMembershipSchema.index({ owner: 1, lastPointAt: -1 });

module.exports = mongoose.model('FanClubMembership', fanClubMembershipSchema);
