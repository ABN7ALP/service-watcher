// ملف: poolWeek.test.js
// ✅ feat/live-hours-host-center: حدود الأسبوع لمسبح المضيفين — الأحد 00:00 حتى السبت
// 23:59:59.999 بتوقيت Asia/Damascus (إزاحة ثابتة UTC+3). اختبارات حسابية بحتة، بلا أي
// محاكاة لقاعدة بيانات — poolWeek.js لا يعتمد على Mongoose إطلاقاً
const { getWeekBoundsForDate, getMonthStartForDate, getDayStartForDate, DAMASCUS_OFFSET_MS } = require('../poolWeek');

describe('poolWeek.getWeekBoundsForDate — حدود الأسبوع (الأحد 00:00 دمشق)', () => {
    // ✅ 7 يناير 2024 أحد؛ منتصف ليل الأحد بتوقيت دمشق (UTC+3) = 2024-01-06T21:00:00.000Z بتوقيت UTC
    const EXPECTED_WEEK_START = new Date('2024-01-06T21:00:00.000Z');
    const EXPECTED_WEEK_END = new Date('2024-01-13T20:59:59.999Z');

    test('بداية الحدّ تماماً (أول لحظة بالأسبوع) → نفس الأسبوع', () => {
        const { weekStart, weekEnd } = getWeekBoundsForDate(new Date('2024-01-06T21:00:00.000Z'));
        expect(weekStart.getTime()).toBe(EXPECTED_WEEK_START.getTime());
        expect(weekEnd.getTime()).toBe(EXPECTED_WEEK_END.getTime());
    });

    test('لحظة واحدة قبل الحدّ (آخر مللي ثانية بالأسبوع السابق) → الأسبوع السابق', () => {
        const { weekStart } = getWeekBoundsForDate(new Date('2024-01-06T20:59:59.999Z'));
        expect(weekStart.getTime()).toBe(EXPECTED_WEEK_START.getTime() - 7 * 86400000);
    });

    test('منتصف الأسبوع (أربعاء ظهراً) → نفس حدود الأسبوع', () => {
        const { weekStart, weekEnd } = getWeekBoundsForDate(new Date('2024-01-10T12:00:00.000Z'));
        expect(weekStart.getTime()).toBe(EXPECTED_WEEK_START.getTime());
        expect(weekEnd.getTime()).toBe(EXPECTED_WEEK_END.getTime());
    });

    test('آخر لحظة بالأسبوع تماماً (السبت 23:59:59.999 دمشق) → لا تزال نفس الأسبوع', () => {
        const { weekStart } = getWeekBoundsForDate(new Date('2024-01-13T20:59:59.999Z'));
        expect(weekStart.getTime()).toBe(EXPECTED_WEEK_START.getTime());
    });

    test('لحظة واحدة بعد الحدّ (أول مللي ثانية بالأسبوع التالي) → الأسبوع التالي', () => {
        const { weekStart } = getWeekBoundsForDate(new Date('2024-01-13T21:00:00.000Z'));
        expect(weekStart.getTime()).toBe(EXPECTED_WEEK_START.getTime() + 7 * 86400000);
    });

    test('مدة الأسبوع تساوي 7 أيام تماماً بلا أي فجوة أو تداخل', () => {
        const { weekStart, weekEnd } = getWeekBoundsForDate(new Date());
        expect(weekEnd.getTime() - weekStart.getTime()).toBe(7 * 86400000 - 1);
    });
});

describe('poolWeek.getMonthStartForDate / getDayStartForDate — بتوقيت دمشق أيضاً', () => {
    test('بداية الشهر: منتصف ليل أول الشهر بتوقيت دمشق', () => {
        // ✅ 1 مارس 2024 منتصف ليل دمشق = 29 فبراير 2024 21:00 UTC (شهر كبيس)
        const monthStart = getMonthStartForDate(new Date('2024-03-15T10:00:00.000Z'));
        expect(monthStart.getTime()).toBe(new Date('2024-02-29T21:00:00.000Z').getTime());
    });

    test('لحظة واحدة قبل بداية الشهر → الشهر السابق', () => {
        const monthStart = getMonthStartForDate(new Date('2024-02-29T20:59:59.999Z'));
        expect(monthStart.getTime()).toBe(new Date('2024-01-31T21:00:00.000Z').getTime());
    });

    test('بداية اليوم: منتصف ليل اليوم نفسه بتوقيت دمشق', () => {
        const dayStart = getDayStartForDate(new Date('2024-01-10T22:00:00.000Z')); // 2024-01-11T01:00 دمشق
        expect(dayStart.getTime()).toBe(new Date('2024-01-10T21:00:00.000Z').getTime());
    });

    test('قبل منتصف الليل بدقيقة بتوقيت دمشق → اليوم السابق', () => {
        const dayStart = getDayStartForDate(new Date('2024-01-10T20:59:00.000Z')); // 2024-01-10T23:59 دمشق
        expect(dayStart.getTime()).toBe(new Date('2024-01-09T21:00:00.000Z').getTime());
    });

    test('الإزاحة الثابتة المُصدَّرة تساوي 3 ساعات بالضبط', () => {
        expect(DAMASCUS_OFFSET_MS).toBe(3 * 60 * 60 * 1000);
    });
});
