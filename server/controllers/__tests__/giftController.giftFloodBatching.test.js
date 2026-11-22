// ملف: giftController.giftFloodBatching.test.js
// 🛡️ طلب صريح (مراجعة PR #110، أُعيد بمراجعة PR #161 البند 1 بعد حذفه خطأً مع الملف القديم
// بإعادة تصميم محرك عرض الهدايا): يختبر دمج gift:sent بنافذة 250ms (نفس مرسل+هدية+نفس مجموعة
// المستلمين بالضبط بنفس الغرفة يُدمَجان بعدّاد كمية واحد لا حدثين) — بلا هذا الدمج، كل ضغطة
// سريعة بسيل هدايا (300 هدية/10 ثوانٍ من عدة مرسلين) كانت تُفجِّر حدثاً منفصلاً لكل مشاهد
// بالغرفة فيتجمّد المضيف؛ محرّك العرض بالعميل (giftEngine.js) يتعامل مع qty الكلية المُجمَّعة
// أصلاً (حتى 3 تشغيلات فيديو + شارة ×N)، فلا حاجة لأي تغيير هناك — الدمج هنا فقط يؤخِّر البثّ
// ذاته 250ms كحد أقصى، لا أي عملية مالية (تُستدعى دوماً بعد نجاح الخصم الذرّي فعلياً).
// وتختبر أيضاً تحديد room-support-points-updated/room-support-updated (مرة واحدة كحد أقصى كل
// 500ms لكل غرفة/مقعد — غير مرتبطتين بإعادة تصميم محرّك الهدايا، بقيتا كما هما تماماً).
//
// 🐛 jest.useFakeTimers() قبل require('../giftController') لنفس سبب ملف pkScore.test.js
// المجاور (الملف يحمّل setInterval حقيقي غير مرتبط بهذا الاختبار عند الاستيراد)
jest.useFakeTimers();

const { emitGiftSent, emitRoomSupportPointsUpdated, emitRoomSupportUpdated } = require('../giftController');

function makeIo() {
    const emitted = [];
    return {
        emitted,
        to(room) {
            return { emit: (event, payload) => emitted.push({ room, event, payload }) };
        }
    };
}

function fakeUser(id, username) {
    return { _id: id, username, profileImage: null };
}

function fakeGift(id, name, videoUrl) {
    return { _id: id, name, imageUrl: '', videoUrl: videoUrl || null, category: 'common' };
}

