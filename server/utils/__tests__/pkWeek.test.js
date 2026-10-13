// ملف: server/utils/__tests__/pkWeek.test.js
// ✅ اختبار حسابات حدود الأسبوع (الاثنين 00:00 حتى الأحد 23:59:59.999 بتوقيت دمشق UTC+3) —
// منطق صِرف بلا أي اعتماد على قاعدة بيانات، بما في ذلك لحظة عبور الحدود (لحظة أحد بتوقيت UTC
// لكنها أصلاً اثنين بتوقيت دمشق يجب أن تُحتسَب ضمن الأسبوع الجديد لا القديم)

const { getWeekBoundsForDate } = require('../pkWeek');

describe('pkWeek.getWeekBoundsForDate', () => {
    test('يحسب حدود أسبوع عادي (أربعاء بتوقيت دمشق) بشكل صحيح', () => {
        const { weekKey, startsAt, endsAt } = getWeekBoundsForDate(new Date('2024-01-10T12:00:00Z'));
        expect(weekKey).toBe('2024-W02');
        expect(startsAt.toISOString()).toBe('2024-01-07T21:00:00.000Z');
        expect(endsAt.toISOString()).toBe('2024-01-14T20:59:59.999Z');
    });

    test('لحظة أحد بتوقيت UTC لكنها اثنين فعلياً بتوقيت دمشق تنتمي للأسبوع الجديد', () => {
        // ✅ 2024-01-07T22:30:00Z UTC = الأحد، لكن +3 ساعات (دمشق) = الاثنين 01:30 — يجب أن
        // تُحتسَب هذي اللحظة ضمن نفس أسبوع الحالة أعلاه بالضبط (بداية الأسبوع الجديد)
        const result = getWeekBoundsForDate(new Date('2024-01-07T22:30:00Z'));
        expect(result.weekKey).toBe('2024-W02');
        expect(result.startsAt.toISOString()).toBe('2024-01-07T21:00:00.000Z');
        expect(result.endsAt.toISOString()).toBe('2024-01-14T20:59:59.999Z');
    });

    test('لحظة واحدة قبل بداية الأسبوع تنتمي للأسبوع السابق (التعامل مع الأحد = اليوم 7)', () => {
        // ✅ 1ms قبل بداية الأسبوع بالحالة أعلاه بالضبط
        const result = getWeekBoundsForDate(new Date('2024-01-07T20:59:59.999Z'));
        expect(result.weekKey).toBe('2024-W01');
        expect(result.startsAt.toISOString()).toBe('2023-12-31T21:00:00.000Z');
        expect(result.endsAt.toISOString()).toBe('2024-01-07T20:59:59.999Z');
    });

    test('مدة كل أسبوع محسوبة دائماً = 7 أيام ناقص 1 ميلي ثانية بالضبط', () => {
        const dates = ['2024-01-10T12:00:00Z', '2025-06-15T03:00:00Z', '2026-12-31T23:59:00Z'];
        for (const d of dates) {
            const { startsAt, endsAt } = getWeekBoundsForDate(new Date(d));
            expect(endsAt.getTime() - startsAt.getTime()).toBe(7 * 86400000 - 1);
            expect(startsAt.getUTCHours()).toBe(21); // ✅ منتصف ليل دمشق = 21:00 UTC دائماً (UTC+3 ثابت)
        }
    });
});
