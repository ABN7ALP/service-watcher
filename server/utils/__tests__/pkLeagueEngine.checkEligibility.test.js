// ملف: pkLeagueEngine.checkEligibility.test.js
// ✅ بوّابة مكافحة التلاعب (طلب صريح: "مهم جداً") — تُحاكي (mock) قراءتَي VoiceRoom.findById
// وRoomBattle.countDocuments بدل قاعدة بيانات حقيقية، فتختبر فروع القرار الصِرفة دون أي اتصال

const VoiceRoom = require('../../models/VoiceRoom');
const RoomBattle = require('../../models/RoomBattle');
const { checkEligibility } = require('../pkLeagueEngine');

const settings = {
    pkMinDurationSeconds: 60,
    pkMinSupportCoins: 50,
    pkMaxDailyMatchesPerPair: 3
};

function mockRooms(roomsById) {
    jest.spyOn(VoiceRoom, 'findById').mockImplementation((id) => ({
        select: () => Promise.resolve(roomsById[id] || null)
    }));
}

function baseBattle(overrides = {}) {
    return {
        _id: 'battle_1',
        roomA: 'room_a',
        roomB: 'room_b',
        startedAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: new Date('2026-01-01T00:03:00Z'), // 180s
        realSupportA: 60,
        realSupportB: 40,
        ...overrides
    };
}

describe('pkLeagueEngine.checkEligibility', () => {
    afterEach(() => jest.restoreAllMocks());

    test('معركة أقصر من الحد الأدنى للمدة — غير مؤهَّلة', async () => {
        const battle = baseBattle({ endsAt: new Date('2026-01-01T00:00:30Z') }); // 30s فقط
        const result = await checkEligibility(battle, settings);
        expect(result.eligible).toBe(false);
        expect(result.reason).toMatch(/^duration_too_short:/);
    });

    test('دعم حقيقي إجمالي أقل من الحد الأدنى — غير مؤهَّلة', async () => {
        const battle = baseBattle({ realSupportA: 10, realSupportB: 5 }); // 15 < 50
        const result = await checkEligibility(battle, settings);
        expect(result.eligible).toBe(false);
        expect(result.reason).toMatch(/^support_too_low:/);
    });

    test('تواطؤ: نفس مضيف الغرفتين — غير مؤهَّلة', async () => {
        mockRooms({
            room_a: { host: 'user_x', moderators: [] },
            room_b: { host: 'user_x', moderators: [] }
        });
        jest.spyOn(RoomBattle, 'countDocuments').mockResolvedValue(0);
        const result = await checkEligibility(baseBattle(), settings);
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('staff_collusion');
    });

    test('تواطؤ: مضيف الغرفة A مشرف بالغرفة B — غير مؤهَّلة', async () => {
        mockRooms({
            room_a: { host: 'user_x', moderators: [] },
            room_b: { host: 'user_y', moderators: ['user_x'] }
        });
        jest.spyOn(RoomBattle, 'countDocuments').mockResolvedValue(0);
        const result = await checkEligibility(baseBattle(), settings);
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('staff_collusion');
    });

    test('بلوغ الحد اليومي الأقصى لنفس زوج الغرفتين — غير مؤهَّلة', async () => {
        mockRooms({
            room_a: { host: 'user_x', moderators: [] },
            room_b: { host: 'user_y', moderators: [] }
        });
        jest.spyOn(RoomBattle, 'countDocuments').mockResolvedValue(3); // = pkMaxDailyMatchesPerPair
        const result = await checkEligibility(baseBattle(), settings);
        expect(result.eligible).toBe(false);
        expect(result.reason).toMatch(/^daily_pair_cap_reached:/);
    });

    test('دون الحد اليومي الأقصى (2 < 3) ولا تواطؤ ولا قصر — مؤهَّلة', async () => {
        mockRooms({
            room_a: { host: 'user_x', moderators: [] },
            room_b: { host: 'user_y', moderators: [] }
        });
        jest.spyOn(RoomBattle, 'countDocuments').mockResolvedValue(2);
        const result = await checkEligibility(baseBattle(), settings);
        expect(result).toEqual({ eligible: true, reason: null });
    });

    test('غرفة محذوفة (findById يُعيد null) — غير مؤهَّلة', async () => {
        mockRooms({ room_a: { host: 'user_x', moderators: [] } }); // room_b غير موجودة
        const result = await checkEligibility(baseBattle(), settings);
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('room_missing');
    });

    test('يستخدم durationSeconds المُعلَن لو لم يُحدَّد startedAt/endsAt فعلياً', async () => {
        mockRooms({
            room_a: { host: 'user_x', moderators: [] },
            room_b: { host: 'user_y', moderators: [] }
        });
        jest.spyOn(RoomBattle, 'countDocuments').mockResolvedValue(0);
        const battle = baseBattle({ startedAt: null, endsAt: null, durationSeconds: 30 });
        const result = await checkEligibility(battle, settings);
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('duration_too_short:30s');
    });
});
