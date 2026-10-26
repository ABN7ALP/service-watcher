// ملف: walletRedenominationMigration.test.js
// 🛡️ دفتر الأستاذ (feat/wallet-ledger-v1): يختبر إعادة التسمية ×10 — كل قيمة مقوَّمة بالكوينز
// (أسعار الكتالوج، السجلّات التاريخية، تراكمات الغرف/الدوري، إعدادات النظام) تُضاعَف ×10
// بالضبط، أرصدة المستخدمين تُفتَح بدفتر الأستاذ (coins_bonus/beans_p — بداية نظيفة) بالقيمة
// الصحيحة، الهدايا غير المستبدَلة تُعلَّم مستبدَلة بعد تحويل قيمتها، وتشغيل المهمة مرتين
// متتاليتين لا يُغيِّر شيئاً (JobRun + idempotencyKey معاً). نفس استراتيجية هذا المشروع
// الثابتة — jest.spyOn على نماذج Mongoose الحقيقية بمحاكاة حالة بذاكرة JS بسيطة
//
// 🛡️ مراجعة إنتاج ثانية (بعد دمج+تراجع PR #131 — "6 blockers v2"):
//   - عائق #2 (موروث): JobRun 'running'->'completed' قابلة للاستئناف؛ علم redenominatedV1
//     يمنع إعادة تضخيم مستند مرتين حتى لو تعطّلت العملية بمنتصفها بالضبط.
//   - البند 1 (جديد): SystemSettings — مستند إعدادات بشكل إنتاج حقيقي (production-shape:
//     مفتقِد حقولاً أُضيفت للمخطط لاحقاً) يُضخَّم effective-value صحيحة، لا صفراً زائفاً؛
//     assertScaledSettingsPositive تُفجِّر خطأً لو انتهت قيمة ما ≤0؛ resolveMigrationStartup
//     يرفض فتح الموقع لو قاسم مالي حقيقي ≤0 بصرف النظر عن اكتمال الترحيل.
//   - البند 2 (جديد): بداية نظيفة — coins_bonus/beans_p لا coins_paid/beans_w، لا usd_cents
//     افتتاحي إطلاقاً، oldBalanceUsd محفوظ بـmeta قيود الافتتاح.
//   - البند 3 (جديد، تقرير): أعلى 10 مستخدمين بالكوينز/الرصيد القديمين + إجماليات المحافظ بعد العملية.

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
const {
    runMigration, resolveMigrationStartup, WALLET_MIGRATION_OFF_MESSAGE,
    JOB_NAME, SENTINEL_WEEK_START
} = require('../walletRedenominationMigration');

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

// ✅ محاكاة بشكل إنتاج حقيقي (production-shape): بلا الحقول الخمسة المُضخَّمة إطلاقاً (لا حتى
// undefined — تماماً كمستند Mongo حقيقي أُنشئ قبل إضافة هذي الحقول للمخطط). singletonKey
// فقط موجود، كما تماماً المستند الحقيقي الذي فجّر العلّة بترحيل إنتاجي سابق
function makeProductionShapeSettings() {
    return { singletonKey: 'main' };
}

function makeDb() {
    return {
        users: [], gifts: [], frames: [], skins: [], customGifts: [], giftLogs: [],
        purchases: [], redemptions: [], fanMemberships: [], rooms: [], standings: [],
        settings: { singletonKey: 'main', coinExchangeRate: 100, pkSupportLpDivisor: 100, pkMinSupportCoins: 50, customGiftDesignFeeCoins: 500, customGiftSendPriceCoins: 100, coinsPerUsd: 1000 },
        jobRuns: new Map(),
        ledgerByKey: new Map()
    };
}

