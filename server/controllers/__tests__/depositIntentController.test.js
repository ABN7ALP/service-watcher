// ملف: depositIntentController.test.js
// 🛡️ شحن الكوينزات عبر شام كاش (feat/wallet-recharge-v1) — بوابة الأمان لكل PR بهذا المشروع
// (راجع "🛡️ بوابة الأمان لكل PR" بـCLAUDE.md) تشترط لكل مسار مالي اختبار انحدار يُثبت فعلياً
// إغلاق السباق، لا مساراً سعيداً فقط. نفس استراتيجية الاختبار الثابتة بهذا المشروع: jest.spyOn
// على نماذج Mongoose الحقيقية بمحاكاة حالة بذاكرة JS (لا قاعدة بيانات حقيقية؛
// mongodb-memory-server يُعلِّق Jest بهذا المحيط — راجع adminController.moneyRaceAtomicity.test.js
// المجاور لنفس النمط). walletService.post مُموَّه بالكامل هنا عمداً — اختباره الذري الخاص موجود
// بـwalletService.test.js، فما يُختبَر هنا هو حصراً حجز DepositIntent/User الذرّي بالكنترولر
// نفسه (لا منطق walletService الداخلي)، وهذا يُثبت بدقّة أكبر: لو حدث سباق حقيقي، walletService.post
// سيُستدعى مرتين — فعدّ استدعاءاته هو الدليل المباشر على إغلاق السباق أو عدمه

jest.mock('../../utils/botMessenger', () => ({ sendBotMessage: jest.fn().mockResolvedValue(null) }));
jest.mock('../../utils/walletService', () => ({ post: jest.fn().mockResolvedValue([]) }));
jest.mock('../../utils/linkageService', () => ({ areLinked: jest.fn().mockResolvedValue(false) }));
jest.mock('../../utils/cloudinary', () => ({
    uploadReceiptImage: jest.fn().mockResolvedValue({ secure_url: 'https://example.test/receipt.jpg' }),
    // ✅ افتراضياً "يمر" (لا يرمي) — الاختبار الذي يحتاج رفض نوع الملف يُقحم mockImplementationOnce
    assertRealType: jest.fn()
}));

const mongoose = require('mongoose');
const DepositIntent = require('../../models/DepositIntent');
const User = require('../../models/User');
const SystemSettings = require('../../models/SystemSettings');
const DeviceSession = require('../../models/DeviceSession');
const Withdrawal = require('../../models/Withdrawal');
const AdminLog = require('../../models/AdminLog');
const walletService = require('../../utils/walletService');
const { areLinked } = require('../../utils/linkageService');
const { assertRealType, uploadReceiptImage } = require('../../utils/cloudinary');
const depositIntentController = require('../depositIntentController');

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.session = () => p;
    p.sort = () => p;
    p.lean = () => p;
    p.populate = () => p;
    p.limit = () => p;
    p.skip = () => p;
    return p;
}

function defaultSettings(overrides = {}) {
    return {
        coinsPerUsd: 1000,
        maxDepositUsd: 1000,
        maxOpenDepositIntentsPerUser: 3,
        dailyDepositCapUsd: 500,
        depositIntentExpiryMinutes: 30,
        depositPackages: [
            { usd: 1, bonusPct: 0, hot: false },
            { usd: 10, bonusPct: 10, hot: true }
        ],
        shamCashBonusPct: 5,
        firstRechargeEnabled: true,
        firstRechargeMultiplierUpToUsd: 5,
        firstRechargeOfferHours: 24,
        ...overrides
    };
}

const USER_ID = '507f1f77bcf86cd799439011';
// ✅ مراجعة PR (بند 2): submitDeposit يتحقق الآن من شكل المعرّف (ObjectId.isValid) قبل أي شيء —
// معرّفات الاختبارات التي تمر عبره يجب أن "تبدو" صالحة الشكل، لا معرّفات نصّية حرة كـ'i1'
const INTENT_ID = '507f1f77bcf86cd799439055';

