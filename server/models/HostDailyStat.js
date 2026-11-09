const mongoose = require('mongoose');

// 🛡️ مراجعة #155: مصدر الحقيقة الوحيد لساعات البث المؤهّلة — صف واحد لكل (مضيف × يوم دمشقي،
// منتصف الليل، راجع server/utils/poolWeek.js getDayStartForDate). كل تِك (socketService.js
// runLiveHoursTick) يُزيد يوم "الآن" وقت التِك نفسه لا يوم بداية الجلسة — فجلسة تعبر منتصف
// الليل تُحسَب دقيقة بدقيقة على يومها الفعلي تلقائياً، بلا أي منطق توزيع إضافي. مجموع الأسبوع
// ورسمه البياني بمركز المضيف كلاهما من نفس هذي السبعة أيام بالضبط — لا مصدر بديل للساعات إطلاقاً
// (HostWeeklyStat لا يحمل حقل ساعات بعد الآن، راجع تعليقه)
const hostDailyStatSchema = new mongoose.Schema({
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    day: { type: Date, required: true, index: true },
    qualifiedSeconds: { type: Number, default: 0 }
}, { timestamps: true });

hostDailyStatSchema.index({ host: 1, day: 1 }, { unique: true });
// ✅ تجميع كل المضيفين بنفس اليوم/مجموعة أيام الأسبوع — رتبة مركز المضيف وجدول الأدمن
// (getHostPoolThisWeek) كلاهما يُجمِّع عبر هذا الحقل بصرف النظر عن المضيف
hostDailyStatSchema.index({ day: 1 });

hostDailyStatSchema.statics.addQualifiedSeconds = async function (hostId, day, seconds) {
    if (!seconds) return null;
    return this.findOneAndUpdate(
        { host: hostId, day },
        { $inc: { qualifiedSeconds: seconds }, $setOnInsert: { host: hostId, day } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

module.exports = mongoose.model('HostDailyStat', hostDailyStatSchema);
