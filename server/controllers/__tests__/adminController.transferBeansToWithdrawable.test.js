// ملف: adminController.transferBeansToWithdrawable.test.js
// 🛡️ مراجعة ما قبل الدمج v2 (البند 2): "تحويل ألماس إلى قابل للسحب" — تحويل إداري يدوي
// موثَّق من beans_p (ترويجي، لا يصل للدولار أبداً) إلى beans_w (قابل للسحب نقداً)، لحالات
// فردية مستقبلية بعد بداية الترحيل النظيفة. حجز ذرّي عبر walletService.post (شرط $gte داخل
// معاملة Mongo حقيقية — نفس قفل المستند الحقيقي + إعادة المحاولة عند تضارب كتابة (code 112)
// المُستخدَم بـwalletService.test.js/adminController.moneyRaceAtomicity.test.js المجاور)،
// قيدا دفتر أستاذ 'adjustment' حقيقيان، وAdminLog موثَّق

jest.mock('../../utils/botMessenger', () => ({ sendBotMessage: jest.fn().mockResolvedValue(null) }));

const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');
const User = require('../../models/User');
const AdminLog = require('../../models/AdminLog');
const LedgerEntry = require('../../models/LedgerEntry');
const adminController = require('../adminController');

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.session = () => p;
    return p;
}

function makeDb() {
    return { users: new Map(), ledgerByKey: new Map(), _locks: new Map() };
}
function seedUser(db, overrides) {
    const user = {
        _id: 'u_default', walletBeansP: 0, walletBeansW: 0, walletCoinsPaid: 0, walletCoinsBonus: 0, walletUsdCents: 0,
        coins: 0, balance: 0, socketId: null, ...overrides
    };
    db.users.set(user._id, user);
    return user;
}

const txContext = new AsyncLocalStorage();
function recordUndo(db, key, beforeValue) {
    const ctx = txContext.getStore();
    if (ctx) ctx.undo.push({ db, key, before: beforeValue });
}
function acquireLock(db, docId) {
    const ctx = txContext.getStore();
    if (!ctx) return;
    const holder = db._locks.get(docId);
    if (holder && holder !== ctx) throw Object.assign(new Error('Write conflict'), { code: 112 });
    if (!holder) { db._locks.set(docId, ctx); ctx.locks.push({ db, docId }); }
}

function wireMocks(db) {
    jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return chainable(null);
        acquireLock(db, row._id);
        for (const [field, cond] of Object.entries(filter)) {
            if (field === '_id') continue;
            if (cond && typeof cond.$gte === 'number' && (row[field] || 0) < cond.$gte) return chainable(null);
        }
        recordUndo(db, row._id, { ...row });
        if (update.$inc) for (const k of Object.keys(update.$inc)) row[k] = (row[k] || 0) + update.$inc[k];
        if (update.$set) Object.assign(row, update.$set);
        return chainable({ ...row });
    });
    jest.spyOn(User, 'updateOne').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return chainable({ matchedCount: 0 });
        acquireLock(db, row._id);
        recordUndo(db, row._id, { ...row });
        if (update.$set) Object.assign(row, update.$set);
        return chainable({ matchedCount: 1 });
    });
    jest.spyOn(User, 'findById').mockImplementation((id) => chainable(db.users.get(String(id)) || null));

    jest.spyOn(LedgerEntry, 'findOne').mockImplementation((filter) => chainable(db.ledgerByKey.get(filter.idempotencyKey) || null));
    jest.spyOn(LedgerEntry, 'create').mockImplementation((docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        const created = arr.map((d, i) => ({ ...d, _id: `ledger_${db.ledgerByKey.size + i}` }));
        created.forEach(c => db.ledgerByKey.set(c.idempotencyKey, c));
        return Promise.resolve(created);
    });

    jest.spyOn(AdminLog, 'logAction').mockResolvedValue({});

    jest.spyOn(mongoose, 'startSession').mockImplementation(async () => ({
        withTransaction: async (fn) => {
            for (let attempt = 0; attempt < 20; attempt++) {
                const ctx = { undo: [], locks: [] };
                try {
                    const result = await txContext.run(ctx, fn);
                    ctx.locks.forEach(({ db: d, docId }) => d._locks.delete(docId));
                    return result;
                } catch (error) {
                    for (let i = ctx.undo.length - 1; i >= 0; i--) {
                        const { db: d, key, before } = ctx.undo[i];
                        Object.assign(d.users.get(key), before);
                    }
                    ctx.locks.forEach(({ db: d, docId }) => d._locks.delete(docId));
                    if (error.code === 112) continue;
                    throw error;
                }
            }
            throw new Error('too many retries');
        },
        endSession: async () => {}
    }));
}

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
function mockReq(overrides) {
    return { admin: { _id: 'admin1' }, params: {}, body: {}, ip: '127.0.0.1', app: { get: () => null }, ...overrides };
}

