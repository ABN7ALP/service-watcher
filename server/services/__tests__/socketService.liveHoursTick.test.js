// ملف: socketService.liveHoursTick.test.js
// 🛡️ feat/live-hours-host-center: تِك دوري كل 60 ثانية يفحص عدد المستمعين الحقيقيين بكل غرفة
// مباشرة (مستبعِداً المضيف نفسه، الحسابات المرتبطة به، والأجهزة المكرَّرة بين المستمعين) ويضيف
// دقيقة كاملة لساعات المسبح الأسبوعي فقط لو تحقّق الحد الأدنى *و* كان المضيف نفسه متصلاً فعلياً
// (مراجعة #154 بند 2). نفس أسلوب محاكاة Mongoose المستخدَم بـsocketService.hostDisconnectSweep.test.js
// المجاور (بلا قاعدة بيانات حقيقية).
jest.mock('../../controllers/giftController', () => ({
    applyGiftToActiveBattle: jest.fn(),
    applyGiftToRoomSupport: jest.fn(),
    applyGiftToActiveSeatChallenge: jest.fn(),
    schedulePkScoreEmit: jest.fn(),
    clearPkScoreThrottle: jest.fn(),
    clearSeatDuelScoreThrottle: jest.fn(),
    buildGiftWalletEntries: jest.fn()
}));
jest.mock('../../utils/linkageService', () => ({
    areLinked: jest.fn().mockResolvedValue(false),
    groupLinkedAccounts: jest.fn()
}));

let socketService;
let VoiceRoom, LiveSession, HostWeeklyStat, SystemSettings, linkageService;

beforeAll(() => {
    jest.spyOn(global, 'setInterval').mockImplementation(() => ({ unref: () => {} }));
    socketService = require('../socketService');
    VoiceRoom = require('../../models/VoiceRoom');
    LiveSession = require('../../models/LiveSession');
    HostWeeklyStat = require('../../models/HostWeeklyStat');
    SystemSettings = require('../../models/SystemSettings');
    linkageService = require('../../utils/linkageService');
});

afterEach(() => jest.restoreAllMocks());

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.lean = () => p;
    return p;
}

// ✅ محاكاة getRoomViewers الحقيقية: io.sockets.adapter.rooms.get(`room-chat-<roomId>`) يُعيد
// مجموعة socketId، وio.sockets.sockets.get(socketId).user هو بيانات المستخدم — نفس الشكل
// الفعلي بـsocketService.js تماماً، فلا حاجة لمحاكاة getRoomViewers نفسها كدالة منفصلة.
// hostIncluded=false يحاكي مضيفاً غير متصل فعلياً بقناة الغرفة (رغم isLive:true بالمستند)
function fakeIoWithViewers(roomId, userIds) {
    const channel = `room-chat-${roomId}`;
    const socketsMap = new Map();
    const roomSet = new Set();
    userIds.forEach((id, i) => {
        const socketId = `sock_${i}`;
        socketsMap.set(socketId, { user: { id, username: `u_${id}`, profileImage: '', activeFrameClass: '' } });
        roomSet.add(socketId);
    });
    return { sockets: { adapter: { rooms: new Map([[channel, roomSet]]) }, sockets: socketsMap } };
}

// ✅ محاكاة groupLinkedAccounts: كل userId بمجموعته الخاصة افتراضياً (لا ترابط)، إلا ما حُدِّد
// صريحاً بـgroups (مصفوفة من مصفوفات أرقام الهوية المرتبطة ببعضها)
function mockGroups(groups) {
    linkageService.groupLinkedAccounts.mockImplementation(async (ids) => {
        const map = new Map();
        ids.forEach(id => map.set(id, id)); // افتراضي: كل واحد بمجموعته
        groups.forEach(group => { const rep = group[0]; group.forEach(id => map.set(id, rep)); });
        return map;
    });
}

