// ملف: socketService.finalizeReliability.test.js
// 🛡️ معيار القبول الصريح لإصلاح "تعلّق نهاية PK/تحدي المقاعد بين الغرف" (الجزء 1، أولوية
// قصوى): (1) استثناء داخل settleBattle لا يمنع pk:result من الوصول أبداً، (2) معركة/تحدٍ
// بلا مؤقّت ذاكرة (محاكاة إعادة تشغيل الخادم) تُنهيه المكنسة الدورية بمفردها، (3) إنهاء
// مزدوج متزامن لنفس المعركة/التحدي يُنتج بثّ نتيجة واحداً فقط (الادّعاء الذرّي هو الحارس).
//
// نفس أسلوب محاكاة Mongoose المستخدَم بكل اختبارات pkLeagueEngine (بلا قاعدة بيانات حقيقية
// — سياسة شبكة الجلسة تحجب mongodb.org فتحميل mongod يفشل دوماً هنا). setInterval يُموَّه
// (mock) قبل استيراد socketService لأن الملف يُسجِّل مُنظِّفَي ذاكرة مؤقّتين عند تحميله (غير
// متعلقين بهذا الاختبار إطلاقاً) كان سيُبقيان عملية jest حيّة للأبد بلا --forceExit

// 🛡️ طلب صريح بمراجعة PR (بند 2): finalizeActiveBattle/finalizeActiveSeatChallenge يجب أن
// يستدعيا clearPkScoreThrottle/clearSeatDuelScoreThrottle من giftController — الدوال الأخرى
// المُصدَّرة من هذا الملف (applyGiftToActiveBattle/applyGiftToRoomSupport/schedulePkScoreEmit)
// غير مُستخدَمة إطلاقاً بمسارات finalize/sweep/retry المُختبَرة هنا (راجع معالج هدايا PK
// بسطر socketService.js البعيد عنها)، فتمويه الوحدة كلها هنا آمن تماماً
jest.mock('../../controllers/giftController', () => ({
    applyGiftToActiveBattle: jest.fn(),
    applyGiftToRoomSupport: jest.fn(),
    applyGiftToActiveSeatChallenge: jest.fn(),
    schedulePkScoreEmit: jest.fn(),
    clearPkScoreThrottle: jest.fn(),
    clearSeatDuelScoreThrottle: jest.fn()
}));

let socketService;
let RoomBattle, SeatChallenge, VoiceRoom, pkLeagueEngine, giftController;

beforeAll(() => {
    jest.spyOn(global, 'setInterval').mockImplementation(() => ({ unref: () => {} }));
    socketService = require('../socketService');
    RoomBattle = require('../../models/RoomBattle');
    SeatChallenge = require('../../models/SeatChallenge');
    VoiceRoom = require('../../models/VoiceRoom');
    pkLeagueEngine = require('../../utils/pkLeagueEngine');
    giftController = require('../../controllers/giftController');
});

// ✅ لا afterAll منفصل لاستعادة setInterval — jest.restoreAllMocks() بـafterEach أدناه
// يستعيده تلقائياً فور نهاية أول اختبار (هو جاسوس (spy) كبقية الجواسيس بهذا الملف)
afterEach(() => {
    jest.restoreAllMocks();
    giftController.clearPkScoreThrottle.mockClear();
    giftController.clearSeatDuelScoreThrottle.mockClear();
});

function fakeIo() {
    const emit = jest.fn();
    return { to: jest.fn(() => ({ emit })), _emit: emit };
}

function fakeBattleDoc(overrides = {}) {
    return {
        _id: 'battle_1',
        roomA: 'room_a',
        roomB: 'room_b',
        scoreA: 500,
        scoreB: 300,
        startedAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: new Date('2026-01-01T00:05:00Z'),
        durationSeconds: 300,
        supportersA: new Map(),
        supportersB: new Map(),
        totalGiftUnits: 10,
        highestCombo: 3,
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides
    };
}

function mockRoomLookups() {
    jest.spyOn(VoiceRoom, 'recordBattleOutcome').mockResolvedValue({});
    jest.spyOn(VoiceRoom, 'findById').mockReturnValue({
        select: () => ({ lean: () => Promise.resolve({ name: 'غرفة', coverImage: null }) })
    });
}

describe('finalizeActiveBattle — استثناء داخل settleBattle', () => {
    test('النتيجة تصل بـleague:null رغم فشل التسوية، والخطأ لا يرمي للمستدعي', async () => {
        const battle = fakeBattleDoc();
        jest.spyOn(RoomBattle, 'findOneAndUpdate').mockResolvedValueOnce({ ...battle, status: 'finalizing' });
        mockRoomLookups();
        jest.spyOn(pkLeagueEngine, 'settleBattle').mockRejectedValue(new Error('DB transaction blew up'));
        const io = fakeIo();

        await expect(socketService.finalizeActiveBattle(io, 'battle_1')).resolves.toBeUndefined();

        expect(io._emit).toHaveBeenCalledTimes(2);
        const [eventA, payloadA] = io._emit.mock.calls[0];
        const [eventB, payloadB] = io._emit.mock.calls[1];
        expect(eventA).toBe('pk:result');
        expect(eventB).toBe('pk:result');
        expect(payloadA.league).toBeNull();
        expect(payloadB.league).toBeNull();
        expect(payloadA.outcome).toBe('win'); // scoreA(500) > scoreB(300)
        // 🛡️ طلب صريح بمراجعة PR: finalizeActiveBattle يُلغي مؤقّت بثّ pk:score المؤجَّل فوراً
        expect(giftController.clearPkScoreThrottle).toHaveBeenCalledWith('battle_1');
    });
});

