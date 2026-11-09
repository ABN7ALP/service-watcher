const mongoose = require('mongoose');

// 🛡️ fanclub-v2: مصدر الحقيقة الوحيد لـ"نجم النادي الأسبوعي" وترتيب أقوى نوادي المعجبين —
// صف واحد لكل (مالك، عضو، أسبوع دمشقي أحد-إلى-سبت، راجع server/utils/poolWeek.js). يُزاد
// فقط من awardFanClubPoints (نفس استدعاء زيادة points الدائمة بـFanClubMembership، لا مصدر
// منفصل) — يستبدل تجميع GiftLog القديم الذي لا يستثني الحسابات المرتبطة بمالك النادي إطلاقاً
const fanClubWeeklySchema = new mongoose.Schema({
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weekStart: { type: Date, required: true, index: true },
    points: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

fanClubWeeklySchema.index({ owner: 1, member: 1, weekStart: 1 }, { unique: true });
// ✅ "نجم الأسبوع": أعلى نقاط بنادٍ معيّن بأسبوع معيّن
fanClubWeeklySchema.index({ owner: 1, weekStart: 1, points: -1 });
// ✅ ترتيب أقوى النوادي: مجموع نقاط الأسبوع عبر كل الأعضاء، مُجمَّع بالمالك
fanClubWeeklySchema.index({ weekStart: 1, owner: 1 });

fanClubWeeklySchema.statics.addPoints = async function (ownerId, memberId, weekStart, delta) {
    if (!delta) return null;
    return this.findOneAndUpdate(
        { owner: ownerId, member: memberId, weekStart },
        { $inc: { points: delta }, $setOnInsert: { owner: ownerId, member: memberId, weekStart } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

module.exports = mongoose.model('FanClubWeekly', fanClubWeeklySchema);