function seedUser(db, overrides) {
    const user = {
        _id: 'u_default', username: overrides.username || overrides._id || 'u_default', coins: 0, balance: 0,
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

// ✅ يُحاكي hydration الحقيقي لـMongoose (SystemSettings.getSettings الفعلية): حقل مفتقِد
// بالمستند المخزَّن (undefined حرفياً) يُستبدَل بالافتراضي الحيّ بالمخطط؛ حقل مخزَّن فعلياً
// (حتى لو صفراً) يبقى كما هو بلا أي استبدال — هذا بالضبط ما يُفرِّق "effective" الصحيحة
function hydrateSettingsLikeMongoose(raw) {
    const result = { ...raw };
    SystemSettings.schema.eachPath((pathName, schemaType) => {
        if (result[pathName] === undefined) {
            const def = schemaType.getDefault();
            if (def !== undefined) result[pathName] = def;
        }
    });
    return result;
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
    // ✅ User.aggregate: بند REPORT_FIELDS الخاص بـsupportMissions.bonusXP (للعرض فقط) + تجميع
    // إجماليات المحافظ الحيّة (sumCurrentWalletTotals بـrunMigration) بتوقيع $group مختلف —
    // نُفرِّق بوجود مفتاح coins_paid بالـ$group (توقيع الإجماليات) من عدمه (توقيع REPORT_FIELDS)
    jest.spyOn(User, 'aggregate').mockImplementation((pipeline) => {
        const groupStage = pipeline.find(s => s.$group).$group;
        if ('coins_paid' in groupStage) {
            // ✅ sumCurrentWalletTotals — مرحلة واحدة فقط (بلا $match)، توقيعها الخماسي مختلف عن REPORT_FIELDS
            const totals = { coins_paid: 0, coins_bonus: 0, beans_w: 0, beans_p: 0, usd_cents: 0 };
            const fieldByWallet = { coins_paid: 'walletCoinsPaid', coins_bonus: 'walletCoinsBonus', beans_w: 'walletBeansW', beans_p: 'walletBeansP', usd_cents: 'walletUsdCents' };
            for (const u of db.users) for (const w of Object.keys(totals)) totals[w] += (u[fieldByWallet[w]] || 0);
            return Promise.resolve([{ _id: null, ...totals }]);
        }
        const matchStage = pipeline.find(s => s.$match);
        const filter = matchStage ? matchStage.$match : {};
        const field = groupStage.total.$sum.slice(1);
        const matching = db.users.filter(u => matchFilter(u, filter));
        const total = matching.reduce((sum, u) => sum + (getPath(u, field) || 0), 0);
        return Promise.resolve([{ _id: null, total }]);
    });

    // 🛡️ مراجعة إنتاج v2 (البند 1): SystemSettings.findOne (lean) — مسار القراءة الخام
    // الجديد (readEffectiveOldSettingsValue + COLLECTION_SCALERS.SystemSettings.apply)، لا
    // hydration إطلاقاً هنا (يُخفي فجوة الحقل المفتقَد تماماً كما بالعلّة الحقيقية)
    jest.spyOn(SystemSettings, 'findOne').mockImplementation((filter) => chainable(matchFilter(db.settings, filter) ? { ...db.settings } : null));
    // ✅ getSettings الحقيقية تُطبِّق hydration (الافتراضي الحيّ بالمخطط لحقل مفتقَد فقط) —
    // تُستخدَم بـassertScaledSettingsPositive/assertMoneyDivisorsSane فقط، لا بمسار الكتابة
    jest.spyOn(SystemSettings, 'getSettings').mockImplementation(() => Promise.resolve(hydrateSettingsLikeMongoose(db.settings)));
    jest.spyOn(SystemSettings, 'updateMany').mockImplementation((filter, update) => {
        if (matchFilter(db.settings, filter)) applyUpdateToDoc(db.settings, update);
        return Promise.resolve({ modifiedCount: 1 });
    });

    // ✅ GiftLog خاصة: aggregate تدعم كلا الاستخدامين (مجموع عام بفلتر {} لـunitPrice/totalPrice
    // بمرحلة المجموعات، ومجموع غير مستبدَل خاص بمستخدم لحساب beans_p الافتتاحية)، وupdateMany
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
        expect(db.users[0].walletCoinsBonus).toBe(0); // ✅ لم تُفتَح أي محفظة فعلياً
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
        expect(db.settings.redenominatedV1).toBe(true);
    });

    test('بداية نظيفة: coins القديمة ×10 -> coins_bonus (لا coins_paid)، oldBalanceUsd محفوظ بـmeta القيد، لا usd_cents افتتاحي إطلاقاً، وbonusXP يُضخَّم بنفس معاملة الفتح', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 100, balance: 5.5, supportMissions: { bonusXP: 7 } });
        wireMocks(db);

        await runMigration({ dryRun: false });

        const user = db.users[0];
        expect(user.walletCoinsBonus).toBe(1000); // 100 × 10 -> bonus لا paid
        expect(user.walletCoinsPaid).toBe(0); // ✅ لم يُلمَس إطلاقاً
        expect(user.walletUsdCents).toBe(0); // ✅ بداية نظيفة — لا افتتاح usd_cents إطلاقاً
        // ✅ مرآة balance القديمة تُعاد مزامنتها تلقائياً من walletUsdCents (=0) بمجرّد أي قيد
        // دفتر أستاذ لهذا المستخدم (walletService.post) — تُصفَّر، لا تبقى على قيمتها القديمة
        // المُخزَّنة المُنفصِلة عن دفتر الأستاذ، تماماً كما يقتضيه "لا أموال حقيقية استُلمت فعلاً"
        expect(user.balance).toBe(0);
        expect(user.supportMissions.bonusXP).toBe(70); // ✅ نفس معاملة فتح المحفظة بالضبط
        expect(user.walletRedenominatedV1).toBe(true);

        const entry = db.ledgerByKey.get(`${JOB_NAME}:u1:coins_bonus`);
        expect(entry).toBeTruthy();
        expect(entry.meta.oldBalanceUsd).toBe(5.5); // ✅ الرصيد الدولاري القديم محفوظ مرجعاً بالقيد
        expect(db.ledgerByKey.has(`${JOB_NAME}:u1:usd_cents`)).toBe(false); // ✅ لا قيد usd_cents إطلاقاً
    });

    test('هدايا غير مستبدَلة تُفتَح كـbeans_p (لا beans_w) بالقيمة الصحيحة (لا تضخيم مضاعَف) وتُعلَّم مستبدَلة', async () => {
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
        expect(user.walletBeansP).toBe(2100);
        expect(user.walletBeansW).toBe(0); // ✅ لم يُلمَس إطلاقاً — بداية نظيفة
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
        const afterFirst = { price: db.gifts[0].price, coinsBonus: db.users[0].walletCoinsBonus };
        expect(db.jobRuns.get(jobRunKey({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START })).status).toBe('completed');

        const result2 = await runMigration({ dryRun: false });
        expect(result2.skipped).toBe(true);
        expect(db.gifts[0].price).toBe(afterFirst.price); // ✅ ليس ×100 — لم يُلمَس ثانية إطلاقاً
        expect(db.users[0].walletCoinsBonus).toBe(afterFirst.coinsBonus);
    });

    test('مستخدم بلا أي رصيد (coins=0, balance=0, بلا هدايا): لا قيود دفتر أستاذ تُكتَب له، لكن علمه يُضبَط فلا يُعاد فحصه', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 0, balance: 0 });
        wireMocks(db);

        await runMigration({ dryRun: false });

        expect(db.ledgerByKey.size).toBe(0);
        expect(db.users[0].walletCoinsBonus).toBe(0);
        expect(db.users[0].walletRedenominatedV1).toBe(true);
    });
});

