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

let socketService;
let RoomBattle, SeatChallenge, VoiceRoom, pkLeagueEngine;

beforeAll(() => {
    jest.spyOn(global, 'setInterval').mockImplementation(() => ({ unref: () => {} }));
    socketService = require('../socketService');
    RoomBattle = require('../../models/RoomBattle');
    SeatChallenge = require('../../models/SeatChallenge');
    VoiceRoom = require('../../models/VoiceRoom');
    pkLeagueEngine = require('../../utils/pkLeagueEngine');
});

// ✅ لا afterAll منفصل لاستعادة setInterval — jest.restoreAllMocks() بـafterEach أدناه
// يستعيده تلقائياً فور نهاية أول اختبار (هو جاسوس (spy) كبقية الجواسيس بهذا الملف)
afterEach(() => jest.restoreAllMocks());

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
            endsAt: new Date(Date.now() - 15000),
            save: jest.fn().mockResolvedValue(undefined),
            populate: jest.fn().mockResolvedValue(undefined),
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
