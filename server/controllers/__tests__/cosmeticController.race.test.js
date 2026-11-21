// ملف: cosmeticController.race.test.js
// 🛡️ بوابة الأمان القياسية لهذا المشروع (CLAUDE.md): كل مسار يُحرِّك كوينزات يحتاج اختبار
// سباق حقيقي يثبت إغلاقه — نفس نمط frameController.race.test.js بالضبط (مرجع صريح بتعليق
// cosmeticController.js). cosmeticController.purchase تقرأ المستخدم من جديد داخل جلستها
// الخاصة (لا قراءة مسبقة قبل المعاملة)، فتضارب كتابة حقيقي بين معاملتين متزامنتين تُكتشَف
// ذاتياً بمستوى محرّك قاعدة البيانات، وwithTransaction تُعيد المحاولة تلقائياً — هذا الاختبار
// يُحاكي تلك الآلية بالذات (قفل مستند حقيقي + إعادة محاولة عند تضارب)، لا مجرد شرط $gte بسيط

const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');
const User = require('../../models/User');
const CosmeticItem = require('../../models/CosmeticItem');
const LedgerEntry = require('../../models/LedgerEntry');
const cosmeticController = require('../cosmeticController');

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.session = () => p;
    return p;
}

function makeDb() {
    return { users: new Map(), ledgerByKey: new Map() };
}
function seedUser(db, overrides) {
    const { coins = 0, ...rest } = overrides;
    const user = {
        _id: 'u1', coins, ownedCosmetics: [],
        activeBubbleCosmetic: null, activeBubbleCosmeticClass: null, activeBubbleCosmeticExpiresAt: null,
        activeEntranceCosmetic: null, activeEntranceCosmeticClass: null, activeEntranceCosmeticExpiresAt: null,
        walletCoinsPaid: coins, walletCoinsBonus: 0, walletUsdCents: 0, walletBeansW: 0, walletBeansP: 0,
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
    db._locks = new Map();

    jest.spyOn(User, 'findById').mockImplementation((id) => {
        const row = db.users.get(String(id));
        if (!row) return chainable(null);
        const draft = {
            _id: row._id,
            coins: row.coins,
            walletCoinsPaid: row.walletCoinsPaid,
            walletCoinsBonus: row.walletCoinsBonus,
            ownedCosmetics: row.ownedCosmetics.map(o => ({ ...o })),
            activeBubbleCosmetic: row.activeBubbleCosmetic,
            activeBubbleCosmeticClass: row.activeBubbleCosmeticClass,
            activeBubbleCosmeticExpiresAt: row.activeBubbleCosmeticExpiresAt,
            activeEntranceCosmetic: row.activeEntranceCosmetic,
            activeEntranceCosmeticClass: row.activeEntranceCosmeticClass,
            activeEntranceCosmeticExpiresAt: row.activeEntranceCosmeticExpiresAt,
            save: async () => {
                acquireLock(db, row._id);
                recordUndo(db, row._id, { ...row });
                row.coins = draft.coins;
                row.ownedCosmetics = draft.ownedCosmetics;
                row.activeBubbleCosmetic = draft.activeBubbleCosmetic;
                row.activeBubbleCosmeticClass = draft.activeBubbleCosmeticClass;
                row.activeBubbleCosmeticExpiresAt = draft.activeBubbleCosmeticExpiresAt;
                row.activeEntranceCosmetic = draft.activeEntranceCosmetic;
                row.activeEntranceCosmeticClass = draft.activeEntranceCosmeticClass;
                row.activeEntranceCosmeticExpiresAt = draft.activeEntranceCosmeticExpiresAt;
            }
        };
        return chainable(draft);
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
    jest.spyOn(LedgerEntry, 'findOne').mockImplementation((filter) => {
        const row = db.ledgerByKey.get(filter.idempotencyKey);
        return chainable(row ? { ...row } : null);
    });
    jest.spyOn(LedgerEntry, 'create').mockImplementation((docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        const created = arr.map((d, i) => ({ ...d, _id: `ledger_${i}_${Date.now()}_${Math.random()}` }));
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
    return { user: { id: 'u1' }, body: {}, ...overrides };
}

describe('cosmeticController.purchase — تضارب الكتابة الحقيقي يمنع تكراراً مجانياً', () => {
    afterEach(() => jest.restoreAllMocks());

    test('رصيد يكفي شراءً واحداً بالضبط + 5 طلبات متزامنة لنفس العنصر: واحد فقط ينجح', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', coins: 4200 });
        jest.spyOn(CosmeticItem, 'findById').mockResolvedValue({
            _id: 'c1', name: 'الذهب الملكي', cssClass: 'bubble-gold', type: 'bubble', source: 'shop', isActive: true,
            durations: [{ days: 7, price: 4200 }, { days: 30, price: 12000 }]
        });
        wireMocks(db);

        const reqs = Array.from({ length: 5 }, () => mockReq({ body: { itemId: 'c1', days: '7' } }));
        const reses = Array.from({ length: 5 }, () => mockRes());

        await Promise.all(reqs.map((req, i) => cosmeticController.purchase(req, reses[i])));

        const bodies = reses.map(r => r.json.mock.calls[0][0]);
        const successCount = bodies.filter(b => b.status === 'success').length;
        const failCount = bodies.filter(b => b.status === 'fail').length;

        expect(successCount).toBe(1); // ✅ جوهر الإصلاح: ليس 5
        expect(failCount).toBe(4);
        expect(user.coins).toBe(0); // خصم مرة واحدة فقط
        expect(user.ownedCosmetics).toHaveLength(1); // ✅ ليس 5 — لا تكرار مجاني
    });

    test('مسار سعيد فردي: يخصم السعر، يضيف الملكية، ويُفعِّلها تلقائياً', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', coins: 12000 });
        jest.spyOn(CosmeticItem, 'findById').mockResolvedValue({
            _id: 'c1', name: 'المجرّة', cssClass: 'bubble-galaxy', type: 'bubble', source: 'shop', isActive: true,
            durations: [{ days: 7, price: 4200 }, { days: 30, price: 12000 }]
        });
        wireMocks(db);

        const req = mockReq({ body: { itemId: 'c1', days: '30' } });
        const res = mockRes();
        await cosmeticController.purchase(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
        expect(user.coins).toBe(0);
        expect(user.ownedCosmetics).toHaveLength(1);
        expect(user.activeBubbleCosmetic).toBe('c1');
        expect(user.activeBubbleCosmeticClass).toBe('bubble-galaxy');
    });

    test('رصيد غير كافٍ: لا خصم، لا ملكية جديدة', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', coins: 100 });
        jest.spyOn(CosmeticItem, 'findById').mockResolvedValue({
            _id: 'c1', name: 'الذهب الملكي', cssClass: 'bubble-gold', type: 'bubble', source: 'shop', isActive: true,
            durations: [{ days: 7, price: 4200 }, { days: 30, price: 12000 }]
        });
        wireMocks(db);

        const req = mockReq({ body: { itemId: 'c1', days: '7' } });
        const res = mockRes();
        await cosmeticController.purchase(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'fail', message: 'رصيد غير كافٍ' }));
        expect(user.coins).toBe(100);
        expect(user.ownedCosmetics).toHaveLength(0);
    });

    test('مدة غير موجودة بقائمة العنصر (التلاعب بقيمة days): 400 بلا أي خصم', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', coins: 100000 });
        jest.spyOn(CosmeticItem, 'findById').mockResolvedValue({
            _id: 'c1', name: 'الذهب الملكي', cssClass: 'bubble-gold', type: 'bubble', source: 'shop', isActive: true,
            durations: [{ days: 7, price: 4200 }, { days: 30, price: 12000 }]
        });
        wireMocks(db);

        const req = mockReq({ body: { itemId: 'c1', days: '1' } }); // ✅ يوم واحد غير معروض إطلاقاً
        const res = mockRes();
        await cosmeticController.purchase(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(user.coins).toBe(100000);
    });
});
