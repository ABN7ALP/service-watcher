// ملف: coinPurchaseRoutes.adminAuth.test.js
// 🛡️ مراجعة أمنية (redteam-audit-1 — البند #12، Low): approve/reject بـ
// server/routes/coinPurchaseRoutes.js كانت محميتين فقط بفحص محلي (if(!req.user.isAdmin))
// داخل الكنترولر، بدل بوابة adminAuth المشتركة التي تمر منها كل مسارات الإدارة الأخرى بهذا
// المشروع. ليست ثغرة فعلية (الفحص المحلي كان يرفض صحيحاً) لكنها نمط غير متّسق ينكسر بصمت لو
// أُضيف مسار إداري جديد لهذا الملف بلا نسخ الفحص. الآن adminAuth نفسها مُطبَّقة على المسارين.
// يختبر هذا الملف تطبيقاً حقيقياً كاملاً (Express حقيقي + خادم HTTP حقيقي + fetch حقيقي —
// لا محاكاة req/res) يثبت أن توكن مستخدم عادي (غير أدمن) يُرفَض فعلياً بـ403 بواسطة adminAuth
// نفسها قبل أن يُنفَّذ الكنترولر إطلاقاً
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-coin-purchase-admin-auth';

jest.mock('../../controllers/coinPurchaseController', () => ({
    getPaymentInfo: (req, res) => res.json({ ok: true }),
    getMyPendingPurchases: (req, res) => res.json({ ok: true }),
    createPurchaseRequest: (req, res) => res.json({ ok: true }),
    buyWithBalance: (req, res) => res.json({ ok: true }),
    uploadReceipt: (req, res) => res.json({ ok: true }),
    approvePurchase: jest.fn((req, res) => res.json({ status: 'success', reachedController: true })),
    rejectPurchase: jest.fn((req, res) => res.json({ status: 'success', reachedController: true }))
}));

const coinPurchaseController = require('../../controllers/coinPurchaseController');
const User = require('../../models/User');
const coinPurchaseRoutes = require('../coinPurchaseRoutes');

function makeFakeUser(overrides) {
    return {
        _id: 'u1', isAdmin: false, isBanned: false, banExpires: null, passwordChangedAt: null,
        changedPasswordAfter() { return false; },
        ...overrides
    };
}
function signToken(userId) {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET);
}

describe('coinPurchaseRoutes /approve و/reject — بوابة adminAuth حقيقية (البند #12)', () => {
    let server, baseUrl;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/coin-purchase', coinPurchaseRoutes);
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });
    afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });
    afterEach(() => jest.restoreAllMocks());

    test('توكن مستخدم عادي (isAdmin:false): adminAuth ترفض بـ403 قبل الوصول للكنترولر إطلاقاً', async () => {
        const normalUser = makeFakeUser({ _id: 'u1', isAdmin: false });
        // ✅ authMiddleware (يُنفَّذ أولاً بهذا الملف) يستدعي findById؛ adminAuth (بعده مباشرة
        // على هذين المسارين فقط) تستدعي findOne بشرط isAdmin:true — لمستخدم عادي، findOne
        // تُحاكي سلوك Mongo الحقيقي: لا تُطابِق مستنداً بشرط isAdmin:true إطلاقاً
        jest.spyOn(User, 'findById').mockReturnValue({ select: () => Promise.resolve(normalUser) });
        jest.spyOn(User, 'findOne').mockImplementation((filter) => ({
            select: () => Promise.resolve(filter.isAdmin && !normalUser.isAdmin ? null : normalUser)
        }));

        const token = signToken('u1');
        const res = await fetch(`${baseUrl}/api/coin-purchase/p1/approve`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const body = await res.json();

        expect(res.status).toBe(403);
        expect(body.reachedController).toBeUndefined();
        expect(coinPurchaseController.approvePurchase).not.toHaveBeenCalled();
    });

    test('توكن أدمن حقيقي (isAdmin:true): adminAuth تقبل وتُمرِّر الطلب للكنترولر فعلياً', async () => {
        const adminUser = makeFakeUser({ _id: 'admin1', isAdmin: true });
        jest.spyOn(User, 'findById').mockReturnValue({ select: () => Promise.resolve(adminUser) });
        jest.spyOn(User, 'findOne').mockImplementation((filter) => ({
            select: () => Promise.resolve(filter.isAdmin ? adminUser : null)
        }));

        const token = signToken('admin1');
        const res = await fetch(`${baseUrl}/api/coin-purchase/p1/reject`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'test' })
        });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.reachedController).toBe(true);
        expect(coinPurchaseController.rejectPurchase).toHaveBeenCalled();
    });

    test('بلا أي توكن إطلاقاً: يُرفَض قبل الوصول للكنترولر', async () => {
        const res = await fetch(`${baseUrl}/api/coin-purchase/p1/approve`, { method: 'POST' });
        expect([401, 403]).toContain(res.status);
        expect(coinPurchaseController.approvePurchase).not.toHaveBeenCalled();
    });
});