describe('walletRedenominationMigration — SystemSettings effective-value (مراجعة إنتاج v2، البند 1)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('مستند إعدادات بشكل إنتاج حقيقي (مفتقِد الحقول الخمسة كلياً): effective = الافتراضي القديم×10، لا صفراً زائفاً', async () => {
        const db = makeDb();
        db.settings = makeProductionShapeSettings(); // ✅ لا pkMinSupportCoins/customGiftDesignFeeCoins/... إطلاقاً
        wireMocks(db);

        const result = await runMigration({ dryRun: false });
        expect(result.skipped).toBe(false);

        // ✅ effective = SETTINGS_OLD_DEFAULTS (100/100/50/500/100) — ليس صفراً كما كان $mul
        // على حقل مفتقَد يفعل سابقاً — ×10 بالضبط
        expect(db.settings.coinExchangeRate).toBe(1000);
        expect(db.settings.pkSupportLpDivisor).toBe(1000);
        expect(db.settings.pkMinSupportCoins).toBe(500);
        expect(db.settings.customGiftDesignFeeCoins).toBe(5000);
        expect(db.settings.customGiftSendPriceCoins).toBe(1000);
        expect(db.settings.redenominatedV1).toBe(true);

        // ✅ التقرير نفسه (قبل/بعد) يعكس effective الصحيحة لا صفراً — بند "التقرير يعرض effective"
        const row = result.rows.find(r => r.label === 'SystemSettings.customGiftDesignFeeCoins');
        expect(row.before).toBe(500);
        expect(row.after).toBe(5000);
        expect(row.ok).toBe(true);
    });

    test('مستند إعدادات مفتقِد لحقل واحد فقط (pkSupportLpDivisor) وسط حقول أخرى مخزَّنة فعلياً: effective تُفرِّق بدقّة بين "مفتقَد" و"مخزَّن 0"', async () => {
        const db = makeDb();
        db.settings = {
            singletonKey: 'main',
            coinExchangeRate: 200, // ✅ مخزَّن فعلياً (ليس الافتراضي) — effective يجب أن يحترمه
            pkMinSupportCoins: 0, // ✅ مخزَّن فعلياً كصفر حقيقي — effective=0 (ليس الافتراضي 50)
            customGiftDesignFeeCoins: 500,
            customGiftSendPriceCoins: 100
            // pkSupportLpDivisor مفتقِد كلياً هنا عمداً
        };
        wireMocks(db);

        await expect(runMigration({ dryRun: false })).rejects.toMatchObject({ code: 'SETTINGS_SANITY_FAILED' });
        // ✅ coinExchangeRate المخزَّن فعلياً (200) ×10 احتُرِم بدقّة
        expect(db.settings.coinExchangeRate).toBe(2000);
        // ✅ pkSupportLpDivisor المفتقِد كلياً -> الافتراضي القديم (100) ×10
        expect(db.settings.pkSupportLpDivisor).toBe(1000);
        // ✅ pkMinSupportCoins المخزَّن فعلياً كصفر -> effective=0 -> ×10=0 (هذا بالضبط ما يُفجِّر assertScaledSettingsPositive لاحقاً)
        expect(db.settings.pkMinSupportCoins).toBe(0);
    });

    test('assertScaledSettingsPositive: حقل مُضخَّم انتهى ≤0 يُفجِّر خطأً ويُبقي JobRun "running" (قابلة للاستئناف، لا فتح الموقع بقاسم صفري)', async () => {
        const db = makeDb();
        db.settings.pkSupportLpDivisor = 0; // ✅ مخزَّن فعلياً كصفر — effective=0 -> ×10=0 -> يفشل التحقّق
        wireMocks(db);

        await expect(runMigration({ dryRun: false })).rejects.toMatchObject({ code: 'SETTINGS_SANITY_FAILED' });
        expect(db.jobRuns.get(jobRunKey({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START })).status).toBe('running'); // ✅ ليست 'completed'
        // ✅ المجموعة ذاتها (SystemSettings) علَّمت نفسها مُضخَّمة فعلاً (نتيجتها فقط كانت ≤0) —
        // الاستئناف لا يُعيد تضخيمها ثانية (علمها true فعلاً)؛ تصحيح القيمة يدوياً للقيمة
        // الصحيحة بعد التضخيم (كما سيفعل المُشغِّل فعلياً من لوحة الإدارة) هو المسار الصحيح
        expect(db.settings.redenominatedV1).toBe(true);
        expect(db.settings.pkSupportLpDivisor).toBe(0);

        db.settings.pkSupportLpDivisor = 1000; // ✅ تصحيح يدوي للقيمة الصحيحة بعد التضخيم
        const result2 = await runMigration({ dryRun: false });
        expect(result2.skipped).toBe(false);
        expect(db.settings.pkSupportLpDivisor).toBe(1000); // ✅ لم تُضخَّم ثانية (المجموعة مُعلَّمة فعلاً)
        expect(db.jobRuns.get(jobRunKey({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START })).status).toBe('completed');
    });
});

