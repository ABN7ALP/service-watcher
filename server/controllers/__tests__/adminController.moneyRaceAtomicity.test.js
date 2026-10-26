// ملف: adminController.moneyRaceAtomicity.test.js
// 🛡️ مراجعة أمنية (redteam-audit-1 — البند #6، High): approveDeposit وrejectTransaction وadjustUserFunds
// (وبنفس العلّة فعلياً: approveCoinPurchase وrejectCoinPurchase القديمتان — راجع
// depositIntentController.adminApproveAtomicity.test.js لما استبدلهما بعد feat/wallet-recharge-v1)
// كانت كل منها تقرأ المستند، تفحص حالته (status !== 'pending' مثلاً)، ثم تُعدِّل الرصيد/الحالة
// بعملية save() أو += منفصلة تماماً — طلبا موافقة/رفض متزامنان على نفس الطلب (نافذتان مفتوحتان
// لنفس المشرف، أو مشرفان مختلفان) يتجاوزان الفحص معاً بالاعتماد على نفس القراءة القديمة، فتُضاف
// القيمة مرتين (إيداع/كوينز مُضاعَف) أو يُسترَد المبلغ مرتين (سحب مرفوض مرتين). أُصلِحت الدوال
// بنفس النمط المرجعي بهذا المشروع (adminReviewCustomGift): حجز ذرّي واحد عبر findOneAndUpdate
// بشرط الحالة الحالية — أي محاولة ثانية على نفس المستند تصطدم بفشل الحجز نفسه فوراً.
//
// نفس استراتيجية الاختبار الثابتة بهذا المشروع (راجع giftController.restAtomicity.test.js
// المجاور): jest.spyOn على نماذج Mongoose الحقيقية بمحاكاة حالة بذاكرة JS (لا قاعدة بيانات
// حقيقية؛ mongodb-memory-server يُعلِّق Jest بهذا المحيط بالتحديد — راجع ملاحظات الجلسة). محاكاة
// findOneAndUpdate هنا تُطبِّق شرط الحالة + التعديل بشكل متزامن (synchronous) داخل نفس استدعاء
// الدالة، قبل أي "await" — وهذا يُحاكي بدقّة الضمان الذري الحقيقي لـMongoDB: أي طلبين متزامنين
// (Promise.all) ينفَّذ أولهما فعلياً حتى نقطة التعليق الأولى قبل أن يبدأ الثاني، فيرى الثاني
// الحالة المحدَّثة فعلاً ويفشل حجزه كما يحدث تماماً بخادم Mongo حقيقي.

jest.mock('../../utils/botMessenger', () => ({
    sendBotMessage: jest.fn().mockResolvedValue(null),
    getBotUser: jest.fn().mockResolvedValue({ _id: 'bot' })
}));

const mongoose = require('mongoose');
const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
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
    return { users: new Map(), transactions: new Map() };
}
function seedUser(db, overrides) {
    const { balance = 0, coins = 0, ...rest } = overrides;
    const user = {
        _id: 'u_default', balance, coins,
        // ✅ دفتر الأستاذ: walletUsdCents/walletCoinsPaid هما ما يقرأهما/يكتبهما walletService
        // فعلياً — balance/coins تبقيان مرآة متزامنة فقط (نفس اتفاقية اختبارات giftController)
        walletUsdCents: Math.round(balance * 100), walletCoinsPaid: coins, walletCoinsBonus: 0,
        walletBeansW: 0, walletBeansP: 0, socketId: null, ...rest
    };
    db.users.set(user._id, user);
    return user;
}
function seedTransaction(db, overrides) {
    const tx = { _id: 'tx_default', user: 'u_default', type: 'deposit', amount: 100, status: 'pending', ...overrides };
    db.transactions.set(tx._id, tx);
    return tx;
}

