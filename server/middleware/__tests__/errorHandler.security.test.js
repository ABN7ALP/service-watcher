// ملف: errorHandler.security.test.js
// 🛡️ مراجعة أمنية (redteam-audit-1 — البند #9، Medium): globalErrorHandler كان يُمرِّر
// err.message الحقيقية للعميل دوماً، بصرف النظر عن مصدرها. أُثبِت فعلياً تسرّب تفاصيل داخلية
// عبر next(error) بمسارات تفتقد try/catch محلياً، مثل:
//   POST /api/auth/login بـ{"email":{"$ne":null},"password":{"$ne":null}} → بعد تعرية
//   express-mongo-sanitize لمفاتيح $، يفشل Mongoose cast ويُعيد حرفياً:
//   "Cast to string failed for value \"{}\" (type Object) at path \"email\" for model \"User\""
// الإصلاح: رسالة err.message الحقيقية تُمرَّر فقط لخطأ مُعلَّم صراحةً status:'fail' (اتفاقية
// الرفض التشغيلي المقصود المستخدمة أصلاً بعشرات دوال هذا المشروع)؛ أي خطأ آخر يُعيد رسالة
// عربية عامة بكل البيئات
const setupErrorHandlers = require('../errorHandlers');

function buildApp(errToThrow) {
    const handlers = [];
    const app = {
        all: () => {},
        use: (fn) => handlers.push(fn)
    };
    setupErrorHandlers(app);
    const globalErrorHandler = handlers[0];
    return { globalErrorHandler };
}

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe('globalErrorHandler — لا تسريب لرسائل الأخطاء الداخلية الحقيقية (البند #9)', () => {
    const originalEnv = process.env.NODE_ENV;
    afterEach(() => { process.env.NODE_ENV = originalEnv; });

    test('خطأ غير تشغيلي (شكل CastError من Mongoose، status افتراضي "error"): رسالة عامة بالإنتاج', () => {
        process.env.NODE_ENV = 'production';
        const { globalErrorHandler } = buildApp();
        const err = new Error('Cast to string failed for value "{}" (type Object) at path "email" for model "User"');
        const res = mockRes();

        globalErrorHandler(err, {}, res, jest.fn());

        const body = res.json.mock.calls[0][0];
        expect(body.message).not.toContain('Cast to string');
        expect(body.message).not.toContain('model');
        expect(body.message).not.toContain('path');
    });

    test('خطأ غير تشغيلي أيضاً بوضع التطوير: الرسالة الرئيسية تبقى عامة (التفاصيل الكاملة بحقل error/stack المنفصل فقط)', () => {
        process.env.NODE_ENV = 'development';
        const { globalErrorHandler } = buildApp();
        const err = new Error('Illegal arguments: object, string');
        const res = mockRes();

        globalErrorHandler(err, {}, res, jest.fn());

        const body = res.json.mock.calls[0][0];
        expect(body.message).not.toContain('Illegal arguments');
        expect(body.error).toBeDefined(); // ✅ التفاصيل الكاملة ما زالت متاحة للمطوّر بحقل منفصل
    });

    test('خطأ تشغيلي صريح (status:"fail" — رفض مقصود، نفس اتفاقية هذا المشروع): رسالته الحقيقية تصل كما هي', () => {
        process.env.NODE_ENV = 'production';
        const { globalErrorHandler } = buildApp();
        const err = Object.assign(new Error('رصيدك غير كافٍ لإتمام العملية'), { status: 'fail', statusCode: 400 });
        const res = mockRes();

        globalErrorHandler(err, {}, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        const body = res.json.mock.calls[0][0];
        expect(body.message).toBe('رصيدك غير كافٍ لإتمام العملية');
    });

    test('مسار "غير موجود" (routeNotFoundHandler → status:"fail"): رسالته الوصفية تصل كما هي', () => {
        process.env.NODE_ENV = 'production';
        const handlers = [];
        const app = { all: (path, fn) => handlers.push(fn), use: (fn) => handlers.push(fn) };
        setupErrorHandlers(app);
        const [routeNotFoundHandler, globalErrorHandler] = handlers;

        const req = { originalUrl: '/api/does-not-exist' };
        const res = mockRes();
        let caughtErr = null;
        routeNotFoundHandler(req, res, (e) => { caughtErr = e; });
        globalErrorHandler(caughtErr, req, res, jest.fn());

        const body = res.json.mock.calls[0][0];
        expect(body.message).toContain('/api/does-not-exist');
    });
});