describe('emitGiftSent — دمج نافذة 250ms بمفتاح (مرسل، هدية، نفس مجموعة المستلمين)', () => {
    test('نفس المرسل+الهدية+المستلم مرتين خلال النافذة → حدث gift:sent واحد فقط بالكمية الكلية', async () => {
        const io = makeIo();
        const sender = fakeUser('u1', 's1');
        const gift = fakeGift('g1', 'وردة');
        const receivers = [fakeUser('u2', 'r1')];

        emitGiftSent(io, { roomId: 'room_1', sender, receivers, gift, qty: 1 });
        emitGiftSent(io, { roomId: 'room_1', sender, receivers, gift, qty: 2 });

        expect(io.emitted).toHaveLength(0); // ✅ لا بثّ فوري — بانتظار انتهاء نافذة الدمج
        await jest.advanceTimersByTimeAsync(250);

        expect(io.emitted).toHaveLength(1);
        expect(io.emitted[0]).toMatchObject({ room: 'room-chat-room_1', event: 'gift:sent', payload: { qty: 3 } });
    });

    test('مجموعتا مستلمين مختلفتان بنفس الغرفة/المرسل/الهدية خلال نفس النافذة → حدثان مستقلان (لا دمج خاطئ)', async () => {
        const io = makeIo();
        const sender = fakeUser('u1', 's1');
        const gift = fakeGift('g1', 'وردة');

        emitGiftSent(io, { roomId: 'room_2', sender, receivers: [fakeUser('rA', 'receiverA')], gift, qty: 1 });
        emitGiftSent(io, { roomId: 'room_2', sender, receivers: [fakeUser('rB', 'receiverB')], gift, qty: 5 });

        await jest.advanceTimersByTimeAsync(250);

        expect(io.emitted).toHaveLength(2);
        const byReceiver = Object.fromEntries(io.emitted.map(e => [e.payload.receivers[0].id, e.payload.qty]));
        expect(byReceiver).toEqual({ rA: 1, rB: 5 });
    });

    test('غرفتان مختلفتان لا تتدخّلان ببعضهما', async () => {
        const io = makeIo();
        const sender = fakeUser('u1', 's1');
        const gift = fakeGift('g1', 'وردة');
        const receivers = [fakeUser('u2', 'r1')];

        emitGiftSent(io, { roomId: 'room_A', sender, receivers, gift, qty: 1 });
        emitGiftSent(io, { roomId: 'room_B', sender, receivers, gift, qty: 1 });

        await jest.advanceTimersByTimeAsync(250);

        expect(io.emitted).toHaveLength(2);
        expect(io.emitted.map(e => e.room).sort()).toEqual(['room-chat-room_A', 'room-chat-room_B']);
    });

    test('3 دفعات (comboKey مختلف لكل دفعة) خلال 250ms → حدث واحد فقط بالكمية الكلية وأحدث comboKey', async () => {
        const io = makeIo();
        const sender = fakeUser('u1', 's1');
        const gift = fakeGift('g1', 'وردة');
        const receivers = [fakeUser('u2', 'r1')];

        emitGiftSent(io, { roomId: 'room_combo', sender, receivers, gift, qty: 2, comboKey: 'combo_1' });
        emitGiftSent(io, { roomId: 'room_combo', sender, receivers, gift, qty: 3, comboKey: 'combo_2' });
        emitGiftSent(io, { roomId: 'room_combo', sender, receivers, gift, qty: 5, comboKey: 'combo_3' });

        expect(io.emitted).toHaveLength(0); // ✅ لا بثّ فوري بعد — بانتظار انتهاء نافذة الدمج (لا مؤقّت جديد لكل دفعة)
        await jest.advanceTimersByTimeAsync(250);

        expect(io.emitted).toHaveLength(1);
        expect(io.emitted[0]).toMatchObject({
            room: 'room-chat-room_combo',
            event: 'gift:sent',
            payload: { qty: 10, comboKey: 'combo_3' } // ✅ الكمية الكلية 2+3+5، وcomboKey الأحدث لا الأقدم
        });
    });

    test('سيل كبير (50 هدية نفس التركيبة) خلال النافذة → حدث gift:sent واحد فقط بالكمية الكلية (50)', async () => {
        const io = makeIo();
        const sender = fakeUser('u1', 's1');
        const gift = fakeGift('g1', 'وردة');
        const receivers = [fakeUser('u2', 'r1')];

        for (let i = 0; i < 50; i++) {
            emitGiftSent(io, { roomId: 'room_flood', sender, receivers, gift, qty: 1 });
        }
        await jest.advanceTimersByTimeAsync(250);

        expect(io.emitted).toHaveLength(1);
        expect(io.emitted[0].payload.qty).toBe(50);
    });

    test('كل عنصر مُدمَج يصل بحدث gift:sent واحد يحمل eventId حقيقياً للتكرار (dedupe) بجهة العميل', async () => {
        const io = makeIo();
        const sender = fakeUser('u1', 's1');
        const gift = fakeGift('g1', 'تنين', '/videos/dragon.mp4');
        const receivers = [fakeUser('u2', 'r1')];

        emitGiftSent(io, { roomId: 'room_evt', sender, receivers, gift, qty: 10 });
        await jest.advanceTimersByTimeAsync(250);

        expect(io.emitted).toHaveLength(1);
        expect(typeof io.emitted[0].payload.eventId).toBe('string');
        expect(io.emitted[0].payload.eventId.length).toBeGreaterThan(0);
        expect(io.emitted[0].payload.gift).toMatchObject({ videoUrl: '/videos/dragon.mp4' });
    });
});

