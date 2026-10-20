// ملف: socketService.recoveryAuth.test.js
// 🛡️ Hotfix (fix/socket-recovery-auth) — علّة إنتاج حقيقية من السجلّات:
// "TypeError: Cannot read properties of undefined (reading 'username') at socketService.js:1107"
//
// السبب الجذري: connectionStateRecovery (ميزة Socket.IO 4.7) تستخدم skipMiddlewares:true
// افتراضياً — أي اتصال "مُستعاد" (recovered) يتجاوز io.use(verifySocketToken) بالكامل، فيبقى
// socket.user غير معرَّف. أول سطر بمعالج 'connection' كان يقرأ socket.user.username فيرمي
// فوراً — فلا يُسجَّل أي مستمع حدث إطلاقاً لهذا السوكيت (الهدايا والدردشة تفشل بصمت)، ويتجاوز
// الاسترداد أيضاً فحص الحظر/إبطال كلمة المرور (البند الأمني #1 بـredteam-audit-1).
//
// الإصلاح الثلاثي:
// 1) skipMiddlewares:false صراحةً — كل اتصال (بما فيها المُستعادة) يُشغِّل verifySocketToken.
// 2) دفاع بالعمق: أول سطر بمعالج 'connection' يقطع الاتصال فوراً لو socket.user غير معرَّف.
// 3) كل مستمعي الأحداث يُسجَّلون بالتزامن أولاً؛ تحديث socketId/الرسائل المعلّقة أصبح
//    fire-and-forget بعدها — يمنع فقدان حدث يُرسَل فوراً بعد الاتصال.
jest.useFakeTimers();

const http = require('http');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const VoiceRoom = require('../../models/VoiceRoom');
const PrivateMessage = require('../../models/PrivateMessage');
const initializeSocket = require('../socketService');
const { verifySocketToken } = initializeSocket;

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-socket-recovery-auth';

describe('مستخدم محظور لا يمكنه استعادة جلسة (البند 1 — نتيجة مباشرة لـskipMiddlewares:false)', () => {
    afterEach(() => jest.restoreAllMocks());

    // ✅ بما أن skipMiddlewares:false يُجبِر Socket.IO على تشغيل verifySocketToken لكل اتصال
    // بما فيها "المُستعادة" (recovered) بعد انقطاع — محاكاة اتصال مُستعاد من منظور التحقق هي
    // بالضبط استدعاء verifySocketToken بنفس توكن الجلسة القديمة؛ لو كان المستخدم مُحظوراً الآن
    // (حُظِر أثناء انقطاعه)، يجب أن يُرفَض بالضبط كما يُرفَض اتصال عادي جديد — لا معاملة خاصة
    // للاتصال "المُستعاد" إطلاقاً بعد هذا الإصلاح
    test('توكن جلسة قديمة لمستخدم مُحظور الآن: verifySocketToken ترفضها — نفس سلوك اتصال عادي جديد بالضبط', async () => {
        const bannedUser = {
            _id: 'u1', isBanned: true, banExpires: null, passwordChangedAt: null, socketId: null,
            save: jest.fn().mockResolvedValue(undefined),
            changedPasswordAfter() { return false; }
        };
        jest.spyOn(User, 'findById').mockReturnValue({ select: () => Promise.resolve(bannedUser) });

        const oldSessionToken = jwt.sign({ id: 'u1' }, process.env.JWT_SECRET);
        const socket = { handshake: { auth: { token: oldSessionToken } } };
        const next = jest.fn();

        await verifySocketToken(socket, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error)); // ✅ الاتصال/الاستعادة تُرفَض
        expect(socket.user).toBeUndefined();
    });
});

describe('connectionStateRecovery — skipMiddlewares:false (جوهر الإصلاح، البند 1)', () => {
    test('new Server(...) الحقيقي يحمل connectionStateRecovery.skipMiddlewares = false فعلياً', () => {
        const server = http.createServer();
        const io = initializeSocket(server);
        // ✅ فحص تهيئة حقيقي على محرّك Socket.IO نفسه (لا توثيق مصدر فقط) — هذا الإعداد بالذات
        // هو ما يُجبِر Socket.IO على تشغيل io.use(verifySocketToken) لكل اتصال مُستعاد أيضاً،
        // بدل تجاوزه كما كان يحدث بالافتراضي الضمني (true) الذي سبّب علّة الإنتاج
        expect(io.opts.connectionStateRecovery.skipMiddlewares).toBe(false);
        expect(io.opts.connectionStateRecovery.maxDisconnectionDuration).toBe(2 * 60 * 1000);
        io.close();
    });
});