// ✅ محاكاة واقعية بما يكفي لـwithTransaction: الالتزام يُطبَّق مباشرة على db، والرفض الداخلي
// (مثل ALREADY_PROCESSED/NOT_PENDING/CLAIM_FAILED) يُعيد db لحالته قبل المعاملة بالضبط
function wireMocks(db) {
    // ✅ تتبّع التراجع (undo) لكل مستند عند لحظة تعديله فعلياً (لا لقطة شاملة لكل المجموعة عند
    // بداية المعاملة) — ضروري هنا لأن اختباراتنا تُشغِّل معاملتين حقيقيتين بالتزامن (Promise.all)
    // على نفس الـMaps المشتركة: لقطة شاملة عند البداية تصبح "قديمة" إن عدّلت معاملة أخرى نفس
    // المجموعة بالمنتصف، فيُرجِع تراجع المعاملة الفاشلة قيماً قديمة فوق تعديل صحيح التزمته
    // المعاملة الفائزة بالتزامن. AsyncLocalStorage يُميِّز بدقّة أي استدعاء await ينتمي لأي
    // معاملة حتى مع التشابك الزمني، فيُراكِم كل معاملة سجلّ تراجعها الخاص فقط لما عدّلته هي فعلاً
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
    jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return chainable(null);
        // ✅ معمَّم على أي حقل محفظة (walletUsdCents/walletCoinsPaid/...) لا balance/coins فقط —
        // walletService.post يشترط $gte على الحقل الفعلي (wallet field) لا المرآة القديمة
        for (const [field, cond] of Object.entries(filter)) {
            if (field === '_id') continue;
            if (cond && typeof cond.$gte === 'number' && (row[field] || 0) < cond.$gte) return chainable(null);
        }
        recordUndo(db.users, row._id, { ...row });
        if (update.$inc) {
            for (const k of Object.keys(update.$inc)) row[k] = (row[k] || 0) + update.$inc[k];
        }
        if (update.$set) Object.assign(row, update.$set);
        return chainable({ ...row });
    });
    jest.spyOn(User, 'updateOne').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return Promise.resolve({ matchedCount: 0 });
        recordUndo(db.users, row._id, { ...row });
        if (update.$set) Object.assign(row, update.$set);
        return Promise.resolve({ matchedCount: 1 });
    });
    jest.spyOn(User, 'findById').mockImplementation((id) => chainable(db.users.get(String(id)) || null));
    jest.spyOn(User, 'exists').mockImplementation((filter) => Promise.resolve(!!db.users.get(String(filter._id))));

    jest.spyOn(LedgerEntry, 'findOne').mockImplementation(() => chainable(null));
    jest.spyOn(LedgerEntry, 'create').mockImplementation((docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        return Promise.resolve(arr.map((d, i) => ({ ...d, _id: `ledger_${i}_${Date.now()}_${Math.random()}` })));
    });

    jest.spyOn(Transaction, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.transactions.get(String(filter._id));
        if (!row) return chainable(null);
        if (filter.status && row.status !== filter.status) return chainable(null);
        recordUndo(db.transactions, row._id, { ...row });
        if (update.$set) Object.assign(row, update.$set);
        return chainable({ ...row });
    });
    jest.spyOn(Transaction, 'create').mockImplementation((docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        const created = arr.map((d, i) => ({ ...d, _id: `tx_new_${db.transactions.size + i}` }));
        created.forEach(c => { recordUndo(db.transactions, c._id, null); db.transactions.set(c._id, c); });
        return Promise.resolve(Array.isArray(docs) ? created : created[0]);
    });

    jest.spyOn(AdminLog, 'create').mockResolvedValue({});
    jest.spyOn(AdminLog, 'logAction').mockResolvedValue({});

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
function makeFakeIo() {
    return { to: () => ({ emit: () => {} }), emit: () => {} };
}
function mockReq(overrides) {
    return { admin: { _id: 'admin1' }, params: {}, body: {}, ip: '127.0.0.1', app: { get: () => makeFakeIo() }, ...overrides };
}