function makeDb() {
    return { intents: new Map(), users: new Map(), exactCents: new Set(), txnNos: new Set(), refCodes: new Set() };
}
function seedUser(db, overrides) {
    const user = {
        _id: USER_ID, coins: 0, socketId: null, firstRechargeBonusConsumedAt: null,
        walletFirstViewedAt: null, createdAt: new Date(), ...overrides
    };
    db.users.set(String(user._id), user);
    return user;
}
function seedIntent(db, overrides) {
    const intent = {
        _id: 'i1', user: USER_ID, status: 'submitted', baseCoins: 1000, bonusLines: [], totalCoinsSnapshot: 1000,
        refCode: 'SW-TEST', exactAmountCents: 100, amountUsd: 1, ...overrides
    };
    db.intents.set(String(intent._id), intent);
    db.exactCents.add(intent.exactAmountCents);
    if (intent.txnNo) db.txnNos.add(intent.txnNo);
    return intent;
}

function wireMocks(db, settings) {
    jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue(settings);

    jest.spyOn(DeviceSession, 'find').mockReturnValue(chainable([]));
    jest.spyOn(Withdrawal, 'find').mockReturnValue(chainable([]));
    jest.spyOn(AdminLog, 'logAction').mockResolvedValue({});

    jest.spyOn(User, 'findById').mockImplementation((id) => chainable(db.users.get(String(id)) || null));
    jest.spyOn(User, 'find').mockReturnValue(chainable([]));
    jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return chainable(null);
        if ('firstRechargeBonusConsumedAt' in filter && row.firstRechargeBonusConsumedAt !== filter.firstRechargeBonusConsumedAt) {
            return chainable(null);
        }
        if (update.$set) Object.assign(row, update.$set);
        return chainable({ ...row });
    });
    jest.spyOn(User, 'updateOne').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return Promise.resolve({ matchedCount: 0 });
        if ('walletFirstViewedAt' in filter && row.walletFirstViewedAt !== filter.walletFirstViewedAt) {
            return Promise.resolve({ matchedCount: 0 });
        }
        if (update.$set) Object.assign(row, update.$set);
        return Promise.resolve({ matchedCount: 1 });
    });

    jest.spyOn(DepositIntent, 'countDocuments').mockImplementation((filter = {}) => {
        let rows = [...db.intents.values()];
        if (filter.user) rows = rows.filter(r => String(r.user) === String(filter.user));
        if (filter.status && filter.status.$in) rows = rows.filter(r => filter.status.$in.includes(r.status));
        else if (filter.status) rows = rows.filter(r => r.status === filter.status);
        return Promise.resolve(rows.length);
    });
    jest.spyOn(DepositIntent, 'aggregate').mockResolvedValue([]);
    jest.spyOn(DepositIntent, 'find').mockReturnValue(chainable([]));
    jest.spyOn(DepositIntent, 'findOne').mockImplementation((filter) => {
        const row = db.intents.get(String(filter._id));
        if (!row) return chainable(null);
        if (filter.user && String(filter.user) !== String(row.user)) return chainable(null);
        return chainable({ ...row });
    });
    jest.spyOn(DepositIntent, 'exists').mockImplementation((filter) => Promise.resolve(!!db.intents.get(String(filter._id))));
    jest.spyOn(DepositIntent, 'create').mockImplementation((doc) => {
        if (db.exactCents.has(doc.exactAmountCents) || db.refCodes.has(doc.refCode)) {
            return Promise.reject(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
        }
        const created = { _id: `intent_${db.intents.size + 1}`, status: 'awaiting_payment', ...doc };
        db.intents.set(String(created._id), created);
        db.exactCents.add(created.exactAmountCents);
        db.refCodes.add(created.refCode);
        return Promise.resolve(created);
    });
    jest.spyOn(DepositIntent, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.intents.get(String(filter._id));
        if (!row) return chainable(null);
        if (filter.user && String(filter.user) !== String(row.user)) return chainable(null);
        if (filter.status) {
            const allowed = filter.status.$in ? filter.status.$in : [filter.status];
            if (!allowed.includes(row.status)) return chainable(null);
        }
        if (filter.expiresAt && filter.expiresAt.$gt && row.expiresAt && row.expiresAt <= filter.expiresAt.$gt) {
            return chainable(null);
        }
        const newTxnNo = update.$set && update.$set.txnNo;
        if (newTxnNo && db.txnNos.has(newTxnNo)) {
            return Promise.reject(Object.assign(new Error('E11000 duplicate key: txnNo'), { code: 11000 }));
        }
        if (update.$set) Object.assign(row, update.$set);
        if (update.$addToSet) {
            for (const [k, v] of Object.entries(update.$addToSet)) {
                row[k] = [...new Set([...(row[k] || []), v])];
            }
        }
        if (newTxnNo) db.txnNos.add(newTxnNo);
        return chainable({ ...row });
    });
    jest.spyOn(DepositIntent, 'updateOne').mockImplementation((filter, update) => {
        const row = db.intents.get(String(filter._id));
        if (!row) return Promise.resolve({ matchedCount: 0 });
        if (update.$set) Object.assign(row, update.$set);
        return Promise.resolve({ matchedCount: 1 });
    });

    jest.spyOn(mongoose, 'startSession').mockResolvedValue({
        withTransaction: async (fn) => fn(),
        endSession: async () => {}
    });
}

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
function mockReq(overrides) {
    return {
        user: { id: USER_ID }, admin: { _id: 'admin1' }, params: {}, body: {}, headers: {}, ip: '127.0.0.1',
        app: { get: () => ({ to: () => ({ emit: () => {} }) }) }, ...overrides
    };
}

