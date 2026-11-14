// ملف: fanClubController.weekly.test.js
// 🛡️ fanclub-v2: تقويم واحد فقط (دمشق، الأسبوع يبدأ أحداً، راجع server/utils/poolWeek.js —
// له اختباره الخاص لحساب الحدود نفسه)، لوحة صدارة مخزَّنة مؤقتاً 10 دقائق لا بكل طلب، وعلم
// "غير نشط" محسوب من lastPointAt فقط (لا خصم نقاط أبداً).
const mongoose = require('mongoose');
const FanClubMembership = require('../../models/FanClubMembership');
const FanClubWeekly = require('../../models/FanClubWeekly');
const User = require('../../models/User');
const Follow = require('../../models/Follow');
const linkageService = require('../../utils/linkageService');
const { getCurrentWeekBounds, getWeekBoundsForDate } = require('../../utils/poolWeek');
const fanClubController = require('../fanClubController');

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.sort = () => p;
    p.skip = () => p;
    p.limit = () => p;
    p.lean = () => p;
    p.populate = () => p;
    return p;
}

function mockRes() { return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }; }

const OWNER = '111111111111111111111111';
const MEMBER = '222222222222222222222222';

describe('awardFanClubPoints — الأسبوع الحالي بتقويم poolWeek.js الوحيد', () => {
    afterEach(() => jest.restoreAllMocks());

    test('نقاط جديدة تُزاد على FanClubWeekly بـweekStart الحالي بالضبط (نفس تقويم مسبح المضيفين)', async () => {
        jest.spyOn(linkageService, 'areLinked').mockResolvedValue(false);
        jest.spyOn(FanClubMembership, 'findOneAndUpdate').mockResolvedValue({ points: 100, _id: 'm1' });
        const addPointsSpy = jest.spyOn(FanClubWeekly, 'addPoints').mockResolvedValue(null);

        await fanClubController.awardFanPoints(null, OWNER, MEMBER, 100);

        const { weekStart } = getCurrentWeekBounds();
        expect(addPointsSpy).toHaveBeenCalledWith(OWNER, MEMBER, weekStart, 100);
    });
});

describe('getWeeklyWins — "الأسبوع الماضي" بتقويم دمشق (الأحد-السبت)، لا UTC/Monday', () => {
    afterEach(() => jest.restoreAllMocks());

    test('نطاق المطابقة بالضبط هو weekStart الأسبوع الدمشقي السابق مباشرة', async () => {
        jest.spyOn(User, 'findById').mockImplementation(() => chainable(null)); // ليس صاحب الحساب نفسه (fanClubBadgesVisible غير مهم هنا)
        jest.spyOn(FanClubMembership, 'find').mockImplementation(() => ({ distinct: () => Promise.resolve([OWNER]) }));
        const aggSpy = jest.spyOn(FanClubWeekly, 'aggregate').mockResolvedValue([]);

        const req = { params: { userId: MEMBER }, user: { id: MEMBER } };
        await fanClubController.getWeeklyWins(req, mockRes());

        const { weekStart: currentWeekStart } = getCurrentWeekBounds();
        const { weekStart: expectedLastWeekStart } = getWeekBoundsForDate(new Date(currentWeekStart.getTime() - 86400000));
        const matchArg = aggSpy.mock.calls[0][0][0].$match;
        expect(matchArg.weekStart.getTime()).toBe(expectedLastWeekStart.getTime());
        // ✅ الأسبوع الماضي يجب أن يسبق الأسبوع الحالي بالضبط 7 أيام (لا نافذة متدحرجة عشوائية)
        expect(currentWeekStart.getTime() - expectedLastWeekStart.getTime()).toBe(7 * 86400000);
    });
});

describe('getLeaderboard — كاش ذاكرة 10 دقائق، لا تجميع بكل طلب', () => {
    afterEach(() => jest.restoreAllMocks());

    test('طلبان متتاليان ضمن 10 دقائق — تجميع واحد فقط', async () => {
        fanClubController._resetLeaderboardCacheForTests();
        jest.spyOn(FanClubWeekly, 'aggregate').mockResolvedValue([]);
        // 🛡️ مراجعة #156: activeCount يُحسَب حياً من FanClubMembership.aggregate الآن (لا حقل
        // User.fanClub.activeCount — أُزيل كعدّاد مخزَّن)
        const activeAggSpy = jest.spyOn(FanClubMembership, 'aggregate').mockResolvedValue([]);
        const findSpy = jest.spyOn(User, 'find').mockImplementation(() => chainable([
            { _id: OWNER, username: 'o1', profileImage: '', fanClub: { memberCount: 5 } }
        ]));

        await fanClubController.getLeaderboard({ query: {}, user: { id: MEMBER } }, mockRes());
        await fanClubController.getLeaderboard({ query: {}, user: { id: MEMBER } }, mockRes());

        expect(findSpy).toHaveBeenCalledTimes(1); // ✅ النداء الثاني من الكاش، لا تجميع جديد
        expect(activeAggSpy).toHaveBeenCalledTimes(1);
    });

    test('الترتيب: الأعضاء النشطون أولاً، نقاط الأسبوع فاصلاً', async () => {
        fanClubController._resetLeaderboardCacheForTests();
        jest.spyOn(FanClubWeekly, 'aggregate').mockResolvedValue([
            { _id: 'ownerLowActiveHighPoints', weeklyPoints: 900 },
            { _id: 'ownerHighActiveLowPoints', weeklyPoints: 10 }
        ]);
        jest.spyOn(FanClubMembership, 'aggregate').mockResolvedValue([
            { _id: 'ownerLowActiveHighPoints', activeCount: 1 },
            { _id: 'ownerHighActiveLowPoints', activeCount: 8 }
        ]);
        jest.spyOn(User, 'find').mockImplementation(() => chainable([
            { _id: 'ownerLowActiveHighPoints', username: 'a', profileImage: '', fanClub: { memberCount: 2 } },
            { _id: 'ownerHighActiveLowPoints', username: 'b', profileImage: '', fanClub: { memberCount: 10 } }
        ]));

        const res = mockRes();
        await fanClubController.getLeaderboard({ query: {}, user: { id: MEMBER } }, res);

        const leaders = res.json.mock.calls[0][0].data.leaders;
        expect(leaders[0].ownerId).toBe('ownerHighActiveLowPoints'); // ✅ activeCount أعلى يتصدّر رغم نقاط أسبوعية أقل
        expect(leaders[1].ownerId).toBe('ownerLowActiveHighPoints');
    });
});

