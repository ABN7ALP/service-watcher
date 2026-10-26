// ملف: walletRedenominationMigration.test.js
// 🛡️ دفتر الأستاذ (feat/wallet-ledger-v1): يختبر إعادة التسمية ×10 — كل قيمة مقوَّمة بالكوينز
// (أسعار الكتالوج، السجلّات التاريخية، تراكمات الغرف/الدوري، إعدادات النظام) تُضاعَف ×10
// بالضبط، أرصدة المستخدمين تُفتَح بدفتر الأستاذ (coins_paid/usd_cents/beans_w) بالقيمة
// الصحيحة، الهدايا غير المستبدَلة تُعلَّم مستبدَلة بعد تحويل قيمتها لـbeans_w، وتشغيل المهمة
// مرتين متتاليتين لا يُغيِّر شيئاً (JobRun + idempotencyKey معاً). نفس استراتيجية هذا المشروع
// الثابتة — jest.spyOn على نماذج Mongoose الحقيقية بمحاكاة حالة بذاكرة JS بسيطة

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

// ✅ محاكاة عامة لمجموعة Mongoose بسيطة (بلا $gte/معاملات) — aggregate (مجموع حسب فلتر)،
// updateMany ($mul/$set)، بما يكفي تماماً لما تحتاجه دالة الترحيل نفسها، لا أكثر
function wireSimpleCollection(Model, docs) {
    jest.spyOn(Model, 'aggregate').mockImplementation(([{ $match: filter }, { $group }]) => {
        const field = $group.total.$sum.slice(1); // "$price" -> "price"
        const matching = docs.filter(d => Object.entries(filter || {}).every(([k, cond]) => {
            const val = getPath(d, k);
            if (cond && typeof cond === 'object' && '$ne' in cond) return val !== cond.$ne;
            return val === cond;
        }));
        const total = matching.reduce((sum, d) => sum + (getPath(d, field) || 0), 0);
        return Promise.resolve([{ _id: null, total }]);
    });
    jest.spyOn(Model, 'updateMany').mockImplementation((filter, update) => {
        const matching = docs.filter(d => Object.entries(filter || {}).every(([k, cond]) => {
            const val = getPath(d, k);
            if (cond && typeof cond === 'object' && '$ne' in cond) return val !== cond.$ne;
            return val === cond;
        }));
        matching.forEach(d => {
            if (update.$mul) for (const [k, factor] of Object.entries(update.$mul)) setPath(d, k, (getPath(d, k) || 0) * factor);
            if (update.$set) for (const [k, v] of Object.entries(update.$set)) setPath(d, k, v);
        });
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
        supportMissions: { bonusXP: 0 },
        ...overrides
    };
    db.users.push(user);
    return user;
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
    wireSimpleCollection(User, db.users); // ✅ لـsupportMissions.bonusXP فقط (aggregate/updateMany)
    jest.spyOn(SystemSettings, 'aggregate').mockImplementation(([{ $match: filter }, { $group }]) => {
        const field = $group.total.$sum.slice(1);
        return Promise.resolve([{ _id: null, total: getPath(db.settings, field) || 0 }]);
    });
    jest.spyOn(SystemSettings, 'updateMany').mockImplementation((filter, update) => {
        if (update.$mul) for (const [k, factor] of Object.entries(update.$mul)) setPath(db.settings, k, (getPath(db.settings, k) || 0) * factor);
        return Promise.resolve({ modifiedCount: 1 });
    });

    // ✅ GiftLog خاصة: aggregate تدعم كلا الاستخدامين (مجموع عام بفلتر {} لـunitPrice/totalPrice،
    // ومجموع غير مستبدَل خاص بمستخدم لحساب beans_w الافتتاحية) — نفس منطق wireSimpleCollection
    // لكن بفلتر receiver+redeemed إضافي يدعمه الأخير وحده
    jest.spyOn(GiftLog, 'aggregate').mockImplementation(([{ $match: filter }, { $group }]) => {
        const field = $group.total.$sum.slice(1);
        const matching = db.giftLogs.filter(d => Object.entries(filter || {}).every(([k, cond]) => {
            const val = getPath(d, k);
            if (cond && typeof cond === 'object' && '$ne' in cond) return val !== cond.$ne;
            return val === cond;
        }));
        const total = matching.reduce((sum, d) => sum + (getPath(d, field) || 0), 0);
        return Promise.resolve([{ _id: null, total }]);
    });
    jest.spyOn(GiftLog, 'updateMany').mockImplementation((filter, update) => {
        const matching = db.giftLogs.filter(d => Object.entries(filter || {}).every(([k, cond]) => {
            const val = getPath(d, k);
            if (cond && typeof cond === 'object' && '$ne' in cond) return val !== cond.$ne;
            return val === cond;
        }));
        matching.forEach(d => {
            if (update.$mul) for (const [k, factor] of Object.entries(update.$mul)) setPath(d, k, (getPath(d, k) || 0) * factor);
            if (update.$set) for (const [k, v] of Object.entries(update.$set)) setPath(d, k, v);
        });
        return chainable({ modifiedCount: matching.length });
    });

    // ✅ User.find({}).select(...).cursor() — تكرار تتابعي بسيط بلا معاملات/جلسة (قراءة بحتة
    // لحساب القيم القديمة لكل مستخدم قبل فتح معاملته المستقلة)
    jest.spyOn(User, 'find').mockImplementation(() => {
        let i = 0;
        return {
            select: () => ({
                cursor: () => ({
                    next: () => Promise.resolve(i < db.users.length ? db.users[i++] : null)
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
        withTransaction: async (fn) => fn(),
        endSession: async () => {}
    }));

    jest.spyOn(JobRun, 'create').mockImplementation((doc) => {
        const key = `${doc.job}:${doc.weekStart.getTime()}`;
        if (db.jobRuns.has(key)) {
            const err = new Error('E11000 duplicate key'); err.code = 11000; return Promise.reject(err);
        }
        db.jobRuns.set(key, doc);
        return Promise.resolve(doc);
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

    test('أرصدة المستخدمين: coins_paid وusd_cents يُفتَحان بدفتر الأستاذ بالقيمة الصحيحة', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 100, balance: 5.5 });
        wireMocks(db);

        await runMigration({ dryRun: false });

        const user = db.users[0];
        expect(user.walletCoinsPaid).toBe(1000); // 100 × 10
        expect(user.walletUsdCents).toBe(550); // 5.5$ -> 550 سنت، بلا أي تضخيم
        expect(user.coins).toBe(1000); // ✅ المرآة القديمة تزامنت تلقائياً عبر walletService
        expect(user.balance).toBe(5.5); // ✅ بلا تغيير — دولار حقيقي
    });

    test('هدايا غير مستبدَلة تُفتَح كـbeans_w ×10 وتُعلَّم مستبدَلة', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 0, balance: 0 });
        db.giftLogs.push({ _id: 'gl1', receiver: 'u1', redeemed: false, unitPrice: 50, totalPrice: 150 });
        db.giftLogs.push({ _id: 'gl2', receiver: 'u1', redeemed: false, unitPrice: 20, totalPrice: 60 });
        db.giftLogs.push({ _id: 'gl3', receiver: 'other', redeemed: false, unitPrice: 20, totalPrice: 60 }); // ✅ مستخدم آخر — لا يُلمَس
        wireMocks(db);

        await runMigration({ dryRun: false });

        const user = db.users[0];
        expect(user.walletBeansW).toBe(2100); // (150+60) × 10
        expect(db.giftLogs[0].redeemed).toBe(true);
        expect(db.giftLogs[1].redeemed).toBe(true);
        expect(db.giftLogs[2].redeemed).toBe(false); // ✅ مستخدم آخر لم يُلمَس
        // ✅ لاحقاً التضخيم العام لـGiftLog.totalPrice (منفصل تماماً عن فتح المحفظة) يُطبَّق أيضاً
        expect(db.giftLogs[0].totalPrice).toBe(1500);
    });

    test('تشغيل المهمة مرتين: الثانية تتخطّى بالكامل (JobRun) — لا تضاعف تراكمي', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 100, balance: 5 });
        db.gifts.push({ _id: 'g1', price: 50, discountedPrice: null });
        wireMocks(db);

        await runMigration({ dryRun: false });
        const afterFirst = { price: db.gifts[0].price, coinsPaid: db.users[0].walletCoinsPaid };

        const result2 = await runMigration({ dryRun: false });
        expect(result2.skipped).toBe(true);
        expect(db.gifts[0].price).toBe(afterFirst.price); // ✅ ليس ×100 — لم يُلمَس ثانية إطلاقاً
        expect(db.users[0].walletCoinsPaid).toBe(afterFirst.coinsPaid);
    });

    test('مستخدم بلا أي رصيد (coins=0, balance=0, بلا هدايا): لا قيود دفتر أستاذ تُكتَب له إطلاقاً', async () => {
        const db = makeDb();
        seedUser(db, { _id: 'u1', coins: 0, balance: 0 });
        wireMocks(db);

        await runMigration({ dryRun: false });

        expect(db.ledgerByKey.size).toBe(0);
        expect(db.users[0].walletCoinsPaid).toBe(0);
    });
});
