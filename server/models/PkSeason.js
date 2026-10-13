const mongoose = require('mongoose');

// =====================================================
// ✅ "موسم" دوري PK الأسبوعي — من الاثنين 00:00 حتى الأحد 23:59 بتوقيت Asia/Damascus (طلب
// صريح). مستند مستقل لكل أسبوع (لا تصفير مدمِّر لمستند واحد متكرر) — يحتفظ بأرشيف كامل لكل
// موسم سابق إلى الأبد، تماماً كما تحتفظ الشركات الكبرى بسجلات مواسمها. `status`:
// - pending: لم يبدأ بعد (نادراً ما تحتاجه عملياً — الموسم الأول يُنشأ "active" مباشرة)
// - active: الموسم الجاري حالياً (يجب أن يوجد موسم "active" واحد بالضبط بأي لحظة)
// - closing: علامة انتقالية ذرّية أثناء إغلاق الموسم — تمنع مهمة الإغلاق من تنفيذ نفسها
//   مرتين لو عملت عدة نسخ من السيرفر بآن واحد (راجع pkSeasonJob.js لشرح كامل لهذي الآلية)
// - closed: انتهى وتجمّد ترتيبه النهائي، ومُنحت مكافآته
// =====================================================
const pkSeasonSchema = new mongoose.Schema({
    weekKey: { type: String, required: true, unique: true, index: true }, // مثال: "2026-W41"
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    status: {
        type: String,
        enum: ['pending', 'active', 'closing', 'closed'],
        default: 'active',
        index: true
    },
    closedAt: { type: Date, default: null },
    rewardsGrantedAt: { type: Date, default: null }
}, { timestamps: true });

// ✅ يجلب الموسم النشط الحالي أو ينشئه إن لم يوجد بعد — upsert ذرّي واحد بلا قراءة مسبقة،
// فيستحيل إنشاء موسمين متطابقين (weekKey) حتى لو نادت عدة طلبات متزامنة هذي الدالة بآن واحد
pkSeasonSchema.statics.ensureActiveSeason = async function () {
    const { getCurrentWeekBounds } = require('../utils/pkWeek');
    const { weekKey, startsAt, endsAt } = getCurrentWeekBounds();
    return this.findOneAndUpdate(
        { weekKey },
        { $setOnInsert: { weekKey, startsAt, endsAt, status: 'active' } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

module.exports = mongoose.model('PkSeason', pkSeasonSchema);
