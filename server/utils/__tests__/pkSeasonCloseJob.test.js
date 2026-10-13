// ملف: pkSeasonCloseJob.test.js
// ✅ إغلاق الموسم بوقت مزيّف (طلب صريح) — claimEndedSeason يجب أن يستخدم "الآن" الحقيقي
// (المُزيَّف بـjest.useFakeTimers) حصراً بفلتر endsAt، وtierForRank يُحدِّد مكافآت المراكز
// 1/2/3/أفضل10/أفضل100 بحدود دقيقة، وcloseEndedSeasons لا تُنفَّذ مرتين لموسم واحد (الادّعاء
// الذرّي: أول موسم "مُدَّعى" فقط يُغلَق، أي محاولة ثانية بعده تجد status ليس 'active' فتتوقف)

const PkSeason = require('../../models/PkSeason');
const { tierForRank, claimEndedSeason, closeEndedSeasons, SEASON_REWARD_TIERS } = require('../pkSeasonCloseJob');

describe('pkSeasonCloseJob.tierForRank', () => {
    test('حدود دقيقة لكل شريحة مكافأة', () => {
        expect(tierForRank(1).coins).toBe(SEASON_REWARD_TIERS[0].coins);
        expect(tierForRank(2).coins).toBe(SEASON_REWARD_TIERS[1].coins);
        expect(tierForRank(3).coins).toBe(SEASON_REWARD_TIERS[2].coins);
        expect(tierForRank(4).coins).toBe(SEASON_REWARD_TIERS[3].coins); // أول "أفضل 10"
        expect(tierForRank(10).coins).toBe(SEASON_REWARD_TIERS[3].coins); // آخر "أفضل 10"
        expect(tierForRank(11).coins).toBe(SEASON_REWARD_TIERS[4].coins); // أول "أفضل 100"
        expect(tierForRank(100).coins).toBe(SEASON_REWARD_TIERS[4].coins); // آخر "أفضل 100"
        expect(tierForRank(101)).toBeNull(); // لا مكافأة بعد المركز 100
    });
});

describe('pkSeasonCloseJob.claimEndedSeason — بوقت مزيَّف', () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('يُدَّعى موسم انتهى زمنه بالضبط عند "الآن" المُزيَّف، بشرط status:active فقط', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-03-10T12:00:00Z'));
        const findOneAndUpdateSpy = jest.spyOn(PkSeason, 'findOneAndUpdate').mockResolvedValue({
            _id: 'season_x', weekKey: '2026-W10', status: 'closing'
        });

        const result = await claimEndedSeason();

        expect(result).toEqual({ _id: 'season_x', weekKey: '2026-W10', status: 'closing' });
        const [filter, update, options] = findOneAndUpdateSpy.mock.calls[0];
        expect(filter.status).toBe('active');
        expect(filter.endsAt.$lt.getTime()).toBe(new Date('2026-03-10T12:00:00Z').getTime());
        expect(update).toEqual({ $set: { status: 'closing' } });
        expect(options).toEqual({ new: true });
    });

    test('لا موسم منتهٍ بعد (findOneAndUpdate يُرجع null) — لا شيء يُدَّعى', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-03-10T12:00:00Z'));
        jest.spyOn(PkSeason, 'findOneAndUpdate').mockResolvedValue(null);
        const result = await claimEndedSeason();
        expect(result).toBeNull();
    });
});

describe('pkSeasonCloseJob.closeEndedSeasons — لا تُنفَّذ مرتين لموسم واحد', () => {
    afterEach(() => jest.restoreAllMocks());

    test('موسم واحد مُدَّعى ومُغلَق، ثم لا مواسم أخرى منتهية — الحلقة تتوقف ولا تُعيد إغلاقه', async () => {
        // ✅ أول نداء لـfindOneAndUpdate (الادّعاء) ينجح مرة واحدة فقط، ثم null دائماً — يُحاكي
        // بالضبط ما يحدث فعلياً: أول من يدّعي الموسم يُحوّل status، فلا نسخة أخرى (أو دورة تالية
        // بنفس العملية) تجده status:'active' بعد ذلك
        const season = { _id: 'season_y', weekKey: '2026-W11', status: 'closing', save: jest.fn() };
        jest.spyOn(PkSeason, 'findOneAndUpdate')
            .mockResolvedValueOnce(season)
            .mockResolvedValue(null);
        jest.spyOn(PkSeason, 'updateOne').mockResolvedValue({});
        jest.spyOn(PkSeason, 'ensureActiveSeason').mockResolvedValue({ weekKey: '2026-W12' });

        // grantSeasonRewards يستعلم PkStanding — لا مراكز لهذا الموسم (قائمة فارغة) يكفي هنا
        const PkStanding = require('../../models/PkStanding');
        jest.spyOn(PkStanding, 'find').mockReturnValue({
            sort: () => ({ limit: () => ({ populate: () => ({ lean: () => Promise.resolve([]) }) }) })
        });

        await closeEndedSeasons(null);

        // ✅ أول موسم أُدَّعى فعلاً أُغلق (status:'closed' + rewardsGrantedAt) — نداء واحد فقط
        const closeCalls = PkSeason.updateOne.mock.calls.filter(([filter]) => filter._id === 'season_y');
        expect(closeCalls).toHaveLength(1);
        expect(closeCalls[0][1].$set.status).toBe('closed');

        // ✅ findOneAndUpdate استُدعي مرتين فقط (ادّعاء ناجح + محاولة ثانية فشلت) لا حلقة لا منتهية
        expect(PkSeason.findOneAndUpdate).toHaveBeenCalledTimes(2);
    });
});
