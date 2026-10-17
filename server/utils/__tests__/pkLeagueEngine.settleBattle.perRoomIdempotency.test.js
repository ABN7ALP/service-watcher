// ملف: pkLeagueEngine.settleBattle.perRoomIdempotency.test.js
// 🛡️ معيار قبول صريح بمراجعة PR: settleBattle idempotent حقيقياً لكل غرفة على حدة — لو
// فشل تطبيق التحديث على غرفة B فقط بعد أن نجح تطبيقه على غرفة A بنفس المحاولة (لا دعم
// معاملات حقيقية هنا، فالتحديثان يُطبَّقان بتوازٍ غير ذرّي بينهما — راجع تعليق applyUpdates)،
// إعادة استدعاء settleBattle كاملة لاحقاً (محاكاة لمهمة إعادة المحاولة الدورية) يجب أن:
// (1) تُطبَّق نقاط A مرّة واحدة فقط رغم استدعاء applyUpdates مرتين إجمالاً،
// (2) تُطبَّق نقاط B مرّة واحدة فقط (بالمحاولة الثانية تحديداً، بعد أن فشلت بالأولى).
//
// نفس أسلوب محاكاة Mongoose المستخدَم بكل اختبارات هذا المشروع (بلا قاعدة بيانات حقيقية).
// mongoose.startSession مُموَّه (mock) ليفشل فوراً بخطأ "بلا دعم معاملات" — يدفع الكود لمسار
// التحديثات الذرّية المتتالية البديل (نفس سلوك قاعدة بيانات الإنتاج الفعلية هنا، راجع تعليق
// jest.config.js: "سياسة شبكة الجلسة تحجب mongodb.org" فمحاكاة الاتصال الحقيقي غير متاحة أصلاً)

const mongoose = require('mongoose');
const RoomBattle = require('../../models/RoomBattle');
const PkStanding = require('../../models/PkStanding');
const PkHeadToHead = require('../../models/PkHeadToHead');
const VoiceRoom = require('../../models/VoiceRoom');
const SystemSettings = require('../../models/SystemSettings');
const PkSeason = require('../../models/PkSeason');
const pkRankingStore = require('../pkRankingStore');
const { settleBattle } = require('../pkLeagueEngine');

function fakeSession() {
    return {
        withTransaction: async () => { throw new Error('Transaction numbers are only allowed on a replica set member or mongos'); },
        endSession: () => {}
    };
}