describe('معالج connection — تسجيل كل المستمعين بالتزامن قبل أي await (البند 3، يمنع فقدان حدث فوري)', () => {
    let server, io;

    beforeAll(() => {
        jest.spyOn(VoiceRoom, 'updateOne').mockResolvedValue({});
        jest.spyOn(PrivateMessage, 'find').mockResolvedValue([]);
        server = http.createServer();
        io = initializeSocket(server);
    });
    afterAll(() => { io.close(); jest.restoreAllMocks(); });

    function makeFakeSocket(overrides) {
        return {
            id: 'sock_test_1',
            user: { _id: 'u1', id: 'u1', username: 'tester', socketId: null },
            rooms: new Set(),
            join: jest.fn(),
            on: jest.fn(),
            emit: jest.fn(),
            to: jest.fn(() => ({ emit: jest.fn() })),
            ...overrides
        };
    }

    test('socket.on يُستدعى للمستمعين الأساسيين فوراً (متزامناً)، قبل أن يُحسَم أي استعلام قاعدة بيانات', () => {
        // ✅ استعلام معلَّق عمداً (لا يُحلّ إطلاقاً خلال هذا الاختبار) — يُحاكي بدقّة بطء شبكة/قاعدة
        // بيانات حقيقياً؛ لو كان تسجيل المستمعين لا يزال يعتمد على await لهذي الاستعلام (العلّة
        // القديمة)، socket.on لن يُستدعى إطلاقاً بنهاية هذا الاختبار المتزامن
        jest.spyOn(User, 'findByIdAndUpdate').mockImplementation(() => new Promise(() => {}));

        const handler = io.listeners('connection')[0];
        expect(typeof handler).toBe('function');

        const fakeSocket = makeFakeSocket();
        handler(fakeSocket); // ✅ استدعاء متزامن محض — لا await هنا بالاختبار نفسه

        const registeredEvents = fakeSocket.on.mock.calls.map(c => c[0]);
        // ✅ جوهر الإصلاح: رغم أن findByIdAndUpdate ما زالت معلّقة بلا حل أبداً، كل هذي
        // المستمعين مسجَّلون فعلياً بالفعل — لا نافذة فقدان حدث
        expect(registeredEvents).toContain('sendMessage');
        expect(registeredEvents).toContain('gift:combo');
        expect(registeredEvents).toContain('join-room-chat');
        expect(registeredEvents).toContain('disconnect');
        expect(registeredEvents.length).toBeGreaterThan(50); // عدد حقيقي كبير من المستمعين المسجَّلين فعلياً
    });

    test('حدث مُرسَل فوراً بعد الاتصال (محاكاة حرفية): يصل فعلياً لأن مستمعه مسجَّل قبل اكتمال أي استعلام', () => {
        jest.spyOn(User, 'findByIdAndUpdate').mockImplementation(() => new Promise(() => {}));

        const handler = io.listeners('connection')[0];
        const fakeSocket = makeFakeSocket({ id: 'sock_test_2' });
        handler(fakeSocket);

        // ✅ محاكاة العميل يرسل حدثاً "فوراً بعد الاتصال" — نجد المستمع الذي سجَّله الكود
        // الحقيقي لـ'typing-start' ونستدعيه مباشرة، تماماً كما يفعل Socket.IO عند استقبال الحدث
        const typingStartCall = fakeSocket.on.mock.calls.find(c => c[0] === 'typing-start');
        expect(typingStartCall).toBeDefined(); // ✅ المستمع موجود فعلاً وقت إرسال الحدث الفوري
        const listener = typingStartCall[1];
        expect(() => listener({ roomId: 'public' })).not.toThrow();
    });
});

describe('معالج connection — دفاع بالعمق ضد socket.user غير معرَّف (البند 2)', () => {
    let server, io;
    beforeAll(() => {
        server = http.createServer();
        io = initializeSocket(server);
    });
    afterAll(() => io.close());

    test('socket.user غير معرَّف (مثلاً انحدار مستقبلي يُعيد تجاوز verifySocketToken): يُقطَع الاتصال فوراً بلا رمي استثناء', () => {
        const handler = io.listeners('connection')[0];
        const fakeSocket = {
            id: 'sock_no_user',
            user: undefined,
            disconnect: jest.fn(),
            on: jest.fn(),
            join: jest.fn()
        };

        expect(() => handler(fakeSocket)).not.toThrow(); // ✅ لا TypeError كما حدث بالإنتاج
        expect(fakeSocket.disconnect).toHaveBeenCalledWith(true);
        expect(fakeSocket.on).not.toHaveBeenCalled(); // ✅ لا يُسجَّل أي مستمع لسوكيت غير مُصادَق عليه
    });
});