describe('emitRoomSupportPointsUpdated — حافة أمامية+خلفية، 500ms كحد أقصى لكل غرفة', () => {
    test('أول نداء يُبثّ فوراً (الحافة الأمامية)', () => {
        const io = makeIo();
        emitRoomSupportPointsUpdated(io, 'room_1', { total: 100 });

        expect(io.emitted).toHaveLength(1);
        expect(io.emitted[0]).toMatchObject({ room: 'room-chat-room_1', event: 'room-support-points-updated', payload: { total: 100 } });
    });

    test('نداءات متتالية خلال نافذة 500ms → بثّ واحد إضافي فقط بأحدث حالة (الحافة الخلفية)', async () => {
        const io = makeIo();
        emitRoomSupportPointsUpdated(io, 'room_2', { total: 100 }); // فوري
        emitRoomSupportPointsUpdated(io, 'room_2', { total: 200 }); // يُجدوَل فقط
        emitRoomSupportPointsUpdated(io, 'room_2', { total: 300 }); // يُحدِّث "أحدث حالة" بلا مؤقّت جديد

        expect(io.emitted).toHaveLength(1); // لم يُبثّ شيء إضافي بعد

        await jest.advanceTimersByTimeAsync(500);

        expect(io.emitted).toHaveLength(2);
        expect(io.emitted[1].payload).toEqual({ total: 300 }); // أحدث حالة فعلية، لا 200 (المُجدوَلة أصلاً)
    });

    test('بعد انتهاء النافذة بالكامل، نداء جديد يُبثّ فوراً من جديد (الحافة الأمامية تُعاد)', async () => {
        const io = makeIo();
        emitRoomSupportPointsUpdated(io, 'room_3', { total: 10 });
        await jest.advanceTimersByTimeAsync(600); // تجاوز النافذة كاملة، لا نداء آخر بالمنتصف

        emitRoomSupportPointsUpdated(io, 'room_3', { total: 20 });

        expect(io.emitted).toHaveLength(2);
        expect(io.emitted[1].payload).toEqual({ total: 20 });
    });

    test('سيل كبير (300 تحديث) خلال 1 ثانية ينتج ≤3 بثّات لكل غرفة لا 300', async () => {
        const io = makeIo();
        for (let i = 0; i < 300; i++) {
            emitRoomSupportPointsUpdated(io, 'room_flood', { total: i });
            await jest.advanceTimersByTimeAsync(3); // ~3ms بين كل هدية — 300 خلال ~900ms
        }
        await jest.advanceTimersByTimeAsync(500); // يُفرِّغ أي مؤقّت خلفي معلّق أخيراً

        expect(io.emitted.length).toBeLessThanOrEqual(4);
        expect(io.emitted[io.emitted.length - 1].payload.total).toBe(299); // آخر بثّ يحمل أحدث قيمة فعلية
    });
});

describe('emitRoomSupportUpdated — عداد دعم المقعد الفردي، حافة أمامية+خلفية، 500ms كحد أقصى لكل (غرفة+مستخدم)', () => {
    test('أول نداء يُبثّ فوراً (الحافة الأمامية)', () => {
        const io = makeIo();
        emitRoomSupportUpdated(io, 'room_1', 'seatUser1', 100);

        expect(io.emitted).toHaveLength(1);
        expect(io.emitted[0]).toMatchObject({
            room: 'room-chat-room_1',
            event: 'room-support-updated',
            payload: { roomId: 'room_1', userId: 'seatUser1', value: 100 }
        });
    });

    test('سيل هدايا سريع لنفس المستلِم خلال نافذة 500ms → بثّ واحد إضافي فقط بأحدث مجموع (الحافة الخلفية)', async () => {
        const io = makeIo();
        emitRoomSupportUpdated(io, 'room_2', 'seatUser2', 100); // فوري
        emitRoomSupportUpdated(io, 'room_2', 'seatUser2', 250); // يُجدوَل فقط
        emitRoomSupportUpdated(io, 'room_2', 'seatUser2', 400); // يُحدِّث "أحدث حالة" بلا مؤقّت جديد

        expect(io.emitted).toHaveLength(1);

        await jest.advanceTimersByTimeAsync(500);

        expect(io.emitted).toHaveLength(2);
        expect(io.emitted[1].payload).toEqual({ roomId: 'room_2', userId: 'seatUser2', value: 400 });
    });

    test('مستلمان مختلفان بنفس الغرفة لا يتدخّلان ببعضهما (مفتاح roomId:userId مستقل لكل مقعد)', async () => {
        const io = makeIo();
        emitRoomSupportUpdated(io, 'room_3', 'seatA', 10); // فوري
        emitRoomSupportUpdated(io, 'room_3', 'seatB', 20); // فوري أيضاً — مفتاح مختلف تماماً
        emitRoomSupportUpdated(io, 'room_3', 'seatA', 15); // يُجدوَل لمقعد A فقط

        expect(io.emitted).toHaveLength(2); // بثّان فوريان مستقلان لمقعدين مختلفين

        await jest.advanceTimersByTimeAsync(500);

        expect(io.emitted).toHaveLength(3);
        expect(io.emitted[2]).toMatchObject({ payload: { userId: 'seatA', value: 15 } });
    });

    test('سيل كبير (300 هدية لنفس المقعد) خلال ~1 ثانية ينتج ≤4 بثّات لا 300', async () => {
        const io = makeIo();
        for (let i = 0; i < 300; i++) {
            emitRoomSupportUpdated(io, 'room_flood', 'seatFlood', i);
            await jest.advanceTimersByTimeAsync(3);
        }
        await jest.advanceTimersByTimeAsync(500);

        expect(io.emitted.length).toBeLessThanOrEqual(4);
        expect(io.emitted[io.emitted.length - 1].payload.value).toBe(299);
    });
});
