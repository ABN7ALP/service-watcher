// ملف: giftRedemptionController.race.test.js
// 🛡️ دفتر الأستاذ (feat/wallet-ledger-v1): redeemGifts (مسار 'coins') تقرأ walletBeansW/P
// الحيّة ثم تخصمها بالكامل وتُضيف المعادل كـcoins_bonus — طلبا استبدال متزامنان لنفس
// المستخدم يجب أن يُطبِّق أحدهما فقط فعلياً (لا قراءتان قديمتان متطابقتان تُنتجان ائتماناً
// مضاعَفاً). نفس قفل المستند الحقيقي + إعادة المحاولة عند تضارب كتابة (code 112) المُستخدَم
// بـwalletService.test.js/frameController.race.test.js — القفل التطبيقي البسيط بـ
// giftRedemptionController.test.js المجاور (withTransaction: fn => fn()) لا يكفي لإثبات هذا

const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');
const User = require('../../models/User');
const LedgerEntry = require('../../models/LedgerEntry');
const GiftRedemption = require('../../models/GiftRedemption');
const SystemSettings = require('../../models/SystemSettings');
const { redeemGifts } = require('../giftRedemptionController');

jest.mock('../../utils/botMessenger', () => ({ sendBotMessage: jest.fn().mockResolvedValue(undefined) }));

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.session = () => p;
    p.sort = () => p;
    p.lean = () => p;
    p.limit = () => p;
    return p;
}

function makeDb() {
    return { users: new Map(), ledgerByKey: new Map(), _locks: new Map() };
}
function seedUser(db, overrides) {
    const { walletBeansW = 0, walletBeansP = 0, ...rest } = overrides;
    const user = {
        _id: 'u1', coins: 0, balance: 0, level: 1,
        walletCoinsPaid: 0, walletCoinsBonus: 0, walletBeansW, walletBeansP, walletUsdCents: 0,
        socketId: null, ...rest
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
    jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({
        coinsPerUsd: 1000, payoutLaunchPct: 70, payoutLaunchEndsAt: new Date(Date.now() - 1000),
        payoutBasePct: 65, payoutHighPct: 70, highHostLevel: 30, beanHoldHours: 72
    });
    // ✅ مسار 'coins' لا يستعلم دفتر الأستاذ إطلاقاً (لا فترة انتظار على هذا المسار) — find
    // فقط لتفادي أي استدعاء غير متوقَّع لا يُستهلَك هنا
    jest.spyOn(LedgerEntry, 'find').mockImplementation(() => chainable([]));
    jest.spyOn(LedgerEntry, 'findOne').mockImplementation(() => chainable(null));
    jest.spyOn(LedgerEntry, 'create').mockImplementation((docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        return Promise.resolve(arr.map((d, i) => ({ ...d, _id: `ledger_${db.ledgerByKey.size + i}` })));
    });
    jest.spyOn(GiftRedemption, 'create').mockResolvedValue([{}]);

    jest.spyOn(User, 'findById').mockImplementation((id) => {
        const row = db.users.get(String(id));
        return chainable(row ? { ...row } : null);
    });
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
    return { user: { id: 'u1' }, body: { redeemTo: 'coins' }, app: { get: () => null }, ...overrides };
}

describe('redeemGifts (coins) — تضارب الكتابة الحقيقي يمنع ائتماناً مضاعَفاً', () => {
    afterEach(() => jest.restoreAllMocks());

    test('طلبا استبدال متزامنان لنفس المستخدم: الخصم والإيداع يحدثان مرة واحدة فقط بالضبط', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', walletBeansW: 500, walletBeansP: 0 });
        wireMocks(db);

        const req1 = mockReq();
        const res1 = mockRes();
        const req2 = mockReq();
        const res2 = mockRes();

        await Promise.all([redeemGifts(req1, res1), redeemGifts(req2, res2)]);

        const bodies = [res1.json.mock.calls[0][0], res2.json.mock.calls[0][0]];
        const successCount = bodies.filter(b => b.status === 'success').length;
        const failCount = bodies.filter(b => b.status === 'fail').length;

        // ✅ الثانية تجد البينز صفراً فعلياً (الأولى استهلكتها بالفعل) فتُرفَض بلا أي ائتمان إضافي
        expect(successCount).toBe(1);
        expect(failCount).toBe(1);
        expect(user.walletBeansW).toBe(0); // ✅ ليس سالباً
        expect(user.walletCoinsBonus).toBe(500); // ✅ ليس 1000 — ائتمان واحد فقط بالضبط
    });
});
