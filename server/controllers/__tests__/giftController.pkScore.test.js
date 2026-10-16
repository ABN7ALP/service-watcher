// ملف: giftController.pkScore.test.js
// ✅ يختبر منطق صِرف بذاكرة العملية فقط (throttle الدفعة + كشف قلب النتيجة) بمحاكاة (mock)
// RoomBattle.findOne/findOneAndUpdate بدل قاعدة بيانات حقيقية — نفس استراتيجية هذا المشروع
// الثابتة (Jest + mocked models، راجع server/utils/__tests__ لنفس الفلسفة مع pkLeagueEngine)
//
// 🛡️ كل اختبار يستخدم battleId مختلفاً كي لا تتسرّب حالة الـthrottle/rate-limit (خرائط
// بذاكرة الوحدة البرمجية، مقصودة كذلك إنتاجياً) من اختبار لآخر بلا حاجة لـjest.resetModules
//
// 🐛 jest.useFakeTimers() هنا قبل require('../giftController') عمداً — الملف يحمل setInterval
// حقيقي غير مرتبط بهذا الاختبار إطلاقاً (تنظيف محدِّد معدّل الهدايا، كل 30 ثانية) يُسجَّل لحظة
// الاستيراد نفسها؛ لو سُجِّل بمؤقّت حقيقي قبل تفعيل المؤقّتات المزيَّفة يُبقي عملية Jest حيّة
// بلا داعٍ حتى بعد انتهاء كل الاختبارات (handle معلّق)، فنُفعِّل المزيَّفة أولاً كي يُسجَّل بها هو نفسه
jest.useFakeTimers();

const RoomBattle = require('../../models/RoomBattle');
const { applyGiftToActiveBattle, clearPkScoreThrottle } = require('../giftController');

function makeIo() {
    const emitted = [];
    return {
        emitted,
        to(room) {
            return { emit: (event, payload) => emitted.push({ room, event, payload }) };
        }
    };
}

// ✅ وثيقة معركة مزيّفة بأقل ما يلزم من الدوال التي يستدعيها giftController على نتيجة
// findOneAndUpdate (buildAudiencePayload/topSupporters) — بلا أي اتصال حقيقي بقاعدة بيانات
function makeBattleDoc(state) {
    return {
        _id: state._id,
        roomA: state.roomA,
        roomB: state.roomB,
        scoreA: state.scoreA,
        scoreB: state.scoreB,
        status: state.status,
        battleMultiplier: () => 1,
        buildAudiencePayload() {
            return { scoreA: state.scoreA, scoreB: state.scoreB, fogged: { A: false, B: false } };
        },
        topSupporters: async () => []
    };
}

function mockBattle(battleId, roomA, roomB) {
    const state = { _id: battleId, roomA, roomB, scoreA: 0, scoreB: 0, status: 'active' };
    jest.spyOn(RoomBattle, 'findOne').mockImplementation(({ $or }) => {
        const roomId = $or[0].roomA || $or[1].roomB;
        if (roomId !== roomA && roomId !== roomB) return Promise.resolve(null);
        return Promise.resolve(makeBattleDoc(state));
    });
    jest.spyOn(RoomBattle, 'findOneAndUpdate').mockImplementation((filter, update) => {
        if (filter._id !== battleId || filter.status !== 'active') return Promise.resolve(null);
        state.scoreA += update.$inc.scoreA || 0;
        state.scoreB += update.$inc.scoreB || 0;
        return Promise.resolve(makeBattleDoc(state));
    });
    // 🛡️ طلب صريح بمراجعة PR: emitPkScoreNow يعيد قراءة الحالة الحقيقية عبر findById قبل أي
    // بثّ (لا يثق باللقطة المحفوظة) — المحاكاة هنا تعكس نفس الحالة (state.status) المُستخدَمة
    // بباقي الدوال، فتختبر اختبارات الحافة الأمامية/الخلفية المسار الطبيعي (معركة لا تزال active)
    jest.spyOn(RoomBattle, 'findById').mockImplementation((id) => {
        if (id !== battleId) return Promise.resolve(null);
        return Promise.resolve(makeBattleDoc(state));
    });
    return state;
}

