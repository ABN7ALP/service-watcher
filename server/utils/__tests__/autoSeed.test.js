// ملف: autoSeed.test.js
// 🛡️ مراجعة #157: seedGiftsIfMissing يجب أن تُدرج فقط الهدايا الناقصة فعلاً، بأسعار مقياس
// ما بعد ترحيل إعادة التسمية ×10 الحالي (لا المقياس القديم)، وألا تلمس سعر أي هدية موجودة
// أصلاً بأي حال — لو أدرجت هدية ناقصة بسعر قديم 10x أرخص بلا أي مسار يصحّحها لاحقاً (الترحيل
// يتخطّى كاملاً فور اكتماله مرّة واحدة)، تبقى أرخص من قيمتها الحقيقية إلى الأبد
const Gift = require('../../models/Gift');
const ProfileFrame = require('../../models/ProfileFrame');
const ChatBubbleSkin = require('../../models/ChatBubbleSkin');
const CosmeticItem = require('../../models/CosmeticItem');
const User = require('../../models/User');
const { seedGiftsIfMissing, seedFramesIfMissing, seedCosmeticItemsIfMissing, migrateDeleteAllChatBubbleSkins } = require('../autoSeed');

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

describe('seedCosmeticItemsIfMissing', () => {
    afterEach(() => jest.restoreAllMocks());

    test('تُدرج كل العناصر الناقصة (8 متجر + 2 ترحيب + 4 فقاعات نادي + 3 إعلانات نادي + 2 ثنائي = 19)', async () => {
        jest.spyOn(CosmeticItem, 'findOne').mockResolvedValue(null);
        const createSpy = jest.spyOn(CosmeticItem, 'create').mockResolvedValue({});

        await seedCosmeticItemsIfMissing();

        expect(createSpy).toHaveBeenCalledTimes(19);
        const byName = Object.fromEntries(createSpy.mock.calls.map(([it]) => [`${it.type}:${it.name}`, it]));
        // ✅ المتجر: مدتان بسعرين مستقلّين لكل فقاعة
        expect(byName['bubble:الذهب الملكي'].durations).toEqual([{ days: 7, price: 4200 }, { days: 30, price: 12000 }]);
        // ✅ النادي: بلا durations، مستوى حقيقي (لا يُشترى أبداً)
        expect(byName['bubble:أسطورة النادي'].fanClubTierLevel).toBe(17);
        expect(byName['bubble:أسطورة النادي'].durations).toEqual([]);
        // ✅ الثنائي: معرَّف لكن معطَّل (بانتظار نظام الحماة)
        expect(byName['bubble:الثنائي'].isActive).toBe(false);
        expect(byName['entrance:الثنائي'].isActive).toBe(false);
    });

    test('لا تلمس أي عنصر موجود أصلاً — لا CosmeticItem.create', async () => {
        jest.spyOn(CosmeticItem, 'findOne').mockResolvedValue({ _id: 'existing' });
        const createSpy = jest.spyOn(CosmeticItem, 'create').mockResolvedValue({});

        await seedCosmeticItemsIfMissing();

        expect(createSpy).not.toHaveBeenCalled();
    });
});

describe('migrateDeleteAllChatBubbleSkins', () => {
    afterEach(() => jest.restoreAllMocks());

    test('تحذف كل ChatBubbleSkin وتُنظِّف ownedBubbleSkins/activeBubbleSkinClass عبر collection الخام', async () => {
        jest.spyOn(ChatBubbleSkin, 'countDocuments').mockResolvedValue(4);
        const updateManySpy = jest.spyOn(User.collection, 'updateMany').mockResolvedValue({ modifiedCount: 7 });
        const deleteManySpy = jest.spyOn(ChatBubbleSkin, 'deleteMany').mockResolvedValue({});

        await migrateDeleteAllChatBubbleSkins();

        expect(updateManySpy).toHaveBeenCalledWith(
            expect.anything(),
            { $unset: { ownedBubbleSkins: '', activeBubbleSkinClass: '' } }
        );
        expect(deleteManySpy).toHaveBeenCalledWith({});
    });

    test('لا شيء للحذف — لا تلمس أي شيء (لا User.collection.updateMany)', async () => {
        jest.spyOn(ChatBubbleSkin, 'countDocuments').mockResolvedValue(0);
        const updateManySpy = jest.spyOn(User.collection, 'updateMany').mockResolvedValue({});

        await migrateDeleteAllChatBubbleSkins();

        expect(updateManySpy).not.toHaveBeenCalled();
    });
});