describe('resolveMigrationStartup — حارس القواسم المالية الدائم (مراجعة إنتاج v2، البند 1)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('قاسم مالي حقيقي ≤0 (coinsPerUsd) حتى بعد اكتمال الترحيل فعلاً: يرفض فتح الموقع', async () => {
        const db = makeDb();
        db.settings.coinsPerUsd = 0; // ✅ تعديل يدوي خاطئ لاحق من لوحة الإدارة، لا علاقة بالترحيل نفسه
        wireMocks(db);
        db.jobRuns.set(jobRunKey({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START }), { job: JOB_NAME, weekStart: SENTINEL_WEEK_START, status: 'completed' });

        const result = await resolveMigrationStartup({ env: {} });
        expect(result.ready).toBe(false);
        expect(result.divisorCheckFailed).toBe(true);
        expect(result.bad).toContain('coinsPerUsd');
    });

    test('كل القواسم المالية > 0: الموقع يُفتَح بشكل طبيعي', async () => {
        const db = makeDb();
        wireMocks(db);
        db.jobRuns.set(jobRunKey({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START }), { job: JOB_NAME, weekStart: SENTINEL_WEEK_START, status: 'completed' });

        const result = await resolveMigrationStartup({ env: {} });
        expect(result).toEqual({ ready: true, mode: 'already_completed' });
    });
});

