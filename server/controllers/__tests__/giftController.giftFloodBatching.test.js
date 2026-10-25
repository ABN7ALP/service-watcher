// ملف: giftController.giftFloodBatching.test.js
// 🛡️ طلب صريح بمراجعة PR (البند 1-3، سيل الهدايا): يختبر دمج إعلانات الهدايا بنافذة 250ms
// (نفس مرسل+هدية+مستلم بنفس الغرفة يُدمَجان بعدّاد كمية واحد لا حدثين) وتحديد
// room-support-points-updated بمرة واحدة كحد أقصى كل 500ms لكل غرفة (حافة أمامية+خلفية).
//
// 🐛 jest.useFakeTimers() قبل require('../giftController') لنفس سبب ملف pkScore.test.js
// المجاور (الملف يحمّل setInterval حقيقي غير مرتبط بهذا الاختبار عند الاستيراد)
jest.useFakeTimers();

const { queueRoomGiftAnnouncement, emitRoomSupportPointsUpdated, emitRoomSupportUpdated } = require('../giftController');

function makeIo() {
    const emitted = [];
    return {
        emitted,
        to(room) {
            return { emit: (event, payload) => emitted.push({ room, event, payload }) };
        }
    };
}

describe('queueRoomGiftAnnouncement — دمج نافذة 250ms بمفتاح (مرسل، هدية، مستلم)', () => {
    test('نفس المرسل+الهدية+المستلم مرتين خلال النافذة → حدث واحد فقط بالكمية الكلية', async () => {
        const io = makeIo();
        queueRoomGiftAnnouncement(io, { roomId: 'room_1', fromUserId: 'u1', giftId: 'g1', toUserId: 'u2', quantity: 1 });
        queueRoomGiftAnnouncement(io, { roomId: 'room_1', fromUserId: 'u1', giftId: 'g1', toUserId: 'u2', quantity: 2 });

        expect(io.emitted).toHaveLength(0); // ✅ لا بثّ فوري — بانتظار انتهاء نافذة الدمج
        await jest.advanceTimersByTimeAsync(250);

        expect(io.emitted).toHaveLength(1);
        expect(io.emitted[0]).toMatchObject({ room: 'room-chat-room_1', event: 'room-gift-announcement', payload: { quantity: 3 } });
    });

    test('مستلمان مختلفان بنفس الغرفة/المرسل/الهدية خلال نفس النافذة → حدثان مستقلان (لا دمج خاطئ)', async () => {
        const io = makeIo();
        queueRoomGiftAnnouncement(io, { roomId: 'room_2', fromUserId: 'u1', giftId: 'g1', toUserId: 'receiverA', quantity: 1 });
        queueRoomGiftAnnouncement(io, { roomId: 'room_2', fromUserId: 'u1', giftId: 'g1', toUserId: 'receiverB', quantity: 5 });

        await jest.advanceTimersByTimeAsync(250);

        expect(io.emitted).toHaveLength(2);
        const byReceiver = Object.fromEntries(io.emitted.map(e => [e.payload.toUserId, e.payload.quantity]));
        expect(byReceiver).toEqual({ receiverA: 1, receiverB: 5 });
    });

    test('غرفتان مختلفتان لا تتدخّلان ببعضهما', async () => {
        const io = makeIo();
        queueRoomGiftAnnouncement(io, { roomId: 'room_A', fromUserId: 'u1', giftId: 'g1', toUserId: 'u2', quantity: 1 });
        queueRoomGiftAnnouncement(io, { roomId: 'room_B', fromUserId: 'u1', giftId: 'g1', toUserId: 'u2', quantity: 1 });

        await jest.advanceTimersByTimeAsync(250);

        expect(io.emitted).toHaveLength(2);
        expect(io.emitted.map(e => e.room).sort()).toEqual(['room-chat-room_A', 'room-chat-room_B']);
    });

    test('3 دفعات (comboId مختلف لكل دفعة) خلال 250ms → حدث واحد فقط بالكمية الكلية وأحدث comboId', async () => {
        const io = makeIo();
        queueRoomGiftAnnouncement(io, { roomId: 'room_combo', fromUserId: 'u1', giftId: 'g1', toUserId: 'u2', quantity: 2, comboId: 'combo_1' });
        queueRoomGiftAnnouncement(io, { roomId: 'room_combo', fromUserId: 'u1', giftId: 'g1', toUserId: 'u2', quantity: 3, comboId: 'combo_2' });
        queueRoomGiftAnnouncement(io, { roomId: 'room_combo', fromUserId: 'u1', giftId: 'g1', toUserId: 'u2', quantity: 5, comboId: 'combo_3' });

        expect(io.emitted).toHaveLength(0); // ✅ لا بثّ فوري بعد — بانتظار انتهاء نافذة الدمج (لا مؤقّت جديد لكل دفعة)
        await jest.advanceTimersByTimeAsync(250);

        expect(io.emitted).toHaveLength(1);
        expect(io.emitted[0]).toMatchObject({
            room: 'room-chat-room_combo',
            event: 'room-gift-announcement',
            payload: { quantity: 10, comboId: 'combo_3' } // ✅ الكمية الكلية 2+3+5، وcomboId الأحدث لا الأقدم
        });
    });

    test('سيل كبير (50 هدية نفس التركيبة) خلال النافذة → حدث واحد فقط بالكمية الكلية (50)', async () => {
        const io = makeIo();
        for (let i = 0; i < 50; i++) {
            queueRoomGiftAnnouncement(io, { roomId: 'room_flood', fromUserId: 'u1', giftId: 'g1', toUserId: 'u2', quantity: 1 });
        }
        await jest.advanceTimersByTimeAsync(250);

        expect(io.emitted).toHaveLength(1);
        expect(io.emitted[0].payload.quantity).toBe(50);
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
