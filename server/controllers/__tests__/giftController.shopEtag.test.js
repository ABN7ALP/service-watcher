// ملف: giftController.shopEtag.test.js
// 🛡️ إصلاح جذري (الموثوقية والسرعة — السبب الجذري هـ): يختبر exports.getGiftShop مباشرة
// (req/res مُحاكاة — لا طبقة Express/HTTP حقيقية، نفس استراتيجية giftController.comboHardening
// المجاورة) للتأكد من: (1) أول نداء يُعيد 200 كاملاً + رأس ETag، (2) If-None-Match مطابق يُعيد
// 304 فعلياً بلا حتى استعلام me/customGifts (التحسين الأساسي المطلوب)، (3) If-None-Match غير
// مطابق (كتالوج تغيّر) يُعيد 200 كاملاً من جديد لا 304
jest.useFakeTimers();

const Gift = require('../../models/Gift');
const User = require('../../models/User');
const CustomGift = require('../../models/CustomGift');
const SystemSettings = require('../../models/SystemSettings');
const giftController = require('../giftController');

function chainable(value) {
    const p = Promise.resolve(value);
    p.sort = () => p;
    p.select = () => p;
    return p;
}

function mockRes() {
    const headers = {};
    return {
        _headers: headers,
        status: jest.fn().mockReturnThis(),
        set: jest.fn((key, value) => { headers[key] = value; return this; }),
        json: jest.fn().mockReturnThis(),
        end: jest.fn().mockReturnThis()
    };
}

const SETTINGS = { customGiftDesignFeeCoins: 500, customGiftSendPriceCoins: 100 };
const CATALOG = [
    { _id: 'g1', name: 'وردة', description: '', imageUrl: 'https://x/g1.webp', price: 10, discount: 0, discountedPrice: 10, category: 'common', animation: null, animationUrl: null, isFullscreen: false, sortOrder: 1 }
];

describe('getGiftShop — ETag/304 لكتالوج الهدايا', () => {
    afterEach(() => jest.restoreAllMocks());

    test('أول نداء (بلا If-None-Match): يُعيد 200 كاملاً (gifts+me+rules) ويضبط رأس ETag', async () => {
        jest.spyOn(Gift, 'find').mockImplementation(() => chainable(CATALOG));
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue(SETTINGS);
        jest.spyOn(User, 'findById').mockImplementation(() => chainable({ coins: 500, level: 1, experience: 0 }));
        jest.spyOn(CustomGift, 'find').mockImplementation(() => chainable([]));

        const req = { headers: {}, user: { id: 'u1' } };
        const res = mockRes();
        await giftController.getGiftShop(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalled();
        const body = res.json.mock.calls[0][0];
        expect(body.data.gifts.common).toHaveLength(1);
        expect(body.data.me.balance).toBe(500);
        expect(res._headers.ETag).toBeTruthy();
        // ✅ أول نداء كل جلسة يجب أن يبقى كاملاً حتى لو حمل العميل If-None-Match من جلسة سابقة —
        // يضمنها العميل (giftShopDataEtag لا يُملأ من localStorage)، لا هذا الـcontroller — هنا
        // فقط نتحقق أن النداء الأول فعلياً استعلم me/customGifts (لم يُقصَّر)
        expect(User.findById).toHaveBeenCalledTimes(1);
        expect(CustomGift.find).toHaveBeenCalledTimes(1);
    });

    test('If-None-Match مطابق تماماً لبصمة الكتالوج الحالية: 304 فوري بلا استعلام me/customGifts إطلاقاً', async () => {
        jest.spyOn(Gift, 'find').mockImplementation(() => chainable(CATALOG));
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue(SETTINGS);
        const userFindByIdSpy = jest.spyOn(User, 'findById').mockImplementation(() => chainable({ coins: 500, level: 1, experience: 0 }));
        const customGiftFindSpy = jest.spyOn(CustomGift, 'find').mockImplementation(() => chainable([]));

        // ✅ نداء أول لمعرفة البصمة الحقيقية المحسوبة فعلياً من نفس منطق الـcontroller (لا قيمة
        // مكتوبة يدوياً قد تنحرف عن خوارزمية الحساب الفعلية لو تغيّرت لاحقاً)
        const firstRes = mockRes();
        await giftController.getGiftShop({ headers: {}, user: { id: 'u1' } }, firstRes);
        const realEtag = firstRes._headers.ETag;
        userFindByIdSpy.mockClear();
        customGiftFindSpy.mockClear();

        const req = { headers: { 'if-none-match': realEtag }, user: { id: 'u1' } };
        const res = mockRes();
        await giftController.getGiftShop(req, res);

        expect(res.status).toHaveBeenCalledWith(304);
        expect(res.end).toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
        expect(User.findById).not.toHaveBeenCalled();
        expect(CustomGift.find).not.toHaveBeenCalled();
    });

    test('If-None-Match من كتالوج قديم مختلف (تغيّر فعلي): يُعيد 200 كاملاً من جديد لا 304', async () => {
        jest.spyOn(Gift, 'find').mockImplementation(() => chainable(CATALOG));
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue(SETTINGS);
        jest.spyOn(User, 'findById').mockImplementation(() => chainable({ coins: 500, level: 1, experience: 0 }));
        jest.spyOn(CustomGift, 'find').mockImplementation(() => chainable([]));

        const req = { headers: { 'if-none-match': '"stale-etag-from-before-admin-change"' }, user: { id: 'u1' } };
        const res = mockRes();
        await giftController.getGiftShop(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalled();
        expect(User.findById).toHaveBeenCalledTimes(1);
    });
});