describe('walletRedenominationMigration — تقرير أعلى 10 مستخدمين + إجماليات المحافظ (مراجعة إنتاج v2، البند 3)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('أعلى 10 بالكوينز القديمة وأعلى 10 بالرصيد الدولاري القديم مُرتَّبان تنازلياً بالاسم/المعرّف/القيمة الصحيحة', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', username: 'Ahmad', coins: 500, balance: 10 });
        seedUser(db, { _id: 'u2', username: 'Sara', coins: 50, balance: 100 });
        seedUser(db, { _id: 'u3', username: 'Omar', coins: 300, balance: 5 });
        wireMocks(db);

        const result = await runMigration({ dryRun: false });

        expect(result.topByOldCoins.map(u => u.id)).toEqual(['u1', 'u3', 'u2']);
        expect(result.topByOldCoins[0]).toMatchObject({ id: 'u1', username: 'Ahmad', oldCoins: 500 });
        expect(result.topByOldBalanceUsd.map(u => u.id)).toEqual(['u2', 'u1', 'u3']);
        expect(result.topByOldBalanceUsd[0]).toMatchObject({ id: 'u2', username: 'Sara', oldBalanceUsd: 100 });
    });

    test('أكثر من 10 مستخدمين: القائمة تُحصَر بأعلى 10 بالضبط', async () => {
        const db = makeDb();
        for (let i = 1; i <= 12; i++) {
            seedUser(db, { _id: `u${i}`, username: `user${i}`, coins: i * 10, balance: 0 });
        }
        wireMocks(db);

        const result = await runMigration({ dryRun: false });

        expect(result.topByOldCoins).toHaveLength(10);
        expect(result.topByOldCoins[0]).toMatchObject({ id: 'u12', oldCoins: 120 }); // الأعلى أولاً
        expect(result.topByOldCoins[9]).toMatchObject({ id: 'u3', oldCoins: 30 }); // العاشر
    });

    test('إجماليات المحافظ بعد التطبيق الفعلي تعكس الحالة الحقيقية (coins_bonus/beans_p من هذي العملية، coins_paid/beans_w/usd_cents صفر — بداية نظيفة)', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 100, balance: 0 });
        db.giftLogs.push({ _id: 'gl1', receiver: 'u1', redeemed: false, unitPrice: 10, totalPrice: 50 });
        wireMocks(db);

        const result = await runMigration({ dryRun: false });

        expect(result.walletTotalsAfter).toEqual({
            coins_paid: 0, coins_bonus: 1000, beans_w: 0, beans_p: 500, usd_cents: 0
        });
    });

    test('إجماليات المحافظ بمعاينة (dryRun): تُحسَب بالإضافة (الحالي + المُتوقَّع)، لا بإعادة قراءة فعلية (لا كتابة حدثت)', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 100, balance: 0, walletCoinsPaid: 50 }); // ✅ محفظة سابقة موجودة فعلاً (غير متعلّقة بهذي العملية)
        wireMocks(db);

        const result = await runMigration({ dryRun: true });

        expect(result.walletTotalsAfter).toEqual({
            coins_paid: 50, coins_bonus: 1000, beans_w: 0, beans_p: 0, usd_cents: 0
        });
        expect(db.users[0].walletCoinsBonus).toBe(0); // ✅ لا كتابة فعلية حدثت فعلاً
    });
});

