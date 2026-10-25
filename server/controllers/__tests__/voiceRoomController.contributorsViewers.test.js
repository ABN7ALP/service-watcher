// ملف: voiceRoomController.contributorsViewers.test.js
// 🛡️ يختبر exports.getRoomContributors وexports.getRoomViewers مباشرة (req/res مُحاكاة — نفس
// استراتيجية giftController.shopEtag المجاورة لا مسار Express/HTTP حقيقي ولا mongodb-memory-server).
// التركيز: (1) استبعاد الحسابات المخفية/المحظورة فعلياً من كلا المسارين — لا تمويهاً سطحياً فقط؛
// (2) ترتيبي أنا مثبّت أسفل قائمة المساهمين حتى خارج أعلى 50؛ (3) حماية الغرفة الخاصة بكلمة
// المرور؛ (4) ترتيب "على المقعد ثم المستمعون" وتصفّح 30 بكل صفحة بمسار الحاضرين.
// 🛡️ voiceRoomController يستورد socketService (setInterval حقيقية غير مشروطة عند تحميل الملف،
// راجع سطوره 73/166/787) — نفس نمط giftController.shopEtag.test.js المجاور بالضبط: مؤقتات
// Jest المزيَّفة يجب أن تكون فعّالة قبل require الأول لـvoiceRoomController، وإلا تبقى عملية
// Jest معلّقة بعد انتهاء كل الاختبارات (مقابض مفتوحة لا تُغلَق أبداً)
jest.useFakeTimers();

const mongoose = require('mongoose');
const VoiceRoom = require('../../models/VoiceRoom');
const User = require('../../models/User');
const GiftLog = require('../../models/GiftLog');
const FanClubMembership = require('../../models/FanClubMembership');
const voiceRoomController = require('../voiceRoomController');

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.lean = () => p;
    p.sort = () => p;
    return p;
}

function mockRes() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

// ✅ محاكاة واقعية لشكل io.sockets (لا mock لدالة getRoomViewers الحقيقية بـsocketService —
// هي مجرد قراءة بنية بيانات محلية بالذاكرة، فتشغيلها فعلياً هنا أدق من تمويهها)
function fakeIo(viewersByChannel) {
    const roomsMap = new Map();
    const socketsMap = new Map();
    let sid = 0;
    for (const [channel, users] of Object.entries(viewersByChannel)) {
        const idSet = new Set();
        for (const u of users) {
            const socketId = `s${sid++}`;
            idSet.add(socketId);
            socketsMap.set(socketId, { user: { id: u.id, username: u.username, profileImage: u.profileImage, activeFrameClass: u.activeFrameClass } });
        }
        roomsMap.set(channel, idSet);
    }
    return { sockets: { adapter: { rooms: roomsMap }, sockets: socketsMap } };
}

const ROOM_ID = new mongoose.Types.ObjectId().toString();
const HOST_ID = new mongoose.Types.ObjectId().toString();