afterEach(() => {
    jest.restoreAllMocks();
    // ✅ jest.mock(...) على مستوى الملف (بخلاف jest.spyOn) لا يُعاد تصفيره بـrestoreAllMocks —
    // تصفير يدوي صريح يمنع تسرّب عدد/نتيجة استدعاءات اختبار إلى الاختبار التالي
    walletService.post.mockClear();
    areLinked.mockReset().mockResolvedValue(false);
    assertRealType.mockReset();
    uploadReceiptImage.mockClear();
    require('../../utils/botMessenger').sendBotMessage.mockClear();
});

describe('createDeposit — سنتات فريدة + امتثال Google Play + الحدود', () => {
    test('سنتات فريدة: تعارض أول محاولة يُعاد المحاولة تلقائياً وينجح الطلب', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        const settings = defaultSettings();
        wireMocks(db, settings);

        // ✅ نحصر الاحتمال بسنت واحد فقط (شغل خارج النطاق لاحقاً) لنضمن تعارضاً حتمياً أولاً
        jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValue(0.5);
        seedIntent(db, { _id: 'blocker', user: 'other', status: 'awaiting_payment', exactAmountCents: 101 });

        const req = mockReq({ body: { usd: 1 }, user: { id: USER_ID } });
        const res = mockRes();
        await depositIntentController.createDeposit(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        const created = res.json.mock.calls[0][0].data.intent;
        expect(created.exactAmountCents).not.toBe(101);
    });

    test('امتثال Google Play: طلب يحمل X-Client: play يُرفض بـ403 ولا يُنشئ أي Intent', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        wireMocks(db, defaultSettings());

        const req = mockReq({ body: { usd: 5 }, headers: { 'x-client': 'play' } });
        const res = mockRes();
        await depositIntentController.createDeposit(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(db.intents.size).toBe(0);
    });

    test('لقطة البونصات تتجمّد وقت الإنشاء: لا تتأثر بتعديل لاحق على الإعدادات', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        const settings = defaultSettings({ depositPackages: [{ usd: 10, bonusPct: 10, hot: true }], shamCashBonusPct: 5, firstRechargeEnabled: false });
        wireMocks(db, settings);

        const req = mockReq({ body: { usd: 10 } });
        const res = mockRes();
        await depositIntentController.createDeposit(req, res);
        const created = res.json.mock.calls[0][0].data.intent;

        // baseCoins=10000, package +10%=1000, method +5%=500 → المجموع 11500 وقت الإنشاء
        expect(created.baseCoins).toBe(10000);
        expect(created.totalCoinsSnapshot).toBe(11500);

        // ✅ تغيير الإعدادات بعد الإنشاء — لا يجب أن يغيّر شيئاً بالطلب المُنشأ مسبقاً
        settings.coinsPerUsd = 5000;
        settings.shamCashBonusPct = 50;
        const stillSame = db.intents.get(String(created._id));
        expect(stillSame.totalCoinsSnapshot).toBe(11500);
        expect(stillSame.baseCoins).toBe(10000);
    });

    test('الحد اليومي: تجاوزه يرفض الطلب برسالة واضحة', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        const settings = defaultSettings({ dailyDepositCapUsd: 5 });
        wireMocks(db, settings);
        DepositIntent.aggregate.mockResolvedValue([{ _id: null, total: 4 }]);

        const req = mockReq({ body: { usd: 10 } });
        const res = mockRes();
        await depositIntentController.createDeposit(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(db.intents.size).toBe(0);
    });
});

