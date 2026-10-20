// ملف: frameController.adminStudio.test.js
// ✅ تحقّق خفيف (Verification LIGHT بطلب المستخدم) لاستوديو الإطارات بلوحة التحكم:
// - GET /api/frames/display عام بلا أي مصادقة، مُخزَّن بـETag (304 عند تطابق If-None-Match)،
//   يستثني أي إطار بلا assetUrl بعد (لم يُرفَع له أصل بعد).
// - adminCreateFrame: يرفض ملفاً مزوَّراً (توقيع بايتات حقيقي لا يطابق webp/gif/png — نفس
//   assertRealType المستخدمة أصلاً بكل رفوعات هذا المشروع)، ملفاً غائباً، اسماً مكرَّراً؛
//   وينجح فعلياً بأنبوب التطبيع/الفحص الحقيقي الكامل (normalizeOne + checkFrameFile — بلا
//   محاكاة لهما، فقط Cloudinary نفسها مُموَّهة لتفادي رفع شبكي حقيقي بالاختبار) مع صورة
//   اصطناعية صالحة (نفس تكوين الحالة الناجحة المُثبَتة أصلاً بـnormalize-frames.js --selftest).
// - adminDeleteFrame: حذف ناعم فعلي (isActive=false)، لا حذف حقيقي من القاعدة.
// - مسار /api/admin/frames محمي فعلاً بـadminAuth (توكن غير أدمن يُرفَض قبل الكونترولر).
// 🐛 jest.useFakeTimers() قبل أي require — frameController.js يستورد services/socketService.js
// (broadcastUserFrameChange) التي تحمل عدة setInterval حقيقية بمستوى الوحدة نفسها (تنظيف
// محدِّدات معدّل الهدايا/الغرف وغيرها) — بلا هذا، عامل Jest (worker) لا يخرج أبداً بعد انتهاء
// الاختبارات فعلياً (نفس السبب الموثَّق بملفات مجاورة كـgiftController.restAtomicity.test.js)
jest.useFakeTimers();

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-frame-studio';

jest.mock('../../utils/cloudinary', () => {
    const real = jest.requireActual('../../utils/cloudinary');
    return {
        ...real,
        uploadFrameAsset: jest.fn((filePath, publicId) =>
            Promise.resolve({ secure_url: `https://res.cloudinary.com/test/image/upload/v1/profile_frames/${publicId}.webp` })
        )
    };
});

const ProfileFrame = require('../../models/ProfileFrame');
const AdminLog = require('../../models/AdminLog');
const { uploadFrameAsset } = require('../../utils/cloudinary');
const frameController = require('../frameController');

// ✅ نفس تكوين الحالة الناجحة المُثبَتة أصلاً بـnormalize-frames.js --selftest بالضبط
// ("padded-small-opening": size=400, openingRadius=60, artRadius=80) — فتحة شفافة حقيقية +
// فنّ محدود بعيد عن الحافة، تمر بأنبوب التطبيع/الفحص الحقيقي الكامل بلا أي تعديل
async function buildValidFrameBuffer() {
    const size = 400;
    const baseSvg = `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="80" fill="rgba(212,175,55,1)"/></svg>`;
    const holeSvg = `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="60" fill="black"/></svg>`;
    const base = await sharp(Buffer.from(baseSvg)).png().toBuffer();
    const hole = await sharp(Buffer.from(holeSvg)).png().toBuffer();
    return sharp(base).composite([{ input: hole, blend: 'dest-out' }]).png().toBuffer();
}

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), end: jest.fn().mockReturnThis() };
}
function mockReq(overrides) {
    return { admin: { _id: 'admin1' }, params: {}, body: {}, headers: {}, ip: '127.0.0.1', app: { get: () => null }, ...overrides };
}

