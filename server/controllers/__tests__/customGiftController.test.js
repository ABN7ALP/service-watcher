// ملف: customGiftController.test.js
// 🛡️ هدايا v2 — المرحلة 4 ("صمّم هديتك"): يختبر (1) reserveGiftCombo's CustomGift fallback
// (الملكية + حالة "approved" فقط قابلة للإرسال — نفس استراتيجية giftController.comboHardening
// المجاورة: jest.spyOn على نماذج Mongoose الحقيقية بمحاكاة حالة بذاكرة JS)، و(2) controller
// الإنشاء/المراجعة مباشرة (مع mocks لـreq/res — لا طبقة Express/HTTP حقيقية)
jest.useFakeTimers();
jest.mock('../../utils/botMessenger', () => ({ sendBotMessage: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../fanClubController', () => ({ awardFanPoints: jest.fn() }));
jest.mock('../../utils/cloudinary', () => ({
    cloudinary: { uploader: { upload_stream: jest.fn() } },
    assertRealType: jest.fn(() => 'image/png'),
    deleteFromCloudinary: jest.fn().mockResolvedValue(undefined)
}));

const mongoose = require('mongoose');
const User = require('../../models/User');
const Gift = require('../../models/Gift');
const CustomGift = require('../../models/CustomGift');
const Transaction = require('../../models/Transaction');
const SystemSettings = require('../../models/SystemSettings');
const AdminLog = require('../../models/AdminLog');
const { cloudinary, deleteFromCloudinary } = require('../../utils/cloudinary');
const { reserveGiftCombo } = require('../giftController');
const customGiftController = require('../customGiftController');

function chainable(value) {
    const p = Promise.resolve(value);
    p.session = () => p;
    p.select = () => p;
    p.lean = () => p;
    p.populate = () => p;
    p.sort = () => p;
    p.limit = () => p;
    return p;
}

function makeFakeSession() {
    return { withTransaction: async (fn) => fn(), endSession: async () => {} };
}

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

// =====================================================
// reserveGiftCombo — فرع CustomGift (إرسال)
// =====================================================
describe('reserveGiftCombo — هدية مخصّصة (CustomGift fallback)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('هدية مخصّصة معتمدة (approved) يملكها المُرسِل: تُرسَل بسعر sendPrice المُجمَّد بالوثيقة', async () => {
        const sender = { _id: 's1', coins: 1000000, blockedUsers: [], isBot: false, username: 'S', profileImage: '', socketId: null };
        const receiver = { _id: 'r1', username: 'R', profileImage: '', socketId: null, blockedUsers: [], isBot: false };
        const customGift = { _id: 'cg1', owner: 's1', name: 'تصميمي', imageUrl: 'https://x/cg1.webp', status: 'approved', sendPrice: 250 };

        jest.spyOn(User, 'findById').mockImplementation((id) => chainable(id === 's1' ? sender : null));
        jest.spyOn(User, 'find').mockImplementation(() => chainable([receiver]));
        jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
            if (filter.coins.$gte > sender.coins) return Promise.resolve(null);
            sender.coins += update.$inc.coins;
            return Promise.resolve({ ...sender });
        });
        jest.spyOn(Gift, 'findById').mockImplementation(() => chainable(null)); // ✅ ليست هدية كتالوج عادية
        jest.spyOn(CustomGift, 'findById').mockImplementation((id) => chainable(id === 'cg1' ? customGift : null));
        jest.spyOn(require('../../models/GiftLog'), 'insertMany').mockResolvedValue([]);

        const session = makeFakeSession();
        const result = await reserveGiftCombo({
            session, senderId: 's1', giftId: 'cg1', quantity: 1, taps: 1, recipientIds: ['r1'], roomId: null
        });

        expect(result.gift.category).toBe('custom');
        expect(result.gift.imageUrl).toBe('https://x/cg1.webp');
        expect(result.totalCost).toBe(250); // sendPrice × 1 ضغطة × ×1 كمية × مستلم واحد
        expect(sender.coins).toBe(1000000 - 250);
    });

    test('هدية مخصّصة لا يملكها المُرسِل: تُرفَض (NO_GIFT) بلا أي خصم', async () => {
        const sender = { _id: 's1', coins: 1000000, blockedUsers: [], isBot: false };
        const customGift = { _id: 'cg1', owner: 'someoneElse', name: 'ليست لي', imageUrl: 'x', status: 'approved', sendPrice: 100 };

        jest.spyOn(User, 'findById').mockImplementation(() => chainable(sender));
        jest.spyOn(User, 'find').mockImplementation(() => chainable([{ _id: 'r1', blockedUsers: [], isBot: false }]));
        const updateSpy = jest.spyOn(User, 'findOneAndUpdate');
        jest.spyOn(Gift, 'findById').mockImplementation(() => chainable(null));
        jest.spyOn(CustomGift, 'findById').mockImplementation(() => chainable(customGift));

        const session = makeFakeSession();
        await expect(reserveGiftCombo({
            session, senderId: 's1', giftId: 'cg1', quantity: 1, taps: 1, recipientIds: ['r1'], roomId: null
        })).rejects.toMatchObject({ code: 'NO_GIFT' });
        expect(updateSpy).not.toHaveBeenCalled(); // ✅ لا خصم إطلاقاً قبل رفض الملكية
    });

    test('هدية مخصّصة ما زالت قيد المراجعة (pending): تُرفَض (NO_GIFT) حتى لو يملكها المُرسِل', async () => {
        const sender = { _id: 's1', coins: 1000000, blockedUsers: [], isBot: false };
        const customGift = { _id: 'cg1', owner: 's1', name: 'قيد المراجعة', imageUrl: 'x', status: 'pending', sendPrice: 100 };

        jest.spyOn(User, 'findById').mockImplementation(() => chainable(sender));
        jest.spyOn(User, 'find').mockImplementation(() => chainable([{ _id: 'r1', blockedUsers: [], isBot: false }]));
        jest.spyOn(Gift, 'findById').mockImplementation(() => chainable(null));
        jest.spyOn(CustomGift, 'findById').mockImplementation(() => chainable(customGift));

        const session = makeFakeSession();
        await expect(reserveGiftCombo({
            session, senderId: 's1', giftId: 'cg1', quantity: 1, taps: 1, recipientIds: ['r1'], roomId: null
        })).rejects.toMatchObject({ code: 'NO_GIFT' });
    });
});

