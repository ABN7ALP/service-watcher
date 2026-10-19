// ملف: giftController.comboHardening.test.js
// 🛡️ طلب صريح (هدايا v2 — تصليب معالج gift:combo): يختبر reserveGiftCombo (النواة
// المعاملاتية — فحص المقاعد الحقيقية + الخصم الذري) وsettleGiftComboClaim (حجز GiftComboTx
// + reserveGiftCombo معاً بمعاملة Mongo واحدة، idempotency) مباشرة — بلا حاجة لمحاكاة طبقة
// Socket.IO كاملة (راجع تعليق الفصل بـgiftController.js).
//
// نفس استراتيجية هذا المشروع الثابتة (راجع giftController.pkScore.test.js المجاور):
// jest.spyOn على نماذج Mongoose الحقيقية (User/Gift/GiftLog/GiftComboTx/VoiceRoom) بمحاكاة
// حالة بذاكرة JS بسيطة، بدل قاعدة بيانات حقيقية أو mongodb-memory-server — تنزيل ثنائي mongod
// الحقيقي قد يفشل ببيئات تشغيل تحجب نطاقات mongodb.org/mongodb.com (راجع jest.config.js)،
// ومحاكاة session.withTransaction هنا (استدعاء مباشر للدالة بلا التزام/تراجع حقيقيين) كافية
// تماماً لاختبار المنطق التجاري الحقيقي (الفرع الذري/التصنيف الصحيح للأخطاء) بثقة كاملة —
// الالتزام/التراجع الفعلي بمستوى محرّك Mongo نفسه خارج نطاق اختبار وحدة لمنطق تطبيقي
//
// 🐛 jest.useFakeTimers() قبل require('../giftController') — الملف يحمّل setInterval حقيقي
// (تنظيف محدِّد معدّل الهدايا، كل 30 ثانية) غير مرتبط بهذا الاختبار عند الاستيراد نفسه؛
// نفس سبب pkScore.test.js/giftFloodBatching.test.js المجاورين بالضبط
jest.useFakeTimers();
jest.mock('../../utils/botMessenger', () => ({ sendBotMessage: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../fanClubController', () => ({ awardFanPoints: jest.fn() }));

const mongoose = require('mongoose');
const User = require('../../models/User');
const Gift = require('../../models/Gift');
const GiftLog = require('../../models/GiftLog');
const GiftComboTx = require('../../models/GiftComboTx');
const VoiceRoom = require('../../models/VoiceRoom');
const { reserveGiftCombo, settleGiftComboClaim } = require('../giftController');

// ✅ غلاف "ثنائي الاستخدام" (Promise + سلسلة استعلام) — نفس شكل ما يُرجعه Mongoose فعلياً:
// Model.findById(x).session(s) أو .select(f).session(s) — كلاهما يُستدعى على القيمة المُرجعة
// قبل انتظارها، فتبقى سلسلة الاستدعاء تعمل بصرف النظر عن الترتيب دون الحاجة لقاعدة حقيقية
function chainable(value) {
    const p = Promise.resolve(value);
    p.session = () => p;
    p.select = () => p;
    p.lean = () => p;
    return p;
}

function cloneDb(db) {
    return {
        users: new Map([...db.users].map(([k, v]) => [k, { ...v }])),
        gifts: new Map([...db.gifts].map(([k, v]) => [k, { ...v }])),
        rooms: new Map([...db.rooms].map(([k, v]) => [k, { ...v }])),
        giftLogs: [...db.giftLogs],
        comboTx: new Map([...db.comboTx].map(([k, v]) => [k, { ...v }]))
    };
}

// ✅ محاكاة session.withTransaction — طلب صريح: يجب أن تحاكي التراجع (rollback) الحقيقي، لا
// فقط الالتزام. بلا هذا، فشل reserveGiftCombo بعد نجاح حجز GiftComboTx (مثال: رصيد غير كافٍ)
// كان سيُبقي الحجز "شبحياً" بمحاكاتنا رغم أن معاملة Mongo الحقيقية كانت ستُسقطه معه بالكامل —
// بالضبط ما تثبته reserveGiftCombo/settleGiftComboClaim أنفسهما (التعليق أعلاهما بـ
// giftController.js). dbRef اختيارية: التسجيلات المباشرة لـreserveGiftCombo (بلا
// mongoose.startSession حقيقي بالاختبار) لا تحتاج محاكاة تراجع — السلوك الذري الحقيقي
// (findOneAndUpdate الشرطي) يمنع أي كتابة جزئية أصلاً بلا حاجة لـsnapshot/restore هنا
function makeFakeSession(dbRef) {
    return {
        withTransaction: async (fn) => {
            const snapshot = dbRef ? cloneDb(dbRef) : null;
            try {
                await fn();
            } catch (error) {
                if (dbRef && snapshot) Object.assign(dbRef, snapshot);
                throw error;
            }
        },
        endSession: async () => {}
    };
}

function makeDb() {
    return { users: new Map(), gifts: new Map(), rooms: new Map(), giftLogs: [], comboTx: new Map() };
}

function seedUser(db, overrides) {
    const user = {
        _id: 'u_default', coins: 0, blockedUsers: [], isBot: false,
        username: 'User', profileImage: '', socketId: null, level: 1, experience: 0,
        ...overrides
    };
    db.users.set(user._id, user);
    return user;
}

function seedGift(db, overrides) {
    const gift = {
        _id: 'g_default', name: 'هدية', imageUrl: 'x.png', price: 100,
        discountedPrice: null, isActive: true, animation: null, icon: '🎁',
        ...overrides
    };
    db.gifts.set(gift._id, gift);
    return gift;
}

function seedRoom(db, roomId, seatedUserIds) {
    const room = { _id: roomId, seats: seatedUserIds.map((uid, i) => ({ seatNumber: i + 1, user: uid })) };
    db.rooms.set(roomId, room);
    return room;
}

// 🛡️ طلب صريح بمراجعة PR #106: محاكاة بسيطة لشكل io الذي يحتاجه getConnectedRoomUserIds —
// فقط io.sockets.adapter.rooms (قناة room-chat-<roomId> ← مجموعة socketId) وio.sockets.sockets
// (socketId ← {user:{id}})، بلا أي محرّك Socket.IO حقيقي. connections: [{roomId, userId, socketId}]
function makeFakeIo(connections = []) {
    const rooms = new Map();
    const sockets = new Map();
    connections.forEach(({ roomId, userId, socketId }) => {
        const channel = `room-chat-${roomId}`;
        if (!rooms.has(channel)) rooms.set(channel, new Set());
        rooms.get(channel).add(socketId);
        sockets.set(socketId, { user: { id: userId } });
    });
    return { sockets: { adapter: { rooms }, sockets } };
}

// ✅ يُركِّب كل محاكاة النماذج فوق db مشتركة واحدة — كل استدعاء جديد يُعيد تثبيت نفس المنطق
// بنفس db (حالة مستمرة عبر استدعاءات متعدّدة بنفس الاختبار، كاختباري "دفعتان متتاليتان")
function wireMocks(db) {
    jest.spyOn(User, 'findById').mockImplementation((id) => chainable(db.users.get(String(id)) || null));
    jest.spyOn(User, 'find').mockImplementation((filter) => {
        const ids = (filter && filter._id && filter._id.$in) || [];
        return chainable(ids.map(id => db.users.get(String(id))).filter(Boolean));
    });
    jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return Promise.resolve(null);
        if (filter.coins && typeof filter.coins.$gte === 'number' && row.coins < filter.coins.$gte) {
            return Promise.resolve(null); // ✅ الشرط فشل — لا أي كتابة إطلاقاً (نفس الذرّية الحقيقية)
        }
        if (update.$inc && typeof update.$inc.coins === 'number') row.coins += update.$inc.coins;
        return Promise.resolve({ ...row });
    });
    jest.spyOn(Gift, 'findById').mockImplementation((id) => chainable(db.gifts.get(String(id)) || null));
    jest.spyOn(GiftLog, 'insertMany').mockImplementation((docs) => {
        db.giftLogs.push(...docs);
        return Promise.resolve(docs);
    });
    jest.spyOn(VoiceRoom, 'findOne').mockImplementation((filter) => chainable(db.rooms.get(String(filter._id)) || null));
    jest.spyOn(GiftComboTx, 'create').mockImplementation(async (docsArray) => {
        const doc = docsArray[0];
        if (db.comboTx.has(doc.key)) {
            const err = new Error('E11000 duplicate key error'); err.code = 11000; throw err;
        }
        const stored = {
            ...doc, balanceAfter: 0,
            save: async function () { db.comboTx.set(doc.key, { balanceAfter: this.balanceAfter }); }
        };
        db.comboTx.set(doc.key, { balanceAfter: 0 }); // ✅ حجز فوري — يمنع أي إدراج موازٍ لاحق بنفس المفتاح
        return [stored];
    });
    jest.spyOn(GiftComboTx, 'findOne').mockImplementation((filter) => chainable(db.comboTx.get(filter.key) || null));
    jest.spyOn(mongoose, 'startSession').mockImplementation(async () => makeFakeSession(db));
}

describe('reserveGiftCombo — النواة المعاملاتية', () => {
    afterEach(() => jest.restoreAllMocks());

    test('خصم متعدد المستلمين: التكلفة الكلية = السعر × الضغطات × الكمية × عدد المستلمين بالضبط', async () => {
        const db = makeDb();
        const sender = seedUser(db, { _id: 's1', coins: 1000000 });
        seedGift(db, { _id: 'g1', price: 100 });
        const recipientIds = ['r1', 'r2', 'r3', 'r4', 'r5'];
        recipientIds.forEach(id => seedUser(db, { _id: id }));
        wireMocks(db);

        const session = makeFakeSession();
        const result = await reserveGiftCombo({
            session, senderId: 's1', giftId: 'g1', quantity: 66, taps: 4, recipientIds, roomId: null
        });

        const expectedTotalCost = 100 * 4 * 66 * recipientIds.length; // price × taps × quantity × recipients.length
        expect(result.totalCost).toBe(expectedTotalCost);
        expect(result.validReceivers).toHaveLength(5);
        expect(sender.coins).toBe(1000000 - expectedTotalCost); // ✅ الخصم الحقيقي بقاعدة البيانات المحاكاة
        expect(result.sender.coins).toBe(sender.coins);
    });

    test('recipientIds تُقبَل فقط كمقاعد مشغولة فعلياً بالغرفة — غير الجالسين يُستبعَدون بصمت', async () => {
        const db = makeDb();
        const roomId = new mongoose.Types.ObjectId().toString();
        seedUser(db, { _id: 's1', coins: 1000000 });
        seedGift(db, { _id: 'g1', price: 50 });
        ['seated1', 'seated2'].forEach(id => seedUser(db, { _id: id }));
        seedUser(db, { _id: 'notSeated' }); // ✅ مستخدم حقيقي لكن ليس بهذي الغرفة
        seedRoom(db, roomId, ['seated1', 'seated2']); // المقعدان المشغولان فعلياً فقط
        wireMocks(db);

        const session = makeFakeSession();
        const result = await reserveGiftCombo({
            session, senderId: 's1', giftId: 'g1', quantity: 1, taps: 1,
            recipientIds: ['seated1', 'seated2', 'notSeated'], roomId
        });

        expect(result.validReceivers.map(r => r._id).sort()).toEqual(['seated1', 'seated2']);
        expect(result.totalCost).toBe(50 * 2); // فقط المقعدان الحقيقيان، لا الثلاثة
    });

    test('roomId غير موجود/وهمي يُرفَض صراحة (NO_ROOM) — لا يُعامَل كـ"بلا غرفة" لتفادي فحص المقاعد', async () => {
        const db = makeDb();
        seedUser(db, { _id: 's1', coins: 1000000 });
        seedGift(db, { _id: 'g1', price: 50 });
        seedUser(db, { _id: 'r1' });
        wireMocks(db);

        const session = makeFakeSession();
        await expect(reserveGiftCombo({
            session, senderId: 's1', giftId: 'g1', quantity: 1, taps: 1,
            recipientIds: ['r1'], roomId: new mongoose.Types.ObjectId().toString()
        })).rejects.toMatchObject({ code: 'NO_ROOM' });
    });

    test('مستلم متصل بقناة الغرفة (مستمع لم يجلس على مقعد) يُقبَل أيضاً كمستلم صالح — لا الجالسين فقط', async () => {
        const db = makeDb();
        const sender = seedUser(db, { _id: 's1', coins: 1000000 });
        seedGift(db, { _id: 'g1', price: 50 });
        const roomId = new mongoose.Types.ObjectId().toString();
        seedUser(db, { _id: 'seated1' });
        seedUser(db, { _id: 'listener1' }); // ✅ لم يجلس على مقعد — فقط متصل بقناة دردشة الغرفة
        seedRoom(db, roomId, ['seated1']);
        wireMocks(db);
        const io = makeFakeIo([{ roomId, userId: 'listener1', socketId: 'sock-listener1' }]);

        const session = makeFakeSession();
        const result = await reserveGiftCombo({
            session, senderId: 's1', giftId: 'g1', quantity: 1, taps: 1,
            recipientIds: ['seated1', 'listener1'], roomId, io
        });

        expect(result.validReceivers.map(r => r._id).sort()).toEqual(['listener1', 'seated1']);
        expect(result.totalCost).toBe(50 * 2);
        expect(sender.coins).toBe(1000000 - 50 * 2);
    });

    test('مستخدم خارج الغرفة كلياً (لا جالس ولا متصل بقناتها) يُرفَض — بلا أي خصم', async () => {
        const db = makeDb();
        const sender = seedUser(db, { _id: 's1', coins: 1000000 });
        seedGift(db, { _id: 'g1', price: 50 });
        const roomId = new mongoose.Types.ObjectId().toString();
        seedUser(db, { _id: 'seated1' });
        seedUser(db, { _id: 'outsider' }); // ✅ مستخدم حقيقي، لكن ليس جالساً ولا متصلاً بهذي الغرفة
        seedRoom(db, roomId, ['seated1']);
        wireMocks(db);
        // io بلا أي اتصال لـoutsider بقناة هذي الغرفة إطلاقاً
        const io = makeFakeIo([{ roomId, userId: 'someoneElse', socketId: 'sock-other' }]);

        const session = makeFakeSession();
        await expect(reserveGiftCombo({
            session, senderId: 's1', giftId: 'g1', quantity: 1, taps: 1,
            recipientIds: ['outsider'], roomId, io
        })).rejects.toMatchObject({ code: 'NO_RECIPIENTS' });

        expect(sender.coins).toBe(1000000); // ✅ بلا أي خصم
        expect(db.giftLogs).toHaveLength(0);
    });

    test('رصيد غير كافٍ: لا خصم جزئي إطلاقاً — رصيد المُرسِل يبقى بلا أي تغيير، والخطأ يحمل balance/needed الصحيحين', async () => {
        const db = makeDb();
        const sender = seedUser(db, { _id: 's1', coins: 500 }); // لا يكفي
        seedGift(db, { _id: 'g1', price: 100 });
        const recipientIds = ['r1', 'r2', 'r3'];
        recipientIds.forEach(id => seedUser(db, { _id: id }));
        wireMocks(db);

        const session = makeFakeSession();
        const expectedCost = 100 * 1 * 10 * recipientIds.length; // 100×1×10×3 = 3000 > 500

        await expect(reserveGiftCombo({
            session, senderId: 's1', giftId: 'g1', quantity: 10, taps: 1, recipientIds, roomId: null
        })).rejects.toMatchObject({ code: 'INSUFFICIENT', balance: 500, needed: expectedCost });

        expect(sender.coins).toBe(500); // ✅ بلا أي خصم جزئي — الرصيد الأصلي تماماً كما كان
        expect(db.giftLogs).toHaveLength(0); // ✅ ولا أي سجلّ هدية كُتب رغم الفشل
    });
});

describe('settleGiftComboClaim — idempotency عبر GiftComboTx بمعاملة واحدة', () => {
    afterEach(() => jest.restoreAllMocks());

    test('seq مكرّر (نفس comboId+seq بالضبط) يُتجاهَل: لا خصم ثانٍ، نفس balanceAfter المخزَّن يُعاد', async () => {
        const db = makeDb();
        const sender = seedUser(db, { _id: 's1', coins: 10000 });
        seedGift(db, { _id: 'g1', price: 100 });
        seedUser(db, { _id: 'r1' });
        wireMocks(db);

        const args = {
            key: 's1:combo-abc:1', senderId: 's1', comboId: 'combo-abc', seq: 1,
            giftId: 'g1', quantity: 1, taps: 1, recipientIds: ['r1'], roomId: null
        };

        const first = await settleGiftComboClaim(args);
        expect(first.duplicate).toBe(false);
        expect(sender.coins).toBe(10000 - 100); // ✅ الخصم الحقيقي الوحيد حدث هنا

        // ✅ إعادة إرسال نفس الرسالة بالضبط (نفس comboId+seq) — محاكاة فقدان ack بعد نجاح فعلي
        const second = await settleGiftComboClaim(args);
        expect(second.duplicate).toBe(true);
        expect(second.balanceAfter).toBe(first.reserved.sender.coins); // نفس القيمة المخزَّنة، لا إعادة حساب

        expect(sender.coins).toBe(10000 - 100); // ✅ لم يتغيّر إطلاقاً بالمحاولة الثانية — لا خصم مزدوج
        expect(db.giftLogs).toHaveLength(1); // ✅ سجلّ هدية واحد فقط، لا سجلّان
    });

    test('seq مختلف بنفس comboId يُعامَل كدفعة جديدة مستقلة تماماً (لا يُعتبَر تكراراً)', async () => {
        const db = makeDb();
        const sender = seedUser(db, { _id: 's1', coins: 10000 });
        seedGift(db, { _id: 'g1', price: 100 });
        seedUser(db, { _id: 'r1' });
        wireMocks(db);

        const first = await settleGiftComboClaim({
            key: 's1:combo-xyz:1', senderId: 's1', comboId: 'combo-xyz', seq: 1,
            giftId: 'g1', quantity: 1, taps: 1, recipientIds: ['r1'], roomId: null
        });
        const second = await settleGiftComboClaim({
            key: 's1:combo-xyz:2', senderId: 's1', comboId: 'combo-xyz', seq: 2,
            giftId: 'g1', quantity: 1, taps: 1, recipientIds: ['r1'], roomId: null
        });

        expect(first.duplicate).toBe(false);
        expect(second.duplicate).toBe(false);
        expect(sender.coins).toBe(10000 - 100 - 100); // ✅ خُصمت مرتين فعلاً — دفعتان حقيقيتان مختلفتان
    });

    test('رصيد غير كافٍ أثناء الحجز: حجز GiftComboTx نفسه يُسقَط أيضاً (لا يبقى "شبحياً") — إعادة المحاولة بنفس seq لاحقاً (بعد شحن الرصيد) ممكنة', async () => {
        const db = makeDb();
        seedUser(db, { _id: 's1', coins: 50 });
        seedGift(db, { _id: 'g1', price: 100 });
        seedUser(db, { _id: 'r1' });
        wireMocks(db);

        const args = {
            key: 's1:combo-poor:1', senderId: 's1', comboId: 'combo-poor', seq: 1,
            giftId: 'g1', quantity: 1, taps: 1, recipientIds: ['r1'], roomId: null
        };

        await expect(settleGiftComboClaim(args)).rejects.toMatchObject({ code: 'INSUFFICIENT' });
        expect(db.users.get('s1').coins).toBe(50); // ✅ بلا خصم
        expect(db.comboTx.has('s1:combo-poor:1')).toBe(false); // ✅ الحجز الفاشل أُسقِط بالكامل — لا أثر شبحي له

        // ✅ يشحن رصيده (مباشرة بـdb — قد تُستبدَل مراجع الكائنات بتراجع المعاملة أعلاه) ثم
        // يعيد نفس seq بالضبط — لأن الحجز الفاشل لم يُثبَّت، هذا ليس "تكراراً" حقيقياً
        db.users.get('s1').coins = 1000;
        const retry = await settleGiftComboClaim(args);
        expect(retry.duplicate).toBe(false);
        expect(db.users.get('s1').coins).toBe(1000 - 100);
    });
});
