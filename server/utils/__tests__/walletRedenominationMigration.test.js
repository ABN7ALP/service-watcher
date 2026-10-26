// ملف: walletRedenominationMigration.test.js
// 🛡️ دفتر الأستاذ (feat/wallet-ledger-v1): يختبر إعادة التسمية ×10 — كل قيمة مقوَّمة بالكوينز
// (أسعار الكتالوج، السجلّات التاريخية، تراكمات الغرف/الدوري، إعدادات النظام) تُضاعَف ×10
// بالضبط، أرصدة المستخدمين تُفتَح بدفتر الأستاذ (coins_paid/usd_cents/beans_w) بالقيمة
// الصحيحة، الهدايا غير المستبدَلة تُعلَّم مستبدَلة بعد تحويل قيمتها لـbeans_w، وتشغيل المهمة
// مرتين متتاليتين لا يُغيِّر شيئاً (JobRun + idempotencyKey معاً). نفس استراتيجية هذا المشروع
// الثابتة — jest.spyOn على نماذج Mongoose الحقيقية بمحاكاة حالة بذاكرة JS بسيطة
//
// 🛡️ مراجعة ما قبل الدمج (6 عوائق) — عائق #2: JobRun 'running'->'completed' قابلة للاستئناف،
// وكل مستند/مستخدم يحمل علم redenominatedV1/walletRedenominatedV1 خاصاً به — يمنع إعادة
// تضخيم مستند مرتين حتى لو تعطّلت العملية بمنتصفها بالضبط. اختبارات هذا الملف تحاكي تعطّلاً
// حقيقياً (استثناء يُرمى بمنتصف مرحلة المجموعات، وآخر بمنتصف مرحلة المستخدمين)، إعادة تشغيل،
// ثم تشغيلاً ثالثاً، وتتحقق أن كل قيمة انتهت ×10 مرة واحدة بالضبط بصرف النظر عن أين تعطّلت

jest.useFakeTimers();

const mongoose = require('mongoose');
const User = require('../../models/User');
const Gift = require('../../models/Gift');
const ProfileFrame = require('../../models/ProfileFrame');
const ChatBubbleSkin = require('../../models/ChatBubbleSkin');
const CustomGift = require('../../models/CustomGift');
const GiftLog = require('../../models/GiftLog');
const CoinPurchase = require('../../models/CoinPurchase');
const GiftRedemption = require('../../models/GiftRedemption');
const FanClubMembership = require('../../models/FanClubMembership');
const VoiceRoom = require('../../models/VoiceRoom');
const PkStanding = require('../../models/PkStanding');
const SystemSettings = require('../../models/SystemSettings');
const JobRun = require('../../models/JobRun');
const LedgerEntry = require('../../models/LedgerEntry');
const { runMigration } = require('../walletRedenominationMigration');

function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (cur[parts[i]] == null) cur[parts[i]] = {};
        cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
}

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.session = () => p;
    p.sort = () => p;
    p.lean = () => p;
    p.limit = () => p;
    return p;
}

// ✅ مطابقة فلتر عامة (تدعم $ne فقط — كل ما تحتاجه دوال الترحيل) — مستخدَمة بـaggregate/updateMany معاً
function matchFilter(doc, filter) {
    return Object.entries(filter || {}).every(([k, cond]) => {
        const val = getPath(doc, k);
        if (cond && typeof cond === 'object' && '$ne' in cond) return val !== cond.$ne;
        return val === cond;
    });
}

// ✅ محاكاة صغيرة لتعبيرات aggregation-pipeline المُستخدَمة بتحديثات Gift/GiftRedemption
// الشرطية ($multiply/$cond/$ne/$eq) — بقدر ما يكفي تماماً لما تكتبه الدالة الحقيقية، لا أكثر
function evalExpr(doc, expr) {
    if (expr === null || typeof expr !== 'object') {
        if (typeof expr === 'string' && expr.startsWith('$')) return getPath(doc, expr.slice(1));
        return expr;
    }
    if ('$multiply' in expr) return expr.$multiply.reduce((acc, e) => acc * evalExpr(doc, e), 1);
    if ('$cond' in expr) {
        const [cond, thenExpr, elseExpr] = expr.$cond;
        return evalCond(doc, cond) ? evalExpr(doc, thenExpr) : evalExpr(doc, elseExpr);
    }
    throw new Error('evalExpr: تعبير غير مدعوم بالمحاكاة: ' + JSON.stringify(expr));
}
function evalCond(doc, cond) {
    if ('$ne' in cond) { const [a, b] = cond.$ne; return evalExpr(doc, a) !== evalExpr(doc, b); }
    if ('$eq' in cond) { const [a, b] = cond.$eq; return evalExpr(doc, a) === evalExpr(doc, b); }
    throw new Error('evalCond: شرط غير مدعوم بالمحاكاة: ' + JSON.stringify(cond));
}