// =====================================================
// createCustomGift — إنشاء هدية مخصّصة (الدفع + التحقق)
// =====================================================
describe('customGiftController.createCustomGift', () => {
    afterEach(() => jest.restoreAllMocks());

    function baseReq(overrides = {}) {
        return {
            user: { id: 'u1' },
            file: { buffer: Buffer.from('fake-image-bytes') },
            body: { name: 'هديتي' },
            ...overrides
        };
    }

    beforeEach(() => {
        // 🐛 jest.fn() من jest.mock (لا jest.spyOn) لا يُصفَّرها restoreAllMocks بـafterEach —
        // يبقى عدّاد الاستدعاءات متراكماً عبر اختبارات هذا الوصف دون هذا التصفير الصريح
        cloudinary.uploader.upload_stream.mockClear();
        cloudinary.uploader.upload_stream.mockImplementation((options, cb) => {
            const stream = { end: () => cb(null, { secure_url: 'https://cdn/img.webp', public_id: 'custom_gifts/u1_123' }) };
            return stream;
        });
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ customGiftDesignFeeCoins: 500, customGiftSendPriceCoins: 100 });
        jest.spyOn(mongoose, 'startSession').mockResolvedValue(makeFakeSession());
    });

    test('رصيد كافٍ + أقل من 3 معلّقة: يخصم 500 بالضبط وينشئ وثيقة pending', async () => {
        jest.spyOn(CustomGift, 'countDocuments').mockImplementation(() => chainable(0));
        const user = { _id: 'u1', coins: 1000 };
        jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
            if (filter.coins.$gte > user.coins) return Promise.resolve(null);
            user.coins += update.$inc.coins;
            return Promise.resolve({ ...user });
        });
        const createdDoc = { _id: 'cg_new', name: 'هديتي', status: 'pending' };
        jest.spyOn(CustomGift, 'create').mockResolvedValue([createdDoc]);
        jest.spyOn(Transaction, 'create').mockResolvedValue([{}]);

        const res = mockRes();
        await customGiftController.createCustomGift(baseReq(), res);

        expect(user.coins).toBe(500); // 1000 - 500 رسم التصميم بالضبط
        expect(res.status).toHaveBeenCalledWith(201);
        expect(deleteFromCloudinary).not.toHaveBeenCalled();
        const payload = res.json.mock.calls[0][0];
        expect(payload.status).toBe('success');
        expect(payload.data.customGift).toEqual(createdDoc);
    });

    test('رصيد غير كافٍ: يُرفَض 400 INSUFFICIENT، وتُحذَف صورة Cloudinary اليتيمة التي رُفعت فعلاً', async () => {
        jest.spyOn(CustomGift, 'countDocuments').mockImplementation(() => chainable(0));
        jest.spyOn(User, 'findOneAndUpdate').mockResolvedValue(null); // ✅ الشرط فشل دائماً هنا
        jest.spyOn(User, 'findById').mockImplementation(() => chainable({ coins: 10 }));
        const createSpy = jest.spyOn(CustomGift, 'create');

        const res = mockRes();
        await customGiftController.createCustomGift(baseReq(), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].code).toBe('INSUFFICIENT');
        expect(createSpy).not.toHaveBeenCalled();
        expect(deleteFromCloudinary).toHaveBeenCalledWith('custom_gifts/u1_123');
    });

    test('3 هدايا معلّقة بالفعل: يُرفَض 400 PENDING_LIMIT بلا أي خصم', async () => {
        jest.spyOn(CustomGift, 'countDocuments').mockImplementation(() => chainable(3));
        const updateSpy = jest.spyOn(User, 'findOneAndUpdate');

        const res = mockRes();
        await customGiftController.createCustomGift(baseReq(), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].code).toBe('PENDING_LIMIT');
        expect(updateSpy).not.toHaveBeenCalled();
        expect(deleteFromCloudinary).toHaveBeenCalled(); // ✅ الصورة رُفعت قبل الفحص — يجب تنظيفها أيضاً هنا
    });

    test('اسم أطول من 12 حرفاً: يُرفَض 400 قبل أي رفع صورة أو خصم', async () => {
        const res = mockRes();
        await customGiftController.createCustomGift(baseReq({ body: { name: 'اسم طويل جداً أكثر من 12 حرف' } }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
    });
});

