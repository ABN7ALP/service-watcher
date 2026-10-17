// ملف: socketService.hostDisconnectSweep.test.js
// 🛡️ طلب صريح بمراجعة PR (البند 4-5): إنهاء البث عند انقطاع المضيف لا يعتمد على مؤقّت
// ذاكرة (setTimeout) بعد الآن — hostDisconnectedAt يُسجَّل بالمستند نفسه عند آخر سوكيت
// فعّال ينقطع، ويُصفَّر عند أي اتصال جديد، ومهمة دورية (sweepDisconnectedHostBroadcasts)
// هي ما يُنهي البث فعلياً بعد 120 ثانية — فيصمد أمام إعادة تشغيل الخادم (لا مؤقّت يُفقَد).
//
// نفس أسلوب محاكاة Mongoose المستخدَم بـsocketService.finalizeReliability.test.js (بلا
// قاعدة بيانات حقيقية). setInterval يُموَّه قبل الاستيراد لنفس السبب (المكنسة الدورية
// الحقيقية + مكانس PK/seat-challenge تُسجِّل مؤقّتات عند تحميل الملف).
jest.mock('../../controllers/giftController', () => ({
    applyGiftToActiveBattle: jest.fn(),
    applyGiftToRoomSupport: jest.fn(),
    applyGiftToActiveSeatChallenge: jest.fn(),
    schedulePkScoreEmit: jest.fn(),
    clearPkScoreThrottle: jest.fn(),
    clearSeatDuelScoreThrottle: jest.fn()
}));

let socketService;
let VoiceRoom;

beforeAll(() => {
    jest.spyOn(global, 'setInterval').mockImplementation(() => ({ unref: () => {} }));
    socketService = require('../socketService');
    VoiceRoom = require('../../models/VoiceRoom');
});

afterEach(() => {
    jest.restoreAllMocks();
});

function fakeIo() {
    const roomEmit = jest.fn();
    const globalEmit = jest.fn();
    return { to: jest.fn(() => ({ emit: roomEmit })), emit: globalEmit, _roomEmit: roomEmit, _globalEmit: globalEmit, sockets: { sockets: new Map() } };
}

describe('markHostDisconnected — تسجيل وقت الانقطاع بالمستند', () => {
    test('لا سوكيت آخر فعّال لنفس المضيف → يسجّل hostDisconnectedAt على غرفته المباشرة فقط', async () => {
        const updateOneSpy = jest.spyOn(VoiceRoom, 'updateOne').mockResolvedValue({ matchedCount: 1 });
        const io = fakeIo(); // بلا سوكيتات أخرى بـio.sockets.sockets
        const hostUser = { _id: 'host_1', username: 'host1' };

        await socketService.markHostDisconnected(io, hostUser, 'socket_disconnecting');

        expect(updateOneSpy).toHaveBeenCalledWith(
            { host: 'host_1', isOfficial: false, isLive: true },
            { $set: { hostDisconnectedAt: expect.any(Date) } }
        );
    });

    test('يوجد سوكيت آخر فعّال لنفس المضيف (تبويب/جهاز ثانٍ) → لا يسجّل شيئاً', async () => {
        const updateOneSpy = jest.spyOn(VoiceRoom, 'updateOne').mockResolvedValue({ matchedCount: 1 });
        const io = fakeIo();
        io.sockets.sockets.set('socket_other', { user: { id: 'host_1' } });
        const hostUser = { _id: 'host_1', username: 'host1' };

        await socketService.markHostDisconnected(io, hostUser, 'socket_disconnecting');

        expect(updateOneSpy).not.toHaveBeenCalled();
    });

    test('استثناء بـVoiceRoom.updateOne لا يرمي للمستدعي (يُسجَّل ويُكمِل بصمت)', async () => {
        jest.spyOn(VoiceRoom, 'updateOne').mockRejectedValue(new Error('اتصال قاعدة بيانات محاكى فشل'));
        const io = fakeIo();

        await expect(
            socketService.markHostDisconnected(io, { _id: 'host_1' }, 'socket_1')
        ).resolves.toBeUndefined();
    });
});

