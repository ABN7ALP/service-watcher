// ملف: followMigration.test.js
// 🛡️ feat/follow-v2: ترحيل مصفوفات followers/following/friends القديمة لمجموعة Follow —
// يُثبِت 3 خصائص جوهرية: (1) dry-run لا يكتب شيئاً إطلاقاً ويُحسب العدد الصحيح للحافات
// المُتوقَّعة (بلا احتساب مضاعف لعلاقة متماثلة الطرفين — راجع `seen` المشترك بـfollowMigration.js)،
// (2) apply الحقيقي ينشئ الحافات الصحيحة فقط مرة واحدة لكل زوج + يُعيد حساب العدّادين بدقّة،
// (3) resumability: تشغيل apply مرتين لا يُعيد معالجة شيء (JobRun مكتملة -> تخطٍّ فوري).
const mongoose = require('mongoose');
const User = require('../../models/User');
const Follow = require('../../models/Follow');
const JobRun = require('../../models/JobRun');
const { runMigration, resolveMigrationStartup, JOB_NAME, SENTINEL_WEEK_START } = require('../followMigration');

function oid(n) { return String(n).padStart(24, '0'); }

function makeCursor(docs) {
    let i = 0;
    return { next: async () => (i < docs.length ? docs[i++] : null) };
}

// 🛡️ مراجعة #147: User.find تُستدعى بشكلين مختلفين الآن — (1) مسح المستخدمين الرئيسي
// (.select().cursor())، و(2) فحص وجود المعرّفات المرجعيّة دفعة واحدة بـfilterExistingIds
// (.select().lean()، فلتر {_id:{$in:[...]}}) — المحاكاة تُميّز بينهما بوجود $in
function wireUserFind(users) {
    jest.spyOn(User, 'find').mockImplementation((filter) => {
        if (filter && filter._id && filter._id.$in) {
            const idSet = new Set(filter._id.$in.map(String));
            const matched = users.filter(u => idSet.has(String(u._id)));
            return { select: () => ({ lean: () => Promise.resolve(matched.map(u => ({ _id: u._id }))) }) };
        }
        const matched = !filter || Object.keys(filter).length === 0
            ? users
            : users.filter(u => !(filter.followMigratedV1 && filter.followMigratedV1.$ne === true && u.followMigratedV1 === true));
        return { select: () => ({ cursor: () => makeCursor(matched) }) };
    });
}

function wireFollowStore(store) {
    jest.spyOn(Follow, 'updateOne').mockImplementation((filter) => {
        const key = `${filter.follower}:${filter.followee}`;
        if (store.has(key)) return Promise.resolve({ upsertedCount: 0, matchedCount: 1 });
        store.set(key, { follower: filter.follower, followee: filter.followee });
        return Promise.resolve({ upsertedCount: 1, matchedCount: 0 });
    });
}

function wireUserUpdateOne(flags) {
    jest.spyOn(User, 'updateOne').mockImplementation((filter) => {
        flags.add(String(filter._id));
        return Promise.resolve({ matchedCount: 1 });
    });
}

function wireJobRunFresh() {
    const store = new Map();
    jest.spyOn(JobRun, 'findOne').mockImplementation((filter) => {
        const key = `${filter.job}:${filter.weekStart?.getTime?.() ?? filter.weekStart}`;
        return Promise.resolve(store.get(key) || null);
    });
    jest.spyOn(JobRun, 'create').mockImplementation((doc) => {
        const key = `${doc.job}:${doc.weekStart.getTime()}`;
        if (store.has(key)) { const e = new Error('dup'); e.code = 11000; throw e; }
        const created = { ...doc };
        store.set(key, created);
        return Promise.resolve(created);
    });
    jest.spyOn(JobRun, 'updateOne').mockImplementation((filter, update) => {
        const key = `${filter.job}:${filter.weekStart.getTime()}`;
        const row = store.get(key);
        if (row && update.$set) Object.assign(row, update.$set);
        return Promise.resolve({ matchedCount: row ? 1 : 0 });
    });
    return store;
}