describe('countQualifyingListeners — hostPresent + استبعاد الحسابات المرتبطة/الأجهزة المكرَّرة', () => {
    test('لا مستمعين إطلاقاً (المضيف وحده بالغرفة) → listenerCount:0، hostPresent:true، بلا أي نداء لـgroupLinkedAccounts', async () => {
        const io = fakeIoWithViewers('room_1', ['host_1']);
        mockGroups([]);
        const result = await socketService.countQualifyingListeners(io, 'room_1', 'host_1');
        expect(result).toEqual({ hostPresent: true, listenerCount: 0 });
        expect(linkageService.groupLinkedAccounts).not.toHaveBeenCalled();
    });

    test('المضيف غير متصل بقناة الغرفة فعلياً (hostPresent:false) حتى مع مستمعين حاضرين', async () => {
        const io = fakeIoWithViewers('room_1', ['v1', 'v2']); // host_1 غائب تماماً عن القناة
        mockGroups([]);
        const result = await socketService.countQualifyingListeners(io, 'room_1', 'host_1');
        expect(result.hostPresent).toBe(false);
        expect(result.listenerCount).toBe(2); // العدد يُحسَب بصرف النظر — القرار النهائي بيد runLiveHoursTick
    });

    test('3 مستمعين مستقلّين تماماً (لا ترابط) → listenerCount:3', async () => {
        const io = fakeIoWithViewers('room_1', ['host_1', 'v1', 'v2', 'v3']);
        mockGroups([]);
        const result = await socketService.countQualifyingListeners(io, 'room_1', 'host_1');
        expect(result).toEqual({ hostPresent: true, listenerCount: 3 });
    });

    test('مستمع مرتبط بالمضيف (جهاز/محفظة مشتركة) → يُستبعَد تماماً، لا يُحسَب حتى كمجموعة مستقلة', async () => {
        const io = fakeIoWithViewers('room_1', ['host_1', 'linkedToHost', 'v2', 'v3']);
        mockGroups([['host_1', 'linkedToHost']]); // linkedToHost بنفس مجموعة المضيف
        const result = await socketService.countQualifyingListeners(io, 'room_1', 'host_1');
        expect(result.listenerCount).toBe(2); // v2 + v3 فقط
    });

    test('مستمعان مرتبطان ببعضهما (نفس الجهاز، شخص واحد بتبويبين) لا بالمضيف → يُحسَبان مستمعاً واحداً فقط', async () => {
        const io = fakeIoWithViewers('room_1', ['host_1', 'dupA', 'dupB', 'v3']);
        mockGroups([['dupA', 'dupB']]); // dupA/dupB مجموعة واحدة، مستقلة عن المضيف
        const result = await socketService.countQualifyingListeners(io, 'room_1', 'host_1');
        expect(result.listenerCount).toBe(2); // {dupA,dupB}=مجموعة واحدة + v3 = 2
    });

    test('مزيج: مرتبط بالمضيف + ثنائي مرتبط ببعضه + مستقلّان', async () => {
        const io = fakeIoWithViewers('room_1', ['host_1', 'linkedToHost', 'dupA', 'dupB', 'v5', 'v6']);
        mockGroups([['host_1', 'linkedToHost'], ['dupA', 'dupB']]);
        const result = await socketService.countQualifyingListeners(io, 'room_1', 'host_1');
        expect(result.listenerCount).toBe(3); // {dupA,dupB} + v5 + v6 = 3 (linkedToHost مستبعد كاملاً)
    });
});

