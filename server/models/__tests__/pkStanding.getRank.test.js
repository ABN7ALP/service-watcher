// ملف: pkStanding.getRank.test.js
// ✅ صحة rankBefore/rankAfter — getRank تحسب الرتبة كـ"عدد من يتفوّقون + 1" بنفس معيار كسر
// التعادل بكل مكان آخر بدوري PK: lp أكبر، أو نفس lp مع wins أكبر، أو نفس كليهما مع lastLpAt
// أسبق (من وصل أولاً يتصدّر). يُحاكى countDocuments (بلا قاعدة بيانات) ويُتحقَّق من شكل الفلتر
// المُمرَّر له فعلياً — إن انحرفت صياغة كسر التعادل بالكود سينكشف هنا فوراً

const PkStanding = require('../PkStanding');

describe('PkStanding.getRank', () => {
    afterEach(() => jest.restoreAllMocks());

    test('null لمعلومة ترتيب غير موجودة', async () => {
        const rank = await PkStanding.getRank('season_1', null);
        expect(rank).toBeNull();
    });

    test('الرتبة = عدد من يتفوّقون + 1', async () => {
        const countSpy = jest.spyOn(PkStanding, 'countDocuments').mockResolvedValue(4);
        const standing = { lp: 1000, wins: 5, lastLpAt: new Date('2026-01-01T00:00:00Z') };
        const rank = await PkStanding.getRank('season_1', standing);
        expect(rank).toBe(5);
        expect(countSpy).toHaveBeenCalledWith({
            season: 'season_1',
            $or: [
                { lp: { $gt: 1000 } },
                { lp: 1000, wins: { $gt: 5 } },
                { lp: 1000, wins: 5, lastLpAt: { $lt: standing.lastLpAt } }
            ]
        });
    });

    test('صفّ لا منافسين له أصلاً (أول دخول) يكون رتبته 1', async () => {
        jest.spyOn(PkStanding, 'countDocuments').mockResolvedValue(0);
        const rank = await PkStanding.getRank('season_1', { lp: 300, wins: 1, lastLpAt: new Date() });
        expect(rank).toBe(1);
    });

    test('lastLpAt غير محدَّد (null) يُستبدَل بتاريخ قديم جداً لكسر التعادل بأمان', async () => {
        const countSpy = jest.spyOn(PkStanding, 'countDocuments').mockResolvedValue(0);
        await PkStanding.getRank('season_1', { lp: 100, wins: 0, lastLpAt: null });
        const filter = countSpy.mock.calls[0][0];
        expect(filter.$or[2].lastLpAt.$lt.getTime()).toBe(new Date(0).getTime());
    });
});
