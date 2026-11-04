// ملف: followController.race.test.js
// 🛡️ feat/follow-v2: followUser/unfollowUser تُحدِّث مستند Follow + عدّادي
// followersCount/followingCount على User، الثلاثة بمعاملة Mongo واحدة (session.withTransaction).
// هذا الاختبار يُثبِت إغلاق التسابق فعلياً، لا فقط "يبدو" صحيحاً:
//   1) idempotency: عدّة طلبات متابعة متزامنة لنفس الزوج (follower,followee) -> حافة Follow
//      واحدة فقط (الفهرس الفريد يضمن ذلك)، والعدّادان يُزادان مرة واحدة فقط بالضبط.
//   2) true concurrency: عدّة متابِعين مختلفين يتابعون نفس الهدف بالتزامن -> followersCount
//      النهائي = عدد الحافات الفعلي بالضبط (لا تحديث مفقود رغم تضارب الكتابة على مستند واحد).
//   3) unfollow concurrency: عدّة طلبات إلغاء متابعة متزامنة لنفس الحافة -> حذف واحد فقط،
//      العدّادان يُخفَّضان مرة واحدة فقط بالضبط (لا سالب).
//   4) مراجعة #147 — friendsCount: A يتابع B وB يتابع A بنفس اللحظة تقريباً -> friendsCount لدى
//      الطرفين = 1 بالضبط (لا 0: الفحص قد "يفوت" حافة الطرف الآخر إن حدث قبل تأمين التسلسل
//      الحقيقي معه؛ ولا 2: لا يحتسبها كلا الطرفين معاً). كشف هذا الاختبار فعلياً عقبتين حقيقيتين
//      أثناء التطوير (لا افتراضيتين): (أ) تقفّل دوراني (deadlock) من ترتيب كتابة معاكس بين
//      follow(A,B) وfollow(B,A) — أُصلِح بترتيب كتابة ثابت (معرّف أصغر أولاً) بصرف النظر عن
//      الدور؛ (ب) فحص وجود الحافة المعاكسة كان يسبق تأمين قفلَي مستندَي الطرفين، فتفوته حافة
//      تلتزم تماماً بين الفحص والكتابة — أُصلِح بنقل الفحص لما بعد تأمين القفلين (راجع followController.js)
//
// 🛡️ نفس استراتيجية الاختبار الثابتة بهذا المشروع (راجع frameController.race.test.js
// المجاور): يُحاكي قفلاً حقيقياً لكل مستند (أي لمسة ثانية من معاملة أخرى "حيّة" على نفس
// المستند تُسقِط بتضارب كتابة فوري - كود 112) + إعادة محاولة withTransaction تلقائياً عند هذا
// التضارب (قراءة/كتابة جديدة بكل محاولة) — يُثبِت أن الاعتماد على اكتشاف Mongo الذاتي للتضارب
// (لا قفل تطبيقي) يعمل فعلياً، لا أن الكود "يبدو" صحيحاً فقط. محاولة إنشاء Follow مكرِّرة
// فعلياً (الحافة موجودة أصلاً، لا تضارب مؤقت) تُرمى كـE11000 حقيقي (duplicate key)، تماماً
// كما يفعل فهرس Mongo الفريد الحقيقي — لا تُعاد المحاولة لهذا الكود، بل تُعامَل كنجاح idempotent.
jest.useFakeTimers();

// ✅ followUser تستدعي fanClubController.creditFollowBonus بأسلوب fire-and-forget (lazy
// require داخل الدالة) — تُموَّه هنا لتفادي لمس FanClubMembership الحقيقي بلا اتصال قاعدة
// بيانات فعلي بهذا الاختبار (نفس اتفاقية adminController.moneyRaceAtomicity.test.js المجاور
// مع botMessenger)
jest.mock('../fanClubController', () => ({ creditFollowBonus: jest.fn() }));

const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');
const User = require('../../models/User');
const Follow = require('../../models/Follow');
const followController = require('../followController');

