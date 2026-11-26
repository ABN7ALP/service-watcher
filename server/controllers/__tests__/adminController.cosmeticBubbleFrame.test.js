// ملف: adminController.cosmeticBubbleFrame.test.js
// ✅ feat/bubble-frames: تحقّق حقلي CosmeticItem.frame/ornament (إطار border-image + زخرفة
// زاوية فوق فقاعة الدردشة) — (1) مستوى المخطط مباشرة (validateSync بلا اتصال قاعدة بيانات):
// غياب الإطار تماماً يبقى صالحاً (المسار الحالي CSS فقط بلا أي تغيير)، رفض أي رابط خارج أصل
// Cloudinary الخاص بنا/مسار محلي ثابت، رفض أي لون نص ليس hex سداسياً، رفض أي قيمة رقمية/enum
// خارج مداها؛ (2) saveCosmetic يمرّر frame/ornament فعلياً (موك على رفع Cloudinary + على
// CosmeticItem.findByIdAndUpdate، نفس أسلوب adminController.giftVideoScale.test.js المجاور)؛
// (3) getBubbleFrames (cosmeticController) يستبعد أي عنصر بلا frame.url فعلي — هذا هو ضمان
// "رجوع الفقاعة لمسارها الافتراضي عند غياب الإطار" من جهة الخادم (العميل لا يرى حتى شكل الحقل
// لصنف لم يُؤطَّر، فيستمر بمساره الحالي — راجع roomChatBubbleFrameConfigs.get بـapp.js)
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'dntlt5xry';

const CosmeticItem = require('../../models/CosmeticItem');
const AdminLog = require('../../models/AdminLog');
const adminController = require('../adminController');
const cosmeticController = require('../cosmeticController');

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

const MIN_BUBBLE = { type: 'bubble', name: 'فقاعة', cssClass: 'bubble-test', source: 'shop' };
const CLOUD_URL = 'https://res.cloudinary.com/dntlt5xry/image/upload/v1/cosmetic_bubble_assets/x.png';

