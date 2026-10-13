// ملف: pkLeagueEngine.computeLp.test.js
// ✅ صيغة نقاط الدوري (LP) — دالة صِرفة بلا أي اعتماد على قاعدة بيانات: فوز/خسارة/تعادل +
// floor(الدعم الحقيقي ÷ المقسوم)، مع سقف أقصى لكل معركة

const { computeLp } = require('../pkLeagueEngine');

const settings = {
    pkWinLp: 300,
    pkLossLp: 50,
    pkDrawLp: 120,
    pkSupportLpDivisor: 100,
    pkLpCapPerBattle: 2000
};

describe('pkLeagueEngine.computeLp', () => {
    test('فوز بلا دعم = القاعدة فقط', () => {
        expect(computeLp('win', 0, settings)).toBe(300);
    });

    test('خسارة بلا دعم = القاعدة فقط', () => {
        expect(computeLp('loss', 0, settings)).toBe(50);
    });

    test('تعادل بلا دعم = القاعدة فقط', () => {
        expect(computeLp('draw', 0, settings)).toBe(120);
    });

    test('فوز بدعم 250 كوينز = 300 + floor(250/100)=2 → 302', () => {
        expect(computeLp('win', 250, settings)).toBe(302);
    });

    test('فوز بدعم 99 كوينز (أقل من المقسوم) = 300 + 0 → 300', () => {
        expect(computeLp('win', 99, settings)).toBe(300);
    });

    test('يُطبَّق السقف الأقصى لكل معركة حتى لو كان الدعم ضخماً جداً', () => {
        expect(computeLp('win', 1000000, settings)).toBe(2000);
    });

    test('دعم سلبي أو غير محدَّد (undefined) يُعامَل كصفر بلا رمي خطأ', () => {
        expect(computeLp('loss', undefined, settings)).toBe(50);
        expect(computeLp('loss', null, settings)).toBe(50);
    });
});