describe('sweepOverdueBattles — محاكاة إعادة تشغيل الخادم أثناء معركة', () => {
    test('معركة active بلا أي مؤقّت ذاكرة (مثل بعد إعادة تشغيل) تُنهيها المكنسة بمفردها', async () => {
        const battle = fakeBattleDoc({ endsAt: new Date(Date.now() - 20000) }); // انتهت منذ 20 ثانية
        jest.spyOn(RoomBattle, 'find').mockReturnValue({
            select: () => ({ lean: () => Promise.resolve([{ _id: 'battle_1' }]) })
        });
        jest.spyOn(RoomBattle, 'findOneAndUpdate').mockResolvedValueOnce({ ...battle, status: 'finalizing' });
        mockRoomLookups();
        jest.spyOn(pkLeagueEngine, 'settleBattle').mockResolvedValue(null);
        const io = fakeIo();

        await socketService.sweepOverdueBattles(io);

        expect(io._emit).toHaveBeenCalledTimes(2);
        expect(io._emit).toHaveBeenCalledWith('pk:result', expect.objectContaining({ battleId: 'battle_1' }));
    });
});

describe('finalizeActiveBattle — إنهاء مزدوج متزامن', () => {
    test('نداءان متزامنان لنفس المعركة ينتجان بثّ نتيجة واحداً فقط (الادّعاء الذرّي يمنع التكرار)', async () => {
        const battle = fakeBattleDoc();
        // ✅ الادّعاء الأول (active→finalizing) ينجح؛ كل ادّعاء تالٍ (الثاني مباشرة + إعادة
        // ادّعاء finalizing "عالقة" التي يجرّبها الفرع الثاني) يفشل — finalizingAt طازج فعلاً
        jest.spyOn(RoomBattle, 'findOneAndUpdate')
            .mockResolvedValueOnce({ ...battle, status: 'finalizing' })
            .mockResolvedValue(null);
        mockRoomLookups();
        jest.spyOn(pkLeagueEngine, 'settleBattle').mockResolvedValue(null);
        const io = fakeIo();

        await Promise.all([
            socketService.finalizeActiveBattle(io, 'battle_1'),
            socketService.finalizeActiveBattle(io, 'battle_1')
        ]);

        // ✅ نتيجة واحدة فقط (لغرفتين — A وB) لا أربعة (معركتان مزدوجتان)
        expect(io._emit).toHaveBeenCalledTimes(2);
    });
});

describe('finalizeActiveSeatChallenge — نفس الإصلاح الثلاثي لتحدي المقاعد', () => {
    function fakeChallengeDoc(overrides = {}) {
        return {
            _id: 'challenge_1',
            room: 'room_a',
            scoreA: 40,
            scoreB: 10,
            participants: [],
            durationSeconds: 180,
            punishmentKey: 'none',
            endsAt: new Date(Date.now() - 15000),
            save: jest.fn().mockResolvedValue(undefined),
            populate: jest.fn().mockResolvedValue(undefined),
            topSupporters: jest.fn().mockResolvedValue([]),
            ...overrides
        };
    }

    test('تحدٍ active بلا مؤقّت ذاكرة — المكنسة تنهيه بمفردها', async () => {
        const challenge = fakeChallengeDoc();
        jest.spyOn(SeatChallenge, 'find').mockReturnValue({
            select: () => ({ lean: () => Promise.resolve([{ _id: 'challenge_1' }]) })
        });
        jest.spyOn(SeatChallenge, 'findOneAndUpdate').mockResolvedValueOnce(challenge);
        const io = fakeIo();

        await socketService.sweepOverdueSeatChallenges(io);

        expect(io._emit).toHaveBeenCalledTimes(1);
        expect(io._emit).toHaveBeenCalledWith('seat-challenge-ended', expect.objectContaining({ challengeId: 'challenge_1' }));
        // 🛡️ طلب صريح بمراجعة PR: finalizeActiveSeatChallenge يُلغي مؤقّت بثّ seat-duel:score المؤجَّل فوراً
        expect(giftController.clearSeatDuelScoreThrottle).toHaveBeenCalledWith('challenge_1');
    });

    test('إنهاء مزدوج متزامن لنفس التحدي — بثّ واحد فقط', async () => {
        const challenge = fakeChallengeDoc();
        jest.spyOn(SeatChallenge, 'findOneAndUpdate')
            .mockResolvedValueOnce(challenge)
            .mockResolvedValue(null);
        const io = fakeIo();

        await Promise.all([
            socketService.finalizeActiveSeatChallenge(io, 'challenge_1'),
            socketService.finalizeActiveSeatChallenge(io, 'challenge_1')
        ]);

        expect(io._emit).toHaveBeenCalledTimes(1);
    });
});

