// ملف: fanClubController.final.test.js
// 🛡️ feat/fanclub-final: (1) getConfig — كل رقم يظهر بصفحة الشرح ("!") يُحسَب من ثوابت الخادم
// نفسها (لا رقم ثابت مُكرَّر قد ينحرف عنها). (2) getTopFans — استبعاد الحسابات المرتبطة
// بالمضيف، الفارق إلى المركز الأعلى (gapToNext)، والتقسيم الصحيح لصفحات. (3) getLeaderboard
// week=last — يقرأ من FanClubWeeklyResult المُجمَّدة فقط، لا من البيانات الحيّة. (4) getMissions
// — حساب "نقاط اليوم المجانية" الحسابي الصحيح من المهام الثلاث (حضور+دردشة+استماع فقط).
const mongoose = require('mongoose');
const FanClubMembership = require('../../models/FanClubMembership');
const FanClubWeekly = require('../../models/FanClubWeekly');
const FanClubWeeklyResult = require('../../models/FanClubWeeklyResult');
const FanClubDailyProgress = require('../../models/FanClubDailyProgress');
const User = require('../../models/User');
const linkageService = require('../../utils/linkageService');
const { getCurrentWeekBounds, getWeekBoundsForDate } = require('../../utils/poolWeek');
const fanClubController = require('../fanClubController');

function oid(n) { return String(n).padStart(24, '0'); }
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
// ✅ كل واحد بمجموعته الخاصة افتراضياً (لا ترابط)، إلا ما حُدِّد صريحاً بـgroups (نفس أسلوب
// socketService.liveHoursTick.test.js المجاور)
function mockGroups(groups = []) {
    jest.spyOn(linkageService, 'groupLinkedAccounts').mockImplementation(async (ids) => {
        const map = new Map();
        ids.forEach(id => map.set(id, id));
        groups.forEach(group => { const rep = group[0]; group.forEach(id => map.set(id, rep)); });
        return map;
    });
}

const OWNER = oid(1);

describe('getConfig — كل رقم من ثوابت الخادم، لا تكرار يدوي قد ينحرف', () => {
    test('dailyFreeCap محسوب حسابياً = حضور + دردشة + (نقطة/دقيقة × سقف الدقائق)', () => {
        const res = mockRes();
        fanClubController.getConfig({}, res);
        const data = res.json.mock.calls[0][0].data;
        expect(data.dailyFreeCap).toBe(data.checkinPoints + data.chatBonusPoints + (data.listenPointsPerMinute * data.listenCapMinutes));
        expect(data.levelThresholds).toHaveLength(20);
        expect(data.tiers).toHaveLength(5);
        expect(data.perkLevels).toEqual({ badge: 1, nameColor: 5, entrance: 9, exclusiveGift: 13, legendFrame: 17 });
    });
});

describe('getTopFans — استبعاد المرتبطين، الفارق للمركز الأعلى، وتقسيم الصفحات', () => {
    afterEach(() => jest.restoreAllMocks());

    test('range=week: حساب مرتبط بالمضيف لا يظهر بالقائمة ولا يُحتسَب برقم الترتيب', async () => {
        const { weekStart } = getCurrentWeekBounds();
        const member1 = oid(2), linkedMember = oid(3), member2 = oid(4);
        jest.spyOn(FanClubWeekly, 'find').mockImplementation(() => chainable([
            { member: member1, points: 500 },
            { member: linkedMember, points: 900 }, // ✅ أعلى نقاطاً لكنه مرتبط — يجب استبعاده تماماً
            { member: member2, points: 300 }
        ]));
        mockGroups([[OWNER, linkedMember]]); // ✅ linkedMember بنفس مجموعة المالك
        jest.spyOn(User, 'find').mockImplementation(() => chainable([
            { _id: member1, username: 'm1', profileImage: 'p1.png' },
            { _id: member2, username: 'm2', profileImage: 'p2.png' }
        ]));
        jest.spyOn(User, 'findById').mockImplementation(() => chainable({ username: 'm1', profileImage: 'p1.png' }));

        const res = mockRes();
        await fanClubController.getTopFans({ params: { ownerId: OWNER }, query: { range: 'week' }, user: { id: member1 } }, res);

        const data = res.json.mock.calls[0][0].data;
        expect(data.fans).toHaveLength(2); // ✅ فقط member1 وmember2 — لا linkedMember
        expect(data.fans.find(f => String(f.userId) === linkedMember)).toBeUndefined();
        expect(data.fans[0].userId).toBe(member1); // ✅ الأعلى نقاطاً ضمن المؤهَّلين فقط (500 > 300)
        expect(data.fans[0].rank).toBe(1);
        expect(data.myRank.rank).toBe(1);
        expect(data.myRank.gapToNext).toBe(0); // ✅ هو الأول فعلاً — لا فارق
        expect(data.total).toBe(2); // ✅ لا يُحسَب المرتبط بإجمالي العدّ أيضاً
    });

    test('gapToNext للمستخدم الحالي = فارق النقاط عن المركز الأعلى مباشرة فقط', async () => {
        const me = oid(5), ahead1 = oid(6), ahead2 = oid(7);
        jest.spyOn(FanClubMembership, 'find').mockImplementation(() => chainable([
            { member: ahead1, points: 1000 },
            { member: ahead2, points: 800 },
            { member: me, points: 650 }
        ]));
        mockGroups([]);
        jest.spyOn(User, 'find').mockImplementation(() => chainable([
            { _id: ahead1, username: 'a1', profileImage: '' },
            { _id: ahead2, username: 'a2', profileImage: '' },
            { _id: me, username: 'me', profileImage: '' }
        ]));
        jest.spyOn(User, 'findById').mockImplementation(() => chainable({ username: 'me', profileImage: '' }));

        const res = mockRes();
        await fanClubController.getTopFans({ params: { ownerId: OWNER }, query: { range: 'all' }, user: { id: me } }, res);

        const data = res.json.mock.calls[0][0].data;
        expect(data.myRank.rank).toBe(3);
        expect(data.myRank.gapToNext).toBe(800 - 650); // ✅ فقط عن المركز 2 (800)، لا عن المركز 1 (1000)
    });

    test('تقسيم صفحات صحيح: skip/limit يطبَّقان على القائمة المؤهَّلة بعد الاستبعاد، لا قبله', async () => {
        const candidates = Array.from({ length: 5 }, (_, i) => ({ member: oid(10 + i), points: 100 - i }));
        jest.spyOn(FanClubWeekly, 'find').mockImplementation(() => chainable(candidates));
        mockGroups([]);
        jest.spyOn(User, 'find').mockImplementation((query) => chainable(
            query._id.$in.map(id => ({ _id: id, username: `u${id}`, profileImage: '' }))
        ));

        const res = mockRes();
        await fanClubController.getTopFans({ params: { ownerId: OWNER }, query: { range: 'week', skip: '2', limit: '2' }, user: { id: oid(999) } }, res);

        const data = res.json.mock.calls[0][0].data;
        expect(data.fans).toHaveLength(2);
        expect(data.fans[0].rank).toBe(3); // ✅ skip=2 يبدأ من المركز الثالث
        expect(data.hasMore).toBe(true); // ✅ 5 مؤهَّلون إجمالاً، عُرض 2 بعد تجاوز أول 2
        expect(data.total).toBe(5);
    });
});

