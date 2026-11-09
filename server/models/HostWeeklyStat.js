const mongoose = require('mongoose');

// ✅ feat/live-hours-host-center: صف واحد لكل (مضيف × أسبوع). qualifiedSeconds هو مصدر
// الحقيقة الوحيد لساعات المسبح (لا بديل له — لا "دفتر أستاذ" للوقت)، يُزاد من تِك البث الدوري
// (راجع socketService.js runLiveHoursTick). weekStart = الأحد 00:00 بتوقيت دمشق (راجع
// server/utils/poolWeek.js) — المفتاح الثابت لكل أسبوع، لا رقم أسبوع منفصل يحتاج حساباً إضافياً
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
    qualifiedSeconds: { type: Number, default: 0 },
    beansW: { type: Number, default: 0 },
    beansP: { type: Number, default: 0 }
}, { timestamps: true });

hostWeeklyStatSchema.index({ host: 1, weekStart: 1 }, { unique: true });
// ✅ ترتيب لوحة الأدمن/حساب "ترتيبك الحالي" بمركز المضيف — الفرز بساعات التأهيل أولاً
hostWeeklyStatSchema.index({ weekStart: 1, qualifiedSeconds: -1 });

hostWeeklyStatSchema.statics.addQualifiedSeconds = async function (hostId, weekStart, seconds) {
    if (!seconds) return null;
    return this.findOneAndUpdate(
        { host: hostId, weekStart },
        { $inc: { qualifiedSeconds: seconds }, $setOnInsert: { host: hostId, weekStart } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

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
