// ملف: pkLeagueEngine.settleBattle.retryOnFailure.test.js
// 🛡️ معيار قبول صريح (الجزء 1، أولوية قصوى): "إن فشلت التسوية ... أعد محاولة التسوية
// لاحقاً" — lpSettled يُفرَج عنه (يُعاد false) عند أي استثناء بعد الادّعاء الذرّي، وإلا
// تبقى معركة فشلت تسويتها لمرة واحدة محظورة من أي محاولة لاحقة للأبد (المكنسة لن تنفعها)

const RoomBattle = require('../../models/RoomBattle');
const SystemSettings = require('../../models/SystemSettings');
const { settleBattle } = require('../pkLeagueEngine');

describe('pkLeagueEngine.settleBattle — إفراج عن الادّعاء عند فشل التسوية', () => {
    afterEach(() => jest.restoreAllMocks());

    test('استثناء أثناء التسوية يُعيد lpSettled إلى false ويُعيد رمي الخطأ للمستدعي', async () => {
        jest.spyOn(RoomBattle, 'findOneAndUpdate').mockResolvedValueOnce({ _id: 'battle_9' }); // ✅ الادّعاء الأول ينجح
        const updateOneSpy = jest.spyOn(RoomBattle, 'updateOne').mockResolvedValue({});
        jest.spyOn(SystemSettings, 'getSettings').mockRejectedValue(new Error('اتصال قاعدة البيانات انقطع'));

        const battle = { _id: 'battle_9', roomA: 'room_a', roomB: 'room_b' };

        await expect(settleBattle(battle, 'A')).rejects.toThrow('اتصال قاعدة البيانات انقطع');

        expect(updateOneSpy).toHaveBeenCalledWith({ _id: 'battle_9' }, { $set: { lpSettled: false } });
    });

    test('بعد الإفراج، محاولة تالية لنفس المعركة يمكنها الادّعاء من جديد', async () => {
        // ✅ محاكاة "المحاولة اللاحقة": lpSettled عاد false فعلياً بقاعدة البيانات (الاختبار
        // أعلى أثبت ذلك) — findOneAndUpdate بنفس شرط lpSettled:false ينجح من جديد هنا
        jest.spyOn(RoomBattle, 'findOneAndUpdate').mockResolvedValueOnce({ _id: 'battle_9' });
        jest.spyOn(RoomBattle, 'updateOne').mockResolvedValue({});
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({
            pkMinDurationSeconds: 999999 // ✅ يضمن عدم الأهلية فوراً بلا حاجة لمحاكاة بقية السلسلة
        });
        const PkSeason = require('../../models/PkSeason');
        jest.spyOn(PkSeason, 'ensureActiveSeason').mockResolvedValue({ _id: 's1', weekKey: '2026-W01' });

        const battle = {
            _id: 'battle_9', roomA: 'room_a', roomB: 'room_b',
            startedAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2026-01-01T00:05:00Z'),
            realSupportA: 100, realSupportB: 100
        };
        const result = await settleBattle(battle, 'A');
        expect(result.eligible).toBe(false); // ✅ اكتمل التنفيذ بلا رمي — الادّعاء الثاني نجح فعلياً
    });
});
