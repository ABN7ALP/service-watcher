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
// 🛡️ fanclub-v2: نقاط الاستماع تُستدعى من نفس التِك — تُموَّه هنا كي لا تلمس FanClubMembership/
// FanClubDailyProgress الحقيقيين بلا اتصال قاعدة بيانات فعلي (لها اختبارها الخاص بمحاكاة ذاكرة
// JS — fanClubController.join.test.js/weekly.test.js — هذا الملف يختبر فقط أن التِك يستدعيها
// بالشروط الصحيحة، لا سلوكها الداخلي)
jest.mock('../../controllers/fanClubController', () => ({ awardListeningMinute: jest.fn() }));

let socketService;
let VoiceRoom, LiveSession, HostDailyStat, SystemSettings, linkageService, fanClubController;

beforeAll(() => {
    jest.spyOn(global, 'setInterval').mockImplementation(() => ({ unref: () => {} }));
    socketService = require('../socketService');
    VoiceRoom = require('../../models/VoiceRoom');
    LiveSession = require('../../models/LiveSession');
    HostDailyStat = require('../../models/HostDailyStat');
    SystemSettings = require('../../models/SystemSettings');
    linkageService = require('../../utils/linkageService');
    fanClubController = require('../../controllers/fanClubController');
});

afterEach(() => {
    jest.restoreAllMocks();
    // ✅ awardListeningMinute هو jest.fn() من jest.mock(factory) لا jest.spyOn — restoreAllMocks
    // لا يُصفِّر سجل نداءاته (يُصفِّر السبايز فقط)، فيتراكم عبر كل اختبارات الملف بلا هذا السطر
    fanClubController.awardListeningMinute.mockClear();
});

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
        expect(result).toEqual({ hostPresent: true, listenerCount: 0, listenerIds: [] });
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
        expect(result).toEqual({ hostPresent: true, listenerCount: 3, listenerIds: ['v1', 'v2', 'v3'] });
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
        jest.spyOn(HostDailyStat, 'addQualifiedSeconds').mockResolvedValue(null);
    }

    test('مضيف حاضر + مستمعان (= الحد الأدنى الافتراضي 2) + ادّعاء التِك ينجح → qualifies:true + إضافة 60 ثانية', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        wireRoom('room_1', 'host_1', 'ls_1');
        mockGroups([]);
        const io = fakeIoWithViewers('room_1', ['host_1', 'v1', 'v2']);

        await socketService.runLiveHoursTick(io);

        expect(LiveSession.applyTick).toHaveBeenCalledWith('ls_1', expect.objectContaining({ qualifies: true, listenerCount: 2 }));
        expect(HostDailyStat.addQualifiedSeconds).toHaveBeenCalledWith('host_1', expect.any(Date), 60);
    });

    // 🛡️ مراجعة #155 (بند 1): اليوم المُرسَل لـHostDailyStat يُحسَب من لحظة *هذا التِك* (now) لا
    // من يوم بداية الجلسة — فجلسة تعبر منتصف الليل بتوقيت دمشق تُحسَب دقيقة بدقيقة على يومها
    // الفعلي تلقائياً، بلا أي منطق توزيع إضافي بالخادم
    test('تِك عند 23:58 دمشق (الجلسة بدأت يوماً سابقاً) → اليوم المُرسَل هو يوم التِك نفسه، لا يوم بداية الجلسة', async () => {
        jest.useFakeTimers();
        // 2024-01-08T20:58:00Z = 2024-01-08T23:58:00 بتوقيت دمشق (UTC+3) — لا يزال الأحد نفسه محلياً
        jest.setSystemTime(new Date('2024-01-08T20:58:00Z'));
        try {
            jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
            wireRoom('room_1', 'host_1', 'ls_1'); // الجلسة الموهومة ls_1 لا تحمل startedAt هنا أصلاً — السلوك لا يعتمد عليه
            mockGroups([]);
            const io = fakeIoWithViewers('room_1', ['host_1', 'v1', 'v2']);

            await socketService.runLiveHoursTick(io);

            expect(HostDailyStat.addQualifiedSeconds).toHaveBeenCalledWith('host_1', expect.any(Date), 60);
            const calledDay = HostDailyStat.addQualifiedSeconds.mock.calls[0][1];
            // ✅ نفس حساب getDayStartForDate بالضبط: منتصف ليل اليوم المحلي (دمشق) كلحظة UTC حقيقية
            const { getDayStartForDate } = require('../../utils/poolWeek');
            expect(calledDay.getTime()).toBe(getDayStartForDate(new Date('2024-01-08T20:58:00Z')).getTime());
        } finally {
            jest.useRealTimers();
        }
    });

    // 🛡️ fanclub-v2: نقاط الاستماع تُمنَح لكل مستمع حقيقي حاضر، وفقط عند نفس "ادّعاء الدقيقة"
    // الذي يُزيد HostDailyStat (updatedSession && qualifies) — لا آلية منع ازدواج منفصلة
    test('نجاح التِك + مستمعان حقيقيان → awardListeningMinute يُستدعى مرة واحدة لكل مستمع، بنفس يوم التِك', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        wireRoom('room_1', 'host_1', 'ls_1');
        mockGroups([]);
        const io = fakeIoWithViewers('room_1', ['host_1', 'v1', 'v2']);

        await socketService.runLiveHoursTick(io);

        expect(fanClubController.awardListeningMinute).toHaveBeenCalledTimes(2);
        expect(fanClubController.awardListeningMinute).toHaveBeenCalledWith(io, 'host_1', 'v1', expect.any(Date));
        expect(fanClubController.awardListeningMinute).toHaveBeenCalledWith(io, 'host_1', 'v2', expect.any(Date));
    });

    // 🛡️ "لا ازدواج عبر تِكتين/نسختين" — ادّعاء applyTick المرفوض (نفس الحماية المستخدَمة فعلاً
    // حين يتصادف تِكان على نفس الدقيقة الفعلية، كحاويتين متداخلتين أو إعادة نشر) يمنع نقاط
    // الاستماع أيضاً، بنفس بالضبط ما يمنع ازدواج HostDailyStat — لا حاجة لحماية منفصلة بنادي المعجبين
    test('ادّعاء الدقيقة رُفض (applyTick أعاد null — تِك مزدوج/متقارب، محاكاة نسختي خادم) → awardListeningMinute لا يُستدعى إطلاقاً', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        wireRoom('room_1', 'host_1', 'ls_1', { applyTickResult: null });
        mockGroups([]);
        const io = fakeIoWithViewers('room_1', ['host_1', 'v1', 'v2']);

        await socketService.runLiveHoursTick(io);

        expect(LiveSession.applyTick).toHaveBeenCalledWith('ls_1', expect.objectContaining({ qualifies: true }));
        expect(HostDailyStat.addQualifiedSeconds).not.toHaveBeenCalled();
        expect(fanClubController.awardListeningMinute).not.toHaveBeenCalled();
    });

    test('المضيف غائب عن قناة الغرفة فعلياً (رغم isLive:true بالمستند) → qualifies:false حتى مع مستمعين كافيين', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        wireRoom('room_1', 'host_1', 'ls_1');
        mockGroups([]);
        const io = fakeIoWithViewers('room_1', ['v1', 'v2']); // host_1 غائب عن القناة

        await socketService.runLiveHoursTick(io);

        expect(LiveSession.applyTick).toHaveBeenCalledWith('ls_1', expect.objectContaining({ qualifies: false }));
        expect(HostDailyStat.addQualifiedSeconds).not.toHaveBeenCalled();
    });

    test('المضيف حاضر لكن بنافذة سماح انقطاعه (hostDisconnectedAt محدَّد) → qualifies:false', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        wireRoom('room_1', 'host_1', 'ls_1', { hostDisconnectedAt: new Date() });
        mockGroups([]);
        const io = fakeIoWithViewers('room_1', ['host_1', 'v1', 'v2']);

        await socketService.runLiveHoursTick(io);

        expect(LiveSession.applyTick).toHaveBeenCalledWith('ls_1', expect.objectContaining({ qualifies: false }));
        expect(HostDailyStat.addQualifiedSeconds).not.toHaveBeenCalled();
    });

    test('مستمع واحد فقط (أقل من الحد الأدنى) → qualifies:false ولا إضافة أي ثانية', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        wireRoom('room_1', 'host_1', 'ls_1');
        mockGroups([]);
        const io = fakeIoWithViewers('room_1', ['host_1', 'v1']);

        await socketService.runLiveHoursTick(io);

        expect(LiveSession.applyTick).toHaveBeenCalledWith('ls_1', expect.objectContaining({ qualifies: false, listenerCount: 1 }));
        expect(HostDailyStat.addQualifiedSeconds).not.toHaveBeenCalled();
    });

    test('حد أدنى مُعدَّل إدارياً إلى 3 → مستمعان لا يكفيان الآن', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 3 });
        wireRoom('room_1', 'host_1', 'ls_1');
        mockGroups([]);
        const io = fakeIoWithViewers('room_1', ['host_1', 'v1', 'v2']);

        await socketService.runLiveHoursTick(io);

        expect(LiveSession.applyTick).toHaveBeenCalledWith('ls_1', expect.objectContaining({ qualifies: false }));
        expect(HostDailyStat.addQualifiedSeconds).not.toHaveBeenCalled();
    });

    // 🛡️ مراجعة #154 (بند 1): عدم العدّ المزدوج — ادّعاء التِك نفسه قد يُرفَض (applyTick يُعيد
    // null، راجع LiveSession.applyTick: تِك متقارب جداً زمنياً من آخر تِك ناجح — تِك إقلاع فوري +
    // مؤقّت 60 ثانية بنفس العملية، أو حاويتان متداخلتان أثناء إعادة نشر) — حتى لو تحقّق كل شرط
    // آخر (مضيف حاضر + مستمعون كافون)، HostDailyStat يجب ألا يُزاد إطلاقاً لو رُفض الادّعاء
    test('ادّعاء الدقيقة رُفض (applyTick أعاد null — تِك مزدوج/متقارب) → HostDailyStat لا يُزاد أبداً رغم qualifies:true', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        wireRoom('room_1', 'host_1', 'ls_1', { applyTickResult: null });
        mockGroups([]);
        const io = fakeIoWithViewers('room_1', ['host_1', 'v1', 'v2']);

        await socketService.runLiveHoursTick(io);

        expect(LiveSession.applyTick).toHaveBeenCalledWith('ls_1', expect.objectContaining({ qualifies: true }));
        expect(HostDailyStat.addQualifiedSeconds).not.toHaveBeenCalled();
    });

    test('لا غرف مباشرة إطلاقاً → لا يلمس أي نموذج (لا تِك، لا إحصائية)', async () => {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ poolMinListeners: 2 });
        jest.spyOn(VoiceRoom, 'find').mockImplementation(() => chainable([]));
        const applyTickSpy = jest.spyOn(LiveSession, 'applyTick').mockResolvedValue(null);
        const addSecondsSpy = jest.spyOn(HostDailyStat, 'addQualifiedSeconds').mockResolvedValue(null);

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
        const addSecondsSpy = jest.spyOn(HostDailyStat, 'addQualifiedSeconds').mockResolvedValue(null);
        mockGroups([]);
        const io = fakeIoWithViewers('room_good', ['host_good', 'v1', 'v2']);

        await expect(socketService.runLiveHoursTick(io)).resolves.not.toThrow();

        expect(applyTickSpy).toHaveBeenCalledWith('ls_good', expect.objectContaining({ qualifies: true }));
        expect(addSecondsSpy).toHaveBeenCalledWith('host_good', expect.any(Date), 60);
    });
});
