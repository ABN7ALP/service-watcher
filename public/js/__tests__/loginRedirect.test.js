// ملف: loginRedirect.test.js
// 🛡️ مراجعة #151 (إعادة توجيه مفتوحة — open redirect): postLoginRedirect كان يُستخدَم كما هو
// بـwindow.location.href بلا أي تحقق — خادمنا يخدم index.html لأي مسار (app.get('*'))، فقيمة
// خبيثة مثل "//evil.com/x" كانت تُحفَظ وتُستخدَم بعد الدخول فعلياً فينتقل المتصفح لنطاق آخر
// (تصيّد). isSafeRedirectPath (login.js) هي نقطة التحقق الوحيدة — هذا الاختبار يُثبِت رفضها
// لكل حيلة إعادة توجيه معروفة، وقبولها فقط للمسارات السبعة الحقيقية (ROUTES بـapp.js)

// document/window لا توجد بـNode — login.js يستدعي document.addEventListener فوراً عند
// التحميل (تسجيل مستمع DOMContentLoaded عادي، لا ينفَّذ أبداً هنا)، فنموّه بأقل ما يكفي
global.document = { addEventListener: () => {} };
global.window = { location: { origin: 'https://example.com' } };

const { isSafeRedirectPath } = require('../login.js');

describe('isSafeRedirectPath — إعادة توجيه ما بعد الدخول', () => {
    test('يرفض روابط بروتوكول نسبي (//evil.com)', () => {
        expect(isSafeRedirectPath('//evil.com')).toBe(false);
        expect(isSafeRedirectPath('//evil.com/x')).toBe(false);
    });

    test('يرفض الشرطة المائلة العكسية (قد تُطبَّع لـ// ببعض المحلِّلات)', () => {
        expect(isSafeRedirectPath('/\\evil.com')).toBe(false);
        expect(isSafeRedirectPath('/\\\\evil.com')).toBe(false);
    });

    test('يرفض رابطاً مطلقاً كاملاً لنطاق آخر', () => {
        expect(isSafeRedirectPath('https://evil.com')).toBe(false);
        expect(isSafeRedirectPath('https://evil.com/u/123456789')).toBe(false);
        expect(isSafeRedirectPath('http://evil.com')).toBe(false);
    });

    test('يرفض مساراً لا يطابق أياً من المسارات السبعة الحقيقية', () => {
        expect(isSafeRedirectPath('/u/123')).toBe(false); // ناقص عن 9 أرقام customId
        expect(isSafeRedirectPath('/u/1234567890')).toBe(false); // أكثر من 9 أرقام
        expect(isSafeRedirectPath('/room/not-a-valid-id')).toBe(false);
        expect(isSafeRedirectPath('/some-other-page')).toBe(false);
        expect(isSafeRedirectPath('/admin')).toBe(false);
    });

    test('يرفض مدخلات غير نصية/فارغة', () => {
        expect(isSafeRedirectPath(null)).toBe(false);
        expect(isSafeRedirectPath(undefined)).toBe(false);
        expect(isSafeRedirectPath('')).toBe(false);
        expect(isSafeRedirectPath(123)).toBe(false);
    });

    test('يقبل المسارات السبعة الحقيقية فقط', () => {
        expect(isSafeRedirectPath('/')).toBe(true);
        expect(isSafeRedirectPath('/u/123456789')).toBe(true);
        expect(isSafeRedirectPath('/room/507f1f77bcf86cd799439011')).toBe(true);
        expect(isSafeRedirectPath('/settings')).toBe(true);
        expect(isSafeRedirectPath('/recharge')).toBe(true);
        expect(isSafeRedirectPath('/messages')).toBe(true);
        expect(isSafeRedirectPath('/rankings')).toBe(true);
    });
});