describe('علم "غير نشط" — من lastPointAt فقط، لا خصم نقاط أبداً', () => {
    afterEach(() => jest.restoreAllMocks());

    test('آخر نقطة منذ 6 أيام — نشط (لم تتجاوز 7 أيام)', async () => {
        fanClubController._resetLeaderboardCacheForTests();
        jest.spyOn(User, 'findById').mockImplementation(() => chainable({ username: 'o', profileImage: '', activeFrameClass: '', fanClub: {} }));
        const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
        jest.spyOn(FanClubMembership, 'findOne').mockResolvedValue({ points: 500, lastPointAt: sixDaysAgo });
        // 🛡️ مراجعة #156: activeCount بملخّص النادي أيضاً حيّ من countDocuments الآن (لا عدّاد مخزَّن)
        const countSpy = jest.spyOn(FanClubMembership, 'countDocuments').mockResolvedValue(1);
        jest.spyOn(FanClubMembership, 'aggregate').mockResolvedValue([]); // ✅ كاش لوحة الصدارة لحساب clubRank برأس الصفحة
        jest.spyOn(FanClubWeekly, 'find').mockImplementation(() => chainable([]));
        jest.spyOn(FanClubWeekly, 'aggregate').mockResolvedValue([]);
        jest.spyOn(User, 'find').mockImplementation(() => chainable([]));
        // 🛡️ feat/fanclub-v2-ui: isFollowing بالملخّص الجديد يستعلم Follow.exists — غير موضوع هذا الاختبار
        jest.spyOn(Follow, 'exists').mockResolvedValue(false);
        // 🛡️ feat/fanclub-final: متابعو المالك برأس الصفحة — غير موضوع هذا الاختبار
        jest.spyOn(Follow, 'countDocuments').mockResolvedValue(0);

        const res = mockRes();
        await fanClubController.getSummary({ params: { ownerId: OWNER }, user: { id: MEMBER } }, res);

        expect(res.json.mock.calls[0][0].data.myInactive).toBe(false);
        expect(res.json.mock.calls[0][0].data.myLevelInfo.points).toBe(500); // ✅ لا خصم نقاط إطلاقاً
        expect(res.json.mock.calls[0][0].data.activeCount).toBe(1);
        expect(countSpy).toHaveBeenCalledWith({ owner: OWNER, lastPointAt: { $gte: expect.any(Date) } });
    });

    test('آخر نقطة منذ 8 أيام — غير نشط، لكن النقاط المخزَّنة لم تتغيّر', async () => {
        fanClubController._resetLeaderboardCacheForTests();
        jest.spyOn(User, 'findById').mockImplementation(() => chainable({ username: 'o', profileImage: '', activeFrameClass: '', fanClub: {} }));
        const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        jest.spyOn(FanClubMembership, 'findOne').mockResolvedValue({ points: 500, lastPointAt: eightDaysAgo });
        jest.spyOn(FanClubMembership, 'countDocuments').mockResolvedValue(0);
        jest.spyOn(FanClubMembership, 'aggregate').mockResolvedValue([]);
        jest.spyOn(FanClubWeekly, 'find').mockImplementation(() => chainable([]));
        jest.spyOn(FanClubWeekly, 'aggregate').mockResolvedValue([]);
        jest.spyOn(User, 'find').mockImplementation(() => chainable([]));
        jest.spyOn(Follow, 'exists').mockResolvedValue(false);
        jest.spyOn(Follow, 'countDocuments').mockResolvedValue(0);

        const res = mockRes();
        await fanClubController.getSummary({ params: { ownerId: OWNER }, user: { id: MEMBER } }, res);

        expect(res.json.mock.calls[0][0].data.myInactive).toBe(true);
        expect(res.json.mock.calls[0][0].data.activeCount).toBe(0); // ✅ غير نشط فعلاً فور صمته 7 أيام، لا بانتظار ترحيل
        expect(res.json.mock.calls[0][0].data.myLevelInfo.points).toBe(500); // ✅ النقاط ثابتة رغم الخمول
    });
});