function applyUpdateToDoc(doc, update) {
    if (Array.isArray(update)) {
        update.forEach(stage => {
            if (stage.$set) for (const [k, expr] of Object.entries(stage.$set)) setPath(doc, k, evalExpr(doc, expr));
        });
    } else {
        if (update.$mul) for (const [k, factor] of Object.entries(update.$mul)) setPath(doc, k, (getPath(doc, k) || 0) * factor);
        if (update.$set) for (const [k, v] of Object.entries(update.$set)) setPath(doc, k, v);
    }
}

// ✅ محاكاة عامة لمجموعة Mongoose بسيطة (بلا $gte/معاملات) — aggregate (مجموع حسب فلتر)،
// updateMany (كائن $mul/$set عادي أو مصفوفة aggregation-pipeline)، بما يكفي تماماً لما
// تحتاجه دالة الترحيل نفسها، لا أكثر
function wireSimpleCollection(Model, docs) {
    jest.spyOn(Model, 'aggregate').mockImplementation(([{ $match: filter }, { $group }]) => {
        const field = $group.total.$sum.slice(1); // "$price" -> "price"
        const matching = docs.filter(d => matchFilter(d, filter));
        const total = matching.reduce((sum, d) => sum + (getPath(d, field) || 0), 0);
        return Promise.resolve([{ _id: null, total }]);
    });
    jest.spyOn(Model, 'updateMany').mockImplementation((filter, update) => {
        const matching = docs.filter(d => matchFilter(d, filter));
        matching.forEach(d => applyUpdateToDoc(d, update));
        return Promise.resolve({ modifiedCount: matching.length });
    });
}

function makeDb() {
    return {
        users: [], gifts: [], frames: [], skins: [], customGifts: [], giftLogs: [],
        purchases: [], redemptions: [], fanMemberships: [], rooms: [], standings: [],
        settings: { singletonKey: 'main', coinExchangeRate: 100, pkSupportLpDivisor: 100, pkMinSupportCoins: 50, customGiftDesignFeeCoins: 500, customGiftSendPriceCoins: 100 },
        jobRuns: new Map(),
        ledgerByKey: new Map()
    };
}

function seedUser(db, overrides) {
    const user = {
        _id: 'u_default', coins: 0, balance: 0,
        walletCoinsPaid: 0, walletCoinsBonus: 0, walletBeansW: 0, walletBeansP: 0, walletUsdCents: 0,
        supportMissions: { bonusXP: 0 }, walletRedenominatedV1: false,
        ...overrides
    };
    db.users.push(user);
    return user;
}

function jobRunKey(filter) {
    return `${filter.job}:${filter.weekStart.getTime()}`;
}

