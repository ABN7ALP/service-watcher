// ملف: socketService.authSecurity.test.js
// 🛡️ مراجعة أمنية (redteam-audit-1 — البند #1): verifySocketToken كانت تتحقق فقط من توقيع
// التوكن ووجود المستخدم — بخلاف authMiddleware (الحارس الموازي لكل طلب HTTP) الذي يتحقق أيضاً
// من isBanned/banExpires وchangedPasswordAfter. النتيجة المُثبَتة فعلياً (راجع تقرير الجولة
// الأولى): توكن صالح لمستخدم محظور، أو توكن صادر قبل تغيير كلمة المرور، يُقبَل بمسار السوكيت
// رغم رفضه الصحيح بمسار HTTP — فيحتفظ المستخدم المحظور/المُبطَل بكل وظائف السوكيت الحيّة
// (بما فيها gift:combo — نقل أموال). يختبر هذا الملف verifySocketToken مباشرة (مُصدَّرة فقط
// لهذا الاختبار — راجع تعليقها بأسفل socketService.js) بمحاكاة socket/next بسيطة، بلا حاجة
// لاتصال Socket.IO حقيقي، إثباتاً أن الفحوصات الآن تطابق authMiddleware تماماً
jest.useFakeTimers();

const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { verifySocketToken } = require('../socketService');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-socket-auth';

function signToken(userId, iat) {
    const payload = iat ? { id: userId, iat } : { id: userId };
    return jwt.sign(payload, process.env.JWT_SECRET, iat ? {} : {});
}

function makeFakeUser(overrides) {
    const user = {
        _id: 'u1', isBanned: false, banExpires: null, passwordChangedAt: null, socketId: null,
        save: jest.fn().mockResolvedValue(undefined),
        changedPasswordAfter(jwtIat) {
            if (!this.passwordChangedAt) return false;
            const changedTimestamp = Math.floor(this.passwordChangedAt.getTime() / 1000);
            return jwtIat < changedTimestamp;
        },
        ...overrides
    };
    return user;
}

function makeSocket(token) {
    return { handshake: { auth: { token } } };
}

describe('verifySocketToken — نفس إنفاذ authMiddleware بالضبط (حظر + إبطال كلمة المرور)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('توكن صالح لمستخدم عادي غير محظور: يُقبَل (next بلا خطأ) ويُعيَّن socket.user', async () => {
        const user = makeFakeUser({ _id: 'u1' });
        jest.spyOn(User, 'findById').mockReturnValue({ select: () => Promise.resolve(user) });

        const token = signToken('u1');
        const socket = makeSocket(token);
        const next = jest.fn();
        await verifySocketToken(socket, next);

        expect(next).toHaveBeenCalledWith();
        expect(socket.user).toBe(user);
    });

    test('مستخدم محظور بشكل دائم: يُرفَض — نفس سلوك authMiddleware (403 بـHTTP) بدل القبول الذي كان يحدث سابقاً', async () => {
        const user = makeFakeUser({ _id: 'u1', isBanned: true, banExpires: null });
        jest.spyOn(User, 'findById').mockReturnValue({ select: () => Promise.resolve(user) });

        const token = signToken('u1');
        const socket = makeSocket(token);
        const next = jest.fn();
        await verifySocketToken(socket, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(socket.user).toBeUndefined();
    });

    test('حظر مؤقت انتهت مدته: يُفَكّ الحظر تلقائياً ويُقبَل — نفس سلوك authMiddleware بالضبط', async () => {
        const pastExpiry = new Date(Date.now() - 1000);
        const user = makeFakeUser({ _id: 'u1', isBanned: true, banExpires: pastExpiry });
        jest.spyOn(User, 'findById').mockReturnValue({ select: () => Promise.resolve(user) });

        const token = signToken('u1');
        const socket = makeSocket(token);
        const next = jest.fn();
        await verifySocketToken(socket, next);

        expect(next).toHaveBeenCalledWith();
        expect(user.isBanned).toBe(false);
        expect(user.save).toHaveBeenCalled();
    });

    test('توكن صادر قبل تغيير كلمة المرور: يُرفَض — يقطع جلسة أي مهاجم يحمل توكناً مسروقاً فوراً بعد تغيير الضحية كلمة مرورها، بالضبط كما يحدث بمسار HTTP', async () => {
        const now = Math.floor(Date.now() / 1000);
        const tokenIssuedAt = now - 100; // صدر قبل 100 ثانية
        const passwordChangedAt = new Date((now - 10) * 1000); // تغيّرت كلمة المرور قبل 10 ثوانٍ فقط (بعد صدور التوكن)
        const user = makeFakeUser({ _id: 'u1', passwordChangedAt });
        jest.spyOn(User, 'findById').mockReturnValue({ select: () => Promise.resolve(user) });

        const token = signToken('u1', tokenIssuedAt);
        const socket = makeSocket(token);
        const next = jest.fn();
        await verifySocketToken(socket, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(socket.user).toBeUndefined();
    });

    test('توكن صادر بعد تغيير كلمة المرور (تسجيل دخول جديد شرعي): يُقبَل بلا مشاكل', async () => {
        const now = Math.floor(Date.now() / 1000);
        const passwordChangedAt = new Date((now - 100) * 1000); // تغيّرت كلمة المرور قبل 100 ثانية
        const tokenIssuedAt = now - 10; // التوكن صدر بعدها (تسجيل دخول جديد)
        const user = makeFakeUser({ _id: 'u1', passwordChangedAt });
        jest.spyOn(User, 'findById').mockReturnValue({ select: () => Promise.resolve(user) });

        const token = signToken('u1', tokenIssuedAt);
        const socket = makeSocket(token);
        const next = jest.fn();
        await verifySocketToken(socket, next);

        expect(next).toHaveBeenCalledWith();
        expect(socket.user).toBe(user);
    });

    test('مستخدم غير موجود (حُذف الحساب): يُرفَض', async () => {
        jest.spyOn(User, 'findById').mockReturnValue({ select: () => Promise.resolve(null) });

        const token = signToken('deleted-user');
        const socket = makeSocket(token);
        const next = jest.fn();
        await verifySocketToken(socket, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    test('بلا توكن إطلاقاً: يُرفَض فوراً بلا أي استعلام قاعدة بيانات', async () => {
        const findByIdSpy = jest.spyOn(User, 'findById');
        const socket = makeSocket(undefined);
        const next = jest.fn();
        await verifySocketToken(socket, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(findByIdSpy).not.toHaveBeenCalled();
    });

    test('توكن موقَّع بمفتاح خاطئ (مزوَّر): يُرفَض', async () => {
        const token = jwt.sign({ id: 'u1' }, 'wrong-secret-entirely');
        const socket = makeSocket(token);
        const next = jest.fn();
        await verifySocketToken(socket, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
});