describe('CosmeticItem.frame/ornament — مخطط Mongoose مباشرة (بلا قاعدة بيانات)', () => {
    test('غياب frame/ornament تماماً يبقى صالحاً (المسار الحالي CSS فقط بلا أي تغيير)', () => {
        const it = new CosmeticItem(MIN_BUBBLE);
        expect(it.frame).toBeUndefined();
        expect(it.ornament).toBeUndefined();
        expect(it.reserveTop).toBe(0);
        expect(it.validateSync()).toBeUndefined();
    });

    test('frame.url من Cloudinary الخاص بسحابتنا يمر التحقّق بلا خطأ', () => {
        const it = new CosmeticItem({ ...MIN_BUBBLE, frame: { url: CLOUD_URL } });
        expect(it.validateSync()).toBeUndefined();
    });

    test('frame.url كمسار محلي ثابت (يبدأ بـ"/" وحيدة) يمر التحقّق بلا خطأ', () => {
        const it = new CosmeticItem({ ...MIN_BUBBLE, frame: { url: '/cosmetic-assets/test-frame.png' } });
        expect(it.validateSync()).toBeUndefined();
    });

    test('frame.url من أصل خارجي غير مسموح يُرفَض بخطأ تحقّق على frame.url تحديداً', () => {
        const it = new CosmeticItem({ ...MIN_BUBBLE, frame: { url: 'https://evil-cdn.example.com/x.png' } });
        const err = it.validateSync();
        expect(err).toBeDefined();
        expect(err.errors['frame.url']).toBeDefined();
    });

    test('frame.url بمسار يحاول الهروب من public (..) يُرفَض', () => {
        const it = new CosmeticItem({ ...MIN_BUBBLE, frame: { url: '/../server/.env' } });
        const err = it.validateSync();
        expect(err).toBeDefined();
        expect(err.errors['frame.url']).toBeDefined();
    });

    test('frame.textColor غير hex سداسي (اسم لون) يُرفَض بخطأ تحقّق', () => {
        const it = new CosmeticItem({ ...MIN_BUBBLE, frame: { url: CLOUD_URL, textColor: 'gold' } });
        const err = it.validateSync();
        expect(err).toBeDefined();
        expect(err.errors['frame.textColor']).toBeDefined();
    });

    test('frame.textColor hex سداسي صالح يمر التحقّق', () => {
        const it = new CosmeticItem({ ...MIN_BUBBLE, frame: { url: CLOUD_URL, textColor: '#fde68a' } });
        expect(it.validateSync()).toBeUndefined();
    });

    test('frame.borderWidth أكبر من 60 يُرفَض بخطأ تحقّق', () => {
        const it = new CosmeticItem({ ...MIN_BUBBLE, frame: { url: CLOUD_URL, borderWidth: 70 } });
        const err = it.validateSync();
        expect(err).toBeDefined();
        expect(err.errors['frame.borderWidth']).toBeDefined();
    });

    test('frame.slice.top أكبر من 200 يُرفَض بخطأ تحقّق', () => {
        const it = new CosmeticItem({ ...MIN_BUBBLE, frame: { url: CLOUD_URL, slice: { top: 250 } } });
        const err = it.validateSync();
        expect(err).toBeDefined();
        expect(err.errors['frame.slice.top']).toBeDefined();
    });

    test('ornament.anchor بقيمة خارج enum يُرفَض بخطأ تحقّق', () => {
        const it = new CosmeticItem({ ...MIN_BUBBLE, ornament: { url: CLOUD_URL, anchor: 'bottom-start' } });
        const err = it.validateSync();
        expect(err).toBeDefined();
        expect(err.errors['ornament.anchor']).toBeDefined();
    });

    test('ornament.offsetX أكبر من 100 يُرفَض بخطأ تحقّق', () => {
        const it = new CosmeticItem({ ...MIN_BUBBLE, ornament: { url: CLOUD_URL, offsetX: 150 } });
        const err = it.validateSync();
        expect(err).toBeDefined();
        expect(err.errors['ornament.offsetX']).toBeDefined();
    });

    test('reserveTop أكبر من 60 يُرفَض بخطأ تحقّق', () => {
        const it = new CosmeticItem({ ...MIN_BUBBLE, reserveTop: 100 });
        const err = it.validateSync();
        expect(err).toBeDefined();
        expect(err.errors.reserveTop).toBeDefined();
    });

    test('مجموعة قيم "أول أصل" المطلوبة صراحةً بالمواصفات تمر التحقّق كاملة بلا خطأ', () => {
        const it = new CosmeticItem({
            ...MIN_BUBBLE,
            frame: { url: CLOUD_URL, slice: { top: 50, right: 50, bottom: 50, left: 50 }, borderWidth: 18, padY: 9, padX: 16, textColor: '#fde68a' },
            ornament: { url: CLOUD_URL, anchor: 'top-start', width: 38, height: 26, offsetX: -2, offsetY: -17 },
            reserveTop: 12
        });
        expect(it.validateSync()).toBeUndefined();
    });
});