describe('createDeposit — نافذة عرض "أول شحنة" الزمنية (مراجعة PR — بند 3)', () => {
    test('النافذة نشطة (walletFirstViewedAt حديث): بونص أول شحنة يُضاف للّقطة', async () => {
        const db = makeDb();
        seedUser(db, { walletFirstViewedAt: new Date(Date.now() - 60000) }); // قبل دقيقة فقط
        wireMocks(db, defaultSettings({ depositPackages: [{ usd: 1, bonusPct: 0 }], shamCashBonusPct: 0 }));

        const req = mockReq({ body: { usd: 1 } });
        const res = mockRes();
        await depositIntentController.createDeposit(req, res);
        const created = res.json.mock.calls[0][0].data.intent;

        expect(created.bonusLines.some(b => b.type === 'first_recharge')).toBe(true);
        expect(created.totalCoinsSnapshot).toBe(2000); // 1000 أساس + 1000 أول شحنة
    });

    test('النافذة لم تبدأ بعد (walletFirstViewedAt فارغ): لا بونص أول شحنة رغم الاستحقاق المنطقي', async () => {
        const db = makeDb();
        seedUser(db, { walletFirstViewedAt: null });
        wireMocks(db, defaultSettings({ depositPackages: [{ usd: 1, bonusPct: 0 }], shamCashBonusPct: 0 }));

        const req = mockReq({ body: { usd: 1 } });
        const res = mockRes();
        await depositIntentController.createDeposit(req, res);
        const created = res.json.mock.calls[0][0].data.intent;

        expect(created.bonusLines.some(b => b.type === 'first_recharge')).toBe(false);
        expect(created.totalCoinsSnapshot).toBe(1000);
    });

    test('النافذة انتهت (تجاوزت firstRechargeOfferHours): لا بونص أول شحنة', async () => {
        const db = makeDb();
        seedUser(db, { walletFirstViewedAt: new Date(Date.now() - 25 * 3600 * 1000) }); // قبل 25 ساعة
        wireMocks(db, defaultSettings({ depositPackages: [{ usd: 1, bonusPct: 0 }], shamCashBonusPct: 0, firstRechargeOfferHours: 24 }));

        const req = mockReq({ body: { usd: 1 } });
        const res = mockRes();
        await depositIntentController.createDeposit(req, res);
        const created = res.json.mock.calls[0][0].data.intent;

        expect(created.bonusLines.some(b => b.type === 'first_recharge')).toBe(false);
        expect(created.totalCoinsSnapshot).toBe(1000);
    });
});

describe('createDeposit — مصفوفة لقطة دقيقة لكل باقة (مراجعة PR — بند 5)', () => {
    // coinsPerUsd=1000, shamCashBonusPct=5, firstRechargeMultiplierUpToUsd=5 (الإعدادات الافتراضية)
    // base=usd*1000, pkgBonus=base*bonusPct/100, methodBonus=base*5/100, firstBonus=min(usd,5)*1000
    const PACKAGES = [
        { usd: 1, bonusPct: 0 }, { usd: 5, bonusPct: 0 }, { usd: 10, bonusPct: 10 },
        { usd: 25, bonusPct: 12 }, { usd: 50, bonusPct: 15 }, { usd: 100, bonusPct: 20 }
    ];
    const packagesSetting = PACKAGES.map(p => ({ usd: p.usd, bonusPct: p.bonusPct, hot: false }));
    test.each(PACKAGES.map(p => {
        const base = p.usd * 1000;
        const pkgBonus = Math.round(base * p.bonusPct / 100);
        const methodBonus = Math.round(base * 0.05);
        const noFirst = base + pkgBonus + methodBonus;
        const firstBonus = Math.min(p.usd, 5) * 1000;
        return [p.usd, p.bonusPct, noFirst, noFirst + firstBonus];
    }))('باقة %i$ (بونص %i%%): بلا أول شحنة=%i، مع أول شحنة=%i', async (usd, bonusPct, expectedNoFirst, expectedWithFirst) => {
        // بلا عرض أول شحنة (النافذة لم تبدأ)
        {
            const db = makeDb();
            seedUser(db, { walletFirstViewedAt: null });
            wireMocks(db, defaultSettings({ depositPackages: packagesSetting }));
            const res = mockRes();
            await depositIntentController.createDeposit(mockReq({ body: { usd } }), res);
            expect(res.json.mock.calls[0][0].data.intent.totalCoinsSnapshot).toBe(expectedNoFirst);
        }
        // مع عرض أول شحنة نشط
        {
            const db = makeDb();
            seedUser(db, { walletFirstViewedAt: new Date() });
            wireMocks(db, defaultSettings({ depositPackages: packagesSetting }));
            const res = mockRes();
            await depositIntentController.createDeposit(mockReq({ body: { usd } }), res);
            expect(res.json.mock.calls[0][0].data.intent.totalCoinsSnapshot).toBe(expectedWithFirst);
        }
    });
});

