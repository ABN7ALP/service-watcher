// ملف: server/utils/pkWeek.js
// ✅ حدود الأسبوع لدوري PK — الاثنين 00:00 حتى الأحد 23:59:59.999 بتوقيت Asia/Damascus
// (طلب صريح). سوريا ألغت التوقيت الصيفي نهائياً منذ 2022، فإزاحة ثابتة UTC+3 صحيحة ومباشرة
// بلا أي اعتماد خارجي (لا مكتبة مناطق زمنية) — إن أُعيد تفعيل التوقيت الصيفي يوماً فهذا
// الثابت وحده يحتاج مراجعة، موثَّق هنا عمداً لسهولة إيجاده لاحقاً

const DAMASCUS_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3

function getWeekBoundsForDate(utcDate) {
    const damascusMs = utcDate.getTime() + DAMASCUS_OFFSET_MS;
    const damascusDate = new Date(damascusMs); // كائن Date "صوري" — حقول UTC به تُقرَأ كساعة دمشق المحلية فعلياً
    const dayOfWeek = damascusDate.getUTCDay() || 7; // الأحد=0 يصبح 7 (آخر يوم بالأسبوع وفق ISO)

    const mondayDamascusMidnightMs = Date.UTC(
        damascusDate.getUTCFullYear(), damascusDate.getUTCMonth(), damascusDate.getUTCDate()
    ) - (dayOfWeek - 1) * 86400000;

    const startsAt = new Date(mondayDamascusMidnightMs - DAMASCUS_OFFSET_MS); // رجوع للحظة UTC حقيقية
    const endsAt = new Date(startsAt.getTime() + 7 * 86400000 - 1); // الأحد 23:59:59.999 دمشق

    const mondayDamascusDate = new Date(mondayDamascusMidnightMs);
    const yearStart = new Date(Date.UTC(mondayDamascusDate.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((mondayDamascusDate - yearStart) / 86400000 + 1) / 7);
    const weekKey = `${mondayDamascusDate.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;

    return { weekKey, startsAt, endsAt };
}

module.exports = {
    getCurrentWeekBounds: () => getWeekBoundsForDate(new Date()),
    getWeekBoundsForDate,
    DAMASCUS_OFFSET_MS
};
