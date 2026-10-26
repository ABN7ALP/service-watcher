// ملف: walletService.test.js
// 🛡️ walletService.post هي الدالة الوحيدة المخوَّلة بتغيير أي رصيد بالتطبيق (feat/wallet-ledger-v1).
// نفس استراتيجية الاختبار الثابتة بهذا المشروع (راجع adminController.moneyRaceAtomicity.test.js):
// jest.spyOn على نماذج Mongoose الحقيقية بمحاكاة حالة بذاكرة JS، findOneAndUpdate يُطبِّق الشرط
// والتعديل بشكل متزامن قبل أي await — يُحاكي الضمان الذري الحقيقي لـMongoDB بدقّة لمعاملتين
// متزامنتين (Promise.all). AsyncLocalStorage يتتبّع تراجع (undo) كل معاملة بمعزل عن الأخرى.

const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');
const User = require('../../models/User');
const LedgerEntry = require('../../models/LedgerEntry');
const walletService = require('../walletService');

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.session = () => p;
    return p;
}

function makeDb() {
    return { users: new Map(), ledger: new Map(), ledgerByKey: new Map() };
}
function seedUser(db, overrides) {
    const user = {
        _id: 'u1', walletCoinsPaid: 0, walletCoinsBonus: 0, walletBeansW: 0, walletBeansP: 0,
        walletUsdCents: 0, coins: 0, balance: 0, ...overrides
    };
    db.users.set(user._id, user);
    return user;
}

const txContext = new AsyncLocalStorage();
function recordUndo(db, kind, key, beforeValue) {
    const ctx = txContext.getStore();
    if (ctx) ctx.undo.push({ db, kind, key, before: beforeValue });
}

// 🛡️ قفل مستند حقيقي على مستوى المعاملة (لا مجرد شرط $gte): أول كتابة لمستند ضمن محاولة
// معاملة تحجزه؛ أي محاولة معاملة أخرى لا تزال "حيّة" (لم تلتزم/تتراجع بعد) تصطدم بتضارب كتابة
// (code 112) فوراً — تماماً كما يكتشف Mongo الحقيقي تضارباً بين معاملتين تكتبان لنفس المستند.
// withTransaction تُعيد تنفيذ الدالة بالكامل تلقائياً عند هذا التضارب (لا عند أي خطأ آخر) —
// ضروري هنا لأن walletService.post تقرأ idempotencyKey ثم تكتب للمستخدم: محاولتان متزامنتان
// بنفس المفتاح يجب أن تُعيد إحداهما قراءة idempotencyKey من جديد بعد أن تلتزم الأخرى، لا أن
// تُطبِّق كلتاهما الخصم اعتماداً على قراءتين قديمتين متطابقتين لحالة "لا يوجد بعد"
function acquireLock(db, docId) {
    const ctx = txContext.getStore();
    if (!ctx) return;
    const holder = db._locks.get(docId);
    if (holder && holder !== ctx) throw Object.assign(new Error('Write conflict'), { code: 112 });
    if (!holder) { db._locks.set(docId, ctx); ctx.locks.push({ db, docId }); }
}

function wireMocks(db) {
    db._locks = new Map();

    jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return chainable(null);
        acquireLock(db, row._id);
        for (const [field, cond] of Object.entries(filter)) {
            if (field === '_id') continue;
            if (cond && typeof cond.$gte === 'number' && (row[field] || 0) < cond.$gte) return chainable(null);
        }
        recordUndo(db, 'users', row._id, { ...row });
        if (update.$inc) for (const k of Object.keys(update.$inc)) row[k] = (row[k] || 0) + update.$inc[k];
        if (update.$set) Object.assign(row, update.$set);
        return chainable({ ...row });
    });
    jest.spyOn(User, 'updateOne').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return chainable({ matchedCount: 0 });
        acquireLock(db, row._id);
        recordUndo(db, 'users', row._id, { ...row });
        if (update.$set) Object.assign(row, update.$set);
        return chainable({ matchedCount: 1 });
    });
    jest.spyOn(User, 'findById').mockImplementation((id) => {
        const row = db.users.get(String(id));
        return chainable(row ? { ...row } : null);
    });

    jest.spyOn(LedgerEntry, 'findOne').mockImplementation((filter) => {
        const row = db.ledgerByKey.get(filter.idempotencyKey);
        return chainable(row ? { ...row } : null);
    });
    jest.spyOn(LedgerEntry, 'create').mockImplementation((docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        const created = arr.map((d, i) => ({ ...d, _id: `le_${db.ledger.size + i}` }));
        created.forEach(c => {
            recordUndo(db, 'ledgerByKey', c.idempotencyKey, null);
            db.ledger.set(c._id, c);
            db.ledgerByKey.set(c.idempotencyKey, c);
        });
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
                        const { db: d, kind, key, before } = ctx.undo[i];
                        const map = d[kind];
                        if (before === null) map.delete(key);
                        // ✅ تحوّل بالمكان (Object.assign على الكائن نفسه) لا استبدال مرجع الخريطة:
                        // الاختبارات تحتفظ بمرجع للكائن الأصلي (const sender = seedUser(...)) —
                        // map.set(key, before) كان يستبدل ما تُشير إليه الخريطة بكائن مختلف
                        // فيبقى مرجع الاختبار القديم يرى القيم المعدَّلة رغم "التراجع"
                        else Object.assign(map.get(key), before);
                    }
                    ctx.locks.forEach(({ db: d, docId }) => d._locks.delete(docId));
                    if (error.code === 112) continue; // ✅ تضارب كتابة حقيقي فقط يُعيد المحاولة
                    throw error;
                }
            }
            throw new Error('too many retries');
        },
        endSession: async () => {}
    }));
}

