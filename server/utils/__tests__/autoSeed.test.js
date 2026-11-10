// ملف: autoSeed.test.js
// 🛡️ مراجعة #157: seedGiftsIfMissing يجب أن تُدرج فقط الهدايا الناقصة فعلاً، بأسعار مقياس
// ما بعد ترحيل إعادة التسمية ×10 الحالي (لا المقياس القديم)، وألا تلمس سعر أي هدية موجودة
// أصلاً بأي حال — لو أدرجت هدية ناقصة بسعر قديم 10x أرخص بلا أي مسار يصحّحها لاحقاً (الترحيل
// يتخطّى كاملاً فور اكتماله مرّة واحدة)، تبقى أرخص من قيمتها الحقيقية إلى الأبد
const Gift = require('../../models/Gift');
const ProfileFrame = require('../../models/ProfileFrame');
const ChatBubbleSkin = require('../../models/ChatBubbleSkin');
const { seedGiftsIfMissing, seedFramesIfMissing, seedBubbleSkinsIfMissing } = require('../autoSeed');

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

describe('seedFramesIfMissing', () => {
    afterEach(() => jest.restoreAllMocks());

    test('تُدرج الإطارات الناقصة بأسعار prices.day1/3/7 مقياس ×10 الحالي، معلَّمة redenominatedV1:true', async () => {
        jest.spyOn(ProfileFrame, 'findOne').mockResolvedValue(null);
        const createSpy = jest.spyOn(ProfileFrame, 'create').mockResolvedValue({});

        await seedFramesIfMissing();

        const byName = Object.fromEntries(createSpy.mock.calls.map(([f]) => [f.name, f]));
        // ✅ الحلقة الفضية: day7=400 (لا 40 القديمة)، إطار فارس بيغاسوس: day7=5000 (لا 500 القديمة)
        expect(byName['الحلقة الفضية'].prices).toEqual({ day1: 90, day3: 220, day7: 400 });
        expect(byName['إطار فارس بيغاسوس'].prices).toEqual({ day1: 1100, day3: 2750, day7: 5000 });
        // ✅ الإطارات المجانية (غير مباعة) تبقى صفراً حقيقياً — ليست "لم تُرحَّل"، صفر×10=صفر
        expect(byName['إطار الترحيب'].prices).toEqual({ day1: 0, day3: 0, day7: 0 });
        for (const f of createSpy.mock.calls.map(([f]) => f)) {
            expect(f.redenominatedV1).toBe(true);
        }
    });

    test('لا تلمس أي إطار موجود أصلاً — لا ProfileFrame.create ولا أي تحديث سعر', async () => {
        jest.spyOn(ProfileFrame, 'findOne').mockResolvedValue({ _id: 'existing', prices: { day1: 1, day3: 2, day7: 3 } });
        const createSpy = jest.spyOn(ProfileFrame, 'create').mockResolvedValue({});
        const updateOneSpy = jest.spyOn(ProfileFrame, 'updateOne');
        const updateManySpy = jest.spyOn(ProfileFrame, 'updateMany');

        await seedFramesIfMissing();

        expect(createSpy).not.toHaveBeenCalled();
        expect(updateOneSpy).not.toHaveBeenCalled();
        expect(updateManySpy).not.toHaveBeenCalled();
    });
});

describe('seedBubbleSkinsIfMissing', () => {
    afterEach(() => jest.restoreAllMocks());

    test('تُدرج الفقاعات الناقصة بأسعار مقياس ×10 الحالي، معلَّمة redenominatedV1:true', async () => {
        jest.spyOn(ChatBubbleSkin, 'findOne').mockResolvedValue(null);
        const createSpy = jest.spyOn(ChatBubbleSkin, 'create').mockResolvedValue({});

        await seedBubbleSkinsIfMissing();

        expect(createSpy).toHaveBeenCalledTimes(4);
        const byName = Object.fromEntries(createSpy.mock.calls.map(([s]) => [s.name, s]));
        // ✅ فقاعة ليلية=400 (لا 40 القديمة)، فقاعة ملكية=1200 (لا 120 القديمة)
        expect(byName['فقاعة ليلية'].price).toBe(400);
        expect(byName['فقاعة ملكية'].price).toBe(1200);
        for (const s of createSpy.mock.calls.map(([s]) => s)) {
            expect(s.redenominatedV1).toBe(true);
        }
    });

    test('لا تلمس أي فقاعة موجودة أصلاً — لا ChatBubbleSkin.create', async () => {
        jest.spyOn(ChatBubbleSkin, 'findOne').mockResolvedValue({ _id: 'existing', price: 999 });
        const createSpy = jest.spyOn(ChatBubbleSkin, 'create').mockResolvedValue({});

        await seedBubbleSkinsIfMissing();

        expect(createSpy).not.toHaveBeenCalled();
    });
});
