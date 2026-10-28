// ملف: withdrawalController.createRace.test.js
// 🛡️ دفتر الأستاذ (feat/wallet-ledger-v1): createWithdrawal تحجز usd_cents عبر walletService
// ضمن معاملة Mongo حقيقية (لا مجرد شرط $gte بسيط) — يختبر أن طلبي سحب متزامنين يتجاوز
// مجموعهما الرصيد المتاح معاً: واحد فقط ينجح، الآخر "رصيد غير كافٍ"، ولا يصل الرصيد سالباً
// أبداً. نفس القفل الحقيقي لكل مستند + إعادة المحاولة التلقائية عند تضارب كتابة (code 112)
// المُستخدَم بـwalletService.test.js/frameController.race.test.js — ضروري هنا لأن
// walletService.post تقرأ idempotencyKey ثم تكتب: محاولتان متزامنتان على نفس المستند يجب أن
// تصطدما بتضارب كتابة حقيقي، لا تطبيقا الخصم معاً اعتماداً على قراءتين قديمتين متطابقتين

const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const Withdrawal = require('../../models/Withdrawal');
const LedgerEntry = require('../../models/LedgerEntry');
const SystemSettings = require('../../models/SystemSettings');
const withdrawalController = require('../withdrawalController');

// 🛡️ مراجعة الأمان v2 (البند 2): كل طلب سحب يتطلّب رمز السحب الآن، والمحفظة تُقرأ من
// payoutShamCashWallet المحفوظة لا من حقل حرّ بالطلب — هذا الهاش يُستخدم بكل مستخدمي الاختبار
const TEST_PIN = '1234';
const TEST_PIN_HASH = bcrypt.hashSync(TEST_PIN, 4);

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.session = () => p;
    p.sort = () => p;
    return p;
}

function makeDb() {
    return { users: new Map(), withdrawals: new Map(), ledgerByKey: new Map(), _locks: new Map() };
}
function seedUser(db, overrides) {
    const { balance = 0, ...rest } = overrides;
    const user = {
        _id: '507f191e810c19729de860ea', balance, walletUsdCents: Math.round(balance * 100),
        walletCoinsPaid: 0, walletCoinsBonus: 0, walletBeansW: 0, walletBeansP: 0,
        socketId: null,
        withdrawalPin: TEST_PIN_HASH, withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null,
        payoutShamCashWallet: 'wallet123', withdrawalBlockedUntil: null, payoutWalletChangedAt: null,
        ...rest
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
    jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ minWithdrawUSD: 5, maxDailyWithdrawalUSD: 500 });
    jest.spyOn(Withdrawal, 'aggregate').mockResolvedValue([]); // ✅ لا طلبات سابقة اليوم
    jest.spyOn(Withdrawal, 'create').mockImplementation((docs, opts) => {
        acquireLock(db, docs[0]._id ? String(docs[0]._id) : 'new-withdrawal-placeholder');
        const created = docs.map(d => ({ ...d }));
        created.forEach(d => db.withdrawals.set(String(d._id), d));
        return Promise.resolve(created);
    });

    jest.spyOn(User, 'findById').mockImplementation((id) => chainable(db.users.get(String(id)) || null));
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
    jest.spyOn(LedgerEntry, 'findOne').mockImplementation((filter) => chainable(db.ledgerByKey.get(filter.idempotencyKey) || null));
    jest.spyOn(LedgerEntry, 'create').mockImplementation((docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        const created = arr.map((d, i) => ({ ...d, _id: `ledger_${db.ledgerByKey.size + i}` }));
        created.forEach(c => db.ledgerByKey.set(c.idempotencyKey, c));
        return Promise.resolve(created);
    });

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
    return { user: { id: '507f191e810c19729de860ea' }, body: {}, app: { get: () => null }, ...overrides };
}

describe('createWithdrawal — تضارب الكتابة الحقيقي يمنع حجزاً مزدوجاً يتجاوز الرصيد', () => {
    afterEach(() => jest.restoreAllMocks());

    test('رصيد يكفي سحباً واحداً بالضبط + طلبا سحب متزامنان بنفس المبلغ: واحد فقط ينجح، الرصيد لا يصبح سالباً', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: '507f191e810c19729de860ea', balance: 10 });
        wireMocks(db);

        const body = { method: 'sham_cash', amount: '10', fullName: 'محمد علي', pin: TEST_PIN };
        const req1 = mockReq({ body });
        const res1 = mockRes();
        const req2 = mockReq({ body });
        const res2 = mockRes();

        await Promise.all([
            withdrawalController.createWithdrawal(req1, res1),
            withdrawalController.createWithdrawal(req2, res2)
        ]);

        const bodies = [res1.json.mock.calls[0][0], res2.json.mock.calls[0][0]];
        const successCount = bodies.filter(b => b.status === 'success').length;
        const failCount = bodies.filter(b => b.status === 'fail').length;

        expect(successCount).toBe(1); // ✅ جوهر الإصلاح: ليس 2
        expect(failCount).toBe(1);
        expect(user.walletUsdCents).toBe(0); // 1000 سنت - 1000 سنت مرة واحدة فقط
        expect(user.walletUsdCents).toBeGreaterThanOrEqual(0); // ✅ لا يصبح سالباً أبداً
        expect(db.withdrawals.size).toBe(1); // ✅ طلب سحب واحد فقط أُنشئ فعلياً
    });

    test('مسار سعيد فردي (بلا تزامن): الحجز والإنشاء ينجحان معاً', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: '507f191e810c19729de860ea', balance: 50 });
        wireMocks(db);

        const req = mockReq({ body: { method: 'sham_cash', amount: '20', fullName: 'محمد علي', pin: TEST_PIN } });
        const res = mockRes();
        await withdrawalController.createWithdrawal(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(user.walletUsdCents).toBe(3000); // 5000 - 2000
        expect(db.withdrawals.size).toBe(1);
    });
});