// =====================================================
// adminReviewCustomGift — موافقة/رفض الإدارة
// =====================================================
describe('customGiftController.adminReviewCustomGift', () => {
    afterEach(() => jest.restoreAllMocks());

    function makeCustomGiftDoc(overrides = {}) {
        const doc = {
            _id: 'cg1', owner: 'u1', name: 'هدية', status: 'pending', createCost: 500,
            rejectReason: null, reviewedBy: null, reviewedAt: null,
            save: jest.fn().mockResolvedValue(undefined),
            ...overrides
        };
        return doc;
    }

    test('موافقة: الحالة تصبح approved، بلا أي استرداد كوينز', async () => {
        const doc = makeCustomGiftDoc();
        jest.spyOn(CustomGift, 'findById').mockResolvedValue(doc);
        const owner = { _id: 'u1', coins: 0, socketId: null };
        jest.spyOn(User, 'findById').mockResolvedValue(owner);
        const incSpy = jest.spyOn(User, 'findByIdAndUpdate');
        jest.spyOn(AdminLog, 'logAction').mockResolvedValue(undefined);

        const req = { params: { id: 'cg1' }, body: { action: 'approve' }, admin: { _id: 'admin1' }, ip: '1.2.3.4', app: { get: () => null } };
        const res = mockRes();
        await customGiftController.adminReviewCustomGift(req, res);

        expect(doc.status).toBe('approved');
        expect(incSpy).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('رفض: الحالة تصبح rejected، createCost يُرَد للمالك ذرّياً، وقيد Transaction يُسجَّل', async () => {
        const doc = makeCustomGiftDoc({ createCost: 500 });
        jest.spyOn(CustomGift, 'findById').mockResolvedValue(doc);
        const owner = { _id: 'u1', coins: 100, socketId: 'sock1' };
        jest.spyOn(User, 'findById').mockResolvedValue(owner);
        jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({ ...owner, coins: 600 });
        const txSpy = jest.spyOn(Transaction, 'create').mockResolvedValue({});
        jest.spyOn(AdminLog, 'logAction').mockResolvedValue(undefined);
        const emit = jest.fn();
        const io = { to: jest.fn(() => ({ emit })) };

        const req = { params: { id: 'cg1' }, body: { action: 'reject', reason: 'غير لائقة' }, admin: { _id: 'admin1' }, ip: '1.2.3.4', app: { get: () => io } };
        const res = mockRes();
        await customGiftController.adminReviewCustomGift(req, res);

        expect(doc.status).toBe('rejected');
        expect(doc.rejectReason).toBe('غير لائقة');
        expect(txSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'custom_gift_refund', amount: 500, user: 'u1' }));
        expect(io.to).toHaveBeenCalledWith('sock1');
        expect(emit).toHaveBeenCalledWith('coinsUpdated', { newCoins: 600 });
    });

    test('هدية غير معلّقة بالفعل (روجعت سابقاً): تُرفَض 400 بلا أي تغيير إضافي', async () => {
        const doc = makeCustomGiftDoc({ status: 'approved' });
        jest.spyOn(CustomGift, 'findById').mockResolvedValue(doc);

        const req = { params: { id: 'cg1' }, body: { action: 'approve' }, admin: { _id: 'admin1' }, ip: '1.2.3.4', app: { get: () => null } };
        const res = mockRes();
        await customGiftController.adminReviewCustomGift(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(doc.save).not.toHaveBeenCalled();
    });
});
