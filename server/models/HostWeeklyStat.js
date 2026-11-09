const mongoose = require('mongoose');

// ✅ feat/live-hours-host-center: صف واحد لكل (مضيف × أسبوع). weekStart = الأحد 00:00 بتوقيت
// دمشق (راجع server/utils/poolWeek.js) — المفتاح الثابت لكل أسبوع، لا رقم أسبوع منفصل يحتاج
// حساباً إضافياً
// 🛡️ مراجعة #155: لا حقل ساعات هنا بعد الآن — HostDailyStat (مصدر الحقيقة الوحيد لكل ساعة،
// يُزاد يوماً بيوم مباشرة من التِك) هو من يُحسَب منه مجموع الأسبوع والرسم البياني كلاهما معاً
// (كانا سابقاً من مصدرين مختلفين فعلياً: هذا الحقل مقابل LiveSession مُجمَّعة بيوم *بداية*
// الجلسة — فيتعارضان بصمت لأي جلسة تعبر منتصف الليل، أو حين لا توجد جلسة مطابقة أصلاً)
// 🛡️ مراجعة #154 (بند 3+4): beansW/beansP تبقيان تُزادان best-effort بعد التزام دفتر الأستاذ
// (giftController.js creditHostWeeklyGiftBeans) — عدّاد تقريبي سريع للوحة مراجعة الأدمن فقط
// (قبل أي PR توزيع)، لا مصدر الحقيقة. مركز المضيف نفسه (getHostPoolSummary) لا يقرأ هذين
// الحقلين إطلاقاً للعرض — يُعيد حسابهما حياً من LedgerEntry لكل طلب (نفس القاعدة بالضبط: محصورة
// بالمستلِم، تستثني الحسابات المرتبطة) كي يطابق "اليوم"/"الأسبوع"/"الشهر" بعضها دوماً. أي PR
// توزيع فعلي مستقبلي يجب كذلك أن يُعيد حساب الألماس من LedgerEntry مباشرة لنفس الأسبوع، لا أن
// يثق بـbeansW/beansP هنا — فهما يُحدَّثان بعد التزام المعاملة لا ضمنها، فقد ينحرفان عن الدفتر
// فعلياً (نداء فشل بصمت/أعيد تشغيل الخادم بين الالتزام والتحديث) دون أن يُكتشَف ذلك إلا بمطابقة
const hostWeeklyStatSchema = new mongoose.Schema({
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weekStart: { type: Date, required: true, index: true },
    beansW: { type: Number, default: 0 },
    beansP: { type: Number, default: 0 }
}, { timestamps: true });

hostWeeklyStatSchema.index({ host: 1, weekStart: 1 }, { unique: true });

hostWeeklyStatSchema.statics.addBeans = async function (hostId, weekStart, { beansW = 0, beansP = 0 } = {}) {
    if (!beansW && !beansP) return null;
    const inc = {};
    if (beansW) inc.beansW = beansW;
    if (beansP) inc.beansP = beansP;
    return this.findOneAndUpdate(
        { host: hostId, weekStart },
        { $inc: inc, $setOnInsert: { host: hostId, weekStart } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

module.exports = mongoose.model('HostWeeklyStat', hostWeeklyStatSchema);