describe('submitDeposit — رقم العملية فريد عالمياً عبر كل الحسابات', () => {
    test('رقم عملية مُستخدَم من قبل (أي حساب آخر) يُرفض بـ409 ولا يُغيّر حالة الطلب', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        seedIntent(db, { _id: INTENT_ID, user: USER_ID, status: 'awaiting_payment', expiresAt: new Date(Date.now() + 60000), txnNo: undefined });
        db.txnNos.add('7781203345'); // ✅ مُستخدَم مسبقاً بحساب آخر فعلاً
        wireMocks(db, defaultSettings());

        const req = mockReq({ params: { id: INTENT_ID }, body: { txnNo: '7781203345' } });
        const res = mockRes();
        await depositIntentController.submitDeposit(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(db.intents.get(INTENT_ID).status).toBe('awaiting_payment');
    });

    test('رقم عملية فريد: الطلب يصبح submitted والأرقام غير الرقمية تُنظَّف', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        seedIntent(db, { _id: INTENT_ID, user: USER_ID, status: 'awaiting_payment', expiresAt: new Date(Date.now() + 60000) });
        wireMocks(db, defaultSettings());

        const req = mockReq({ params: { id: INTENT_ID }, body: { txnNo: ' 778-120-3345 ' } });
        const res = mockRes();
        await depositIntentController.submitDeposit(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(db.intents.get(INTENT_ID).status).toBe('submitted');
        expect(db.intents.get(INTENT_ID).txnNo).toBe('7781203345');
    });

    test('طلب منتهي الصلاحية (awaiting_payment تجاوز expiresAt) لا يُقبَل إرسال الإشعار له', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        seedIntent(db, { _id: INTENT_ID, user: USER_ID, status: 'awaiting_payment', expiresAt: new Date(Date.now() - 1000) });
        wireMocks(db, defaultSettings());

        const req = mockReq({ params: { id: INTENT_ID }, body: { txnNo: '123456' } });
        const res = mockRes();
        await depositIntentController.submitDeposit(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('submitDeposit — الملكية/الحالة/الصلاحية تُتحقَّق قبل لمس أي ملف (مراجعة PR — بند 2)', () => {
    test('معرّف غير صالح الشكل → 404 فوراً بلا أي استعلام أو رفع', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        wireMocks(db, defaultSettings());

        const req = mockReq({ params: { id: 'not-an-object-id' }, body: { txnNo: '123456' } });
        const res = mockRes();
        await depositIntentController.submitDeposit(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(uploadReceiptImage).not.toHaveBeenCalled();
    });

    test('معرّف طلب يخصّ حساباً آخر → 404 ولا أي رفع للملف', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        const otherUserIntentId = '507f1f77bcf86cd799439099';
        seedIntent(db, {
            _id: otherUserIntentId, user: '507f1f77bcf86cd799439022', status: 'awaiting_payment',
            expiresAt: new Date(Date.now() + 60000)
        });
        wireMocks(db, defaultSettings());

        const req = mockReq({
            params: { id: otherUserIntentId }, body: { txnNo: '123456' },
            file: { buffer: Buffer.from('fake-image-bytes') }
        });
        const res = mockRes();
        await depositIntentController.submitDeposit(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(uploadReceiptImage).not.toHaveBeenCalled();
        expect(assertRealType).not.toHaveBeenCalled();
    });

    test('ملف ليس صورة فعلياً (توقيع بايتات مرفوض) → 400 ولا يُرفَع ولا يُحفَظ كإيصال', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        seedIntent(db, { _id: INTENT_ID, user: USER_ID, status: 'awaiting_payment', expiresAt: new Date(Date.now() + 60000) });
        wireMocks(db, defaultSettings());
        assertRealType.mockImplementationOnce(() => { throw new Error('محتوى الملف لا يطابق نوعاً مسموحاً به.'); });

        const req = mockReq({
            params: { id: INTENT_ID }, body: { txnNo: '123456' },
            file: { buffer: Buffer.from('not-really-an-image') }
        });
        const res = mockRes();
        await depositIntentController.submitDeposit(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(uploadReceiptImage).not.toHaveBeenCalled();
        expect(db.intents.get(INTENT_ID).status).toBe('awaiting_payment');
        expect(db.intents.get(INTENT_ID).receiptImage).toBeUndefined();
    });
});

describe('adminApproveIntent — حجز ذرّي يمنع إيداعاً مزدوجاً + تقسيم البونصات لقيود مستقلة', () => {
    test('موافقتان متزامنتان على نفس الطلب: walletService.post يُستدعى مرة واحدة فقط', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        seedIntent(db, {
            _id: 'i1', user: USER_ID, status: 'submitted', baseCoins: 1000,
            bonusLines: [{ type: 'package', coins: 100, reason: 'test' }, { type: 'method', coins: 50, reason: 'test' }],
            totalCoinsSnapshot: 1150
        });
        wireMocks(db, defaultSettings());

        const req1 = mockReq({ params: { id: 'i1' } });
        const res1 = mockRes();
        const req2 = mockReq({ params: { id: 'i1' } });
        const res2 = mockRes();

        await Promise.all([
            depositIntentController.adminApproveIntent(req1, res1),
            depositIntentController.adminApproveIntent(req2, res2)
        ]);

        expect(walletService.post).toHaveBeenCalledTimes(1);
        // ✅ 3 قيود بهذه الاستدعاءة الواحدة: الأساس + بونص الباقة + بونص الطريقة، كل منها منفصل
        const entries = walletService.post.mock.calls[0][0];
        expect(entries).toHaveLength(3);
        expect(entries.find(e => e.wallet === 'coins_paid').delta).toBe(1000);
        expect(entries.filter(e => e.wallet === 'coins_bonus').map(e => e.delta).sort((a, b) => a - b)).toEqual([50, 100]);
        // idempotencyKey مختلف لكل بند — لا تضارب بين الأساس والبونصات
        expect(new Set(entries.map(e => e.idempotencyKey)).size).toBe(3);

        const bodies = [res1.json.mock.calls[0][0], res2.json.mock.calls[0][0]];
        expect(bodies.filter(b => b.success === true)).toHaveLength(1);
        expect(bodies.filter(b => b.success === false)).toHaveLength(1);
        expect(db.intents.get('i1').status).toBe('approved');
    });

    test('بونص أول شحنة: يُستهلَك مرة واحدة فقط لو وافق الأدمن على طلبين لنفس الحساب بالتزامن', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID, firstRechargeBonusConsumedAt: null });
        seedIntent(db, {
            _id: 'i1', user: USER_ID, status: 'submitted', baseCoins: 1000,
            bonusLines: [{ type: 'first_recharge', coins: 5000, reason: 'أول شحنة' }], totalCoinsSnapshot: 6000
        });
        seedIntent(db, {
            _id: 'i2', user: USER_ID, status: 'submitted', baseCoins: 2000,
            bonusLines: [{ type: 'first_recharge', coins: 5000, reason: 'أول شحنة' }], totalCoinsSnapshot: 7000
        });
        wireMocks(db, defaultSettings());

        await Promise.all([
            depositIntentController.adminApproveIntent(mockReq({ params: { id: 'i1' } }), mockRes()),
            depositIntentController.adminApproveIntent(mockReq({ params: { id: 'i2' } }), mockRes())
        ]);

        expect(db.intents.get('i1').status).toBe('approved');
        expect(db.intents.get('i2').status).toBe('approved');
        expect(db.users.get(USER_ID).firstRechargeBonusConsumedAt).not.toBeNull();

        // ✅ مجموع كل القيود عبر الاستدعاءين: بونص "أول شحنة" (5000) ظهر مرة واحدة فقط إجمالاً
        const allEntries = walletService.post.mock.calls.flat(2);
        const firstRechargeCredits = allEntries.filter(e => e.meta?.reason === 'أول شحنة');
        expect(firstRechargeCredits).toHaveLength(1);
    });

    test('حساب مرتبط استهلك عرض أول شحنة فعلاً: بونص أول شحنة لا يُمنَح لهذا الحساب', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID, firstRechargeBonusConsumedAt: null }); // الحساب الحالي — لم يستهلك بعد
        seedIntent(db, {
            _id: 'i1', user: USER_ID, status: 'submitted', baseCoins: 1000,
            bonusLines: [{ type: 'first_recharge', coins: 5000, reason: 'أول شحنة' }], totalCoinsSnapshot: 6000
        });
        wireMocks(db, defaultSettings());
        // ✅ حساب "u_linked" يشارك جهازاً مع هذا الحساب، وقد استهلك عرض أول شحنة فعلاً
        DeviceSession.find.mockImplementation((filter) => {
            if (filter.deviceId) return chainable([{ user: 'u_linked' }]);
            return chainable([{ deviceId: 'shared-device', ip: null }]);
        });
        User.find.mockReturnValue(chainable([{ _id: 'u_linked' }]));
        areLinked.mockResolvedValue(true);

        const req = mockReq({ params: { id: 'i1' } });
        const res = mockRes();
        await depositIntentController.adminApproveIntent(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        const entries = walletService.post.mock.calls[0][0];
        expect(entries.find(e => e.meta?.reason === 'أول شحنة')).toBeUndefined();
        expect(entries.find(e => e.wallet === 'coins_paid').delta).toBe(1000);
    });

    test('رفض طلب غير submitted (مثل منتهي الصلاحية) يُرفَض برسالة 409 ولا يمس أي رصيد', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        seedIntent(db, { _id: 'i1', user: USER_ID, status: 'expired' });
        wireMocks(db, defaultSettings());

        const req = mockReq({ params: { id: 'i1' } });
        const res = mockRes();
        await depositIntentController.adminApproveIntent(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(walletService.post).not.toHaveBeenCalled();
    });

    test('creditedCoins يُحفَظ ويُعاد بالاستجابة عند اكتمال كل البونصات (مراجعة PR — بند 4)', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        seedIntent(db, {
            _id: 'i1', user: USER_ID, status: 'submitted', baseCoins: 1000,
            bonusLines: [{ type: 'package', coins: 100, reason: 'test' }, { type: 'method', coins: 50, reason: 'test' }],
            totalCoinsSnapshot: 1150
        });
        wireMocks(db, defaultSettings());

        const req = mockReq({ params: { id: 'i1' } });
        const res = mockRes();
        await depositIntentController.adminApproveIntent(req, res);

        expect(res.json.mock.calls[0][0].intent.creditedCoins).toBe(1150);
        expect(db.intents.get('i1').creditedCoins).toBe(1150);
    });

    test('creditedCoins أقل من totalCoinsSnapshot لو أُسقِط بونص أول شحنة (حساب مرتبط استهلكه)', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID, firstRechargeBonusConsumedAt: null });
        seedIntent(db, {
            _id: 'i1', user: USER_ID, status: 'submitted', baseCoins: 1000,
            bonusLines: [{ type: 'method', coins: 50, reason: 'method' }, { type: 'first_recharge', coins: 5000, reason: 'أول شحنة' }],
            totalCoinsSnapshot: 6050
        });
        wireMocks(db, defaultSettings());
        DeviceSession.find.mockImplementation((filter) => {
            if (filter.deviceId) return chainable([{ user: 'u_linked' }]);
            return chainable([{ deviceId: 'shared-device' }]);
        });
        User.find.mockReturnValue(chainable([{ _id: 'u_linked' }]));
        areLinked.mockResolvedValue(true);

        const req = mockReq({ params: { id: 'i1' } });
        const res = mockRes();
        await depositIntentController.adminApproveIntent(req, res);

        // 1050 = الأساس 1000 + method 50 فقط — بونص أول شحنة (5000) أُسقِط
        expect(res.json.mock.calls[0][0].intent.creditedCoins).toBe(1050);
        expect(res.json.mock.calls[0][0].intent.totalCoinsSnapshot).toBe(6050); // اللقطة الأصلية تبقى كما هي للسجل
    });

    test('مشاركة IP فقط (أجهزة مختلفة) لا تحظر بونص أول شحنة إطلاقاً (مراجعة PR — بند 1)', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID, firstRechargeBonusConsumedAt: null });
        seedIntent(db, {
            _id: 'i1', user: USER_ID, status: 'submitted', baseCoins: 1000,
            bonusLines: [{ type: 'first_recharge', coins: 5000, reason: 'أول شحنة' }], totalCoinsSnapshot: 6000
        });
        wireMocks(db, defaultSettings());
        // ✅ findLinkedCandidateUserIds لا يستعلم بـip أبداً بعد الآن — DeviceSession.find بفلتر
        // deviceId لا يُستدعى بمرشّحين إطلاقاً لأن لا deviceIds مشتركة هنا، فالدالة تُعيد [] فوراً
        DeviceSession.find.mockReturnValue(chainable([{ deviceId: null, ip: '1.2.3.4' }]));
        Withdrawal.find.mockReturnValue(chainable([]));
        areLinked.mockResolvedValue(false); // areLinked نفسها لم تعد تفحص IP إطلاقاً

        const req = mockReq({ params: { id: 'i1' } });
        const res = mockRes();
        await depositIntentController.adminApproveIntent(req, res);

        const entries = walletService.post.mock.calls[0][0];
        expect(entries.find(e => e.meta?.reason === 'أول شحنة')).toBeDefined();
        expect(res.json.mock.calls[0][0].intent.creditedCoins).toBe(6000);
    });
});