function wireMocks(db) {
    wireSimpleCollection(Gift, db.gifts);
    wireSimpleCollection(ProfileFrame, db.frames);
    wireSimpleCollection(ChatBubbleSkin, db.skins);
    wireSimpleCollection(CustomGift, db.customGifts);
    wireSimpleCollection(CoinPurchase, db.purchases);
    wireSimpleCollection(GiftRedemption, db.redemptions);
    wireSimpleCollection(FanClubMembership, db.fanMemberships);
    wireSimpleCollection(VoiceRoom, db.rooms);
    wireSimpleCollection(PkStanding, db.standings);
    // ✅ User.aggregate فقط (بند REPORT_FIELDS الخاص بـsupportMissions.bonusXP، للعرض فقط) —
    // بلا updateMany هنا، فتضخيم bonusXP الفعلي يحدث عبر User.updateOne بمعاملة كل مستخدم
    jest.spyOn(User, 'aggregate').mockImplementation(([{ $match: filter }, { $group }]) => {
        const field = $group.total.$sum.slice(1);
        const matching = db.users.filter(u => matchFilter(u, filter));
        const total = matching.reduce((sum, u) => sum + (getPath(u, field) || 0), 0);
        return Promise.resolve([{ _id: null, total }]);
    });
    jest.spyOn(SystemSettings, 'aggregate').mockImplementation(([{ $match: filter }, { $group }]) => {
        const field = $group.total.$sum.slice(1);
        const total = matchFilter(db.settings, filter) ? (getPath(db.settings, field) || 0) : 0;
        return Promise.resolve([{ _id: null, total }]);
    });
    jest.spyOn(SystemSettings, 'updateMany').mockImplementation((filter, update) => {
        if (matchFilter(db.settings, filter)) applyUpdateToDoc(db.settings, update);
        return Promise.resolve({ modifiedCount: 1 });
    });

    // ✅ GiftLog خاصة: aggregate تدعم كلا الاستخدامين (مجموع عام بفلتر {} لـunitPrice/totalPrice
    // بمرحلة المجموعات، ومجموع غير مستبدَل خاص بمستخدم لحساب beans_w الافتتاحية)، وupdateMany
    // تدعم كلا الاستخدامين (تضخيم جماعي $mul بمرحلة المجموعات، وتعليم {redeemed:true} الخاص
    // بمستخدم بمرحلة المستخدمين) — بنفس matchFilter/applyUpdateToDoc العامتين لا شيء خاص
    jest.spyOn(GiftLog, 'aggregate').mockImplementation(([{ $match: filter }, { $group }]) => {
        const field = $group.total.$sum.slice(1);
        const matching = db.giftLogs.filter(d => matchFilter(d, filter));
        const total = matching.reduce((sum, d) => sum + (getPath(d, field) || 0), 0);
        return Promise.resolve([{ _id: null, total }]);
    });
    jest.spyOn(GiftLog, 'updateMany').mockImplementation((filter, update) => {
        const matching = db.giftLogs.filter(d => matchFilter(d, filter));
        matching.forEach(d => applyUpdateToDoc(d, update));
        return chainable({ modifiedCount: matching.length });
    });

    // ✅ User.find(filter).select(...).cursor() — تحترم الفلتر فعلياً (مهم: !dryRun يُمرّر
    // {walletRedenominatedV1:{$ne:true}} لتخطّي من فُتحت محفظته فعلاً عند الاستئناف)
    jest.spyOn(User, 'find').mockImplementation((filter = {}) => {
        const matching = db.users.filter(u => matchFilter(u, filter));
        let i = 0;
        return {
            select: () => ({
                cursor: () => ({
                    next: () => Promise.resolve(i < matching.length ? matching[i++] : null)
                })
            })
        };
    });
    jest.spyOn(User, 'findById').mockImplementation((id) => chainable(db.users.find(u => String(u._id) === String(id)) || null));
    jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.users.find(u => String(u._id) === String(filter._id));
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
        const row = db.users.find(u => String(u._id) === String(filter._id));
        if (!row) return chainable({ matchedCount: 0 });
        applyUpdateToDoc(row, update);
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
        withTransaction: async (fn) => fn(),
        endSession: async () => {}
    }));

    jest.spyOn(JobRun, 'findOne').mockImplementation((filter) => chainable(db.jobRuns.get(jobRunKey(filter)) || null));
    jest.spyOn(JobRun, 'create').mockImplementation((doc) => {
        const key = jobRunKey(doc);
        if (db.jobRuns.has(key)) {
            const err = new Error('E11000 duplicate key'); err.code = 11000; return Promise.reject(err);
        }
        db.jobRuns.set(key, { ...doc });
        return Promise.resolve(doc);
    });
    jest.spyOn(JobRun, 'updateOne').mockImplementation((filter, update) => {
        const row = db.jobRuns.get(jobRunKey(filter));
        if (row && update.$set) Object.assign(row, update.$set);
        return Promise.resolve({ matchedCount: row ? 1 : 0 });
    });
}

