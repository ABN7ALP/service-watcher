// ملف: autoSeed.test.js
// 🛡️ مراجعة #157: seedGiftsIfMissing يجب أن تُدرج فقط الهدايا الناقصة فعلاً، بأسعار مقياس
// ما بعد ترحيل إعادة التسمية ×10 الحالي (لا المقياس القديم)، وألا تلمس سعر أي هدية موجودة
// أصلاً بأي حال — لو أدرجت هدية ناقصة بسعر قديم 10x أرخص بلا أي مسار يصحّحها لاحقاً (الترحيل
// يتخطّى كاملاً فور اكتماله مرّة واحدة)، تبقى أرخص من قيمتها الحقيقية إلى الأبد
const Gift = require('../../models/Gift');
const { seedGiftsIfMissing } = require('../autoSeed');

describe('seedGiftsIfMissing', () => {
    afterEach(() => jest.restoreAllMocks());

    test('تُدرج الهدايا الناقصة بأسعار مقياس ×10 الحالي، معلَّمة redenominatedV1:true', async () => {
        jest.spyOn(Gift, 'findOne').mockResolvedValue(null); // لا هدايا موجودة أصلاً
        const createSpy = jest.spyOn(Gift, 'create').mockResolvedValue({});

        await seedGiftsIfMissing();

        expect(createSpy).toHaveBeenCalledTimes(12);
        const byName = Object.fromEntries(createSpy.mock.calls.map(([g]) => [g.name, g]));
        // ✅ وردة=100 (لا 10 القديمة)، تنين=7000 (لا 700 القديمة) — كل الأسعار ×10 عن القائمة القديمة
        expect(byName['وردة'].price).toBe(100);
        expect(byName['تنين'].price).toBe(7000);
        for (const g of createSpy.mock.calls.map(([g]) => g)) {
            expect(g.redenominatedV1).toBe(true);
            expect(g.price).toBeGreaterThanOrEqual(100); // ✅ لا هدية بمقياس ما قبل الترحيل (كانت تبدأ من 10)
        }
    });

    test('لا تلمس أي هدية موجودة أصلاً — لا Gift.create ولا أي تحديث سعر', async () => {
        jest.spyOn(Gift, 'findOne').mockResolvedValue({ _id: 'existing', price: 999 }); // كل الهدايا "موجودة" بسعر مختلف تماماً
        const createSpy = jest.spyOn(Gift, 'create').mockResolvedValue({});
        const updateOneSpy = jest.spyOn(Gift, 'updateOne');
        const updateManySpy = jest.spyOn(Gift, 'updateMany');

        await seedGiftsIfMissing();

        expect(createSpy).not.toHaveBeenCalled();
        expect(updateOneSpy).not.toHaveBeenCalled();
        expect(updateManySpy).not.toHaveBeenCalled();
    });

    test('ناقصة جزئياً: تُدرج فقط الاسم الناقص، ولا تلمس البقية', async () => {
        jest.spyOn(Gift, 'findOne').mockImplementation(({ name }) =>
            Promise.resolve(name === 'وردة' ? null : { _id: 'existing' })
        );
        const createSpy = jest.spyOn(Gift, 'create').mockResolvedValue({});

        await seedGiftsIfMissing();

        expect(createSpy).toHaveBeenCalledTimes(1);
        expect(createSpy.mock.calls[0][0].name).toBe('وردة');
        expect(createSpy.mock.calls[0][0].price).toBe(100);
    });
});
