const mongoose = require('mongoose');

// 🛡️ feat/fanclub-final: نتيجة نهائية مجمَّدة لترتيب نوادي المعجبين بأسبوع دمشقي مكتمل —
// صف واحد لكل (نادٍ، أسبوع)، يُكتب مرة واحدة فقط بـfanClubWeeklyResultJob.js (نفس حجز JobRun
// الذرّي المُستخدَم فعلياً بـfanClubWeeklyFrameJob.js المجاور) فور اكتمال الأسبوع، ولا يُعاد
// حسابه أو تعديله أبداً بعد ذلك — تبويب "الأسبوع الماضي" بلوحة الصدارة يقرأ هذا الجدول وحده،
// لا FanClubWeekly/lastPointAt الحيّين (تلك تتغيّر باستمرار، هذا جدول تاريخي ثابت بطبيعته)
const fanClubWeeklyResultSchema = new mongoose.Schema({
    weekStart: { type: Date, required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rank: { type: Number, required: true },
    // ✅ username/profileImage مُنسَّخان وقت التجميد (لا populate لاحق) — نفس فلسفة أي جدول
    // نتائج تاريخي بهذا المشروع (اسم المستخدم وقتها، لا اسمه الحالي لو غيّره لاحقاً)
    username: String,
    profileImage: String,
    emblemColorId: { type: String, default: 'pink' },
    memberCount: { type: Number, default: 0 },
    activeCount: { type: Number, default: 0 },
    weeklyPoints: { type: Number, default: 0 }
}, { timestamps: true });

fanClubWeeklyResultSchema.index({ weekStart: 1, owner: 1 }, { unique: true });
fanClubWeeklyResultSchema.index({ weekStart: 1, rank: 1 });

module.exports = mongoose.model('FanClubWeeklyResult', fanClubWeeklyResultSchema);