describe('followMigration — dry run', () => {
    afterEach(() => jest.restoreAllMocks());

    test('لا يكتب شيئاً إطلاقاً، ويحسب عدد الحافات المتوقَّعة بدقّة (بلا احتساب مضاعف لعلاقة متماثلة)', async () => {
        // u1 يتابع u2 ويتابع u3 (مصفوفة following فقط) — u2.followers تحتوي u1 أيضاً (نفس العلاقة
        // من الطرف الآخر، يجب أن تُحسَب مرة واحدة فقط بالمعاينة بفضل `seen` المشترك)
        const users = [
            { _id: oid(1), following: [oid(2), oid(3)], followers: [], friends: [] },
            { _id: oid(2), following: [], followers: [oid(1)], friends: [oid(5)] },
            { _id: oid(3), following: [], followers: [], friends: [] },
            { _id: oid(5), following: [], followers: [], friends: [oid(2)] }
        ];
        wireUserFind(users);
        const followUpdateSpy = jest.spyOn(Follow, 'updateOne');
        const userUpdateSpy = jest.spyOn(User, 'updateOne');

        const result = await runMigration({ dryRun: true });

        expect(result.skipped).toBe(false);
        expect(result.dryRun).toBe(true);
        expect(result.usersProcessed).toBe(4);
        // الحافات الفريدة المتوقَّعة: u1->u2 (following+followers لنفس الزوج=مرة واحدة)، u1->u3،
        // وصداقة u2<->u5 (حافتان متبادلتان) = 4 بالضبط
        expect(result.edgesCreated).toBe(4);
        // 🛡️ جوهر "لا يكتب شيئاً" — لا استدعاء كتابة واحد حتى بوضع المعاينة
        expect(followUpdateSpy).not.toHaveBeenCalled();
        expect(userUpdateSpy).not.toHaveBeenCalled();
    });
});

