// ملف: coinPurchaseController.raceAtomicity.test.js
// 🛡️ مراجعة أمنية (redteam-audit-1 — اكتُشفت أثناء إصلاح البند #12، نفس عائلة البند #6
// بالضبط لكن بملف فاتته الجولة الأولى): approvePurchase بمسار حيّ فعلياً
// (POST /api/coin-purchase/:purchaseId/approve) كانت تفحص purchase.status ثم تُعدِّل
// status وcoins.user بعمليتي save() منفصلتين تماماً بلا أي قفل — موافقتان متزامنتان على نفس
// الطلب تتجاوزان الفحص معاً بالاعتماد على نفس القراءة القديمة، فتُضاف الكوينز مرتين. الإصلاح:
// حجز ذرّي واحد (findOneAndUpdate بشرط status:'pending_review') + إيداع الكوينز بنفس المعاملة
// — نفس نمط adminController.approveCoinPurchase المُصلَح بالبند #6 حرفياً.
//
// نفس استراتيجية الاختبار الثابتة بهذا المشروع (jest.spyOn + محاكاة Map بذاكرة JS، لا قاعدة
// بيانات حقيقية) — راجع adminController.moneyRaceAtomicity.test.js المجاور لشرح تفصيلي
// لمنطق تتبّع التراجع (AsyncLocalStorage) الضروري هنا لأن الاختبار يُشغِّل معاملتين حقيقيتين
// بالتزامن (Promise.all) على نفس الحالة المشتركة
const mongoose = require('mongoose');
const User = require('../../models/User');
const CoinPurchase = require('../../models/CoinPurchase');
const coinPurchaseController = require('../coinPurchaseController');

function chainable(value) {
    return Promise.resolve(value);
}

function makeDb() {
    return { users: new Map(), purchases: new Map() };
}
function seedUser(db, overrides) {
    const user = { _id: 'u_default', coins: 0, socketId: null, ...overrides };
    db.users.set(user._id, user);
    return user;
}
function seedPurchase(db, overrides) {
    const p = { _id: 'cp_default', user: 'u_default', coinsAmount: 500, status: 'pending_review', ...overrides };
    db.purchases.set(p._id, p);
    return p;
}

function wireMocks(db) {
    const { AsyncLocalStorage } = require('async_hooks');
    const txContext = new AsyncLocalStorage();
    function recordUndo(map, key, beforeValue) {
        const ctx = txContext.getStore();
        if (ctx) ctx.undo.push({ map, key, before: beforeValue });
    }

    jest.spyOn(User, 'findByIdAndUpdate').mockImplementation((id, update) => {
        const row = db.users.get(String(id));
        if (!row) return chainable(null);
        recordUndo(db.users, row._id, { ...row });
        if (update.$inc) {
            for (const k of Object.keys(update.$inc)) row[k] = (row[k] || 0) + update.$inc[k];
        }
        return chainable({ ...row });
    });

    jest.spyOn(CoinPurchase, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.purchases.get(String(filter._id));
        if (!row) return chainable(null);
        if (filter.status) {
            const allowed = filter.status.$in ? filter.status.$in : [filter.status];
            if (!allowed.includes(row.status)) return chainable(null);
        }
        recordUndo(db.purchases, row._id, { ...row });
        if (update.$set) Object.assign(row, update.$set);
        return chainable({ ...row });
    });
    jest.spyOn(CoinPurchase, 'exists').mockImplementation((filter) => Promise.resolve(!!db.purchases.get(String(filter._id))));

    jest.spyOn(mongoose, 'startSession').mockImplementation(async () => ({
        withTransaction: async (fn) => {
            const ctx = { undo: [] };
            try {
                await txContext.run(ctx, fn);
            } catch (error) {
                for (let i = ctx.undo.length - 1; i >= 0; i--) {
                    const { map, key, before } = ctx.undo[i];
                    if (before === null) map.delete(key);
                    else map.set(key, before);
                }
                throw error;
            }
        },
        endSession: async () => {}
    }));
}

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
function mockReq(overrides) {
    return { admin: { _id: 'admin1' }, params: {}, body: {}, app: { get: () => ({ to: () => ({ emit: () => {} }) }) }, ...overrides };
}

describe('approvePurchase (POST /api/coin-purchase/:id/approve) — حجز ذرّي يمنع إيداعاً مزدوجاً', () => {
    afterEach(() => jest.restoreAllMocks());

    test('موافقتان متزامنتان على نفس طلب الشراء: واحدة فقط تنجح، الكوينز تُضاف مرة واحدة فقط', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', coins: 0 });
        seedPurchase(db, { _id: 'cp1', user: 'u1', coinsAmount: 1000, status: 'pending_review' });
        wireMocks(db);

        const req1 = mockReq({ params: { purchaseId: 'cp1' } });
        const res1 = mockRes();
        const req2 = mockReq({ params: { purchaseId: 'cp1' } });
        const res2 = mockRes();

        await Promise.all([
            coinPurchaseController.approvePurchase(req1, res1),
            coinPurchaseController.approvePurchase(req2, res2)
        ]);

        const bodies = [res1.json.mock.calls[0][0], res2.json.mock.calls[0][0]];
        const successCount = bodies.filter(b => b.status === 'success').length;
        const failCount = bodies.filter(b => b.status === 'fail').length;
        expect(successCount).toBe(1);
        expect(failCount).toBe(1);
        expect(user.coins).toBe(1000); // ✅ ليس 2000
    });

    test('مسار سعيد فردي: الكوينز تُضاف والحالة تصبح approved', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', coins: 100 });
        seedPurchase(db, { _id: 'cp1', user: 'u1', coinsAmount: 500, status: 'pending_review' });
        wireMocks(db);

        const req = mockReq({ params: { purchaseId: 'cp1' } });
        const res = mockRes();
        await coinPurchaseController.approvePurchase(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
        expect(user.coins).toBe(600);
        expect(db.purchases.get('cp1').status).toBe('approved');
    });
});

describe('rejectPurchase (POST /api/coin-purchase/:id/reject) — حجز ذرّي يمنع معالجة الرفض مرتين', () => {
    afterEach(() => jest.restoreAllMocks());

    test('رفضان متزامنان لنفس طلب الشراء: واحد فقط ينجح', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1' });
        seedPurchase(db, { _id: 'cp1', user: 'u1', status: 'pending_review' });
        wireMocks(db);

        const req1 = mockReq({ params: { purchaseId: 'cp1' }, body: { reason: 'r1' } });
        const res1 = mockRes();
        const req2 = mockReq({ params: { purchaseId: 'cp1' }, body: { reason: 'r2' } });
        const res2 = mockRes();

        await Promise.all([
            coinPurchaseController.rejectPurchase(req1, res1),
            coinPurchaseController.rejectPurchase(req2, res2)
        ]);

        const bodies = [res1.json.mock.calls[0][0], res2.json.mock.calls[0][0]];
        const successCount = bodies.filter(b => b.status === 'success').length;
        const failCount = bodies.filter(b => b.status === 'fail').length;
        expect(successCount).toBe(1);
        expect(failCount).toBe(1);
        expect(db.purchases.get('cp1').status).toBe('rejected');
    });
});