// ✅ تفريغ طابور المهام المجهرية (Promise) — emitPkScoreNow/schedulePkScoreEmit غير منتظَرين
// عمداً من applyGiftToActiveBattle (fire-and-forget)، فحتى بعد await على الاستدعاء نفسه قد
// يبقى بثّ pk:score معلّقاً بسلسلة Promise.all داخلية؛ هذا يُفرِّغها دون الاعتماد على مؤقتات زائفة
async function flushMicrotasks() {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('giftController: pk:score throttled batching', () => {
    afterEach(() => jest.restoreAllMocks());

    test('الحافة الأمامية: أول هدية بعد هدوء تُبثّ فوراً بحدث pk:score لكل غرفة', async () => {
        const io = makeIo();
        mockBattle('battle_lead', 'roomA_1', 'roomB_1');
        await applyGiftToActiveBattle(io, 'roomA_1', 100, null);
        await flushMicrotasks();

        const scoreEvents = io.emitted.filter(e => e.event === 'pk:score');
        expect(scoreEvents).toHaveLength(2);
        const forA = scoreEvents.find(e => e.room === 'room-chat-roomA_1');
        expect(forA.payload.us).toBe(100);
        expect(forA.payload.them).toBe(0);
    });

    test('هدايا متسارعة داخل نافذة 300ms تُبثّ مرّة واحدة فقط (الحافة الخلفية) بأحدث رقم', async () => {
        const io = makeIo();
        mockBattle('battle_batch', 'roomA_2', 'roomB_2');

        await applyGiftToActiveBattle(io, 'roomA_2', 100, null); // حافة أمامية — تُبثّ فوراً
        await flushMicrotasks();
        io.emitted.length = 0; // نعزل النافذة التالية فقط

        await applyGiftToActiveBattle(io, 'roomA_2', 50, null); // يفتح نافذة 300ms جديدة
        await applyGiftToActiveBattle(io, 'roomA_2', 30, null); // بنفس النافذة — لا بثّ منفصل لها
        await flushMicrotasks();
        expect(io.emitted.filter(e => e.event === 'pk:score')).toHaveLength(0);

        await jest.advanceTimersByTimeAsync(300);
        await flushMicrotasks();

        const scoreEvents = io.emitted.filter(e => e.event === 'pk:score');
        expect(scoreEvents).toHaveLength(2); // بثّ واحد فقط لكل غرفة طوال النافذة كلها
        const forA = scoreEvents.find(e => e.room === 'room-chat-roomA_2');
        expect(forA.payload.us).toBe(180); // 100 (قبل النافذة) + 50 + 30، أحدث رقم لا أول رقم بالنافذة
    });
});

describe('giftController: clearPkScoreThrottle + حماية الحالة — مراجعة PR بند 2', () => {
    afterEach(() => jest.restoreAllMocks());

    test('clearPkScoreThrottle تُلغي المؤقّت المؤجَّل — لا بثّ pk:score متأخر بعد إنهاء المعركة', async () => {
        const io = makeIo();
        mockBattle('battle_cleared', 'roomA_6', 'roomB_6');

        await applyGiftToActiveBattle(io, 'roomA_6', 100, null); // حافة أمامية — تُبثّ فوراً
        await flushMicrotasks();
        io.emitted.length = 0;

        await applyGiftToActiveBattle(io, 'roomA_6', 50, null); // يفتح نافذة 300ms (مؤقّت مؤجَّل)
        await flushMicrotasks();

        clearPkScoreThrottle('battle_cleared'); // ✅ محاكاة finalizeActiveBattle يُنهي المعركة الآن

        await jest.advanceTimersByTimeAsync(300);
        await flushMicrotasks();

        expect(io.emitted.filter(e => e.event === 'pk:score')).toHaveLength(0);
    });

    test('فحص دفاعي مستقل: معركة لم تعد active وقت تنفيذ المؤقّت المؤجَّل — لا بثّ حتى بلا clearPkScoreThrottle', async () => {
        const io = makeIo();
        const state = mockBattle('battle_stale', 'roomA_7', 'roomB_7');

        await applyGiftToActiveBattle(io, 'roomA_7', 100, null); // حافة أمامية
        await flushMicrotasks();
        io.emitted.length = 0;

        await applyGiftToActiveBattle(io, 'roomA_7', 50, null); // يفتح نافذة 300ms
        await flushMicrotasks();

        state.status = 'ended'; // ✅ المعركة انتهت فعلياً قبل إطلاق المؤقّت المؤجَّل (بلا إلغاء)

        await jest.advanceTimersByTimeAsync(300);
        await flushMicrotasks();

        expect(io.emitted.filter(e => e.event === 'pk:score')).toHaveLength(0);
    });
});

describe('giftController: pk:leadChange — كشف قلب النتيجة', () => {
    afterEach(() => jest.restoreAllMocks());

    test('لا حدث عند أول تقدّم من تعادل (لا يوجد متقدّم سابق لينقلب)', async () => {
        const io = makeIo();
        mockBattle('battle_first', 'roomA_3', 'roomB_3');
        await applyGiftToActiveBattle(io, 'roomA_3', 100, null); // 0-0 → A يتقدّم لأول مرة
        await flushMicrotasks();
        expect(io.emitted.filter(e => e.event === 'pk:leadChange')).toHaveLength(0);
    });

    test('ينبعث pk:leadChange فوراً لكل غرفة بمنظورها (us/them) عند انقلاب المتقدّم', async () => {
        const io = makeIo();
        mockBattle('battle_flip', 'roomA_4', 'roomB_4');
        await applyGiftToActiveBattle(io, 'roomB_4', 100, null); // B يتقدّم
        await flushMicrotasks();
        io.emitted.length = 0;

        await applyGiftToActiveBattle(io, 'roomA_4', 150, null); // A يتخطّى B — قلب النتيجة
        await flushMicrotasks();

        const leadEvents = io.emitted.filter(e => e.event === 'pk:leadChange');
        expect(leadEvents).toHaveLength(2);
        expect(leadEvents.find(e => e.room === 'room-chat-roomA_4').payload.leader).toBe('us');
        expect(leadEvents.find(e => e.room === 'room-chat-roomB_4').payload.leader).toBe('them');
    });

    test('يُمنع تكرار الانفجار أكثر من مرّة كل 3 ثوانٍ لنفس المعركة', async () => {
        const io = makeIo();
        mockBattle('battle_guard', 'roomA_5', 'roomB_5');

        await applyGiftToActiveBattle(io, 'roomB_5', 100, null); // B يتقدّم
        await applyGiftToActiveBattle(io, 'roomA_5', 150, null); // قلب أول — يُسمح
        await flushMicrotasks();
        expect(io.emitted.filter(e => e.event === 'pk:leadChange')).toHaveLength(2);
        io.emitted.length = 0;

        await applyGiftToActiveBattle(io, 'roomB_5', 200, null); // قلب ثانٍ بعد أقل من 3 ثوانٍ — يُمنع
        await flushMicrotasks();
        expect(io.emitted.filter(e => e.event === 'pk:leadChange')).toHaveLength(0);

        await jest.advanceTimersByTimeAsync(3000);
        io.emitted.length = 0;
        await applyGiftToActiveBattle(io, 'roomA_5', 500, null); // بعد مرور 3 ثوانٍ — يُسمح مجدداً
        await flushMicrotasks();
        expect(io.emitted.filter(e => e.event === 'pk:leadChange')).toHaveLength(2);
    });
});
