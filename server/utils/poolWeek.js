// ملف: server/utils/poolWeek.js
// ✅ حدود الأسبوع لمسبح المضيفين الأسبوعي — الأحد 00:00 حتى السبت 23:59:59.999 بتوقيت
// Asia/Damascus. نفس إزاحة UTC+3 الثابتة المستخدَمة بـpkWeek.js ولنفس السبب تماماً (سوريا
// ألغت التوقيت الصيفي نهائياً منذ 2022) — إن أُعيد تفعيله يوماً فهذا الثابت وحده يحتاج مراجعة
// بكل الملفات التي تستخدمه (هذا وpkWeek.js)
const DAMASCUS_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3

function getWeekBoundsForDate(utcDate) {
    const damascusMs = utcDate.getTime() + DAMASCUS_OFFSET_MS;
    const damascusDate = new Date(damascusMs); // كائن Date "صوري" — حقول UTC به تُقرَأ كساعة دمشق المحلية فعلياً
    const dayOfWeek = damascusDate.getUTCDay(); // الأحد=0 هنا فعلاً (الأسبوع يبدأ أحداً، بعكس pkWeek الذي يبدأ اثنين)

    const sundayDamascusMidnightMs = Date.UTC(
        damascusDate.getUTCFullYear(), damascusDate.getUTCMonth(), damascusDate.getUTCDate()
    ) - dayOfWeek * 86400000;

    const weekStart = new Date(sundayDamascusMidnightMs - DAMASCUS_OFFSET_MS); // رجوع للحظة UTC حقيقية
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000 - 1); // السبت 23:59:59.999 دمشق

    return { weekStart, weekEnd };
}

// ✅ بداية الشهر الحالي بتوقيت دمشق (منتصف أول يوم بالشهر) — تُستخدَم لتقسيم "ألماس الشهر"
// (قابل للسحب/من هدايا مجانية) بمركز المضيف، مستقلة عن حدود الأسبوع أعلاه
function getMonthStartForDate(utcDate) {
    const damascusMs = utcDate.getTime() + DAMASCUS_OFFSET_MS;
    const damascusDate = new Date(damascusMs);
    const firstOfMonthMs = Date.UTC(damascusDate.getUTCFullYear(), damascusDate.getUTCMonth(), 1);
    return new Date(firstOfMonthMs - DAMASCUS_OFFSET_MS);
}

// ✅ بداية اليوم الحالي بتوقيت دمشق — لإحصائيات "اليوم" (بث اليوم/ألماس اليوم/متابعون جدد اليوم)
function getDayStartForDate(utcDate) {
    const damascusMs = utcDate.getTime() + DAMASCUS_OFFSET_MS;
    const damascusDate = new Date(damascusMs);
    const todayMidnightMs = Date.UTC(damascusDate.getUTCFullYear(), damascusDate.getUTCMonth(), damascusDate.getUTCDate());
    return new Date(todayMidnightMs - DAMASCUS_OFFSET_MS);
}

module.exports = {
    getCurrentWeekBounds: () => getWeekBoundsForDate(new Date()),
    getWeekBoundsForDate,
    getCurrentMonthStart: () => getMonthStartForDate(new Date()),
    getMonthStartForDate,
    getCurrentDayStart: () => getDayStartForDate(new Date()),
    getDayStartForDate,
    DAMASCUS_OFFSET_MS
};