describe('adminListIntents — إشارة "نفس IP" خطر عرض فقط (مراجعة PR — بند 1)', () => {
    test('same_ip:N يظهر بعلامات الخطر، لا linked_accounts، لو الحسابان يشتركان بـIP فقط', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        const userDoc = { _id: USER_ID, username: 'u1', profileImage: '', createdAt: new Date(Date.now() - 100 * 86400000) };
        const intentDoc = {
            _id: 'i1', user: userDoc, status: 'submitted', riskFlags: [], bonusLines: [],
            toObject() { return { ...this, user: userDoc }; }
        };
        wireMocks(db, defaultSettings());
        jest.spyOn(DepositIntent, 'find').mockReturnValue(chainable([intentDoc]));
        jest.spyOn(DepositIntent, 'countDocuments').mockImplementation((filter = {}) => {
            if (filter.status === 'rejected') return Promise.resolve(0);
            return Promise.resolve(1);
        });
        DeviceSession.find.mockImplementation((filter) => {
            if (filter.deviceId) return chainable([]); // لا تطابق جهاز — غير مرتبطَين فعلياً
            if (filter.ip) return chainable([{ user: 'other1' }, { user: 'other2' }]);
            return chainable([{ deviceId: null, ip: '9.9.9.9' }]);
        });
        Withdrawal.find.mockReturnValue(chainable([]));

        const req = mockReq({ query: {} });
        const res = mockRes();
        await depositIntentController.adminListIntents(req, res);

        const flags = res.json.mock.calls[0][0].intents[0].riskFlags;
        expect(flags).toContain('same_ip:2');
        expect(flags).not.toContain('linked_accounts');
    });
});