describe('saveCosmetic — يمرّر frame/ornament فعلياً لتحديث مستند الفقاعة الحقيقي', () => {
    afterEach(() => jest.restoreAllMocks());

    test('PUT بحقلي frame/ornament (JSON مُسلسَلين، بلا ملفات) يصل CosmeticItem.findByIdAndUpdate كما هو', async () => {
        const updateSpy = jest.spyOn(CosmeticItem, 'findByIdAndUpdate').mockResolvedValue({ _id: 'c1' });
        jest.spyOn(AdminLog, 'create').mockResolvedValue({});
        const req = {
            body: {
                name: 'فقاعة', cssClass: 'bubble-test', type: 'bubble', source: 'shop',
                frame: JSON.stringify({ url: CLOUD_URL, borderWidth: 18 }),
                ornament: JSON.stringify({ url: CLOUD_URL, anchor: 'top-start' })
            },
            params: { itemId: 'c1' },
            admin: { _id: 'admin1' },
            ip: '127.0.0.1',
            app: { get: () => null }
        };
        await adminController.saveCosmetic(req, mockRes());
        expect(updateSpy).toHaveBeenCalledWith('c1', expect.objectContaining({
            frame: expect.objectContaining({ url: CLOUD_URL, borderWidth: 18 }),
            ornament: expect.objectContaining({ url: CLOUD_URL, anchor: 'top-start' })
        }), expect.anything());
    });

    test('رفع frameFile فعلياً يستبدل frame.url بالرابط الناتج من Cloudinary، بعد assertRealType', async () => {
        const updateSpy = jest.spyOn(CosmeticItem, 'findByIdAndUpdate').mockResolvedValue({ _id: 'c1' });
        jest.spyOn(AdminLog, 'create').mockResolvedValue({});
        const cloudinaryUtils = require('../../utils/cloudinary');
        jest.spyOn(cloudinaryUtils, 'uploadCosmeticAsset').mockResolvedValue({ secure_url: CLOUD_URL });
        // توقيع PNG حقيقي (8 بايتات) كي يمر assertRealType الحقيقي بلا موك له
        const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
        const req = {
            body: { name: 'فقاعة', cssClass: 'bubble-test', type: 'bubble', source: 'shop', frame: JSON.stringify({ borderWidth: 18 }) },
            params: { itemId: 'c1' },
            admin: { _id: 'admin1' },
            ip: '127.0.0.1',
            app: { get: () => null },
            files: { frameFile: [{ buffer: pngSignature }] }
        };
        await adminController.saveCosmetic(req, mockRes());
        expect(updateSpy).toHaveBeenCalledWith('c1', expect.objectContaining({
            frame: expect.objectContaining({ url: CLOUD_URL, borderWidth: 18 })
        }), expect.anything());
    });

    test('frame بلا url فعلي (لا ملف، لا رابط قائم) يُحذَف من itemData قبل الحفظ — لا كائن إطار فارغ', async () => {
        const updateSpy = jest.spyOn(CosmeticItem, 'findByIdAndUpdate').mockResolvedValue({ _id: 'c1' });
        jest.spyOn(AdminLog, 'create').mockResolvedValue({});
        const req = {
            body: { name: 'فقاعة', cssClass: 'bubble-test', type: 'bubble', source: 'shop', frame: JSON.stringify({ borderWidth: 18 }) },
            params: { itemId: 'c1' },
            admin: { _id: 'admin1' },
            ip: '127.0.0.1',
            app: { get: () => null }
        };
        await adminController.saveCosmetic(req, mockRes());
        const calledWith = updateSpy.mock.calls[0][1];
        expect(calledWith.frame).toBeUndefined();
    });
});

describe('getBubbleFrames — يستبعد أي عنصر بلا frame.url فعلي (ضمان الرجوع للمسار الافتراضي)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('العناصر بلا frame.url لا تُطلَب حتى من القاعدة (الفلتر بالاستعلام نفسه)', async () => {
        const findSpy = jest.spyOn(CosmeticItem, 'find').mockReturnValue({
            select: jest.fn().mockResolvedValue([
                { cssClass: 'bubble-gold', frame: { url: CLOUD_URL, borderWidth: 18 }, ornament: null, reserveTop: 12 }
            ])
        });
        const res = mockRes();
        await cosmeticController.getBubbleFrames({}, res);
        expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bubble', isActive: true, 'frame.url': { $exists: true, $ne: null }
        }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            status: 'success',
            data: { frames: { 'bubble-gold': { frame: { url: CLOUD_URL, borderWidth: 18 }, ornament: null, reserveTop: 12 } } }
        }));
    });
});
