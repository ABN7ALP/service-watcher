// ملف: giftController.restAtomicity.test.js
// 🛡️ مراجعة أمنية (redteam-audit-1 — البند المعروف #1): sendGift (REST /api/gifts/send — لا
// يزال حيّاً، يستخدمه فعلياً الإعجاب السريع من الملف الشخصي بـapp.js) وsendPublicGift (REST
// /api/gifts/send-public) كانا يُنفِّذان الخصم الذرّي وإنشاء GiftLog (سجلّ قيمة المُستلِم
// الحقيقية القابلة للاستبدال نقداً عبر giftRedemptionController) كعمليتين منفصلتين تماماً بلا
// معاملة Mongo تجمعهما — نفس فئة الثغرة المُصلَحة سابقاً بمسار gift:combo (راجع
// buildGiftLogEntries بـgiftController.js). أُصلِحت الدالتان الآن: معاملة واحدة تحوي الخصم
// الذرّي + GiftLog معاً فقط؛ كل ما بعدها (خبرة/نقاط/بثّ) يبقى غير ذرّي بعمد (best-effort،
// لا قيمة نقدية مباشرة لأي منها).
//
// نفس استراتيجية هذا المشروع الثابتة (راجع giftController.comboHardening.test.js المجاور):
// jest.spyOn على نماذج Mongoose الحقيقية بمحاكاة حالة بذاكرة JS، لا قاعدة بيانات حقيقية.
// بخلاف مسار gift:combo (يستقبل session من مستدعيه)، sendGift/sendPublicGift تبدآن جلستهما
// الخاصة داخلياً (mongoose.startSession() مباشرة) — فنُموِّه mongoose.startSession نفسها هنا،
// بمحاكاة withTransaction تُطبِّق الالتزام مباشرة وتُرجع db لحالته قبل المعاملة عند أي رفض
// داخلي (نفس فلسفة makeFakeSession بالملف المجاور).
//
// 🐛 jest.useFakeTimers() قبل require('../giftController') — نفس سبب الملفات المجاورة
// (setInterval حقيقي لتنظيف محدِّد معدّل الهدايا عند الاستيراد نفسه)
jest.useFakeTimers();
jest.mock('../fanClubController', () => ({ awardFanPoints: jest.fn() }));
jest.mock('../../utils/experienceManager', () => ({
    addGiftExperience: jest.fn().mockResolvedValue(null),
    calculateRequiredXp: (level) => level * 1500,
    REQUIRED_XP_PER_LEVEL: 1500,
    GIFT_XP_SENDER_DIVISOR: 3
}));

const mongoose = require('mongoose');
const User = require('../../models/User');
const Gift = require('../../models/Gift');
const GiftLog = require('../../models/GiftLog');
const { addGiftExperience } = require('../../utils/experienceManager');
const giftController = require('../giftController');

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.session = () => p;
    return p;
}

function makeDb() {
    return { users: new Map(), gifts: new Map(), giftLogs: [] };
}
function seedUser(db, overrides) {
    const user = {
        _id: 'u_default', coins: 0, balance: 0, blockedUsers: [], blockedBy: [], isBot: false,
        username: 'User', profileImage: '', socketId: null, level: 1, experience: 0,
        ...overrides
    };
    db.users.set(user._id, user);
    return user;
}
function seedGift(db, overrides) {
    const gift = {
        _id: 'g_default', name: 'هدية', imageUrl: 'x.png', price: 100,
        discountedPrice: null, isActive: true, animation: null, icon: '🎁',
        ...overrides
    };
    db.gifts.set(gift._id, gift);
    return gift;
}

