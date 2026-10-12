const mongoose = require('mongoose');

// =====================================================
// ✅ "دوري PK الأسبوعي" بين الغرف — ترتيب أسبوعي للغرف الأكثر فوزاً ودعماً ببعضها (طلب صريح:
// "نظام مدروس ومعقّد ومهندس ببنية تحتية مقعّدة كالشركات الكبيرة"). كل أسبوع تقويمي (ISO Week)
// له مستند مستقل لكل غرفة (room, weekKey) — لا تصفير مدمِّر لسجل الأسابيع السابقة، بل مستندات
// منفصلة تراكمية بالأرشيف، تماماً كما تحتفظ الشركات الكبرى بسجلات موسمية منفصلة لا تُمحى.
//
// 🛡️ القيمة الحقيقية فقط: `supportPoints` يُغذّى من RoomBattle.realSupportA/B حصراً (الدعم
// الحقيقي غير المُضخَّم بمضاعف القفاز) — لا يتسرّب الحماس اللحظي للشريط لهذا الترتيب الدائم أبداً.
// =====================================================

const WIN_SCORE = 500;           // ✅ قيمة فوز واحد — يعادل تقريباً دعماً حقيقياً بقيمة 500 كوينز
const SUPPORT_SCORE_RATIO = 1;   // ✅ كل كوينز دعم حقيقي = نقطة ترتيب واحدة

const roomWeeklyPkSchema = new mongoose.Schema({
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceRoom', required: true, index: true },
    weekKey: { type: String, required: true, index: true }, // مثال: "2026-W41"
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    supportPoints: { type: Number, default: 0 }, // الدعم الحقيقي المتراكم بمعارك هذا الأسبوع
    score: { type: Number, default: 0, index: true } // wins*WIN_SCORE + supportPoints*SUPPORT_SCORE_RATIO
}, { timestamps: true });

roomWeeklyPkSchema.index({ room: 1, weekKey: 1 }, { unique: true });

// ✅ مفتاح الأسبوع التقويمي الحالي بصيغة ISO (سنة-W رقم الأسبوع) — نفس الأسبوع لكل من يحتسب
// بنفس اللحظة بغض النظر عن توقيته المحلي (UTC دائماً)، يبدأ كل أسبوع يوم الاثنين كمعيار ISO
roomWeeklyPkSchema.statics.getCurrentWeekKey = function (date = new Date()) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7; // الأحد=0 يصبح 7 كي يكون آخر يوم بالأسبوع (معيار ISO)
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
};

// ✅ يُسجّل نتيجة معركة محسومة لغرفة واحدة بهذا الأسبوع — تحديث ذرّي واحد (upsert + inc) بلا
// أي قراءة مسبقة؛ النقاط المُضافة هنا realSupportPoints يجب أن تكون القيمة الحقيقية البحتة دوماً
roomWeeklyPkSchema.statics.recordOutcome = async function (roomId, outcome, realSupportPoints, weekKey) {
    const key = weekKey || this.getCurrentWeekKey();
    const incField = outcome === 'win' ? 'wins' : (outcome === 'loss' ? 'losses' : 'draws');
    const scoreDelta = (outcome === 'win' ? WIN_SCORE : 0) + (realSupportPoints || 0) * SUPPORT_SCORE_RATIO;
    return this.findOneAndUpdate(
        { room: roomId, weekKey: key },
        { $inc: { [incField]: 1, supportPoints: realSupportPoints || 0, score: scoreDelta } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

// ✅ رتبة غرفة بنتيجة معيّنة بهذا الأسبوع — عدّ من هم أعلى منها نقاطاً فقط (أسرع من فرز الكل
// واستخراج الموضع)، فتكون الرتبة 1 + عدد من تجاوزوها؛ 0 نقاط بلا مستند = غير مصنَّفة بعد
roomWeeklyPkSchema.statics.getRank = async function (weekKey, score) {
    const higherCount = await this.countDocuments({ weekKey, score: { $gt: score || 0 } });
    return higherCount + 1;
};

// ✅ أعلى الغرف بالدوري الأسبوعي الحالي — تُستخدم بتبويب "دوري PK الأسبوعي" بشاشة المتصدرين
roomWeeklyPkSchema.statics.getTopRooms = async function (weekKey, limit = 10) {
    const key = weekKey || this.getCurrentWeekKey();
    return this.find({ weekKey: key, score: { $gt: 0 } })
        .sort({ score: -1 })
        .limit(limit)
        .populate('room', 'name coverImage level')
        .lean();
};

module.exports = mongoose.model('RoomWeeklyPk', roomWeeklyPkSchema);
module.exports.WIN_SCORE = WIN_SCORE;
module.exports.SUPPORT_SCORE_RATIO = SUPPORT_SCORE_RATIO;