describe('followMigration — apply', () => {
    afterEach(() => jest.restoreAllMocks());

    test('ينشئ الحافات الصحيحة فقط (لا تكرار لعلاقة متماثلة)، يُعلِّم كل مستخدم مُرحَّلاً، ويُعيد حساب العدّادين', async () => {
        const users = [
            { _id: oid(1), following: [oid(2), oid(3)], followers: [], friends: [] },
            { _id: oid(2), following: [], followers: [oid(1)], friends: [oid(5)] },
            { _id: oid(3), following: [], followers: [], friends: [] },
            { _id: oid(5), following: [], followers: [], friends: [oid(2)] }
        ];
        wireUserFind(users);
        const followStore = new Map();
        wireFollowStore(followStore);
        const migratedFlags = new Set();
        wireUserUpdateOne(migratedFlags);
        wireJobRunFresh();

        // ✅ recomputeAllCounters تستدعي Follow.aggregate 3 مرّات الآن (followee ثم follower
        // ثم friendsAgg المتبادَل عبر $lookup — راجع #147) — نحسبها فعلياً من followStore
        // (مصدر الحقيقة بعد الكتابة) بدل قيم ثابتة، لضمان دقّة الاختبار بكل الحالات الثلاث
        jest.spyOn(Follow, 'aggregate').mockImplementation((pipeline) => {
            const counts = new Map();
            if (pipeline[0].$lookup) {
                // friendsAgg: لكل حافة follower->followee، احسبها فقط لو حافة معاكسة موجودة أيضاً
                for (const edge of followStore.values()) {
                    const reverseKey = `${edge.followee}:${edge.follower}`;
                    if (!followStore.has(reverseKey)) continue;
                    const key = String(edge.follower);
                    counts.set(key, (counts.get(key) || 0) + 1);
                }
            } else {
                const groupField = pipeline[0].$group._id === '$followee' ? 'followee' : 'follower';
                for (const edge of followStore.values()) {
                    const key = String(edge[groupField]);
                    counts.set(key, (counts.get(key) || 0) + 1);
                }
            }
            return Promise.resolve(Array.from(counts.entries()).map(([_id, count]) => ({ _id, count })));
        });
        const bulkOps = [];
        jest.spyOn(User, 'bulkWrite').mockImplementation((ops) => { bulkOps.push(...ops); return Promise.resolve({}); });

        const result = await runMigration({ dryRun: false });

        expect(result.skipped).toBe(false);
        expect(followStore.size).toBe(4); // u1->u2, u1->u3, u2->u5, u5->u2 — لا تكرار لعلاقة u1<->u2
        expect(followStore.has(`${oid(1)}:${oid(2)}`)).toBe(true);
        expect(followStore.has(`${oid(1)}:${oid(3)}`)).toBe(true);
        expect(followStore.has(`${oid(2)}:${oid(5)}`)).toBe(true);
        expect(followStore.has(`${oid(5)}:${oid(2)}`)).toBe(true);
        // ✅ كل المستخدمين الثلاثة عُلِّموا مُرحَّلين
        expect(migratedFlags.has(oid(1))).toBe(true);
        expect(migratedFlags.has(oid(2))).toBe(true);
        expect(migratedFlags.has(oid(3))).toBe(true);
        expect(migratedFlags.has(oid(5))).toBe(true);
        // ✅ العدّادان أُعيد حسابهما من الحافات الفعلية (bulkWrite استُدعيت بقيم صحيحة) — متابِعا
        // u2 اثنان فعلاً: u1 (عبر following) وu5 (عبر الصداقة المتبادلة u5<->u2)
        const followersCountForU2 = bulkOps.find(op => op.updateOne.filter._id === oid(2) && 'followersCount' in op.updateOne.update.$set);
        expect(followersCountForU2.updateOne.update.$set.followersCount).toBe(2);
    });

    test('resumability: تشغيل apply مرتين لا يُعيد معالجة شيء (JobRun مكتملة -> تخطٍّ فوري)', async () => {
        const users = [
            { _id: oid(1), following: [oid(2)], followers: [], friends: [] },
            { _id: oid(2), following: [], followers: [], friends: [] }
        ];
        wireUserFind(users);
        const followStore = new Map();
        wireFollowStore(followStore);
        wireUserUpdateOne(new Set());
        wireJobRunFresh();
        jest.spyOn(Follow, 'aggregate').mockResolvedValue([]);
        jest.spyOn(User, 'bulkWrite').mockResolvedValue({});

        const first = await runMigration({ dryRun: false });
        expect(first.skipped).toBe(false);

        const second = await runMigration({ dryRun: false });
        expect(second.skipped).toBe(true);
        expect(second.reason).toBe('already_applied');
        expect(followStore.size).toBe(1); // ✅ لم يُعَد إنشاء نفس الحافة مرة أخرى
    });
});

describe('followMigration — تخطّي الحافات الفاسدة (مراجعة #147)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('يتخطّى الحافات الذاتية ومرجعيات مستخدمين محذوفين، ويُبلِغ عن عددها بدقّة (dry-run)', async () => {
        // u1: following تحتوي u1 نفسه (حافة ذاتية فاسدة) + u2 (حقيقي) + u404/u405 (محذوفان —
        // لا مستند User لهما بالقائمة أدناه). u2.friends تحتوي u406 (محذوف أيضاً، عبر الصداقة)
        const users = [
            { _id: oid(1), following: [oid(1), oid(2), oid(404), oid(405)], followers: [], friends: [] },
            { _id: oid(2), following: [], followers: [], friends: [oid(406)] }
        ];
        wireUserFind(users);

        const result = await runMigration({ dryRun: true });

        expect(result.skipped).toBe(false);
        // ✅ الحافة الحقيقية الوحيدة: u1->u2
        expect(result.edgesCreated).toBe(1);
        // ✅ حافة ذاتية واحدة (u1->u1)
        expect(result.skippedSelf).toBe(1);
        // ✅ 3 مرجعيات لمستخدمين محذوفين: u404 وu405 (following لدى u1)، وu406 (friends لدى
        // u2 — existsOrSkip يستبعدها مرّة واحدة قبل محاولتَي upsertFollowEdge بكلا الاتجاهين،
        // فلا تُحصَيان مرتين لنفس friendId الواحد)
        expect(result.skippedMissingUser).toBe(3);
    });
});