describe('walletRedenominationMigration — تعطّل واستئناف (مراجعة ما قبل الدمج، عائق #2)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('JobRun بحالة "running" (من عملية تعطّلت) تُستأنَف — لا تُعامَل كـ"نُفِّذت فعلاً"', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 100, balance: 0 });
        wireMocks(db);

        // ✅ محاكاة JobRun ادّعاها إقلاع سابق للسيرفر ثم تعطّل قبل أن يكتمل (لا status:'completed' أبداً)
        db.jobRuns.set(jobRunKey({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START }), {
            job: JOB_NAME, weekStart: SENTINEL_WEEK_START, status: 'running'
        });

        const result = await runMigration({ dryRun: false });
        expect(result.skipped).toBe(false); // ✅ لم تُتخطَّ — استؤنفت فعلياً
        expect(db.users[0].walletCoinsBonus).toBe(1000); // ✅ المحفظة فُتحت فعلياً بهذي العملية "المستأنَفة"
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
        expect(db.users[0].walletCoinsBonus).toBe(100);
        expect(db.users[1].walletRedenominatedV1).toBeFalsy(); // ✅ u2 لم يكتمل بعد

        // ✅ إزالة محاكاة التعطّل الثانية — محاولة ثالثة تُكمِل فقط ما تبقّى (u2)، ولا تُعيد لمس
        // ما اكتمل فعلاً (Gift/GiftLog/u1) إطلاقاً
        User.updateOne.mockImplementation(realUserUpdateOne);
        const result3 = await runMigration({ dryRun: false });
        expect(result3.skipped).toBe(false);
        expect(db.users[1].walletRedenominatedV1).toBe(true);
        expect(db.users[1].walletCoinsBonus).toBe(200); // 20 × 10 — مرة واحدة بالضبط

        // ✅ كل قيمة انتهت ×10 مرة واحدة بالضبط عبر الثلاث محاولات مجتمعة
        expect(db.gifts[0].price).toBe(500);
        expect(db.gifts[0].discountedPrice).toBe(200);
        expect(db.giftLogs[0].totalPrice).toBe(1000);
        expect(db.users[0].walletCoinsBonus).toBe(100);
        expect(db.users[1].walletCoinsBonus).toBe(200);
        // ✅ قيد افتتاح واحد بالضبط لكل (مستخدم، محفظة) — لا تكرار عبر محاولات الاستئناف المتعددة
        expect(db.ledgerByKey.has(`${JOB_NAME}:u1:coins_bonus`)).toBe(true);
        expect(db.ledgerByKey.has(`${JOB_NAME}:u1:beans_p`)).toBe(true);
        expect(db.ledgerByKey.has(`${JOB_NAME}:u2:coins_bonus`)).toBe(true);
        // ✅ u1:coins_bonus + u1:beans_p (من gl1) + u2:coins_bonus فقط — لا أي قيد مكرَّر عبر محاولات الاستئناف المتعددة
        expect(db.ledgerByKey.size).toBe(3);

        // ✅ تشغيل رابع (بعد الاكتمال الكامل): يتخطّى فوراً، لا يُغيّر شيئاً إطلاقاً
        const result4 = await runMigration({ dryRun: false });
        expect(result4.skipped).toBe(true);
        expect(db.gifts[0].price).toBe(500);
        expect(db.users[0].walletCoinsBonus).toBe(100);
        expect(db.users[1].walletCoinsBonus).toBe(200);
        expect(db.ledgerByKey.size).toBe(3);
    });
});