describe('clearHostDisconnected — تصفير الانقطاع عند أي اتصال جديد', () => {
    test('يستدعي updateOne بالشرط الصحيح (لا يفحص النتيجة لمستخدمين عاديين غير مضيفين)', async () => {
        const updateOneSpy = jest.spyOn(VoiceRoom, 'updateOne').mockResolvedValue({ matchedCount: 0 });

        await socketService.clearHostDisconnected('user_42');

        expect(updateOneSpy).toHaveBeenCalledWith(
            { host: 'user_42', isOfficial: false, hostDisconnectedAt: { $ne: null } },
            { $set: { hostDisconnectedAt: null } }
        );
    });
});

describe('sweepDisconnectedHostBroadcasts — المكنسة الدورية الحقيقية (بلا مؤقّت ذاكرة)', () => {
    test('غرفة متأخرة (مضيف منقطع منذ >120ث) تُنهى فعلياً ويصل البثّ للغرفة + قائمة التصفح', async () => {
        const hostUser = { _id: 'host_1', username: 'host1', profileImage: null };
        jest.spyOn(VoiceRoom, 'find').mockReturnValue({
            select: () => ({
                populate: () => ({
                    lean: () => Promise.resolve([{ _id: 'room_1', host: hostUser }])
                })
            })
        });
        jest.spyOn(VoiceRoom, 'findOne').mockResolvedValue({ _id: 'room_1', host: hostUser });
        jest.spyOn(VoiceRoom, 'endBroadcast').mockResolvedValue({
            room: { followers: [{ toString: () => 'follower_1' }] },
            occupantIds: [],
            durationSeconds: 300
        });
        const io = fakeIo();

        await socketService.sweepDisconnectedHostBroadcasts(io);

        expect(VoiceRoom.endBroadcast).toHaveBeenCalledWith('room_1');
        expect(io.to).toHaveBeenCalledWith('room-chat-room_1');
        expect(io._roomEmit).toHaveBeenCalledWith('room-broadcast-ended', expect.objectContaining({
            roomId: 'room_1',
            durationSeconds: 300,
            followerIds: ['follower_1']
        }));
        expect(io._globalEmit).toHaveBeenCalledWith('room-went-offline', { roomId: 'room_1' });
    });

    test('مضيف محذوف (host:null بعد populate) — يُتجاهَل بلا محاولة إنهاء', async () => {
        jest.spyOn(VoiceRoom, 'find').mockReturnValue({
            select: () => ({
                populate: () => ({
                    lean: () => Promise.resolve([{ _id: 'room_orphan', host: null }])
                })
            })
        });
        const findOneSpy = jest.spyOn(VoiceRoom, 'findOne');
        const io = fakeIo();

        await socketService.sweepDisconnectedHostBroadcasts(io);

        expect(findOneSpy).not.toHaveBeenCalled();
        expect(io._roomEmit).not.toHaveBeenCalled();
    });

    test('لا غرف متأخرة — لا شيء يُبَثّ', async () => {
        jest.spyOn(VoiceRoom, 'find').mockReturnValue({
            select: () => ({ populate: () => ({ lean: () => Promise.resolve([]) }) })
        });
        const io = fakeIo();

        await socketService.sweepDisconnectedHostBroadcasts(io);

        expect(io._roomEmit).not.toHaveBeenCalled();
        expect(io._globalEmit).not.toHaveBeenCalled();
    });

    test('استثناء أثناء المسح لا يرمي للمستدعي', async () => {
        jest.spyOn(VoiceRoom, 'find').mockImplementation(() => { throw new Error('فشل استعلام محاكى'); });
        const io = fakeIo();

        await expect(socketService.sweepDisconnectedHostBroadcasts(io)).resolves.toBeUndefined();
    });
});
