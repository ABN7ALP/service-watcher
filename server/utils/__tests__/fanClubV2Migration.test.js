// ملف: fanClubV2Migration.test.js
// 🛡️ مراجعة #156 (بند 2): عضويات قديمة سابقة لهذي المراجعة تحمل lastPointAt:null — تظهر
// "غير نشطة" فوراً بعد النشر رغم نشاطها الحقيقي. يُثبِت هذا الملف: (1) dry-run يُحسب عدد
// الوثائق الناقصة بلا أي كتابة، (2) apply يُصحِّحها من updatedAt (أو createdAt احتياطياً)،
// (3) apply يُعيد حساب memberCount فقط (activeCount لم يَعُد يُرحَّل — ليس عدّاداً مخزَّناً)،
// (4) resumability: apply ثانٍ لا يُعيد المعالجة (JobRun مكتملة فعلاً).
const User = require('../../models/User');
const FanClubMembership = require('../../models/FanClubMembership');
const JobRun = require('../../models/JobRun');
const { runMigration, resolveMigrationStartup, JOB_NAME, SENTINEL_WEEK_START } = require('../fanClubV2Migration');

function oid(n) { return String(n).padStart(24, '0'); }

function wireJobRunFresh() {
    const store = new Map();
    jest.spyOn(JobRun, 'findOne').mockImplementation((filter) => {
        const key = `${filter.job}:${filter.weekStart?.getTime?.() ?? filter.weekStart}`;
        return Promise.resolve(store.get(key) || null);
    });
    jest.spyOn(JobRun, 'create').mockImplementation((doc) => {
        const key = `${doc.job}:${doc.weekStart.getTime()}`;
        if (store.has(key)) { const err = new Error('dup'); err.code = 11000; throw err; }
        store.set(key, { ...doc });
        return Promise.resolve({ ...doc });
    });
    jest.spyOn(JobRun, 'updateOne').mockImplementation((filter, update) => {
        const key = `${filter.job}:${filter.weekStart.getTime()}`;
        const row = store.get(key);
        if (row && update.$set) Object.assign(row, update.$set);
        return Promise.resolve({ matchedCount: row ? 1 : 0 });
    });
    return store;
}

afterEach(() => jest.restoreAllMocks());

describe('backfillMissingLastPointAt (ضمن runMigration) — عضويات lastPointAt:null', () => {
    test('dry-run: يُحسب عدد الوثائق الناقصة فقط، بلا أي كتابة (updateMany لا يُستدعى)', async () => {
        wireJobRunFresh();
        jest.spyOn(FanClubMembership, 'countDocuments').mockResolvedValue(3);
        const updateManySpy = jest.spyOn(FanClubMembership, 'updateMany');
        jest.spyOn(FanClubMembership, 'aggregate').mockResolvedValue([]);

        const result = await runMigration({ dryRun: true });

        expect(result.backfilled).toBe(3);
        expect(updateManySpy).not.toHaveBeenCalled();
    });

    test('apply: يُصحِّح lastPointAt من updatedAt (أو createdAt احتياطياً) عبر خط أنابيب تجميع', async () => {
        wireJobRunFresh();
        const updateManySpy = jest.spyOn(FanClubMembership, 'updateMany').mockResolvedValue({ modifiedCount: 5 });
        jest.spyOn(FanClubMembership, 'aggregate').mockResolvedValue([]);
        jest.spyOn(User, 'bulkWrite').mockResolvedValue({});

        const result = await runMigration({ dryRun: false });

        expect(result.backfilled).toBe(5);
        expect(updateManySpy).toHaveBeenCalledWith(
            { lastPointAt: null },
            [{ $set: { lastPointAt: { $ifNull: ['$updatedAt', '$createdAt'] } } }]
        );
    });
});

describe('recomputeMemberCounts (ضمن runMigration apply) — memberCount فقط، لا activeCount', () => {
    test('apply: يُعيد حساب memberCount لكل مالك من FanClubMembership الحقيقية', async () => {
        wireJobRunFresh();
        jest.spyOn(FanClubMembership, 'updateMany').mockResolvedValue({ modifiedCount: 0 });
        jest.spyOn(FanClubMembership, 'aggregate').mockResolvedValue([
            { _id: oid(1), memberCount: 7 },
            { _id: oid(2), memberCount: 2 }
        ]);
        const bulkWriteSpy = jest.spyOn(User, 'bulkWrite').mockResolvedValue({});

        const result = await runMigration({ dryRun: false });

        expect(result.ownersProcessed).toBe(2);
        const ops = bulkWriteSpy.mock.calls[0][0];
        expect(ops).toEqual([
            { updateOne: { filter: { _id: oid(1) }, update: { $set: { 'fanClub.memberCount': 7 } } } },
            { updateOne: { filter: { _id: oid(2) }, update: { $set: { 'fanClub.memberCount': 2 } } } }
        ]);
        // ✅ activeCount لم يَعُد يُرحَّل إطلاقاً — لا $set له بأي عملية bulkWrite
        expect(JSON.stringify(ops)).not.toContain('activeCount');
    });
});

describe('resolveMigrationStartup — off|dry|apply + استئناف', () => {
    test('off (افتراضي): لا كتابة، ready:false', async () => {
        wireJobRunFresh();
        const updateManySpy = jest.spyOn(FanClubMembership, 'updateMany');
        const bulkWriteSpy = jest.spyOn(User, 'bulkWrite');

        const result = await resolveMigrationStartup({ env: {} });

        expect(result).toEqual({ ready: false, mode: 'off' });
        expect(updateManySpy).not.toHaveBeenCalled();
        expect(bulkWriteSpy).not.toHaveBeenCalled();
    });

    test('apply مرتين: الثانية تتخطّى كاملة (JobRun مكتملة فعلاً) — resumability', async () => {
        wireJobRunFresh();
        jest.spyOn(FanClubMembership, 'updateMany').mockResolvedValue({ modifiedCount: 0 });
        const aggSpy = jest.spyOn(FanClubMembership, 'aggregate').mockResolvedValue([]);
        jest.spyOn(User, 'bulkWrite').mockResolvedValue({});

        await resolveMigrationStartup({ env: { FANCLUB_V2_MIGRATION: 'apply' } });
        expect(aggSpy).toHaveBeenCalledTimes(1);

        const second = await resolveMigrationStartup({ env: { FANCLUB_V2_MIGRATION: 'apply' } });
        expect(second).toEqual({ ready: true, mode: 'already_completed' });
        expect(aggSpy).toHaveBeenCalledTimes(1); // ✅ لم يُعاد التجميع إطلاقاً بالمحاولة الثانية
    });
});
