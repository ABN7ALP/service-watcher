// ملف: giftRedemptionController.test.js
// 🛡️ دفتر الأستاذ (feat/wallet-ledger-v1): يختبر الاستبدال الجديد (beans -> coins/usd) —
// التحويل لكوينز (بونص+خاص، 1:1 بلا انتظار)، التحويل لدولار (فقط beans_w الأقدم من
// beanHoldHours، حسب نسبة الدفع الحالية)، وأن beans_p الترويجية لا تصل للدولار أبداً مهما
// قَدِم عمرها (لا تُستعلَم أصلاً بمحفظة beans_w). نفس استراتيجية هذا المشروع الثابتة —
// jest.spyOn على نماذج Mongoose الحقيقية بمحاكاة حالة بذاكرة JS

jest.mock('../../utils/botMessenger', () => ({ sendBotMessage: jest.fn().mockResolvedValue(undefined) }));

const mongoose = require('mongoose');
const User = require('../../models/User');
const LedgerEntry = require('../../models/LedgerEntry');
const GiftRedemption = require('../../models/GiftRedemption');
const SystemSettings = require('../../models/SystemSettings');
const {
    redeemGifts, getRedeemableGifts, getEligibleBeansWForUsd, currentPayoutRatePercent
} = require('../giftRedemptionController');

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
    return { users: new Map(), ledger: [] };
}
function seedUser(db, overrides) {
    const { walletBeansW = 0, walletBeansP = 0, ...rest } = overrides;
    const user = {
        _id: 'u1', coins: 0, balance: 0, level: 1,
        walletCoinsPaid: 0, walletCoinsBonus: 0, walletBeansW, walletBeansP, walletUsdCents: 0,
        ...rest
    };
    db.users.set(user._id, user);
    return user;
}
// ✅ يُضيف قيد دفتر أستاذ تاريخي مباشرة لمحاكاة بينز استُلمت منذ "ageHours" ساعة — يُستخدَم
// لبناء طابور FIFO واقعي بأعمار مختلفة بلا الاعتماد على المرور الحقيقي للوقت
function seedLedger(db, { user = 'u1', wallet, delta, ageHours = 0 }) {
    db.ledger.push({
        user, wallet, delta, createdAt: new Date(Date.now() - ageHours * 60 * 60 * 1000)
    });
}

function wireMocks(db) {
    jest.spyOn(User, 'findById').mockImplementation((id) => chainable(db.users.get(String(id)) || null));
    jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return chainable(null);
        for (const [field, cond] of Object.entries(filter)) {
            if (field === '_id') continue;
            if (cond && typeof cond.$gte === 'number' && (row[field] || 0) < cond.$gte) return chainable(null);
        }
        if (update.$inc) for (const k of Object.keys(update.$inc)) row[k] = (row[k] || 0) + update.$inc[k];
        if (update.$set) Object.assign(row, update.$set);
        return chainable({ ...row });
    });
    jest.spyOn(User, 'updateOne').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return chainable({ matchedCount: 0 });
        if (update.$set) Object.assign(row, update.$set);
        return chainable({ matchedCount: 1 });
    });
    jest.spyOn(LedgerEntry, 'findOne').mockImplementation(() => chainable(null));
    jest.spyOn(LedgerEntry, 'create').mockImplementation((docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        const created = arr.map((d, i) => ({ createdAt: new Date(), ...d, _id: `ledger_${db.ledger.length + i}` }));
        db.ledger.push(...created);
        return Promise.resolve(created);
    });
    jest.spyOn(LedgerEntry, 'find').mockImplementation((filter) => {
        const rows = db.ledger
            .filter(e => String(e.user) === String(filter.user) && e.wallet === filter.wallet)
            .sort((a, b) => a.createdAt - b.createdAt);
        return chainable(rows);
    });
    jest.spyOn(GiftRedemption, 'create').mockImplementation((docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        return Promise.resolve(arr.map((d, i) => ({ ...d, _id: `gr_${i}` })));
    });
    jest.spyOn(GiftRedemption, 'find').mockReturnValue(chainable([]));

    jest.spyOn(mongoose, 'startSession').mockImplementation(async () => ({
        withTransaction: async (fn) => fn(),
        endSession: async () => {}
    }));
}

