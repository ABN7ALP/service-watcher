const mongoose = require('mongoose');

// ✅ feat/live-hours-host-center: صف واحد لكل (مضيف × أسبوع) — مصدر الحقيقة لتأهيل مسبح
// المضيفين الأسبوعي. qualifiedSeconds يُزاد من تِك البث الدوري (راجع socketService.js
// runLiveHoursTick)، beansW/beansP من مسار الهدايا بعد التزام دفتر الأستاذ مباشرة (راجع
// giftController.js creditHostWeeklyGiftBeans) — كلاهما $inc ذرّي، لا قراءة-ثم-كتابة أبداً.
// weekStart = الأحد 00:00 بتوقيت دمشق (راجع server/utils/poolWeek.js) — المفتاح الثابت لكل
// أسبوع، لا رقم أسبوع منفصل يحتاج حساباً إضافياً
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