describe('getFrameDisplayConfig — عام، ETag، يستثني إطاراً بلا assetUrl', () => {
    afterEach(() => jest.restoreAllMocks());

    test('يُعيد فقط الإطارات التي لها assetUrl فعلياً، مع رياضيات العرض الخمس كاملة', async () => {
        jest.spyOn(ProfileFrame, 'find').mockReturnValue({
            select: () => ({
                lean: () => Promise.resolve([
                    { cssClass: 'profile-frame-a', assetUrl: '/a.webp', staticUrl: '/a-static.webp', display: { frameScale: 1.5, avatarScale: 0.7, offsetX: 0.01, offsetY: -0.01, crownTop: 0.42 } },
                    { cssClass: 'profile-frame-b', assetUrl: null, staticUrl: null, display: {} } // ✅ بلا أصل مرفوع بعد — يجب استثناؤه
                ])
            })
        });
        const req = mockReq();
        const res = mockRes();
        await frameController.getFrameDisplayConfig(req, res);

        const body = res.json.mock.calls[0][0];
        expect(Object.keys(body.frames)).toEqual(['profile-frame-a']);
        expect(body.frames['profile-frame-a']).toMatchObject({
            assetUrl: '/a.webp', staticUrl: '/a-static.webp', frameScale: 1.5, avatarScale: 0.7, offsetX: 0.01, offsetY: -0.01, crownTop: 0.42
        });
        expect(body._default).toBeDefined();
        expect(res.set).toHaveBeenCalledWith('ETag', expect.any(String));
    });

    test('If-None-Match مطابق تماماً: 304 بلا أي جسم استجابة', async () => {
        jest.spyOn(ProfileFrame, 'find').mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
        const res1 = mockRes();
        await frameController.getFrameDisplayConfig(mockReq(), res1);
        const etag = res1.set.mock.calls.find(c => c[0] === 'ETag')[1];

        jest.spyOn(ProfileFrame, 'find').mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
        const res2 = mockRes();
        await frameController.getFrameDisplayConfig(mockReq({ headers: { 'if-none-match': etag } }), res2);

        expect(res2.status).toHaveBeenCalledWith(304);
        expect(res2.json).not.toHaveBeenCalled();
    });
});

describe('adminCreateFrame — تحقّق + أنبوب تطبيع/فحص حقيقي كامل', () => {
    afterEach(() => jest.restoreAllMocks());

    test('بلا ملف مرفوع: 400، لا إنشاء', async () => {
        const createSpy = jest.spyOn(ProfileFrame, 'create');
        const req = mockReq({ body: { name: 'تجريبي', day1: '10', day3: '20', day7: '30' } });
        const res = mockRes();
        await frameController.adminCreateFrame(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(createSpy).not.toHaveBeenCalled();
    });

    test('ملف مزوَّر (توقيع بايتات حقيقي غير مدعوم — نص عادي): 400 عبر assertRealType الحقيقية، لا إنشاء', async () => {
        const createSpy = jest.spyOn(ProfileFrame, 'create');
        const req = mockReq({
            file: { buffer: Buffer.from('this is not an image at all, plain text buffer') },
            body: { name: 'تجريبي', day1: '10', day3: '20', day7: '30' }
        });
        const res = mockRes();
        await frameController.adminCreateFrame(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(createSpy).not.toHaveBeenCalled();
    });

    test('ملف صالح فعلياً (أنبوب تطبيع/فحص حقيقي كامل، Cloudinary مُموَّهة فقط): 201، يُستدعى AdminLog وfames:updated', async () => {
        const buffer = await buildValidFrameBuffer();
        let createdDoc = null;
        jest.spyOn(ProfileFrame, 'create').mockImplementation(async (data) => {
            createdDoc = { _id: 'f1', ...data };
            return createdDoc;
        });
        jest.spyOn(AdminLog, 'logAction').mockResolvedValue({});
        const ioEmit = jest.fn();

        const req = mockReq({
            file: { buffer },
            body: { name: 'إطار تجريبي', day1: '10', day3: '20', day7: '30', adminOnly: 'false', isActive: 'true', frameScale: '1.5' },
            app: { get: () => ({ emit: ioEmit }) }
        });
        const res = mockRes();
        await frameController.adminCreateFrame(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(createdDoc).toMatchObject({ name: 'إطار تجريبي', prices: { day1: 10, day3: 20, day7: 30 } });
        expect(createdDoc.assetUrl).toMatch(/^https:\/\/res\.cloudinary\.com/);
        expect(createdDoc.staticUrl).toMatch(/-static\.webp$/);
        expect(createdDoc.display.frameScale).toBe(1.5);
        expect(uploadFrameAsset).toHaveBeenCalledTimes(2); // متحرك + ثابت
        expect(AdminLog.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'create_frame', targetEntity: 'frame' }));
        expect(ioEmit).toHaveBeenCalledWith('frames:updated', {});
    }, 20000);

    test('اسم مكرَّر (E11000 من Mongoose): 400 برسالة واضحة', async () => {
        const buffer = await buildValidFrameBuffer();
        jest.spyOn(AdminLog, 'logAction').mockResolvedValue({});
        jest.spyOn(ProfileFrame, 'create').mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));

        const req = mockReq({
            file: { buffer },
            body: { name: 'موجود مسبقاً', day1: '10', day3: '20', day7: '30' }
        });
        const res = mockRes();
        await frameController.adminCreateFrame(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    }, 20000);
});