describe('retryFailedLeagueSettlements — إعادة محاولة تسوية الدوري الدورية (مراجعة PR)', () => {
    test('معركة ended بـlpSettled:false ضمن النافذة الزمنية — تُعاد محاولتها وتبثّ pk:league-update لكلا الغرفتين', async () => {
        jest.spyOn(RoomBattle, 'find').mockReturnValue({
            select: () => ({ lean: () => Promise.resolve([{ _id: 'battle_retry' }]) })
        });
        const claimedBattle = {
            _id: 'battle_retry', roomA: 'room_a', roomB: 'room_b', winner: 'A', settleAttempts: 1
        };
        jest.spyOn(RoomBattle, 'findOneAndUpdate').mockResolvedValue(claimedBattle);
        jest.spyOn(RoomBattle, 'updateOne').mockResolvedValue({ matchedCount: 1 });
        jest.spyOn(pkLeagueEngine, 'settleBattle').mockResolvedValue({
            eligible: true,
            season: { weekKey: '2026-W01', endsAt: new Date(Date.now() + 1000) },
            A: { rankBefore: 5, rankAfter: 3, lpBefore: 1000, lpAfter: 1305, record: { wins: 1, losses: 0, draws: 0 }, neighbours: [], hint: null, headToHead: {} },
            B: { rankBefore: 2, rankAfter: 2, lpBefore: 800, lpAfter: 853, record: { wins: 0, losses: 1, draws: 0 }, neighbours: [], hint: null, headToHead: {} }
        });
        const io = fakeIo();

        await socketService.retryFailedLeagueSettlements(io);

        // ✅ الادّعاء الذرّي (settleAttempts++) حدث قبل أي شيء آخر
        expect(RoomBattle.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'battle_retry', status: 'ended', lpSettled: false, settleAttempts: { $lt: 5 } },
            { $inc: { settleAttempts: 1 } },
            { new: true }
        );
        expect(pkLeagueEngine.settleBattle).toHaveBeenCalledWith(claimedBattle, 'A');
        // ✅ اللقطة المخزَّنة (GET .../result) تُحدَّث أيضاً بقسم الدوري، لا تبقى league:null للأبد
        expect(RoomBattle.updateOne).toHaveBeenCalledWith(
            { _id: 'battle_retry' },
            { $set: { 'resultA.league': expect.objectContaining({ lpAfter: 1305 }), 'resultB.league': expect.objectContaining({ lpAfter: 853 }) } }
        );
        expect(io._emit).toHaveBeenCalledTimes(2);
        expect(io._emit).toHaveBeenCalledWith('pk:league-update', expect.objectContaining({ battleId: 'battle_retry', league: expect.objectContaining({ lpAfter: 1305 }) }));
        expect(io._emit).toHaveBeenCalledWith('pk:league-update', expect.objectContaining({ battleId: 'battle_retry', league: expect.objectContaining({ lpAfter: 853 }) }));
    });

    test('settleBattle يُرجع null (سُوِّيت من قبل فعلياً) — لا بثّ ولا تحديث للقطة المخزَّنة', async () => {
        jest.spyOn(RoomBattle, 'find').mockReturnValue({
            select: () => ({ lean: () => Promise.resolve([{ _id: 'battle_already' }]) })
        });
        jest.spyOn(RoomBattle, 'findOneAndUpdate').mockResolvedValue({ _id: 'battle_already', roomA: 'room_a', roomB: 'room_b', winner: 'A', settleAttempts: 1 });
        const updateOneSpy = jest.spyOn(RoomBattle, 'updateOne').mockResolvedValue({ matchedCount: 1 });
        jest.spyOn(pkLeagueEngine, 'settleBattle').mockResolvedValue(null);
        const io = fakeIo();

        await socketService.retryFailedLeagueSettlements(io);

        expect(io._emit).not.toHaveBeenCalled();
        expect(updateOneSpy).not.toHaveBeenCalled();
    });

    test('استثناء من settleBattle أثناء إعادة المحاولة لا يرمي للمستدعي (يُسجَّل ويُكمِل بصمت)', async () => {
        jest.spyOn(RoomBattle, 'find').mockReturnValue({
            select: () => ({ lean: () => Promise.resolve([{ _id: 'battle_fail_again' }]) })
        });
        jest.spyOn(RoomBattle, 'findOneAndUpdate').mockResolvedValue({ _id: 'battle_fail_again', roomA: 'room_a', roomB: 'room_b', winner: 'A', settleAttempts: 2 });
        jest.spyOn(pkLeagueEngine, 'settleBattle').mockRejectedValue(new Error('انقطاع شبكة محاكى'));
        const io = fakeIo();

        await expect(socketService.retryFailedLeagueSettlements(io)).resolves.toBeUndefined();
        expect(io._emit).not.toHaveBeenCalled();
    });
});