async function runInTransaction(fn) {
    const session = await mongoose.startSession();
    try {
        return await session.withTransaction(() => fn(session));
    } finally {
        await session.endSession();
    }
}

describe('walletService.post', () => {
    afterEach(() => jest.restoreAllMocks());

    test('قيد واحد ناجح: $inc يُطبَّق، balanceAfter صحيح، coins/balance القديمان يتزامنان', async () => {
        const db = makeDb();
        const user = seedUser(db, { walletCoinsPaid: 100 });
        wireMocks(db);

        const [entry] = await runInTransaction((session) =>
            walletService.post([{ user: 'u1', wallet: 'coins_paid', delta: -30, type: 'gift_send', idempotencyKey: 'k1' }], session)
        );

        expect(user.walletCoinsPaid).toBe(70);
        expect(entry.balanceAfter).toBe(70);
        expect(user.coins).toBe(70); // ✅ المرآة القديمة تزامنت تلقائياً
    });

    test('خصم يتجاوز الرصيد: يُرفَض بـINSUFFICIENT_FUNDS، لا تغيير على الرصيد إطلاقاً', async () => {
        const db = makeDb();
        const user = seedUser(db, { walletCoinsPaid: 10 });
        wireMocks(db);

        await expect(runInTransaction((session) =>
            walletService.post([{ user: 'u1', wallet: 'coins_paid', delta: -30, type: 'gift_send', idempotencyKey: 'k1' }], session)
        )).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

        expect(user.walletCoinsPaid).toBe(10); // ✅ بلا تغيير — المعاملة تراجعت بالكامل
        expect(db.ledger.size).toBe(0);
    });

    test('إعادة محاولة بنفس idempotencyKey (تسلسلياً): لا تُطبَّق مرتين، تُعاد نفس القيد', async () => {
        const db = makeDb();
        const user = seedUser(db, { walletCoinsPaid: 100 });
        wireMocks(db);

        const run = () => runInTransaction((session) =>
            walletService.post([{ user: 'u1', wallet: 'coins_paid', delta: -30, type: 'gift_send', idempotencyKey: 'dup-key' }], session)
        );
        const [first] = await run();
        const [second] = await run();

        expect(user.walletCoinsPaid).toBe(70); // ✅ خُصِم مرة واحدة فقط رغم استدعاءين
        expect(second._id).toBe(first._id);
        expect(db.ledger.size).toBe(1);
    });

    test('تسابق حقيقي: استدعاءان متزامنان بنفس idempotencyKey لا يُطبَّقان الخصم مرتين', async () => {
        const db = makeDb();
        const user = seedUser(db, { walletCoinsPaid: 100 });
        wireMocks(db);

        const call = () => runInTransaction((session) =>
            walletService.post([{ user: 'u1', wallet: 'coins_paid', delta: -30, type: 'gift_send', idempotencyKey: 'race-key' }], session)
        );
        await Promise.all([call(), call()]);

        expect(user.walletCoinsPaid).toBe(70); // ✅ ليس 40 — القيد الثاني وجد الأول ولم يُكرِّر الخصم
        expect(db.ledger.size).toBe(1);
    });

    test('تسابق حقيقي: خصمان متزامنان (مفاتيح مختلفة) مجموعهما يتجاوز الرصيد — واحد فقط ينجح، لا رصيد سالب', async () => {
        const db = makeDb();
        const user = seedUser(db, { walletCoinsPaid: 100 });
        wireMocks(db);

        const debit = (key) => runInTransaction((session) =>
            walletService.post([{ user: 'u1', wallet: 'coins_paid', delta: -70, type: 'gift_send', idempotencyKey: key }], session)
        ).then(() => 'ok').catch((e) => e.code || 'error');

        const [r1, r2] = await Promise.all([debit('a'), debit('b')]);
        const results = [r1, r2];
        expect(results.filter(r => r === 'ok').length).toBe(1);
        expect(results.filter(r => r === 'INSUFFICIENT_FUNDS').length).toBe(1);
        expect(user.walletCoinsPaid).toBe(30); // 100 - 70 مرة واحدة فقط
        expect(user.walletCoinsPaid).toBeGreaterThanOrEqual(0);
    });

    test('عدة قيود بنداء واحد تُطبَّق جميعها ذرّياً (مثال: إرسال هدية — خصم المرسل + إيداع المستلم)', async () => {
        const db = makeDb();
        const sender = seedUser(db, { _id: 'sender', walletCoinsPaid: 100 });
        const receiver = seedUser(db, { _id: 'receiver', walletBeansW: 0 });
        wireMocks(db);

        await runInTransaction((session) => walletService.post([
            { user: 'sender', wallet: 'coins_paid', delta: -50, type: 'gift_send', idempotencyKey: 'g1-send' },
            { user: 'receiver', wallet: 'beans_w', delta: 50, type: 'gift_receive', idempotencyKey: 'g1-recv' }
        ], session));

        expect(sender.walletCoinsPaid).toBe(50);
        expect(receiver.walletBeansW).toBe(50);
    });

    test('فشل القيد الثاني بمصفوفة واحدة يُسقِط القيد الأول أيضاً (ذرّية عبر المعاملة بأكملها)', async () => {
        const db = makeDb();
        const sender = seedUser(db, { _id: 'sender', walletCoinsPaid: 100 });
        seedUser(db, { _id: 'receiver', walletBeansW: 5 });
        wireMocks(db);

        await expect(runInTransaction((session) => walletService.post([
            { user: 'sender', wallet: 'coins_paid', delta: -50, type: 'gift_send', idempotencyKey: 'g2-send' },
            { user: 'nonexistent', wallet: 'beans_w', delta: 50, type: 'gift_receive', idempotencyKey: 'g2-recv' }
        ], session))).rejects.toBeTruthy();

        expect(sender.walletCoinsPaid).toBe(100); // ✅ تراجع كامل رغم نجاح القيد الأول مؤقتاً
    });

    test('يرفض entry بلا session، أو delta غير صحيح، أو محفظة غير معروفة', async () => {
        const db = makeDb();
        seedUser(db, {});
        wireMocks(db);
        const session = await mongoose.startSession();

        await expect(walletService.post([{ user: 'u1', wallet: 'coins_paid', delta: -1, type: 't', idempotencyKey: 'k' }], null))
            .rejects.toThrow('session');
        await expect(walletService.post([{ user: 'u1', wallet: 'coins_paid', delta: 1.5, type: 't', idempotencyKey: 'k' }], session))
            .rejects.toThrow();
        await expect(walletService.post([{ user: 'u1', wallet: 'not_a_wallet', delta: 1, type: 't', idempotencyKey: 'k' }], session))
            .rejects.toThrow(/محفظة غير معروفة/);
    });
});