describe('walletRedenominationMigration — dry-run (لا يكتب شيئاً)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('يُعيد جدولاً صحيحاً (بعد = قبل×10) بلا أي كتابة فعلية — تشغيل مزدوج يُعيد نفس الأرقام بالضبط', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 100, balance: 5 });
        db.gifts.push({ _id: 'g1', price: 50, discountedPrice: null });
        wireMocks(db);

        const result1 = await runMigration({ dryRun: true });
        expect(result1.skipped).toBe(false);
        expect(result1.allOk).toBe(true);

        // ✅ لا كتابة فعلية حدثت — تشغيل ثانٍ يُعيد تماماً نفس الأرقام (لا تضاعف تراكمي)
        const result2 = await runMigration({ dryRun: true });
        expect(result2.rows).toEqual(result1.rows);
        expect(db.gifts[0].price).toBe(50); // ✅ لم يتغيّر إطلاقاً
        expect(db.users[0].walletCoinsPaid).toBe(0); // ✅ لم تُفتَح أي محفظة فعلياً
    });
});

describe('walletRedenominationMigration — apply (يكتب فعلياً)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('كل القيم البسيطة تُضاعَف ×10 بالضبط', async () => {
        const db = makeDb();
        db.gifts.push({ _id: 'g1', price: 50, discountedPrice: 40 }, { _id: 'g2', price: 100, discountedPrice: null });
        db.frames.push({ _id: 'f1', prices: { day1: 100, day3: 200, day7: 300 } });
        db.skins.push({ _id: 's1', price: 20 });
        db.customGifts.push({ _id: 'cg1', createCost: 500, sendPrice: 100 });
        db.giftLogs.push({ _id: 'gl1', receiver: 'u_other', redeemed: true, unitPrice: 10, totalPrice: 20 });
        db.purchases.push({ _id: 'cp1', coinsAmount: 1000 });
        db.redemptions.push({ _id: 'gr1', redeemedTo: 'coins', originalCoinsValue: 300, finalAmount: 300 });
        db.redemptions.push({ _id: 'gr2', redeemedTo: 'balance', originalCoinsValue: 300, finalAmount: 2.7 });
        db.fanMemberships.push({ _id: 'fm1', points: 400 });
        db.rooms.push({ _id: 'r1', supportPoints: 5000, sessionSupportPoints: 200 });
        db.standings.push({ _id: 'st1', supportCoins: 600 });
        wireMocks(db);

        const result = await runMigration({ dryRun: false });
        expect(result.skipped).toBe(false);
        expect(result.allOk).toBe(true);

        expect(db.gifts[0].price).toBe(500);
        expect(db.gifts[0].discountedPrice).toBe(400);
        expect(db.gifts[1].discountedPrice).toBeNull(); // ✅ null لم يُلمَس إطلاقاً (لا $mul على null)
        expect(db.gifts[0].redenominatedV1).toBe(true);
        expect(db.frames[0].prices.day1).toBe(1000);
        expect(db.frames[0].prices.day7).toBe(3000);
        expect(db.skins[0].price).toBe(200);
        expect(db.customGifts[0].createCost).toBe(5000);
        expect(db.customGifts[0].sendPrice).toBe(1000);
        expect(db.giftLogs[0].unitPrice).toBe(100);
        expect(db.giftLogs[0].totalPrice).toBe(200);
        expect(db.purchases[0].coinsAmount).toBe(10000);
        expect(db.redemptions[0].finalAmount).toBe(3000); // coins -> ×10
        expect(db.redemptions[0].originalCoinsValue).toBe(3000);
        expect(db.redemptions[1].finalAmount).toBe(2.7); // balance (دولار) -> بلا تضخيم
        expect(db.redemptions[1].originalCoinsValue).toBe(3000); // لكن originalCoinsValue كوينز دوماً -> ×10
        expect(db.redemptions[1].redenominatedV1).toBe(true); // ✅ العلم يُضبَط حتى للمستندات الشرطية
        expect(db.fanMemberships[0].points).toBe(4000);
        expect(db.rooms[0].supportPoints).toBe(50000);
        expect(db.rooms[0].sessionSupportPoints).toBe(2000);
        expect(db.standings[0].supportCoins).toBe(6000);

        expect(db.settings.coinExchangeRate).toBe(1000);
        expect(db.settings.pkSupportLpDivisor).toBe(1000);
        expect(db.settings.pkMinSupportCoins).toBe(500);
        expect(db.settings.customGiftDesignFeeCoins).toBe(5000);
        expect(db.settings.customGiftSendPriceCoins).toBe(1000);
    });

    test('أرصدة المستخدمين: coins_paid وusd_cents يُفتَحان بدفتر الأستاذ بالقيمة الصحيحة، وbonusXP يُضخَّم بنفس معاملة الفتح', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 100, balance: 5.5, supportMissions: { bonusXP: 7 } });
        wireMocks(db);

        await runMigration({ dryRun: false });

        const user = db.users[0];
        expect(user.walletCoinsPaid).toBe(1000); // 100 × 10
        expect(user.walletUsdCents).toBe(550); // 5.5$ -> 550 سنت، بلا أي تضخيم
        expect(user.coins).toBe(1000); // ✅ المرآة القديمة تزامنت تلقائياً عبر walletService
        expect(user.balance).toBe(5.5); // ✅ بلا تغيير — دولار حقيقي
        expect(user.supportMissions.bonusXP).toBe(70); // ✅ نفس معاملة فتح المحفظة بالضبط
        expect(user.walletRedenominatedV1).toBe(true);
    });

    test('هدايا غير مستبدَلة تُفتَح كـbeans_w بالقيمة الصحيحة (لا تضخيم مضاعَف بعد الترتيب الجديد) وتُعلَّم مستبدَلة', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 0, balance: 0 });
        db.giftLogs.push({ _id: 'gl1', receiver: 'u1', redeemed: false, unitPrice: 50, totalPrice: 150 });
        db.giftLogs.push({ _id: 'gl2', receiver: 'u1', redeemed: false, unitPrice: 20, totalPrice: 60 });
        db.giftLogs.push({ _id: 'gl3', receiver: 'other', redeemed: false, unitPrice: 20, totalPrice: 60 }); // ✅ مستخدم آخر — لا يُلمَس
        wireMocks(db);

        await runMigration({ dryRun: false });

        const user = db.users[0];
        // ✅ المجموعات (GiftLog.totalPrice) ضُخِّمت أولاً ×10 فعلاً، فمحفظة المستخدم تقرأ القيمة
        // المُضخَّمة بالفعل وتفتح بها مباشرة بلا ضرب إضافي: (150+60)×10 = 2100 بالضبط، لا 21000
        expect(user.walletBeansW).toBe(2100);
        expect(db.giftLogs[0].redeemed).toBe(true);
        expect(db.giftLogs[1].redeemed).toBe(true);
        expect(db.giftLogs[2].redeemed).toBe(false); // ✅ مستخدم آخر لم يُلمَس
        expect(db.giftLogs[0].totalPrice).toBe(1500); // ✅ تضخيم المجموعة العام (منفصل عن فتح المحفظة) مرة واحدة فقط
        expect(db.giftLogs[1].totalPrice).toBe(600);
    });

    test('تشغيل المهمة مرتين: الثانية تتخطّى بالكامل (JobRun completed) — لا تضاعف تراكمي', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 100, balance: 5 });
        db.gifts.push({ _id: 'g1', price: 50, discountedPrice: null });
        wireMocks(db);

        await runMigration({ dryRun: false });
        const afterFirst = { price: db.gifts[0].price, coinsPaid: db.users[0].walletCoinsPaid };
        expect(db.jobRuns.get(jobRunKey({ job: require('../walletRedenominationMigration').JOB_NAME, weekStart: require('../walletRedenominationMigration').SENTINEL_WEEK_START })).status).toBe('completed');

        const result2 = await runMigration({ dryRun: false });
        expect(result2.skipped).toBe(true);
        expect(db.gifts[0].price).toBe(afterFirst.price); // ✅ ليس ×100 — لم يُلمَس ثانية إطلاقاً
        expect(db.users[0].walletCoinsPaid).toBe(afterFirst.coinsPaid);
    });

    test('مستخدم بلا أي رصيد (coins=0, balance=0, بلا هدايا): لا قيود دفتر أستاذ تُكتَب له، لكن علمه يُضبَط فلا يُعاد فحصه', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 0, balance: 0 });
        wireMocks(db);

        await runMigration({ dryRun: false });

        expect(db.ledgerByKey.size).toBe(0);
        expect(db.users[0].walletCoinsPaid).toBe(0);
        expect(db.users[0].walletRedenominatedV1).toBe(true);
    });
});