function defaultSettings(overrides = {}) {
    return {
        coinsPerUsd: 1000,
        payoutLaunchPct: 70,
        // ✅ مراجعة ما قبل الدمج v2 (البند 3): العرض "بدأ" افتراضياً بهذي الاختبارات (الماضي)
        // لكن endsAt الافتراضية بالماضي أيضاً، فالنتيجة الصافية الافتراضية تبقى "بعد الإطلاق"
        // تماماً كالسابق — التغيير الفعلي يظهر فقط باختبار "لم يبدأ بعد" الجديد أدناه
        payoutLaunchStartsAt: new Date(Date.now() - 1000),
        payoutLaunchEndsAt: new Date(Date.now() - 1000), // ✅ انتهت فترة الإطلاق افتراضياً بهذي الاختبارات
        payoutBasePct: 65,
        payoutHighPct: 70,
        highHostLevel: 30,
        beanHoldHours: 72,
        ...overrides
    };
}

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
function mockReq(overrides) {
    return { user: { id: 'u1' }, body: {}, app: { get: () => null }, ...overrides };
}

describe('currentPayoutRatePercent', () => {
    test('أثناء فترة الإطلاق: نسبة الإطلاق دوماً بصرف النظر عن مستوى المضيف', () => {
        const settings = defaultSettings({ payoutLaunchEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24) });
        expect(currentPayoutRatePercent(settings, 1)).toBe(70);
        expect(currentPayoutRatePercent(settings, 999)).toBe(70);
    });
    test('بعد الإطلاق، مستوى أقل من الحدّ: نسبة أساسية', () => {
        const settings = defaultSettings();
        expect(currentPayoutRatePercent(settings, 10)).toBe(65);
    });
    test('بعد الإطلاق، مستوى مضيف عالٍ (>= highHostLevel): نسبة أعلى', () => {
        const settings = defaultSettings();
        expect(currentPayoutRatePercent(settings, 30)).toBe(70);
        expect(currentPayoutRatePercent(settings, 50)).toBe(70);
    });
    test('لم يبدأ العرض بعد (payoutLaunchStartsAt مستقبلية رغم أن endsAt لم تنتهِ): نسبة أساسية لا نسبة الإطلاق', () => {
        const settings = defaultSettings({
            payoutLaunchStartsAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
            payoutLaunchEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
        });
        expect(currentPayoutRatePercent(settings, 1)).toBe(65); // basePct — ليس 70
    });
    test('payoutLaunchStartsAt=null (لم يُفعَّل العرض إطلاقاً، الافتراضي الحقيقي بالمخطط): نسبة أساسية حتى مع endsAt مستقبلية', () => {
        const settings = defaultSettings({
            payoutLaunchStartsAt: null,
            payoutLaunchEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
        });
        expect(currentPayoutRatePercent(settings, 1)).toBe(65);
    });
});