describe('resolveMigrationStartup — تحكّم المُشغِّل الصريح عبر WALLET_MIGRATION', () => {
    afterEach(() => jest.restoreAllMocks());

    test('unset/"off": لا يُشغِّل الترحيل إطلاقاً، يبقى غير جاهز، ويطبع الرسالة المطلوبة بالضبط', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 100, balance: 0 });
        wireMocks(db);
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        const resultUnset = await resolveMigrationStartup({ env: {} });
        expect(resultUnset).toEqual({ ready: false, mode: 'off' });

        const resultOff = await resolveMigrationStartup({ env: { WALLET_MIGRATION: 'off' } });
        expect(resultOff).toEqual({ ready: false, mode: 'off' });

        expect(db.users[0].walletCoinsBonus).toBe(0); // ✅ لا كتابة إطلاقاً
        expect(db.jobRuns.size).toBe(0); // ✅ لا ادّعاء JobRun حتى
        expect(logSpy.mock.calls.some(call => call[0].includes(WALLET_MIGRATION_OFF_MESSAGE))).toBe(true);
    });

    test('"dry": يُعاين فقط (بلا كتابة)، يطبع الجدول والعدّادات، ويبقى غير جاهز', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 100, balance: 0 });
        db.gifts.push({ _id: 'g1', price: 50, discountedPrice: null });
        wireMocks(db);
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        const result = await resolveMigrationStartup({ env: { WALLET_MIGRATION: 'dry' } });

        expect(result).toEqual({ ready: false, mode: 'dry' });
        expect(db.users[0].walletCoinsBonus).toBe(0); // ✅ لا كتابة إطلاقاً
        expect(db.gifts[0].price).toBe(50);
        expect(db.jobRuns.size).toBe(0); // ✅ dry لا يدّعي JobRun حتى
        // ✅ الجدول (printReportTable) + سطر "usersProcessed" مطبوعان معاً بالسجلات
        expect(logSpy.mock.calls.some(call => typeof call[0] === 'string' && call[0].includes('| القيمة | قبل | بعد'))).toBe(true);
        expect(logSpy.mock.calls.some(call => typeof call[0] === 'string' && call[0].includes('usersProcessed=1'))).toBe(true);
    });

    test('"apply": يُنفِّذ الترحيل فعلياً (قابل للاستئناف كما هو) ثم يُصبح جاهزاً', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 100, balance: 0 });
        wireMocks(db);

        const result = await resolveMigrationStartup({ env: { WALLET_MIGRATION: 'apply' } });

        expect(result).toEqual({ ready: true, mode: 'apply' });
        expect(db.users[0].walletCoinsBonus).toBe(1000); // ✅ كتابة فعلية حدثت
        expect(db.users[0].walletRedenominatedV1).toBe(true);
        const jr = db.jobRuns.get(jobRunKey({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START }));
        expect(jr.status).toBe('completed');
    });

    test('الترحيل مكتمل فعلاً مسبقاً: القيمة (حتى "off") تُتجاهَل تماماً، الموقع يعمل بشكل طبيعي', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 100, balance: 0 });
        wireMocks(db);

        db.jobRuns.set(jobRunKey({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START }), {
            job: JOB_NAME, weekStart: SENTINEL_WEEK_START, status: 'completed'
        });

        const resultOff = await resolveMigrationStartup({ env: {} }); // ✅ حتى بلا WALLET_MIGRATION إطلاقاً
        expect(resultOff).toEqual({ ready: true, mode: 'already_completed' });

        const resultApply = await resolveMigrationStartup({ env: { WALLET_MIGRATION: 'apply' } }); // ✅ حتى لو apply صريحة
        expect(resultApply).toEqual({ ready: true, mode: 'already_completed' });

        expect(db.users[0].walletCoinsBonus).toBe(0); // ✅ لا أي كتابة إضافية — لم يُعَد تشغيل الترحيل إطلاقاً
    });
});