describe('getLeaderboard week=last — من FanClubWeeklyResult المُجمَّدة فقط، لا إعادة حساب', () => {
    afterEach(() => jest.restoreAllMocks());

    test('يقرأ من FanClubWeeklyResult مُرتَّباً بـrank، ولا يلمس أي تجميع حيّ', async () => {
        const findSpy = jest.spyOn(FanClubWeeklyResult, 'find').mockImplementation(() => chainable([
            { owner: OWNER, rank: 1, username: 'o1', profileImage: 'p.png', emblemColorId: 'blue', memberCount: 50, activeCount: 20, weeklyPoints: 9000 },
            { owner: oid(2), rank: 2, username: 'o2', profileImage: 'p2.png', emblemColorId: 'pink', memberCount: 30, activeCount: 10, weeklyPoints: 5000 }
        ]));
        const liveAggSpy = jest.spyOn(FanClubWeekly, 'aggregate');

        const res = mockRes();
        await fanClubController.getLeaderboard({ query: { week: 'last' }, user: { id: oid(999) } }, res);

        expect(findSpy).toHaveBeenCalled();
        expect(liveAggSpy).not.toHaveBeenCalled(); // ✅ لا تجميع حيّ أبداً لأسبوع مكتمل مُجمَّد
        const data = res.json.mock.calls[0][0].data;
        expect(data.week).toBe('last');
        expect(data.leaders[0].rank).toBe(1);
        expect(data.leaders[0].gapToNext).toBe(0); // ✅ المركز الأول: لا فارق
        expect(data.leaders[1].gapToNext).toBe(20 - 10); // ✅ فارق الأعضاء النشطين عن المركز الأعلى مباشرة
    });

    test('weekStart المُستعلَم عنه هو الأسبوع الدمشقي السابق مباشرة (7 أيام قبل الحالي)', async () => {
        const findSpy = jest.spyOn(FanClubWeeklyResult, 'find').mockImplementation(() => chainable([]));
        await fanClubController.getLeaderboard({ query: { week: 'last' }, user: { id: oid(999) } }, mockRes());

        const { weekStart: currentWeekStart } = getCurrentWeekBounds();
        const { weekStart: expectedLastWeekStart } = getWeekBoundsForDate(new Date(currentWeekStart.getTime() - 86400000));
        expect(findSpy.mock.calls[0][0].weekStart.getTime()).toBe(expectedLastWeekStart.getTime());
    });
});

describe('getMissions — حساب "نقاط اليوم المجانية" من حضور+دردشة+استماع فقط (الهدايا بلا حد)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('التقدّم = 50 (حضور) + 50 (دردشة) + 13×10 (استماع) = 230، والسقف = 50+50+300 = 400', async () => {
        jest.spyOn(FanClubMembership, 'findOne').mockResolvedValue({ points: 11800, lastPointAt: new Date(), followBonusClaimed: true });
        jest.spyOn(FanClubDailyProgress, 'findOne').mockResolvedValue({
            checkinAwarded: true, chatBonusAwarded: true, chatMsgCount: 3, listenMinutes: 13
        });

        const res = mockRes();
        await fanClubController.getMissions({ params: { ownerId: OWNER }, user: { id: oid(2) } }, res);

        const data = res.json.mock.calls[0][0].data;
        expect(data.dailyFreeProgress).toBe(230);
        expect(data.dailyFreeCap).toBe(400);
    });

    test('لم يحقّق أي مهمة بعد اليوم — التقدّم صفر، السقف يبقى 400 ثابتاً', async () => {
        jest.spyOn(FanClubMembership, 'findOne').mockResolvedValue({ points: 500, lastPointAt: new Date(), followBonusClaimed: false });
        jest.spyOn(FanClubDailyProgress, 'findOne').mockResolvedValue(null);

        const res = mockRes();
        await fanClubController.getMissions({ params: { ownerId: OWNER }, user: { id: oid(2) } }, res);

        const data = res.json.mock.calls[0][0].data;
        expect(data.dailyFreeProgress).toBe(0);
        expect(data.dailyFreeCap).toBe(400);
    });
});