// ✅ isValidId (followController.js) تتحقق عبر mongoose.Types.ObjectId.isValid — تلزم IDs
// شبيهة بـObjectId حقيقي (24 خانة hex)، لا نصاً حراً كـ'target1'
function oid(n) { return String(n).padStart(24, '0'); }

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.session = () => p;
    return p;
}

function makeDb() {
    return { users: new Map(), follows: new Map(), _locks: new Map() };
}
function seedUser(db, overrides) {
    const user = { _id: 'u_default', followersCount: 0, followingCount: 0, friendsCount: 0, blockedUsers: [], ...overrides };
    db.users.set(user._id, user);
    return user;
}
function followKey(follower, followee) { return `${follower}:${followee}`; }

const txContext = new AsyncLocalStorage();
function recordUndo(ctx, map, key, beforeValue) {
    if (ctx) ctx.undo.push({ map, key, before: beforeValue });
}
function acquireLock(db, lockId) {
    const ctx = txContext.getStore();
    if (!ctx) return;
    const holder = db._locks.get(lockId);
    if (holder && holder !== ctx) throw Object.assign(new Error('Write conflict'), { code: 112 });
    if (!holder) { db._locks.set(lockId, ctx); ctx.locks.push(lockId); }
}

function wireMocks(db) {
    jest.spyOn(Follow, 'create').mockImplementation((docsArr) => {
        const ctx = txContext.getStore();
        const doc = docsArr[0];
        const key = followKey(String(doc.follower), String(doc.followee));
        acquireLock(db, `follow:${key}`);
        if (db.follows.has(key)) {
            throw Object.assign(new Error('E11000 duplicate key error collection: follows index: follower_1_followee_1'), { code: 11000 });
        }
        recordUndo(ctx, db.follows, key, null);
        const created = { follower: doc.follower, followee: doc.followee, createdAt: new Date() };
        db.follows.set(key, created);
        return Promise.resolve([created]);
    });

    // ✅ مراجعة #147: followUser/unfollowUser تستدعيان Follow.exists داخل المعاملة نفسها للتحقّق
    // من وجود الحافة المعاكسة (هل تكتمل/تنكسر صداقة متبادلة بهذي العملية؟). عزل قراءة حقيقي
    // (snapshot isolation) مطلوب هنا تحديداً: حافة أنشأتها معاملة أخرى لا تزال "قيد الالتزام"
    // (قفلها لا يزال محجوزاً لها، لم يُحرَّر بعد) يجب ألا تظهر لقراءة معاملة مختلفة — وإلا
    // يرى الطرفان المتزامنان بعضهما "موجوداً" معاً فتُحتسَب الصداقة مرتين. القفل نفسه (الذي
    // يُحرَّر فقط عند الالتزام الناجح أو يُزال مع التراجع عند الفشل — راجع Follow.create
    // وwithTransaction أدناه) هو إشارة الالتزام الوحيدة المتاحة هنا، فنعتمد عليه مباشرة بدل
    // تتبّع حالة التزام منفصلة: قفل محجوز لمعاملة أخرى = غير مُلتزَم بعد = غير مرئي لي
    jest.spyOn(Follow, 'exists').mockImplementation((filter) => {
        const key = followKey(String(filter.follower), String(filter.followee));
        if (!db.follows.has(key)) return chainable(false);
        const lockHolder = db._locks.get(`follow:${key}`);
        const ctx = txContext.getStore();
        if (lockHolder && lockHolder !== ctx) return chainable(false);
        return chainable(true);
    });

    jest.spyOn(Follow, 'findOneAndDelete').mockImplementation((filter) => {
        const key = followKey(String(filter.follower), String(filter.followee));
        acquireLock(db, `follow:${key}`);
        const existing = db.follows.get(key);
        if (!existing) return chainable(null);
        const ctx = txContext.getStore();
        recordUndo(ctx, db.follows, key, existing);
        db.follows.delete(key);
        return chainable(existing);
    });

    jest.spyOn(User, 'exists').mockImplementation((filter) => {
        const row = db.users.get(String(filter._id));
        if (!row) return Promise.resolve(false);
        if (filter.blockedUsers !== undefined) {
            return Promise.resolve((row.blockedUsers || []).map(String).includes(String(filter.blockedUsers)));
        }
        return Promise.resolve(true);
    });

    jest.spyOn(User, 'updateOne').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return Promise.resolve({ matchedCount: 0 });
        acquireLock(db, `user:${row._id}`);
        for (const [field, cond] of Object.entries(filter)) {
            if (field === '_id') continue;
            if (cond && typeof cond.$gt === 'number' && !((row[field] || 0) > cond.$gt)) return Promise.resolve({ matchedCount: 0 });
        }
        const ctx = txContext.getStore();
        recordUndo(ctx, db.users, row._id, { ...row });
        if (update.$inc) for (const k of Object.keys(update.$inc)) row[k] = (row[k] || 0) + update.$inc[k];
        return Promise.resolve({ matchedCount: 1 });
    });

    jest.spyOn(User, 'findById').mockImplementation((id) => chainable(db.users.get(String(id)) ? { ...db.users.get(String(id)) } : null));

    // ✅ نفس سلوك withTransaction الحقيقي: تضارب كتابة (112) يُعاد تنفيذ الدالة بالكامل تلقائياً
    // (undo شامل لكل ما كتبته هذي المحاولة بالذات + تحرير أقفالها، ثم محاولة جديدة من الصفر)؛
    // أي خطأ آخر (مثل E11000 حقيقي) يُرمى فوراً بلا إعادة محاولة — المستدعي (followController)
    // يُعامله كحالة idempotent معروفة، لا كفشل
    jest.spyOn(mongoose, 'startSession').mockImplementation(async () => ({
        withTransaction: async (fn) => {
            for (let attempt = 0; attempt < 30; attempt++) {
                const ctx = { undo: [], locks: [] };
                try {
                    const result = await txContext.run(ctx, fn);
                    ctx.locks.forEach(lockId => db._locks.delete(lockId));
                    return result;
                } catch (error) {
                    for (let i = ctx.undo.length - 1; i >= 0; i--) {
                        const { map, key, before } = ctx.undo[i];
                        if (before === null) map.delete(key);
                        else map.set(key, before);
                    }
                    ctx.locks.forEach(lockId => db._locks.delete(lockId));
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
    return { user: { id: oid(1) }, params: {}, app: { get: () => null }, ...overrides };
}

describe('followUser — حافة واحدة فقط من عدّة طلبات متزامنة لنفس الزوج (idempotency)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('5 طلبات متابعة متزامنة لنفس الزوج: حافة Follow واحدة فقط، followersCount/followingCount تُزادان مرة واحدة بالضبط', async () => {
        const db = makeDb();
        const target = seedUser(db, { _id: oid(2) });
        const follower = seedUser(db, { _id: oid(1) });
        wireMocks(db);

        const reqs = Array.from({ length: 5 }, () => mockReq({ params: { id: oid(2) } }));
        const reses = Array.from({ length: 5 }, () => mockRes());

        await Promise.all(reqs.map((req, i) => followController.followUser(req, reses[i])));

        const bodies = reses.map(r => r.json.mock.calls[0][0]);
        const successCount = bodies.filter(b => b.status === 'success' && b.data?.isFollowing === true).length;
        expect(successCount).toBe(5); // ✅ idempotent — كل الطلبات الخمسة "تنجح" (النتيجة النهائية نفسها: يتابعه)
        expect(db.follows.size).toBe(1); // ✅ جوهر الإصلاح: حافة واحدة فقط، لا 5
        expect(target.followersCount).toBe(1); // ✅ ليس 5
        expect(follower.followingCount).toBe(1); // ✅ ليس 5
    });
});

describe('followUser — تضارب كتابة حقيقي على نفس مستند الهدف يمنع فقدان تحديث (true concurrency)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('10 متابِعين مختلفين يتابعون نفس الهدف بالتزامن: followersCount النهائي = 10 بالضبط', async () => {
        const db = makeDb();
        const target = seedUser(db, { _id: oid(100) });
        const followerIds = Array.from({ length: 10 }, (_, i) => oid(200 + i));
        followerIds.forEach(id => seedUser(db, { _id: id }));
        wireMocks(db);

        const reqs = followerIds.map(id => mockReq({ user: { id }, params: { id: oid(100) } }));
        const reses = reqs.map(() => mockRes());

        await Promise.all(reqs.map((req, i) => followController.followUser(req, reses[i])));

        const bodies = reses.map(r => r.json.mock.calls[0][0]);
        expect(bodies.every(b => b.status === 'success')).toBe(true);
        expect(db.follows.size).toBe(10); // ✅ 10 حافات مختلفة فعلاً (لا تكرار لنفس الزوج هنا)
        expect(target.followersCount).toBe(10); // ✅ جوهر الإصلاح: لا تحديث $inc مفقود رغم 10 كتابات متزامنة لنفس المستند
        followerIds.forEach(id => expect(db.users.get(id).followingCount).toBe(1));
    });
});