describe('transferBeansToWithdrawable', () => {
    afterEach(() => jest.restoreAllMocks());

    test('مسار سعيد: beans_p تُخصَم وbeans_w تُضاف بنفس القيمة بالضبط، وAdminLog موثَّق', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', walletBeansP: 1000 });
        wireMocks(db);

        const req = mockReq({ params: { userId: 'u1' }, body: { amount: 300, reason: 'تسوية نزاع تجريبية' } });
        const res = mockRes();
        await adminController.transferBeansToWithdrawable(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(user.walletBeansP).toBe(700);
        expect(user.walletBeansW).toBe(300);
        expect(AdminLog.logAction).toHaveBeenCalledWith(expect.objectContaining({
            action: 'transfer_beans_to_withdrawable', targetUser: 'u1',
            details: expect.objectContaining({ amount: 300 })
        }));
    });

    test('رصيد beans_p غير كافٍ: فشل 400 واضح، بلا أي تغيير', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', walletBeansP: 100 });
        wireMocks(db);

        const req = mockReq({ params: { userId: 'u1' }, body: { amount: 300, reason: 'تسوية نزاع تجريبية' } });
        const res = mockRes();
        await adminController.transferBeansToWithdrawable(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(user.walletBeansP).toBe(100);
        expect(user.walletBeansW).toBe(0);
    });

    test('مستخدم غير موجود: 400 (walletService.post يُعامِل $gte غير المُطابَق كرصيد غير كافٍ — نفس سلوك adjustUserFunds المجاور تماماً، لا تمييز خاص هنا)', async () => {
        const db = makeDb();
        wireMocks(db);
        const req = mockReq({ params: { userId: 'ghost' }, body: { amount: 10, reason: 'سبب تجريبي كافٍ' } });
        const res = mockRes();
        await adminController.transferBeansToWithdrawable(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('سبب مفقود/قصير جداً: 400 بلا أي كتابة', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', walletBeansP: 1000 });
        wireMocks(db);
        const req = mockReq({ params: { userId: 'u1' }, body: { amount: 10, reason: 'ab' } });
        const res = mockRes();
        await adminController.transferBeansToWithdrawable(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(user.walletBeansP).toBe(1000);
    });

    test('كمية غير صالحة (صفر): 400 بلا أي كتابة', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', walletBeansP: 1000 });
        wireMocks(db);
        const req = mockReq({ params: { userId: 'u1' }, body: { amount: 0, reason: 'سبب صالح كافٍ' } });
        const res = mockRes();
        await adminController.transferBeansToWithdrawable(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(user.walletBeansP).toBe(1000);
    });

    test('طلبا تحويل متزامنان يتجاوز مجموعهما الرصيد المتاح: واحد فقط ينجح، beans_p لا يصبح سالباً', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', walletBeansP: 500 });
        wireMocks(db);

        const req1 = mockReq({ params: { userId: 'u1' }, body: { amount: 400, reason: 'طلب تحويل 1' } });
        const res1 = mockRes();
        const req2 = mockReq({ params: { userId: 'u1' }, body: { amount: 400, reason: 'طلب تحويل 2' } });
        const res2 = mockRes();

        await Promise.all([
            adminController.transferBeansToWithdrawable(req1, res1),
            adminController.transferBeansToWithdrawable(req2, res2)
        ]);

        const bodies = [res1.json.mock.calls[0]?.[0], res2.json.mock.calls[0]?.[0]];
        const successCount = bodies.filter(b => b && b.success === true).length;
        expect(successCount).toBe(1); // ✅ جوهر الإصلاح — ليس 2
        expect(user.walletBeansP).toBe(100); // 500 - 400 مرة واحدة فقط، ليس سالباً (500-800)
        expect(user.walletBeansP).toBeGreaterThanOrEqual(0);
        expect(user.walletBeansW).toBe(400);
    });
});