describe('pkLeagueEngine.settleBattle — idempotent حقيقياً لكل غرفة على حدة', () => {
    afterEach(() => jest.restoreAllMocks());

    test('فشل تطبيق غرفة B فقط بالمحاولة الأولى، ثم نجاح إعادة المحاولة — A مرّة واحدة، B مرّة واحدة', async () => {
        jest.spyOn(mongoose, 'startSession').mockResolvedValue(fakeSession());
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({
            pkMinDurationSeconds: 60, pkMinSupportCoins: 10, pkMaxDailyMatchesPerPair: 99,
            pkWinLp: 300, pkLossLp: 50, pkDrawLp: 120, pkSupportLpDivisor: 100, pkLpCapPerBattle: 2000
        });
        jest.spyOn(PkSeason, 'ensureActiveSeason').mockResolvedValue({
            _id: 'season_1', weekKey: '2026-W01', startsAt: new Date(), endsAt: new Date()
        });
        // ✅ يخدم استعلامين مختلفين بالملف: checkEligibility (await مباشر بلا lean) وgetNeighbours
        // (.lean() مُسلسَلة) — الكائن المُرجَع من select() قابل للانتظار مباشرة وله .lean() معاً
        jest.spyOn(VoiceRoom, 'findById').mockImplementation((id) => {
            const data = id === 'room_a'
                ? { host: 'host_a', moderators: [], name: 'غرفة أ', coverImage: null }
                : { host: 'host_b', moderators: [], name: 'غرفة ب', coverImage: null };
            return { select: () => ({ lean: () => Promise.resolve(data), then: (resolve) => resolve(data) }) };
        });
        jest.spyOn(RoomBattle, 'countDocuments').mockResolvedValue(0);
        jest.spyOn(pkRankingStore, 'syncRoom').mockResolvedValue(undefined);
        jest.spyOn(PkHeadToHead, 'getForRoomPair').mockResolvedValue({ myWins: 0, opponentWins: 0, draws: 0, matches: 0 });
        jest.spyOn(PkHeadToHead, 'recordMatch').mockResolvedValue({});

        // ✅ حالة PkStanding بالذاكرة لمحاكاة قاعدة بيانات حقيقية بسيطة — findOne/ensure-upsert/
        // التحديث المشروط بـappliedBattleIds كلها تعمل على نفس الكائنين الحقيقيين هنا
        const standings = {
            room_a: { season: 'season_1', room: 'room_a', lp: 1000, wins: 5, losses: 2, draws: 0, streak: 1, bestStreak: 3, appliedBattleIds: [] },
            room_b: { season: 'season_1', room: 'room_b', lp: 800, wins: 3, losses: 4, draws: 0, streak: -1, bestStreak: 2, appliedBattleIds: [] }
        };
        let roomBShouldFail = true; // ✅ تفشل بالمحاولة الأولى فقط، تنجح بالثانية

        jest.spyOn(PkStanding, 'findOne').mockImplementation((filter) => {
            const key = filter.room;
            const doc = standings[key];
            return { ...doc, appliedBattleIds: [...doc.appliedBattleIds] }; // نسخة ضحلة كافية هنا
        });
        jest.spyOn(PkStanding, 'findOneAndUpdate').mockImplementation(async (filter) => {
            // ✅ خطوة "ensure exists" فقط (بلا $inc بهذا الاستدعاء بالكود الحقيقي) — المستندان
            // موجودان بالفعل بهذي المحاكاة، فلا شيء لفعله هنا سوى إرجاعهما كما هما
            return standings[filter.room];
        });
        jest.spyOn(PkStanding, 'updateOne').mockImplementation(async (filter, update) => {
            const key = filter.room;
            const doc = standings[key];
            const battleId = filter.appliedBattleIds.$ne;
            if (doc.appliedBattleIds.includes(battleId)) {
                return { matchedCount: 0, modifiedCount: 0 }; // ✅ سُوِّيت من قبل — لا تكرار
            }
            if (key === 'room_b' && roomBShouldFail) {
                throw new Error('شبكة متقطّعة محاكاة لفشل غرفة B بالمحاولة الأولى');
            }
            doc.lp += update.$inc.lp;
            doc.wins += update.$inc.wins || 0;
            doc.losses += update.$inc.losses || 0;
            doc.draws += update.$inc.draws || 0;
            doc.appliedBattleIds.push(battleId);
            return { matchedCount: 1, modifiedCount: 1 };
        });
        jest.spyOn(PkStanding, 'getRank').mockResolvedValue(1);
        // ✅ getNeighbours (زينة بصرية لحركة السلّم فقط، غير مختبَرة هنا) — لا جيران، يكفي تماماً
        jest.spyOn(PkStanding, 'find').mockReturnValue({
            sort: () => ({ skip: () => ({ limit: () => ({ populate: () => ({ lean: () => Promise.resolve([]) }) }) }) })
        });

        const battle = {
            _id: 'battle_partial',
            roomA: 'room_a', roomB: 'room_b',
            startedAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2026-01-01T00:05:00Z'), // 300s
            realSupportA: 500, realSupportB: 300
        };

        // ✅ محاكاة ادّعاء lpSettled الذرّي الخاص بـsettleBattle نفسها (راجع تعليقها أعلى
        // الملف: تُعيد ضبطه إلى false تلقائياً عند أي استثناء بعد الادّعاء، فتسمح بمحاولة
        // تالية حقيقية — هذا بالضبط ما يختبره هذا الملف)
        let lpSettledFlag = false;
        jest.spyOn(RoomBattle, 'findOneAndUpdate').mockImplementation(async (filter) => {
            if (filter._id !== 'battle_partial' || lpSettledFlag) return null;
            lpSettledFlag = true;
            return { _id: 'battle_partial' };
        });
        jest.spyOn(RoomBattle, 'updateOne').mockImplementation(async (filter, update) => {
            if (update.$set && 'lpSettled' in update.$set) lpSettledFlag = update.$set.lpSettled;
            return { matchedCount: 1 };
        });

        // ✅ المحاولة الأولى: غرفة A تُطبَّق بنجاح (lp 1000→1305، +305 فوز (300 أساس + 5 مكافأة دعم))، ثم تفشل غرفة B
        // فيرمي Promise.all استثناءً يصل حتى settleBattle (التي تُعيد ضبط lpSettled:false
        // وتُعيد رمي الخطأ — مطابقة تماماً لسلوكها الموثَّق بتعليقها الخاص)
        await expect(settleBattle(battle, 'A')).rejects.toThrow('شبكة متقطّعة');
        expect(standings.room_a.lp).toBe(1305); // ✅ A أُضيفت فعلاً رغم فشل الاستدعاء كاملاً
        expect(standings.room_a.appliedBattleIds).toEqual(['battle_partial']);
        expect(standings.room_b.lp).toBe(800); // ✅ B لم تتغيّر بعد (فشلت)

        // ✅ محاكاة: مهمة إعادة المحاولة الدورية تستدعي settleBattle مجدداً لاحقاً — لا حاجة
        // لمحاكاة lpSettled:false مجدداً هنا لأن الاستثناء أعلاه أعاد ضبطها فعلياً بالفعل
        roomBShouldFail = false; // ✅ "الشبكة عادت" قبل المحاولة الثانية
        const settlement = await settleBattle(battle, 'A');

        expect(settlement.eligible).toBe(true);
        // 🛡️ النتيجة الحاسمة: A لم تُضاعَف (لا تزال 1305، لا 1610)، وB أُضيفت مرّة واحدة فقط
        expect(standings.room_a.lp).toBe(1305);
        expect(standings.room_a.appliedBattleIds).toEqual(['battle_partial']); // لا تكرار بالمصفوفة
        expect(standings.room_b.lp).toBe(853); // 800 + 53(loss lp: 50 أساس + 3 مكافأة دعم) = 853
        expect(standings.room_b.appliedBattleIds).toEqual(['battle_partial']);

        // ✅ lpBefore المعروض بنتيجة المحاولة الثانية يعكس اللقطة الحقيقية لحظة هذي المحاولة
        // تحديداً (لا طرح lpDelta من الرقم النهائي، كان سينحرف لغرفة A المُطبَّقة من قبل)
        expect(settlement.A.lpBefore).toBe(1305);
        expect(settlement.A.lpAfter).toBe(1305);
        expect(settlement.B.lpBefore).toBe(800);
        expect(settlement.B.lpAfter).toBe(853);
    });
});