describe('followUser — صداقة متبادلة مكتمَلة بالتزامن من الطرفين معاً (مراجعة #147)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('A يتابع B وB يتابع A بنفس اللحظة تقريباً: friendsCount = 1 بالضبط لدى الطرفين (لا 0 ولا 2)', async () => {
        const db = makeDb();
        const userA = seedUser(db, { _id: oid(1) });
        const userB = seedUser(db, { _id: oid(2) });
        wireMocks(db);

        const reqAtoB = mockReq({ user: { id: oid(1) }, params: { id: oid(2) } }); // A يتابع B
        const reqBtoA = mockReq({ user: { id: oid(2) }, params: { id: oid(1) } }); // B يتابع A
        const resAtoB = mockRes();
        const resBtoA = mockRes();

        await Promise.all([
            followController.followUser(reqAtoB, resAtoB),
            followController.followUser(reqBtoA, resBtoA)
        ]);

        expect(db.follows.size).toBe(2); // ✅ الحافتان كلتاهما أُنشئتا (follow(A,B) وfollow(B,A))
        expect(userA.friendsCount).toBe(1); // ✅ جوهر الإصلاح: ليس 0 (تضارب الكتابة المشترك على وثيقتَي A/B يضمن إعادة قراءة الحافة المعاكسة)
        expect(userB.friendsCount).toBe(1); // ✅ وليس 2 (لا احتساب مضاعف)
        expect(userA.followersCount).toBe(1);
        expect(userA.followingCount).toBe(1);
        expect(userB.followersCount).toBe(1);
        expect(userB.followingCount).toBe(1);
    });
});