describe('walletService.computeCoinSpendSplit — البونص أولاً ثم المدفوع', () => {
    afterEach(() => jest.restoreAllMocks());

    test('رصيد بونص كافٍ وحده: كل المبلغ من البونص، صفر من المدفوع', async () => {
        const db = makeDb();
        seedUser(db, { walletCoinsBonus: 100, walletCoinsPaid: 50 });
        wireMocks(db);
        const session = await mongoose.startSession();
        const split = await walletService.computeCoinSpendSplit('u1', 60, session);
        expect(split).toEqual({ fromBonus: 60, fromPaid: 0 });
    });

    test('رصيد بونص غير كافٍ: يُستنفَد البونص بالكامل والباقي من المدفوع', async () => {
        const db = makeDb();
        seedUser(db, { walletCoinsBonus: 20, walletCoinsPaid: 100 });
        wireMocks(db);
        const session = await mongoose.startSession();
        const split = await walletService.computeCoinSpendSplit('u1', 60, session);
        expect(split).toEqual({ fromBonus: 20, fromPaid: 40 });
    });

    test('لا بونص إطلاقاً: كل المبلغ من المدفوع', async () => {
        const db = makeDb();
        seedUser(db, { walletCoinsBonus: 0, walletCoinsPaid: 100 });
        wireMocks(db);
        const session = await mongoose.startSession();
        const split = await walletService.computeCoinSpendSplit('u1', 60, session);
        expect(split).toEqual({ fromBonus: 0, fromPaid: 60 });
    });

    test('مجموع الرصيدين غير كافٍ: INSUFFICIENT_FUNDS', async () => {
        const db = makeDb();
        seedUser(db, { walletCoinsBonus: 10, walletCoinsPaid: 10 });
        wireMocks(db);
        const session = await mongoose.startSession();
        await expect(walletService.computeCoinSpendSplit('u1', 60, session)).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    });
});
