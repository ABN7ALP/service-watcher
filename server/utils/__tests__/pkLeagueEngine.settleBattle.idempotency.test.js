// ملف: pkLeagueEngine.settleBattle.idempotency.test.js
// 🛡️ idempotency — "نفس التحدي مرتين لا يضاعف" (طلب صريح). الادّعاء الذرّي
// (findOneAndUpdate بشرط lpSettled:false) هو الحارس الوحيد؛ هذا الاختبار يُحاكيه بدقّة:
// ينجح مرة واحدة فقط، وأي استدعاء تالٍ لنفس المعركة يُرجع null فوراً بلا لمس أي شيء آخر

const RoomBattle = require('../../models/RoomBattle');
const SystemSettings = require('../../models/SystemSettings');
const PkSeason = require('../../models/PkSeason');
const { settleBattle } = require('../pkLeagueEngine');

describe('pkLeagueEngine.settleBattle — idempotency', () => {
    afterEach(() => jest.restoreAllMocks());

    test('معركة سُوِّيت بالفعل (lpSettled:true) — الادّعاء يفشل، لا حساب إطلاقاً', async () => {
        jest.spyOn(RoomBattle, 'findOneAndUpdate').mockResolvedValue(null);
        const getSettingsSpy = jest.spyOn(SystemSettings, 'getSettings');

        const result = await settleBattle({ _id: 'battle_1' }, 'A');

        expect(result).toBeNull();
        expect(RoomBattle.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'battle_1', lpSettled: false },
            { $set: { lpSettled: true } },
            { new: false }
        );
        expect(getSettingsSpy).not.toHaveBeenCalled();
    });

    test('الادّعاء الأول ينجح (معركة غير مؤهَّلة بمكافحة التلاعب)، والاستدعاء الثاني لنفس المعركة لا يُعيد الحساب', async () => {
        jest.spyOn(RoomBattle, 'findOneAndUpdate')
            .mockResolvedValueOnce({ _id: 'battle_2' }) // ✅ الادّعاء الأول ينجح
            .mockResolvedValueOnce(null); // ✅ الاستدعاء الثاني: lpSettled أصبح true فلا يُطابق الشرط بعد الآن
        jest.spyOn(RoomBattle, 'updateOne').mockResolvedValue({});
        const getSettingsSpy = jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({
            pkMinDurationSeconds: 60, pkMinSupportCoins: 50, pkMaxDailyMatchesPerPair: 3,
            pkWinLp: 300, pkLossLp: 50, pkDrawLp: 120, pkSupportLpDivisor: 100, pkLpCapPerBattle: 2000
        });
        jest.spyOn(PkSeason, 'ensureActiveSeason').mockResolvedValue({
            _id: 'season_1', weekKey: '2026-W01', startsAt: new Date(), endsAt: new Date()
        });

        const battle = {
            _id: 'battle_2', roomA: 'room_a', roomB: 'room_b',
            startedAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2026-01-01T00:00:30Z'), // 30s < الحد الأدنى
            realSupportA: 100, realSupportB: 100
        };

        const first = await settleBattle(battle, 'A');
        expect(first.eligible).toBe(false);
        expect(first.reason).toMatch(/^duration_too_short:/);
        expect(RoomBattle.updateOne).toHaveBeenCalledWith(
            { _id: 'battle_2' },
            { $set: { lpCounted: false, lpSkippedReason: first.reason } }
        );

        const second = await settleBattle(battle, 'A');
        expect(second).toBeNull(); // ✅ لا إعادة حساب — الادّعاء الثاني فشل فوراً
        expect(getSettingsSpy).toHaveBeenCalledTimes(1); // ✅ لم تُستدعَ مرة ثانية بالاستدعاء الثاني
    });
});
