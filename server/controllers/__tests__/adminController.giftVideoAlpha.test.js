// ملف: adminController.giftVideoAlpha.test.js
// ✅ feat/gift-alpha-video: ثلاث طبقات تحقّق لحقل Gift.videoAlpha —
// (1) مستوى المخطط مباشرة (validateSync بلا أي اتصال قاعدة بيانات، افتراضي 'luma' + رفض أي
//     قيمة خارج enum)، (2) saveGift يمرّر الحقل فعلياً لتحديث المستند الحقيقي (موك على
//     Gift.findByIdAndUpdate فقط، نفس أسلوب giftController.shopEtag.test.js المجاور)،
// (3) مسار POST /api/admin/gifts الحقيقي محمي بـadminAuth فعلاً — توكن غير أدمن يُرفَض 403
//     قبل الوصول لـsaveGift إطلاقاً (نفس أسلوب frameController.adminStudio.test.js المجاور)
jest.useFakeTimers();

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-gift-video-alpha';

const Gift = require('../../models/Gift');
const AdminLog = require('../../models/AdminLog');
const adminController = require('../adminController');

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe('Gift.videoAlpha — مخطط Mongoose مباشرة (بلا قاعدة بيانات)', () => {
    const MIN_VALID = { name: 'تنين', imageUrl: 'https://x/d.png', price: 100, category: 'legendary' };

    test('الافتراضي "luma" حين لا يُحدَّد الحقل إطلاقاً', () => {
        const g = new Gift(MIN_VALID);
        expect(g.videoAlpha).toBe('luma');
        expect(g.validateSync()).toBeUndefined();
    });

    test('"stacked" قيمة صالحة تمر التحقّق بلا خطأ', () => {
        const g = new Gift({ ...MIN_VALID, videoAlpha: 'stacked' });
        expect(g.videoAlpha).toBe('stacked');
        expect(g.validateSync()).toBeUndefined();
    });

    test('قيمة خارج enum (مثلاً "chroma") تُرفَض بخطأ تحقّق على حقل videoAlpha تحديداً', () => {
        const g = new Gift({ ...MIN_VALID, videoAlpha: 'chroma' });
        const err = g.validateSync();
        expect(err).toBeDefined();
        expect(err.errors.videoAlpha).toBeDefined();
    });
});

describe('saveGift — يمرّر videoAlpha فعلياً لتحديث مستند الهدية الحقيقي', () => {
    afterEach(() => jest.restoreAllMocks());

    test('PUT بحقل videoAlpha:"stacked" يصل Gift.findByIdAndUpdate كما هو', async () => {
        const updateSpy = jest.spyOn(Gift, 'findByIdAndUpdate').mockResolvedValue({ _id: 'g1', videoAlpha: 'stacked' });
        jest.spyOn(AdminLog, 'create').mockResolvedValue({});
        const req = {
            body: { name: 'تنين', imageUrl: 'https://x/d.png', price: 100, videoAlpha: 'stacked' },
            params: { giftId: 'g1' },
            admin: { _id: 'admin1' },
            ip: '127.0.0.1',
            app: { get: () => null }
        };
        await adminController.saveGift(req, mockRes());
        expect(updateSpy).toHaveBeenCalledWith('g1', expect.objectContaining({ videoAlpha: 'stacked' }), expect.anything());
    });
});

describe('POST /api/admin/gifts — محمي فعلاً بـadminAuth (توكن غير أدمن يُرفَض قبل saveGift)', () => {
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

    test('مستخدم عادي (isAdmin:false): 403 قبل الوصول لـsaveGift إطلاقاً', async () => {
        jest.spyOn(User, 'findOne').mockReturnValue({ select: () => Promise.resolve(null) }); // ✅ شرط isAdmin:true لا يطابق مستخدماً عادياً
        const saveSpy = jest.spyOn(Gift, 'findByIdAndUpdate');
        const token = jwt.sign({ id: 'u1' }, process.env.JWT_SECRET);
        const res = await fetch(`${baseUrl}/api/admin/gifts`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'تنين', imageUrl: 'https://x/d.png', price: 100, videoAlpha: 'stacked' })
        });
        expect(res.status).toBe(403);
        expect(saveSpy).not.toHaveBeenCalled();
    });
});
