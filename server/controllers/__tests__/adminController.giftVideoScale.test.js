// ملف: adminController.giftVideoScale.test.js
// ✅ feat/room-notice-lanes-v2: تحقّق حقل Gift.videoScale (حجم عرض فيديو الهدية % من الشاشة) —
// (1) مستوى المخطط مباشرة (validateSync بلا اتصال قاعدة بيانات، افتراضي 150 — يُعيد الحجم
//     الموحَّد القديم لأي هدية لم يُحدَّد لها شيء صراحة — ورفض أي قيمة خارج 80-200)،
// (2) saveGift يمرّر الحقل فعلياً لتحديث المستند الحقيقي (موك على Gift.findByIdAndUpdate فقط،
//     نفس أسلوب adminController.giftVideoAlpha.test.js المجاور — الحماية بـadminAuth مُثبَتة
//     هناك عاماً لكل حقول الهدية، لا تكرار هنا لنفس الفحص العام)
const Gift = require('../../models/Gift');
const AdminLog = require('../../models/AdminLog');
const adminController = require('../adminController');

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe('Gift.videoScale — مخطط Mongoose مباشرة (بلا قاعدة بيانات)', () => {
    const MIN_VALID = { name: 'تنين', imageUrl: 'https://x/d.png', price: 100, category: 'legendary' };

    test('الافتراضي 150 حين لا يُحدَّد الحقل إطلاقاً (يُعيد الحجم القديم الموحَّد)', () => {
        const g = new Gift(MIN_VALID);
        expect(g.videoScale).toBe(150);
        expect(g.validateSync()).toBeUndefined();
    });

    test('قيمة داخل النطاق (130) تمر التحقّق بلا خطأ', () => {
        const g = new Gift({ ...MIN_VALID, videoScale: 130 });
        expect(g.videoScale).toBe(130);
        expect(g.validateSync()).toBeUndefined();
    });

    test('قيمة أقل من 80 تُرفَض بخطأ تحقّق على حقل videoScale تحديداً', () => {
        const g = new Gift({ ...MIN_VALID, videoScale: 50 });
        const err = g.validateSync();
        expect(err).toBeDefined();
        expect(err.errors.videoScale).toBeDefined();
    });

    test('قيمة أكبر من 200 تُرفَض بخطأ تحقّق على حقل videoScale تحديداً', () => {
        const g = new Gift({ ...MIN_VALID, videoScale: 250 });
        const err = g.validateSync();
        expect(err).toBeDefined();
        expect(err.errors.videoScale).toBeDefined();
    });
});

describe('saveGift — يمرّر videoScale فعلياً لتحديث مستند الهدية الحقيقي', () => {
    afterEach(() => jest.restoreAllMocks());

    test('PUT بحقل videoScale:130 يصل Gift.findByIdAndUpdate كما هو', async () => {
        const updateSpy = jest.spyOn(Gift, 'findByIdAndUpdate').mockResolvedValue({ _id: 'g1', videoScale: 130 });
        jest.spyOn(AdminLog, 'create').mockResolvedValue({});
        const req = {
            body: { name: 'تنين', imageUrl: 'https://x/d.png', price: 100, videoScale: 130 },
            params: { giftId: 'g1' },
            admin: { _id: 'admin1' },
            ip: '127.0.0.1',
            app: { get: () => null }
        };
        await adminController.saveGift(req, mockRes());
        expect(updateSpy).toHaveBeenCalledWith('g1', expect.objectContaining({ videoScale: 130 }), expect.anything());
    });
});