describe('walletRedenominationMigration — تعطّل واستئناف (مراجعة ما قبل الدمج، عائق #2)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('JobRun بحالة "running" (من عملية تعطّلت) تُستأنَف — لا تُعامَل كـ"نُفِّذت فعلاً"', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 100, balance: 0 });
        wireMocks(db);

        // ✅ محاكاة JobRun ادّعاها إقلاع سابق للسيرفر ثم تعطّل قبل أن يكتمل (لا status:'completed' أبداً)
        db.jobRuns.set(jobRunKey({ job: require('../walletRedenominationMigration').JOB_NAME, weekStart: require('../walletRedenominationMigration').SENTINEL_WEEK_START }), {
            job: require('../walletRedenominationMigration').JOB_NAME,
            weekStart: require('../walletRedenominationMigration').SENTINEL_WEEK_START,
            status: 'running'
        });

        const result = await runMigration({ dryRun: false });
        expect(result.skipped).toBe(false); // ✅ لم تُتخطَّ — استؤنفت فعلياً
        expect(db.users[0].walletCoinsPaid).toBe(1000); // ✅ المحفظة فُتحت فعلياً بهذي العملية "المستأنَفة"
    });

    test('تعطّل بمنتصف مرحلة المجموعات ثم بمنتصف مرحلة المستخدمين، إعادة تشغيل بعد كل تعطّل، ثم تشغيل ثالث: كل قيمة ×10 مرة واحدة بالضبط، كل مستخدم يملك علماً واحداً وقيد افتتاح واحد لكل محفظة', async () => {
        const db = makeDb();
        db.gifts.push({ _id: 'g1', price: 50, discountedPrice: 20 });
        db.giftLogs.push({ _id: 'gl1', receiver: 'u1', redeemed: false, unitPrice: 10, totalPrice: 100 });
        seedUser(db, { _id: 'u1', coins: 10, balance: 0 });
        seedUser(db, { _id: 'u2', coins: 20, balance: 0 });
        wireMocks(db);

        // 🔥 محاكاة تعطّل أثناء تضخيم مجموعة GiftLog بالذات (منتصف مرحلة المجموعات بالضبط) —
        // نفرّق استدعاء التضخيم الجماعي ($mul بلا فلتر مستخدم) عن استدعاء تعليم "مستبدَلة" الخاص
        // بمستخدم (يحدث لاحقاً بمرحلة المستخدمين، إذا وصلتها العملية أصلاً)
        let giftLogUpdateCalls = 0;
        const realGiftLogUpdateMany = GiftLog.updateMany.getMockImplementation();
        GiftLog.updateMany.mockImplementation((filter, update) => {
            giftLogUpdateCalls++;
            if (giftLogUpdateCalls === 1 && update && !Array.isArray(update) && update.$mul) {
                throw Object.assign(new Error('محاكاة تعطّل أثناء تضخيم مجموعة GiftLog'), { simulatedCrash: true });
            }
            return realGiftLogUpdateMany(filter, update);
        });

        // ✅ محاولة أولى: تتعطّل بمنتصف مرحلة المجموعات (Gift نجحت فعلاً، GiftLog فجّرت الاستثناء)
        await expect(runMigration({ dryRun: false })).rejects.toThrow(/محاكاة تعطّل/);
        expect(db.gifts[0].redenominatedV1).toBe(true); // ✅ ما قبل التعطّل اكتمل فعلاً ولم يُلمَس ثانية لاحقاً
        expect(db.gifts[0].price).toBe(500);
        expect(db.giftLogs[0].redenominatedV1).toBeFalsy(); // ✅ GiftLog لم تُضخَّم بعد (تعطّلت قبل تطبيقها)
        expect(db.users[0].walletRedenominatedV1).toBeFalsy(); // ✅ مرحلة المستخدمين لم تبدأ إطلاقاً بعد

        // ✅ إزالة محاكاة التعطّل — المحاولة الثانية تُكمِل تضخيم المجموعات بالكامل، لكن تتعطّل
        // هذي المرة بمنتصف مرحلة المستخدمين (بعد نجاح u1، قبل نجاح u2)
        GiftLog.updateMany.mockImplementation(realGiftLogUpdateMany);
        // ✅ نُفرِّق استدعاء ضبط علم walletRedenominatedV1 (نهاية معاملة كل مستخدم بالضبط) عن
        // استدعاءات مزامنة مرآة coins/balance الداخلية بـwalletService.post (لا تحمل هذا الحقل)
        // — فنتعطّل بدقّة بعد اكتمال معاملة أول مستخدم بالكامل (علمه مضبوط) وقبل اكتمال معاملة الثاني
        let markerCalls = 0;
        const realUserUpdateOne = User.updateOne.getMockImplementation();
        User.updateOne.mockImplementation((filter, update) => {
            const isMarkerCall = update && update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'walletRedenominatedV1');
            if (isMarkerCall) {
                markerCalls++;
                if (markerCalls === 2) {
                    throw Object.assign(new Error('محاكاة تعطّل بمنتصف مرحلة المستخدمين (بعد أول مستخدم)'), { simulatedCrash: true });
                }
            }
            return realUserUpdateOne(filter, update);
        });

        await expect(runMigration({ dryRun: false })).rejects.toThrow(/محاكاة تعطّل/);
        expect(db.giftLogs[0].redenominatedV1).toBe(true); // ✅ مرحلة المجموعات اكتملت هذي المرة بالكامل
        expect(db.giftLogs[0].totalPrice).toBe(1000); // ✅ ×10 مرة واحدة بالضبط (ليس ×100)
        expect(db.users[0].walletRedenominatedV1).toBe(true); // ✅ u1 اكتمل قبل تعطّل u2
        expect(db.users[0].walletCoinsPaid).toBe(100);
        expect(db.users[1].walletRedenominatedV1).toBeFalsy(); // ✅ u2 لم يكتمل بعد

        // ✅ إزالة محاكاة التعطّل الثانية — محاولة ثالثة تُكمِل فقط ما تبقّى (u2)، ولا تُعيد لمس
        // ما اكتمل فعلاً (Gift/GiftLog/u1) إطلاقاً
        User.updateOne.mockImplementation(realUserUpdateOne);
        const result3 = await runMigration({ dryRun: false });
        expect(result3.skipped).toBe(false);
        expect(db.users[1].walletRedenominatedV1).toBe(true);
        expect(db.users[1].walletCoinsPaid).toBe(200); // 20 × 10 — مرة واحدة بالضبط

        // ✅ كل قيمة انتهت ×10 مرة واحدة بالضبط عبر الثلاث محاولات مجتمعة
        expect(db.gifts[0].price).toBe(500);
        expect(db.gifts[0].discountedPrice).toBe(200);
        expect(db.giftLogs[0].totalPrice).toBe(1000);
        expect(db.users[0].walletCoinsPaid).toBe(100);
        expect(db.users[1].walletCoinsPaid).toBe(200);
        // ✅ قيد افتتاح واحد بالضبط لكل (مستخدم، محفظة) — لا تكرار عبر محاولات الاستئناف المتعددة
        expect(db.ledgerByKey.has(`${require('../walletRedenominationMigration').JOB_NAME}:u1:coins_paid`)).toBe(true);
        expect(db.ledgerByKey.has(`${require('../walletRedenominationMigration').JOB_NAME}:u1:beans_w`)).toBe(true);
        expect(db.ledgerByKey.has(`${require('../walletRedenominationMigration').JOB_NAME}:u2:coins_paid`)).toBe(true);
        // ✅ u1:coins_paid + u1:beans_w (من gl1) + u2:coins_paid فقط — لا أي قيد مكرَّر عبر محاولات الاستئناف المتعددة
        expect(db.ledgerByKey.size).toBe(3);

        // ✅ تشغيل رابع (بعد الاكتمال الكامل): يتخطّى فوراً، لا يُغيّر شيئاً إطلاقاً
        const result4 = await runMigration({ dryRun: false });
        expect(result4.skipped).toBe(true);
        expect(db.gifts[0].price).toBe(500);
        expect(db.users[0].walletCoinsPaid).toBe(100);
        expect(db.users[1].walletCoinsPaid).toBe(200);
        expect(db.ledgerByKey.size).toBe(3);
    });
});