describe('adminRejectIntent — يتطلّب سبباً ويُشعر المستخدم', () => {
    test('بلا سبب: يُرفَض الطلب بـ400 ولا يُغيّر حالة الـIntent', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        seedIntent(db, { _id: 'i1', user: USER_ID, status: 'submitted' });
        wireMocks(db, defaultSettings());

        const req = mockReq({ params: { id: 'i1' }, body: {} });
        const res = mockRes();
        await depositIntentController.adminRejectIntent(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(db.intents.get('i1').status).toBe('submitted');
    });

    test('رفضان متزامنان لنفس الطلب: واحد فقط ينجح', async () => {
        const db = makeDb();
        seedUser(db, { _id: USER_ID });
        seedIntent(db, { _id: 'i1', user: USER_ID, status: 'submitted' });
        wireMocks(db, defaultSettings());

        const req1 = mockReq({ params: { id: 'i1' }, body: { reason: 'سبب 1' } });
        const res1 = mockRes();
        const req2 = mockReq({ params: { id: 'i1' }, body: { reason: 'سبب 2' } });
        const res2 = mockRes();

        await Promise.all([
            depositIntentController.adminRejectIntent(req1, res1),
            depositIntentController.adminRejectIntent(req2, res2)
        ]);

        const bodies = [res1.json.mock.calls[0][0], res2.json.mock.calls[0][0]];
        expect(bodies.filter(b => b.success === true)).toHaveLength(1);
        expect(bodies.filter(b => b.success === false)).toHaveLength(1);
        expect(db.intents.get('i1').status).toBe('rejected');
    });
});