describe('getEligibleBeansWForUsd — طابور FIFO محاسبي', () => {
    afterEach(() => jest.restoreAllMocks());

    test('كل الرصيد أقدم من فترة الانتظار: كله مؤهَّل', async () => {
        const db = makeDb();
        seedLedger(db, { wallet: 'beans_w', delta: 500, ageHours: 100 });
        wireMocks(db);
        expect(await getEligibleBeansWForUsd('u1', 72, null)).toBe(500);
    });

    test('كل الرصيد أحدث من فترة الانتظار: لا شيء مؤهَّل', async () => {
        const db = makeDb();
        seedLedger(db, { wallet: 'beans_w', delta: 500, ageHours: 10 });
        wireMocks(db);
        expect(await getEligibleBeansWForUsd('u1', 72, null)).toBe(0);
    });

    test('خصم سابق (استبدال جزئي) يستهلك الأقدم أولاً (FIFO) — المتبقي الأحدث غير مؤهَّل', async () => {
        const db = makeDb();
        // ✅ 300 قديمة (100 ساعة) + 300 حديثة (10 ساعات) = 600 بالرصيد الحالي
        seedLedger(db, { wallet: 'beans_w', delta: 300, ageHours: 100 });
        seedLedger(db, { wallet: 'beans_w', delta: 300, ageHours: 10 });
        // ✅ خصم 300 سابق (مثلاً استبدال سابق لكوينز) — يستهلك الدفعة القديمة بالكامل أولاً
        seedLedger(db, { wallet: 'beans_w', delta: -300, ageHours: 5 });
        wireMocks(db);
        // المتبقي بالطابور: فقط الدفعة الحديثة (10 ساعات) — غير مؤهَّلة بعد
        expect(await getEligibleBeansWForUsd('u1', 72, null)).toBe(0);
    });

    test('مزيج قديم/حديث بلا أي خصم: فقط الجزء الأقدم من الحدّ مؤهَّل', async () => {
        const db = makeDb();
        seedLedger(db, { wallet: 'beans_w', delta: 400, ageHours: 100 }); // مؤهَّلة
        seedLedger(db, { wallet: 'beans_w', delta: 200, ageHours: 10 }); // غير مؤهَّلة
        wireMocks(db);
        expect(await getEligibleBeansWForUsd('u1', 72, null)).toBe(400);
    });
});