describe('unfollowUser — إلغاء واحد فقط من عدّة طلبات متزامنة لنفس الحافة (idempotency)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('4 طلبات إلغاء متابعة متزامنة لنفس الحافة الموجودة: حذف واحد فقط، العدّادان يصلان لصفر بالضبط (لا سالب)', async () => {
        const db = makeDb();
        const target = seedUser(db, { _id: oid(2), followersCount: 1 });
        const follower = seedUser(db, { _id: oid(1), followingCount: 1 });
        db.follows.set(followKey(oid(1), oid(2)), { follower: oid(1), followee: oid(2), createdAt: new Date() });
        wireMocks(db);

        const reqs = Array.from({ length: 4 }, () => mockReq({ params: { id: oid(2) } }));
        const reses = reqs.map(() => mockRes());

        await Promise.all(reqs.map((req, i) => followController.unfollowUser(req, reses[i])));

        const bodies = reses.map(r => r.json.mock.calls[0][0]);
        expect(bodies.every(b => b.status === 'success' && b.data?.isFollowing === false)).toBe(true);
        expect(db.follows.size).toBe(0);
        expect(target.followersCount).toBe(0);
        expect(target.followersCount).toBeGreaterThanOrEqual(0); // ✅ لا سالب
        expect(follower.followingCount).toBe(0);
    });
});