// ✅ محاكاة واقعية بما يكفي لـwithTransaction: الالتزام يُطبَّق مباشرة على db (نفس المراجع
// التي يحملها الاختبار)، والرفض الداخلي (مثل INSUFFICIENT) يُعيد db لحالته قبل المعاملة بالضبط
// (snapshot/restore) — يثبت أن فشل الخصم لا يكتب أي شيء جزئياً، تماماً كالمعاملة الحقيقية
function wireMocks(db) {
    jest.spyOn(User, 'findById').mockImplementation((id) => chainable(db.users.get(String(id)) || null));
    jest.spyOn(User, 'find').mockImplementation((filter) => {
        const ids = (filter && filter._id && filter._id.$in) || [];
        return chainable(ids.map(id => db.users.get(String(id))).filter(Boolean));
    });
    jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return Promise.resolve(null);
        if (filter.coins && typeof filter.coins.$gte === 'number' && row.coins < filter.coins.$gte) {
            return Promise.resolve(null); // ✅ الشرط فشل — لا أي كتابة إطلاقاً
        }
        if (update.$inc && typeof update.$inc.coins === 'number') row.coins += update.$inc.coins;
        return Promise.resolve({ ...row });
    });
    jest.spyOn(Gift, 'findById').mockImplementation((id) => chainable(db.gifts.get(String(id)) || null));
    jest.spyOn(GiftLog, 'create').mockImplementation((docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        const created = arr.map((d, i) => ({ ...d, _id: `log_${db.giftLogs.length + i}` }));
        db.giftLogs.push(...created);
        return Promise.resolve(created);
    });
    jest.spyOn(GiftLog, 'insertMany').mockImplementation((docs) => {
        db.giftLogs.push(...docs);
        return Promise.resolve(docs);
    });
    jest.spyOn(mongoose, 'startSession').mockImplementation(async () => ({
        withTransaction: async (fn) => {
            const snapshot = {
                users: new Map([...db.users].map(([k, v]) => [k, { ...v }])),
                giftLogs: [...db.giftLogs]
            };
            try {
                await fn();
            } catch (error) {
                // ✅ رفض داخلي حقيقي (رصيد غير كافٍ) — كل كتابة سبقته بهذي المعاملة تُسقَط بالكامل
                for (const [k, v] of snapshot.users) Object.assign(db.users.get(k) || {}, v);
                db.giftLogs.length = 0;
                db.giftLogs.push(...snapshot.giftLogs);
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
    return { to: () => ({ emit: () => {} }), emit: () => {}, sockets: { adapter: { rooms: new Map() }, sockets: new Map() } };
}
function mockReq(overrides) {
    return { user: { id: 's1' }, body: {}, app: { get: () => makeFakeIo() }, ...overrides };
}

describe('sendGift (REST /api/gifts/send) — ذرّية الخصم + GiftLog', () => {
    afterEach(() => jest.restoreAllMocks());

    test('مسار سعيد: خصم ذرّي + سجلّ GiftLog مطابق تماماً، استجابة 201', async () => {
        const db = makeDb();
        const sender = seedUser(db, { _id: 's1', coins: 1000 });
        seedUser(db, { _id: 'r1' });
        seedGift(db, { _id: 'g1', price: 100 });
        wireMocks(db);

        const req = mockReq({ body: { receiverId: 'r1', giftId: 'g1', quantity: 2, context: 'profile' } });
        const res = mockRes();
        await giftController.sendGift(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(sender.coins).toBe(1000 - 200);
        expect(db.giftLogs).toHaveLength(1);
        expect(db.giftLogs[0]).toMatchObject({ sender: 's1', receiver: 'r1', unitPrice: 100, totalPrice: 200, quantity: 2 });
    });

    // 🛡️ جوهر البند المعروف #1: يحاكي انهياراً حقيقياً فور نجاح المعاملة — نُجبِر
    // addGiftExperience (أول أثر جانبي غير ذرّي بعد المعاملة مباشرة) على الرفض، فيفشل الطلب
    // كاملاً (500) بالضبط كما يبدو لعميل بعد انهيار/إعادة تشغيل حقيقي بهذي اللحظة تماماً
    test('انهيار حقيقي بعد التزام المعاملة (addGiftExperience ترفض): الخصم وGiftLog يبقيان مُلتَزَمين وصحيحين — لا علاقة لهما بنجاح أي أثر جانبي لاحق', async () => {
        const db = makeDb();
        const sender = seedUser(db, { _id: 's1', coins: 1000 });
        seedUser(db, { _id: 'r1' });
        seedGift(db, { _id: 'g1', price: 100 });
        wireMocks(db);
        addGiftExperience.mockRejectedValueOnce(new Error('simulated crash after commit'));

        const req = mockReq({ body: { receiverId: 'r1', giftId: 'g1', quantity: 1, context: 'profile' } });
        const res = mockRes();
        await giftController.sendGift(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        // ✅ جوهر الإصلاح: الخصم وGiftLog التزما فعلياً قبل هذا الانهيار المُحاكى — مُتطابقان
        // تماماً (لا خصم بلا سجلّ، ولا سجلّ بلا خصم)، بصرف النظر عن فشل كل ما بعدهما
        expect(sender.coins).toBe(1000 - 100);
        expect(db.giftLogs).toHaveLength(1);
        expect(db.giftLogs[0]).toMatchObject({ sender: 's1', receiver: 'r1', unitPrice: 100, totalPrice: 100 });
    });

    test('رصيد غير كافٍ: لا خصم ولا أي سجلّ GiftLog إطلاقاً', async () => {
        const db = makeDb();
        const sender = seedUser(db, { _id: 's1', coins: 50 });
        seedUser(db, { _id: 'r1' });
        seedGift(db, { _id: 'g1', price: 100 });
        wireMocks(db);

        const req = mockReq({ body: { receiverId: 'r1', giftId: 'g1', quantity: 1, context: 'profile' } });
        const res = mockRes();
        await giftController.sendGift(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(sender.coins).toBe(50);
        expect(db.giftLogs).toHaveLength(0);
    });
});

describe('sendPublicGift (REST /api/gifts/send-public) — ذرّية الخصم + GiftLog لعدّة مستلمين', () => {
    afterEach(() => jest.restoreAllMocks());

    test('مسار سعيد: خصم ذرّي واحد بإجمالي كل المستلمين + سجلّ GiftLog لكل مستلم مطابق', async () => {
        const db = makeDb();
        const sender = seedUser(db, { _id: 's1', coins: 1000 });
        seedUser(db, { _id: 'r1' });
        seedUser(db, { _id: 'r2' });
        seedGift(db, { _id: 'g1', price: 50 });
        wireMocks(db);

        const req = mockReq({ body: { giftId: 'g1', audience: 'selected', recipientIds: ['r1', 'r2'] } });
        const res = mockRes();
        await giftController.sendPublicGift(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(sender.coins).toBe(1000 - 50 * 2);
        expect(db.giftLogs).toHaveLength(2);
        const total = db.giftLogs.reduce((sum, l) => sum + l.totalPrice, 0);
        expect(total).toBe(100);
    });

    test('انهيار حقيقي بعد التزام المعاملة: الخصم وكل سجلّات GiftLog تبقى مُلتَزَمة وصحيحة', async () => {
        const db = makeDb();
        const sender = seedUser(db, { _id: 's1', coins: 1000 });
        seedUser(db, { _id: 'r1' });
        seedUser(db, { _id: 'r2' });
        seedGift(db, { _id: 'g1', price: 50 });
        wireMocks(db);
        addGiftExperience.mockRejectedValueOnce(new Error('simulated crash after commit'));

        const req = mockReq({ body: { giftId: 'g1', audience: 'selected', recipientIds: ['r1', 'r2'] } });
        const res = mockRes();
        await giftController.sendPublicGift(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(sender.coins).toBe(1000 - 100);
        expect(db.giftLogs).toHaveLength(2);
    });

    test('رصيد غير كافٍ: لا خصم ولا أي سجلّ GiftLog إطلاقاً', async () => {
        const db = makeDb();
        const sender = seedUser(db, { _id: 's1', coins: 10 });
        seedUser(db, { _id: 'r1' });
        seedUser(db, { _id: 'r2' });
        seedGift(db, { _id: 'g1', price: 50 });
        wireMocks(db);

        const req = mockReq({ body: { giftId: 'g1', audience: 'selected', recipientIds: ['r1', 'r2'] } });
        const res = mockRes();
        await giftController.sendPublicGift(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(sender.coins).toBe(10);
        expect(db.giftLogs).toHaveLength(0);
    });
});