describe('runLiveHoursTick — يُضيف دقيقة فقط عند: حضور المضيف فعلياً + لا نافذة انقطاع + الحد الأدنى + ادّعاء تِك ناجح', () => {
    function wireRoom(roomId, hostId, sessionId, { hostDisconnectedAt = null, applyTickResult = { _id: 'applied' } } = {}) {
        jest.spyOn(VoiceRoom, 'find').mockImplementation(() => chainable([{ _id: roomId, host: hostId, hostDisconnectedAt }]));
        jest.spyOn(LiveSession, 'findOne').mockImplementation(() => chainable({ _id: sessionId }));
        jest.spyOn(LiveSession, 'applyTick').mockResolvedValue(applyTickResult);
        jest.spyOn(HostWeeklyStat, 'addQualifiedSeconds').mockResolvedValue(null);
    }

    test('مضيف حاضر + مستمعان (= الحد الأدنى الافتراضي 2) + ادّعاء التِك ينجح → qualifies:true + إضافة 60 ثانية', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        wireRoom('room_1', 'host_1', 'ls_1');
        mockGroups([]);
        const io = fakeIoWithViewers('room_1', ['host_1', 'v1', 'v2']);

        await socketService.runLiveHoursTick(io);

        expect(LiveSession.applyTick).toHaveBeenCalledWith('ls_1', expect.objectContaining({ qualifies: true, listenerCount: 2 }));
        expect(HostWeeklyStat.addQualifiedSeconds).toHaveBeenCalledWith('host_1', expect.any(Date), 60);
    });

    test('المضيف غائب عن قناة الغرفة فعلياً (رغم isLive:true بالمستند) → qualifies:false حتى مع مستمعين كافيين', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        wireRoom('room_1', 'host_1', 'ls_1');
        mockGroups([]);
        const io = fakeIoWithViewers('room_1', ['v1', 'v2']); // host_1 غائب عن القناة

        await socketService.runLiveHoursTick(io);

        expect(LiveSession.applyTick).toHaveBeenCalledWith('ls_1', expect.objectContaining({ qualifies: false }));
        expect(HostWeeklyStat.addQualifiedSeconds).not.toHaveBeenCalled();
    });

    test('المضيف حاضر لكن بنافذة سماح انقطاعه (hostDisconnectedAt محدَّد) → qualifies:false', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        wireRoom('room_1', 'host_1', 'ls_1', { hostDisconnectedAt: new Date() });
        mockGroups([]);
        const io = fakeIoWithViewers('room_1', ['host_1', 'v1', 'v2']);

        await socketService.runLiveHoursTick(io);

        expect(LiveSession.applyTick).toHaveBeenCalledWith('ls_1', expect.objectContaining({ qualifies: false }));
        expect(HostWeeklyStat.addQualifiedSeconds).not.toHaveBeenCalled();
    });

    test('مستمع واحد فقط (أقل من الحد الأدنى) → qualifies:false ولا إضافة أي ثانية', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        wireRoom('room_1', 'host_1', 'ls_1');
        mockGroups([]);
        const io = fakeIoWithViewers('room_1', ['host_1', 'v1']);

        await socketService.runLiveHoursTick(io);

        expect(LiveSession.applyTick).toHaveBeenCalledWith('ls_1', expect.objectContaining({ qualifies: false, listenerCount: 1 }));
        expect(HostWeeklyStat.addQualifiedSeconds).not.toHaveBeenCalled();
    });

    test('حد أدنى مُعدَّل إدارياً إلى 3 → مستمعان لا يكفيان الآن', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 3 });
        wireRoom('room_1', 'host_1', 'ls_1');
        mockGroups([]);
        const io = fakeIoWithViewers('room_1', ['host_1', 'v1', 'v2']);

        await socketService.runLiveHoursTick(io);

        expect(LiveSession.applyTick).toHaveBeenCalledWith('ls_1', expect.objectContaining({ qualifies: false }));
        expect(HostWeeklyStat.addQualifiedSeconds).not.toHaveBeenCalled();
    });

    // 🛡️ مراجعة #154 (بند 1): عدم العدّ المزدوج — ادّعاء التِك نفسه قد يُرفَض (applyTick يُعيد
    // null، راجع LiveSession.applyTick: تِك متقارب جداً زمنياً من آخر تِك ناجح — تِك إقلاع فوري +
    // مؤقّت 60 ثانية بنفس العملية، أو حاويتان متداخلتان أثناء إعادة نشر) — حتى لو تحقّق كل شرط
    // آخر (مضيف حاضر + مستمعون كافون)، HostWeeklyStat يجب ألا يُزاد إطلاقاً لو رُفض الادّعاء
    test('ادّعاء الدقيقة رُفض (applyTick أعاد null — تِك مزدوج/متقارب) → HostWeeklyStat لا يُزاد أبداً رغم qualifies:true', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        wireRoom('room_1', 'host_1', 'ls_1', { applyTickResult: null });
        mockGroups([]);
        const io = fakeIoWithViewers('room_1', ['host_1', 'v1', 'v2']);

        await socketService.runLiveHoursTick(io);

        expect(LiveSession.applyTick).toHaveBeenCalledWith('ls_1', expect.objectContaining({ qualifies: true }));
        expect(HostWeeklyStat.addQualifiedSeconds).not.toHaveBeenCalled();
    });

    test('لا غرف مباشرة إطلاقاً → لا يلمس أي نموذج (لا تِك، لا إحصائية)', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        jest.spyOn(VoiceRoom, 'find').mockImplementation(() => chainable([]));
        const applyTickSpy = jest.spyOn(LiveSession, 'applyTick').mockResolvedValue(null);
        const addSecondsSpy = jest.spyOn(HostWeeklyStat, 'addQualifiedSeconds').mockResolvedValue(null);

        await socketService.runLiveHoursTick({ sockets: { adapter: { rooms: new Map() }, sockets: new Map() } });

        expect(applyTickSpy).not.toHaveBeenCalled();
        expect(addSecondsSpy).not.toHaveBeenCalled();
    });

    test('خطأ بغرفة واحدة لا يُسقِط تِك بقية الغرف (كل غرفة بـtry/catch مستقل)', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        jest.spyOn(VoiceRoom, 'find').mockImplementation(() => chainable([
            { _id: 'room_bad', host: 'host_bad', hostDisconnectedAt: null },
            { _id: 'room_good', host: 'host_good', hostDisconnectedAt: null }
        ]));
        jest.spyOn(LiveSession, 'findOne').mockImplementation((filter) => {
            if (String(filter.room) === 'room_bad') throw new Error('DB error simulated');
            return chainable({ _id: 'ls_good' });
        });
        const applyTickSpy = jest.spyOn(LiveSession, 'applyTick').mockResolvedValue({ _id: 'ls_good' });
        const addSecondsSpy = jest.spyOn(HostWeeklyStat, 'addQualifiedSeconds').mockResolvedValue(null);
        mockGroups([]);
        const io = fakeIoWithViewers('room_good', ['host_good', 'v1', 'v2']);

        await expect(socketService.runLiveHoursTick(io)).resolves.not.toThrow();

        expect(applyTickSpy).toHaveBeenCalledWith('ls_good', expect.objectContaining({ qualifies: true }));
        expect(addSecondsSpy).toHaveBeenCalledWith('host_good', expect.any(Date), 60);
    });
});
