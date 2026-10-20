// ملف: socketService.roomEventRateLimit.test.js
// 🛡️ مراجعة أمنية (redteam-audit-1 — البندان #7 و#8، High):
//
// البند #7: join-room-chat وget-room-viewers لم يكن عليهما أي محدِّد معدل إطلاقاً (بخلاف
// gift:combo). أُثبِت فعلياً: سوكيت واحد مُصادَق عليه أرسل 544.7 get-room-viewers/ثانية
// و491.0 join-room-chat/ثانية بلا أي رفض — get-room-viewers ينفّذ تجميعاً Mongo غير مُخزَّن
// وغير محدود سعره يتناسب مع عدد كل الغرف النشطة، وjoin-room-chat يبثّ لكل من بالغرفة (تضخيم
// يصيب سوكيتات أخرى). أُضيف isRoomEventRateLimited بنفس نمط isGiftComboRateLimited تماماً
// (10 طلبات/نافذة ثانيتين لكل مستخدم×حدث) ويُختبَر هنا مباشرة كدالة خالصة (مُصدَّرة فقط لهذا
// الاختبار — راجع تعليقها بـsocketService.js).
//
// البند #8: new Server(server,{...}) لم يكن يُحدِّد maxHttpBufferSize إطلاقاً — الافتراضي
// الضمني لمكتبة Socket.IO (1MB) كان الفعلي، بخلاف REST (express.json بحد 10kb صريح). أُثبِت
// فعلياً: سوكيت واحد أرسل ~126.3 ميجابايت/ثانية من حمولة مقبولة فعلياً. يختبر هذا الملف أن
// محرّك Socket.IO الحقيقي (io.engine، لا توثيق مصدر فقط) يحمل القيمة الصريحة 100KB فعلياً
// بعد استدعاء initializeSocket على خادم HTTP حقيقي (بلا أي اتصال عميل فعلي — فحص تهيئة فقط)
jest.useFakeTimers();

const http = require('http');
const socketService = require('../socketService');
const { isRoomEventRateLimited } = socketService;

describe('isRoomEventRateLimited — محدِّد معدل join-room-chat/get-room-viewers (البند #7)', () => {
    test('10 طلبات أولى بنافذة واحدة: غير محدودة؛ الطلب الحادي عشر: محدود', () => {
        const userId = `race-user-${Date.now()}-a`;
        for (let i = 0; i < 10; i++) {
            expect(isRoomEventRateLimited(userId, 'join-room-chat')).toBe(false);
        }
        expect(isRoomEventRateLimited(userId, 'join-room-chat')).toBe(true);
    });

    test('المفتاح مُركَّب (userId × eventName) — إغراق join-room-chat لا يُحجِّم get-room-viewers لنفس المستخدم', () => {
        const userId = `race-user-${Date.now()}-b`;
        for (let i = 0; i < 15; i++) isRoomEventRateLimited(userId, 'join-room-chat');
        // ✅ join-room-chat لهذا المستخدم محدود الآن بالتأكيد، لكن get-room-viewers (حدث مختلف) ليس له أي سجلّ سابق
        expect(isRoomEventRateLimited(userId, 'get-room-viewers')).toBe(false);
    });

    test('مستخدمان مختلفان بنفس الحدث: إغراق أحدهما لا يُحجِّم الآخر إطلاقاً', () => {
        const attacker = `race-user-${Date.now()}-attacker`;
        const victim = `race-user-${Date.now()}-victim`;
        for (let i = 0; i < 20; i++) isRoomEventRateLimited(attacker, 'get-room-viewers');
        expect(isRoomEventRateLimited(victim, 'get-room-viewers')).toBe(false);
    });
});

describe('Socket.IO maxHttpBufferSize — حد حمولة صريح 100KB (البند #8)', () => {
    let server;

    afterEach(async () => {
        if (server) await new Promise((resolve) => server.close(resolve));
    });

    test('io.engine.opts.maxHttpBufferSize = 100 * 1024 فعلياً على محرّك Socket.IO الحقيقي', () => {
        server = http.createServer();
        const io = socketService(server);
        expect(io.engine.opts.maxHttpBufferSize).toBe(100 * 1024);
        io.close();
    });
});
