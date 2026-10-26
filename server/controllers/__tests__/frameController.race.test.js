// ملف: frameController.race.test.js
// 🛡️ مراجعة أمنية (redteam-audit-1 — البند #2، Critical): purchaseFrame كانت تقرأ
// user.coins، تفحص coins < price، ثم تُعدِّل coins وownedFrames (دفع لعنصر مصفوفة) بعملية
// save() واحدة لاحقة — بلا أي معاملة أو شرط ذرّي. أُثبِت فعلياً: مستخدم برصيد كافٍ لشراء واحد
// بالضبط، 5 طلبات شراء متزامنة لنفس الإطار → 5 استجابات 200، خصم مرة واحدة فقط (coins:0) لكن
// ownedFrames.length:5 — تكرار مجاني غير محدود لأي عنصر مدفوع.
//
// الإصلاح: المعاملة الآن تقرأ user من جديد داخل جلستها الخاصة (لا القراءة المسبقة)، فيكتشف
// محرّك Mongo الحقيقي أي تضارب كتابة بين معاملتين متزامنتين تعدِّلان نفس المستند، وwithTransaction
// تُعيد تنفيذ الدالة بالكامل تلقائياً عند هذا التضارب (قراءة جديدة، لا الحالة القديمة).
//
// بخلاف باقي اختبارات هذا المشروع (jest.spyOn مباشر على findOneAndUpdate بشرط $gte)، هذا
// المسار يعتمد فعلياً على آلية إعادة المحاولة التلقائية لـwithTransaction عند تضارب كتابة بين
// جلستين — فمحاكاة هذا الاختبار تُحاكي تلك الآلية بالذات: قفل حقيقي لكل مستند (أي لمسة ثانية
// من معاملة أخرى لا تزال "حيّة" على نفس المستند تُسقِط بتضارب كتابة فوري، بصرف النظر عن نوع
// العملية — findOneAndUpdate أو save() معاً، تماماً كما يكتشف محرّك Mongo الحقيقي أي تضارب على
// مستوى المستند) + إعادة محاولة withTransaction تلقائياً عند هذا التضارب تحديداً (نفس نمط
// walletService.test.js المرجعي)، لا مجرد شرط $gte بسيط — كي يُثبِت أن الحل الحقيقي (الاعتماد
// على اكتشاف Mongo الذاتي للتضارب، لا قفلاً تطبيقياً) يعمل فعلياً عبر الخصم الذرّي (walletService)
// وتعديل ownedFrames (save()) معاً، لا أن الكود "يبدو" صحيحاً فقط
jest.useFakeTimers();

const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');
const User = require('../../models/User');
const ProfileFrame = require('../../models/ProfileFrame');
const LedgerEntry = require('../../models/LedgerEntry');
const frameController = require('../frameController');

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
        _id: 'u1', coins, ownedFrames: [],
        // ✅ دفتر الأستاذ: walletCoinsPaid هو ما يقرأه/يخصمه walletService فعلياً — coins مرآة فقط
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
            ownedFrames: row.ownedFrames.map(o => ({ ...o })),
            save: async () => {
                acquireLock(db, row._id);
                recordUndo(db, row._id, { ...row });
                row.coins = draft.coins;
                row.ownedFrames = draft.ownedFrames;
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
        // ✅ نفس سلوك withTransaction الحقيقي بالضبط: تضارب كتابة (code 112) يُعاد تنفيذ الدالة
        // بالكامل تلقائياً (قراءة جديدة في كل مرة)؛ أي خطأ آخر (مثل INSUFFICIENT) يُرمى فوراً بلا إعادة محاولة
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
    return { user: { id: 'u1' }, body: {}, io: null, ...overrides };
}

describe('purchaseFrame — تضارب الكتابة الحقيقي يمنع تكراراً مجانياً (البند #2)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('رصيد يكفي شراءً واحداً بالضبط + 5 طلبات متزامنة لنفس الإطار: واحد فقط ينجح، البقية "رصيد غير كافٍ"', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', coins: 100 });
        jest.spyOn(ProfileFrame, 'findById').mockResolvedValue({
            _id: 'f1', isActive: true, name: 'إطار تجريبي', prices: { day1: 100, day3: 200, day7: 300 }
        });
        wireMocks(db);

        const reqs = Array.from({ length: 5 }, () => mockReq({ body: { frameId: 'f1', duration: '1' } }));
        const reses = Array.from({ length: 5 }, () => mockRes());

        await Promise.all(reqs.map((req, i) => frameController.purchaseFrame(req, reses[i])));

        const bodies = reses.map(r => r.json.mock.calls[0][0]);
        const successCount = bodies.filter(b => b.status === 'success').length;
        const failCount = bodies.filter(b => b.status === 'fail').length;

        expect(successCount).toBe(1); // ✅ جوهر الإصلاح: ليس 5
        expect(failCount).toBe(4);
        expect(user.coins).toBe(0); // خصم مرة واحدة فقط
        expect(user.ownedFrames).toHaveLength(1); // ✅ ليس 5 — لا تكرار مجاني
    });

    test('مسار سعيد فردي (بلا تزامن): يخصم السعر ويضيف إطاراً واحداً', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', coins: 500 });
        jest.spyOn(ProfileFrame, 'findById').mockResolvedValue({
            _id: 'f1', isActive: true, name: 'إطار تجريبي', prices: { day1: 100, day3: 200, day7: 300 }
        });
        wireMocks(db);

        const req = mockReq({ body: { frameId: 'f1', duration: '1' } });
        const res = mockRes();
        await frameController.purchaseFrame(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
        expect(user.coins).toBe(400);
        expect(user.ownedFrames).toHaveLength(1);
    });
});
