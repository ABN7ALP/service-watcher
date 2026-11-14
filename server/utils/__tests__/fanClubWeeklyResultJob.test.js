// ملف: fanClubWeeklyResultJob.test.js
// 🛡️ feat/fanclub-final: يثبت أن تجميد ترتيب الأسبوع الماضي (أ) لا يُعاد أبداً لنفس الأسبوع
// (حجز ذرّي حقيقي بـJobRun، نفس أسلوب fanClubWeeklyFrameJob.test.js المجاور بالضبط — محاكاة
// فهرس unique(job, weekStart) حقيقية: إدراج ثانٍ لنفس المفتاح يُرفض بـE11000)، و(ب) "نشط" يُحسَب
// من نقاط ذلك الأسبوع نفسها (FanClubWeekly.points > 0)، لا من lastPointAt/الآن الحيّين.
function wireMocks(db, claimed) {
    const User = require('../../models/User');
    const FanClubWeekly = require('../../models/FanClubWeekly');
    const FanClubWeeklyResult = require('../../models/FanClubWeeklyResult');
    const JobRun = require('../../models/JobRun');

    jest.spyOn(FanClubWeekly, 'aggregate').mockImplementation(() => Promise.resolve(db.weeklyAgg || []));
    jest.spyOn(User, 'find').mockImplementation(() => ({
        select: () => Promise.resolve(db.owners || [])
    }));
    jest.spyOn(JobRun, 'create').mockImplementation(({ job, weekStart }) => {
        const key = `${job}:${weekStart.getTime()}`;
        if (claimed.has(key)) {
            return Promise.reject(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
        }
        claimed.add(key);
        return Promise.resolve({ job, weekStart });
    });
    const insertedDocs = [];
    jest.spyOn(FanClubWeeklyResult, 'insertMany').mockImplementation((docs) => {
        insertedDocs.push(...docs);
        return Promise.resolve(docs);
    });

    return { User, FanClubWeekly, FanClubWeeklyResult, JobRun, insertedDocs };
}

describe('fanClubWeeklyResultJob — حجز ذرّي يمنع إعادة تجميد نفس الأسبوع', () => {
    let db, claimed;

    beforeEach(() => {
        db = {
            weeklyAgg: [
                { _id: 'owner1', weeklyPoints: 500, activeCount: 3 },
                { _id: 'owner2', weeklyPoints: 900, activeCount: 1 }
            ],
            owners: [
                { _id: 'owner1', username: 'o1', profileImage: 'p1.png', fanClub: { memberCount: 10, emblemColorId: 'blue' } },
                { _id: 'owner2', username: 'o2', profileImage: 'p2.png', fanClub: { memberCount: 5, emblemColorId: 'pink' } }
            ]
        };
        claimed = new Set();
    });

    afterEach(() => jest.restoreAllMocks());

    test('نداء ثانٍ لنفس الأسبوع لا يُعيد التجميد إطلاقاً (الحجز الذرّي بـJobRun)', async () => {
        const mocks = wireMocks(db, claimed);
        const { finalizeLastWeekClubResults } = require('../fanClubWeeklyResultJob');

        await finalizeLastWeekClubResults();
        expect(mocks.insertedDocs).toHaveLength(2);
        expect(mocks.FanClubWeekly.aggregate).toHaveBeenCalledTimes(1);

        await finalizeLastWeekClubResults(); // فحص دوري ثانٍ (كل 30 دقيقة)

        expect(mocks.FanClubWeekly.aggregate).toHaveBeenCalledTimes(1); // ✅ لم يُعَد التجميع أصلاً
        expect(mocks.insertedDocs).toHaveLength(2); // ✅ لا صفوف إضافية
    });

    test('بعد "إعادة تشغيل" حقيقية للعملية — الحجز بقاعدة البيانات يمنع إعادة التجميد', async () => {
        wireMocks(db, claimed);
        const { finalizeLastWeekClubResults: finalizeBeforeRestart } = require('../fanClubWeeklyResultJob');
        await finalizeBeforeRestart();

        jest.resetModules(); // ✅ يُحاكي إعادة تشغيل العملية فعلياً — حالة JS المحلية تضيع، الحجز بقاعدة البيانات لا
        const mocksAfterRestart = wireMocks(db, claimed);
        const { finalizeLastWeekClubResults: finalizeAfterRestart } = require('../fanClubWeeklyResultJob');
        await finalizeAfterRestart();

        expect(mocksAfterRestart.FanClubWeekly.aggregate).not.toHaveBeenCalled(); // ✅ رُفض الحجز فوراً، لا معالجة أصلاً
        expect(mocksAfterRestart.insertedDocs).toHaveLength(0);
    });

    test('الترتيب: الأعضاء النشطون أولاً، نقاط الأسبوع فاصلاً — نفس معيار لوحة الصدارة الحيّة', async () => {
        const mocks = wireMocks(db, claimed);
        const { finalizeLastWeekClubResults } = require('../fanClubWeeklyResultJob');

        await finalizeLastWeekClubResults();

        // owner1: activeCount 3 (أعلى) يتصدّر رغم نقاط أسبوعية أقل من owner2 (activeCount 1)
        const byOwner = new Map(mocks.insertedDocs.map(d => [d.owner, d]));
        expect(byOwner.get('owner1').rank).toBe(1);
        expect(byOwner.get('owner2').rank).toBe(2);
        expect(byOwner.get('owner1').emblemColorId).toBe('blue'); // ✅ شعار النادي يُنسَخ وقت التجميد
        expect(byOwner.get('owner1').memberCount).toBe(10);
    });

    test('لا نوادٍ نشطة بالأسبوع الماضي — لا تجميد لأي صف، ولا خطأ', async () => {
        db.weeklyAgg = [];
        const mocks = wireMocks(db, claimed);
        const { finalizeLastWeekClubResults } = require('../fanClubWeeklyResultJob');

        await expect(finalizeLastWeekClubResults()).resolves.not.toThrow();
        expect(mocks.insertedDocs).toHaveLength(0);
    });
});