describe('adminDeleteFrame — حذف ناعم فعلي (isActive=false)، لا حذف حقيقي', () => {
    afterEach(() => jest.restoreAllMocks());

    test('يُحدِّث isActive فقط، يُسجِّل AdminLog، لا يستدعي أي دالة حذف حقيقي من القاعدة', async () => {
        const findByIdAndUpdateSpy = jest.spyOn(ProfileFrame, 'findByIdAndUpdate')
            .mockResolvedValue({ _id: 'f1', name: 'إطار', isActive: false });
        const deleteSpy = jest.spyOn(ProfileFrame, 'findByIdAndDelete');
        jest.spyOn(AdminLog, 'logAction').mockResolvedValue({});

        const req = mockReq({ params: { frameId: 'f1' } });
        const res = mockRes();
        await frameController.adminDeleteFrame(req, res);

        expect(findByIdAndUpdateSpy).toHaveBeenCalledWith('f1', { isActive: false }, { new: true });
        expect(deleteSpy).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(AdminLog.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete_frame' }));
    });

    test('إطار غير موجود: 404', async () => {
        jest.spyOn(ProfileFrame, 'findByIdAndUpdate').mockResolvedValue(null);
        const req = mockReq({ params: { frameId: 'missing' } });
        const res = mockRes();
        await frameController.adminDeleteFrame(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe('مسارات حقيقية — GET /api/frames/display عام، POST /api/admin/frames محمي بـadminAuth', () => {
    let server, baseUrl;

    beforeAll(async () => {
        jest.spyOn(ProfileFrame, 'find').mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
        const app = express();
        app.use(express.json());
        app.use('/api/frames', require('../../routes/frameRoutes'));
        app.get('/api/admin-test-frames', (req, res) => res.json({ reached: true })); // placeholder not used
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });
    afterAll(async () => { await new Promise((resolve) => server.close(resolve)); jest.restoreAllMocks(); });

    test('GET /api/frames/display بلا أي رأس Authorization إطلاقاً: 200 فعلياً (عام حقيقياً)', async () => {
        const res = await fetch(`${baseUrl}/api/frames/display`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.frames).toEqual({});
    });
});

describe('POST /api/admin/frames — توكن غير أدمن يُرفَض بـadminAuth قبل الكونترولر', () => {
    let server, baseUrl;
    const User = require('../../models/User');

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/admin', require('../../routes/admin'));
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });
    afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });
    afterEach(() => jest.restoreAllMocks());

    test('مستخدم عادي (isAdmin:false): 403 قبل الوصول لـadminCreateFrame إطلاقاً', async () => {
        jest.spyOn(User, 'findOne').mockReturnValue({ select: () => Promise.resolve(null) }); // ✅ شرط isAdmin:true بالاستعلام لا يطابق مستخدماً عادياً فعلياً
        const token = jwt.sign({ id: 'u1' }, process.env.JWT_SECRET);
        const res = await fetch(`${baseUrl}/api/admin/frames`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });
        expect(res.status).toBe(403);
    });
});