describe('approveDeposit — حجز ذرّي يمنع إيداعاً مزدوجاً من موافقتين متزامنتين', () => {
    afterEach(() => jest.restoreAllMocks());

    test('موافقتان متزامنتان على نفس المعاملة: واحدة فقط تنجح، الرصيد يُضاف مرة واحدة فقط', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', balance: 0 });
        seedTransaction(db, { _id: 'tx1', user: 'u1', amount: 50, status: 'pending' });
        wireMocks(db);

        const req1 = mockReq({ params: { transactionId: 'tx1' } });
        const res1 = mockRes();
        const req2 = mockReq({ params: { transactionId: 'tx1' } });
        const res2 = mockRes();

        await Promise.all([
            adminController.approveDeposit(req1, res1),
            adminController.approveDeposit(req2, res2)
        ]);

        const bodies = [res1.json.mock.calls[0][0], res2.json.mock.calls[0][0]];
        const successCount = bodies.filter(b => b.success === true).length;
        const failCount = bodies.filter(b => b.success === false).length;
        expect(successCount).toBe(1);
        expect(failCount).toBe(1);
        expect(user.balance).toBe(50); // ✅ ليس 100 — جوهر الإصلاح
    });
});

describe('rejectTransaction — حجز ذرّي يمنع استرداد سحب مرفوض مرتين', () => {
    afterEach(() => jest.restoreAllMocks());

    test('رفضان متزامنان لنفس طلب السحب: واحد فقط ينجح، الاسترداد يحدث مرة واحدة فقط', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', balance: 0 });
        seedTransaction(db, { _id: 'tx1', user: 'u1', type: 'withdrawal', amount: -30, status: 'pending' });
        wireMocks(db);

        const req1 = mockReq({ params: { transactionId: 'tx1' }, body: { reason: 'test' } });
        const res1 = mockRes();
        const req2 = mockReq({ params: { transactionId: 'tx1' }, body: { reason: 'test' } });
        const res2 = mockRes();

        await Promise.all([
            adminController.rejectTransaction(req1, res1),
            adminController.rejectTransaction(req2, res2)
        ]);

        const bodies = [res1.json.mock.calls[0][0], res2.json.mock.calls[0][0]];
        const successCount = bodies.filter(b => b.success === true).length;
        const failCount = bodies.filter(b => b.success === false).length;
        expect(successCount).toBe(1);
        expect(failCount).toBe(1);
        expect(user.balance).toBe(30); // ✅ ليس 60 — استرداد واحد فقط
    });
});

describe('adjustUserFunds — شرط $gte الذري يمنع رصيداً سالباً من تعديلين متزامنين', () => {
    afterEach(() => jest.restoreAllMocks());

    test('سحبان يدويان متزامنان يتجاوز مجموعهما الرصيد الحالي: واحد فقط ينجح، الرصيد لا يصبح سالباً', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', balance: 60, coins: 0 });
        wireMocks(db);

        const req1 = mockReq({ params: { userId: 'u1' }, body: { balanceChange: -50, reason: 'تعديل تجريبي 1' } });
        const res1 = mockRes();
        const req2 = mockReq({ params: { userId: 'u1' }, body: { balanceChange: -50, reason: 'تعديل تجريبي 2' } });
        const res2 = mockRes();

        await Promise.all([
            adminController.adjustUserFunds(req1, res1),
            adminController.adjustUserFunds(req2, res2)
        ]);

        // ✅ مسار النجاح يستدعي res.json مباشرة بلا res.status سابق (200 ضمنياً) — نتحقق من
        // محتوى json مباشرة بدل الاعتماد على status
        const jsonBodies = [res1.json.mock.calls[0]?.[0], res2.json.mock.calls[0]?.[0]];
        const successCount = jsonBodies.filter(b => b && b.success === true).length;
        const failCount = jsonBodies.filter(b => b && b.success === false).length;

        expect(successCount).toBe(1);
        expect(failCount).toBe(1);
        expect(user.balance).toBe(10); // ✅ 60 - 50 مرة واحدة فقط، ليس سالباً (60 - 100)
        expect(user.balance).toBeGreaterThanOrEqual(0);
    });

    test('تعديل فردي عادي (بلا تزامن) ينجح ويُحدِّث الرصيد والكوينز معاً', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', balance: 100, coins: 50 });
        wireMocks(db);

        const req = mockReq({ params: { userId: 'u1' }, body: { balanceChange: 20, coinsChange: -10, reason: 'تصحيح يدوي' } });
        const res = mockRes();
        await adminController.adjustUserFunds(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(user.balance).toBe(120);
        expect(user.coins).toBe(40);
    });
});