describe('redeemGifts — تحويل لكوينز (coins)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('يحوّل beans_w + beans_p معاً 1:1 إلى coins_bonus فوراً، بصرف النظر عن العمر', async () => {
        const db = makeDb();
        seedUser(db, { walletBeansW: 300, walletBeansP: 200 });
        seedLedger(db, { wallet: 'beans_w', delta: 300, ageHours: 1 }); // حديثة جداً — لا يهم هنا
        wireMocks(db);
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue(defaultSettings());

        const req = mockReq({ body: { redeemTo: 'coins' } });
        const res = mockRes();
        await redeemGifts(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const user = db.users.get('u1');
        expect(user.walletBeansW).toBe(0);
        expect(user.walletBeansP).toBe(0);
        expect(user.walletCoinsBonus).toBe(500);
        expect(res.json.mock.calls[0][0].data.finalAmount).toBe(500);
    });

    test('لا بينز إطلاقاً: يُرفَض 400 بلا أي كتابة', async () => {
        const db = makeDb();
        seedUser(db, { walletBeansW: 0, walletBeansP: 0 });
        wireMocks(db);
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue(defaultSettings());

        const req = mockReq({ body: { redeemTo: 'coins' } });
        const res = mockRes();
        await redeemGifts(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('redeemGifts — تحويل لدولار (balance) — فترة الانتظار + beans_p لا تصل أبداً', () => {
    afterEach(() => jest.restoreAllMocks());

    test('beans_w مؤهَّلة بالكامل: تتحوّل لدولار حسب نسبة الدفع، ويبقى الرصيد غير المؤهَّل فقط', async () => {
        const db = makeDb();
        seedUser(db, { walletBeansW: 1000, walletBeansP: 0, level: 1 });
        seedLedger(db, { wallet: 'beans_w', delta: 1000, ageHours: 100 });
        wireMocks(db);
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue(defaultSettings()); // بعد الإطلاق، مستوى 1 => 65%

        const req = mockReq({ body: { redeemTo: 'balance' } });
        const res = mockRes();
        await redeemGifts(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const user = db.users.get('u1');
        expect(user.walletBeansW).toBe(0);
        // 1000 بينز × 65% ÷ 1000 كوينز/دولار = 0.65$
        expect(user.walletUsdCents).toBe(65);
        expect(res.json.mock.calls[0][0].data.finalAmount).toBeCloseTo(0.65, 2);
    });

    test('beans_w كلها أحدث من فترة الانتظار: يُرفَض 400 بلا أي خصم', async () => {
        const db = makeDb();
        seedUser(db, { walletBeansW: 1000, walletBeansP: 0 });
        seedLedger(db, { wallet: 'beans_w', delta: 1000, ageHours: 5 });
        wireMocks(db);
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue(defaultSettings());

        const req = mockReq({ body: { redeemTo: 'balance' } });
        const res = mockRes();
        await redeemGifts(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        const user = db.users.get('u1');
        expect(user.walletBeansW).toBe(1000); // ✅ بلا أي تغيير
        expect(user.walletUsdCents).toBe(0);
    });

    test('beans_p لا تصل للدولار أبداً مهما قَدِم عمرها — غير مُستعلَمة أصلاً بمسار beans_w', async () => {
        const db = makeDb();
        // beans_p وحدها (بدون beans_w إطلاقاً) — حتى لو أُضيف لها قيد قديم جداً
        seedUser(db, { walletBeansW: 0, walletBeansP: 1000 });
        seedLedger(db, { wallet: 'beans_p', delta: 1000, ageHours: 1000 });
        wireMocks(db);
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue(defaultSettings());

        const req = mockReq({ body: { redeemTo: 'balance' } });
        const res = mockRes();
        await redeemGifts(req, res);

        expect(res.status).toHaveBeenCalledWith(400); // ✅ لا شيء مؤهَّل بمحفظة beans_w أصلاً
        const user = db.users.get('u1');
        expect(user.walletBeansP).toBe(1000); // ✅ بلا أي تغيير — لم تُلمَس إطلاقاً
        expect(user.walletUsdCents).toBe(0);
    });

    test('أثناء فترة الإطلاق: نسبة الإطلاق تُستخدَم بصرف النظر عن مستوى المضيف', async () => {
        const db = makeDb();
        seedUser(db, { walletBeansW: 1000, walletBeansP: 0, level: 1 });
        seedLedger(db, { wallet: 'beans_w', delta: 1000, ageHours: 100 });
        wireMocks(db);
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue(
            defaultSettings({ payoutLaunchEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24) })
        );

        const req = mockReq({ body: { redeemTo: 'balance' } });
        const res = mockRes();
        await redeemGifts(req, res);

        const user = db.users.get('u1');
        expect(user.walletUsdCents).toBe(70); // 1000 × 70% ÷ 1000 = 0.70$ = 70 سنت
    });
});

describe('getRedeemableGifts — ملخّص الاستبدال', () => {
    afterEach(() => jest.restoreAllMocks());

    test('يُرجع coinsIfRedeemed = beansW+beansP، وusdIfRedeemed من الجزء المؤهَّل فقط', async () => {
        const db = makeDb();
        seedUser(db, { walletBeansW: 1000, walletBeansP: 500, level: 1 });
        seedLedger(db, { wallet: 'beans_w', delta: 1000, ageHours: 100 });
        wireMocks(db);
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue(defaultSettings());

        const req = mockReq();
        const res = mockRes();
        await getRedeemableGifts(req, res);

        const data = res.json.mock.calls[0][0].data;
        expect(data.coinsIfRedeemed).toBe(1500);
        expect(data.totalGiftsCount).toBe(1);
        expect(data.usdIfRedeemed).toBeCloseTo(0.65, 2);
        expect(data.redemptionRatePercent).toBe(65);
    });

    test('بلا أي بينز: totalGiftsCount صفر', async () => {
        const db = makeDb();
        seedUser(db, { walletBeansW: 0, walletBeansP: 0 });
        wireMocks(db);
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue(defaultSettings());

        const req = mockReq();
        const res = mockRes();
        await getRedeemableGifts(req, res);

        expect(res.json.mock.calls[0][0].data.totalGiftsCount).toBe(0);
    });
});