describe('getRoomContributors', () => {
    afterEach(() => jest.restoreAllMocks());

    test('يرفض معرّف غرفة غير صالح (مثل main) بـ400 بدل تجميع بلا معنى', async () => {
        const res = mockRes();
        await voiceRoomController.getRoomContributors({ params: { id: 'main' }, query: {}, user: { id: HOST_ID } }, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('غرفة خاصة بلا كلمة مرور صحيحة: 403، بلا أي استعلام GiftLog', async () => {
        jest.spyOn(VoiceRoom, 'findById').mockImplementation(() => chainable({
            _id: ROOM_ID, host: HOST_ID, seats: [], moderators: [], isPrivate: true, password: 'secret123'
        }));
        const aggSpy = jest.spyOn(GiftLog, 'aggregate').mockResolvedValue([]);
        const res = mockRes();
        await voiceRoomController.getRoomContributors({ params: { id: ROOM_ID }, query: {}, user: { id: 'intruder' } }, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(aggSpy).not.toHaveBeenCalled();
    });

    test('يستبعد الحسابات المخفية/المحظورة صريحاً ضمن استعلام التجميع نفسه (لا فقط بالعميل)', async () => {
        // 🛡️ معرّف غرفة مستقل خاص بهذا الاختبار — contributorsCache (30 ثانية، على مستوى
        // الموديول) تتشارك بين كل الاختبارات؛ نفس (roomId+period) بين اختبارين متتاليين يجعل
        // الثاني يقرأ نتيجة الأول المخزَّنة مؤقتاً بدل استدعاء GiftLog.aggregate من جديد فعلياً
        const roomId = new mongoose.Types.ObjectId().toString();
        jest.spyOn(VoiceRoom, 'findById').mockImplementation(() => chainable({
            _id: roomId, host: HOST_ID, seats: [], moderators: [], isPrivate: false, password: null
        }));
        jest.spyOn(FanClubMembership, 'find').mockImplementation(() => chainable([]));
        let capturedPipeline = null;
        jest.spyOn(GiftLog, 'aggregate').mockImplementation((pipeline) => {
            capturedPipeline = pipeline;
            return Promise.resolve([]);
        });

        const res = mockRes();
        await voiceRoomController.getRoomContributors({ params: { id: roomId }, query: {}, user: { id: HOST_ID } }, res);

        const hideStage = capturedPipeline.find(stage => stage.$match && stage.$match['user.isHidden'] !== undefined);
        expect(hideStage).toBeTruthy();
        expect(hideStage.$match['user.isHidden']).toEqual({ $ne: true });
        expect(hideStage.$match['user.isBanned']).toEqual({ $ne: true });
    });

    test('ترتيبي أنا يبقى مثبّتاً حتى خارج أعلى 50 (رتبتي الحقيقية + مجموعي الحقيقي)', async () => {
        const roomId = new mongoose.Types.ObjectId().toString();
        jest.spyOn(VoiceRoom, 'findById').mockImplementation(() => chainable({
            _id: roomId, host: HOST_ID, seats: [], moderators: [], isPrivate: false, password: null
        }));
        jest.spyOn(FanClubMembership, 'find').mockImplementation(() => chainable([]));
        const myId = new mongoose.Types.ObjectId().toString();
        // ✅ 55 مساهماً أكبر منّي ترتيباً + أنا بالمرتبة 56 — أتحقق أن القائمة المُعادة تحوي 50
        // فقط بأعلى المساهمين، وأن data.me يحمل رتبتي الحقيقية (56) لا شيء افتراضي
        const entries = [];
        for (let i = 0; i < 55; i++) {
            entries.push({ userId: new mongoose.Types.ObjectId(), username: `u${i}`, profileImage: null, level: 1, activeFrameClass: '', total: 10000 - i });
        }
        entries.push({ userId: myId, username: 'me', profileImage: null, level: 3, activeFrameClass: '', total: 50 });
        jest.spyOn(GiftLog, 'aggregate').mockResolvedValue(entries);

        const res = mockRes();
        await voiceRoomController.getRoomContributors({ params: { id: roomId }, query: {}, user: { id: myId, username: 'me' } }, res);

        const body = res.json.mock.calls[0][0];
        expect(body.data.list).toHaveLength(50);
        expect(body.data.me.rank).toBe(56);
        expect(body.data.me.total).toBe(50);
    });
});

describe('getRoomViewers', () => {
    afterEach(() => jest.restoreAllMocks());

    test('يرفض معرّف غرفة غير صالح وليس main بـ400', async () => {
        const res = mockRes();
        await voiceRoomController.getRoomViewers({ params: { id: 'not-an-id' }, query: {}, user: { id: HOST_ID }, app: { get: () => fakeIo({}) } }, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('يستبعد الحسابات المخفية/المحظورة من قائمة الحاضرين الحيّة فعلياً', async () => {
        const hiddenId = new mongoose.Types.ObjectId().toString();
        const bannedId = new mongoose.Types.ObjectId().toString();
        const visibleId = new mongoose.Types.ObjectId().toString();
        const channel = `room-chat-${ROOM_ID}`;
        const io = fakeIo({
            [channel]: [
                { id: hiddenId, username: 'hidden-user', profileImage: null, activeFrameClass: '' },
                { id: bannedId, username: 'banned-user', profileImage: null, activeFrameClass: '' },
                { id: visibleId, username: 'visible-user', profileImage: null, activeFrameClass: '' }
            ]
        });
        jest.spyOn(VoiceRoom, 'findById').mockImplementation(() => chainable({
            _id: ROOM_ID, host: HOST_ID, seats: [], moderators: [], isPrivate: false, password: null
        }));
        jest.spyOn(User, 'find').mockImplementation(() => chainable([
            { _id: hiddenId, level: 1, isHidden: true, isBanned: false },
            { _id: bannedId, level: 1, isHidden: false, isBanned: true },
            { _id: visibleId, level: 2, isHidden: false, isBanned: false }
        ]));
        jest.spyOn(FanClubMembership, 'find').mockImplementation(() => chainable([]));

        const res = mockRes();
        await voiceRoomController.getRoomViewers({ params: { id: ROOM_ID }, query: {}, user: { id: HOST_ID }, app: { get: () => io } }, res);

        const body = res.json.mock.calls[0][0];
        const ids = body.data.viewers.map(v => v.userId);
        expect(ids).toEqual([visibleId]);
        expect(body.data.total).toBe(1);
    });

    test('على المقعد (والمضيف) أولاً، ثم المستمعون — وتصفّح 30 بكل صفحة', async () => {
        const channel = `room-chat-${ROOM_ID}`;
        const listeners = Array.from({ length: 35 }, () => ({
            id: new mongoose.Types.ObjectId().toString(), username: 'listener', profileImage: null, activeFrameClass: ''
        }));
        const seatedUser = { id: new mongoose.Types.ObjectId().toString(), username: 'seated', profileImage: null, activeFrameClass: '' };
        const io = fakeIo({ [channel]: [...listeners, seatedUser] });

        jest.spyOn(VoiceRoom, 'findById').mockImplementation(() => chainable({
            _id: ROOM_ID, host: HOST_ID, seats: [{ seatNumber: 1, user: seatedUser.id }], moderators: [], isPrivate: false, password: null
        }));
        jest.spyOn(User, 'find').mockImplementation(() => chainable(
            [...listeners, seatedUser].map(u => ({ _id: u.id, level: 1, isHidden: false, isBanned: false }))
        ));
        jest.spyOn(FanClubMembership, 'find').mockImplementation(() => chainable([]));

        const res = mockRes();
        await voiceRoomController.getRoomViewers({ params: { id: ROOM_ID }, query: {}, user: { id: HOST_ID }, app: { get: () => io } }, res);

        const body = res.json.mock.calls[0][0];
        expect(body.data.viewers).toHaveLength(30);
        expect(body.data.viewers[0].userId).toBe(seatedUser.id);
        expect(body.data.viewers[0].status).toBe('seat');
        expect(body.data.seatedCount).toBe(1);
        expect(body.data.total).toBe(36);
        expect(body.data.nextCursor).toBe(30);

        const res2 = mockRes();
        await voiceRoomController.getRoomViewers({ params: { id: ROOM_ID }, query: { cursor: '30' }, user: { id: HOST_ID }, app: { get: () => io } }, res2);
        const body2 = res2.json.mock.calls[0][0];
        expect(body2.data.viewers).toHaveLength(6);
        expect(body2.data.nextCursor).toBeNull();
    });
});
