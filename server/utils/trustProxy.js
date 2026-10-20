// ✅ مُستخرَجة من server.js لتكون قابلة للاختبار مباشرة (راجع
// __tests__/trustProxy.security.test.js) — نفس منطق إعداد trust proxy بالضبط، بلا تكرار.
// راجع التعليق الكامل بـserver.js (مراجعة أمنية — redteam-audit-1، البند #4) لسبب التحويل من
// قيمة ثابتة (1) لمتغيّر بيئة صريح يفتَرِض "لا خادم وكيل" افتراضياً
function computeTrustProxySetting(envValue) {
    if (envValue === undefined || envValue === '') return false;
    if (envValue === 'true') return true;
    if (envValue === 'false') return false;
    if (!isNaN(Number(envValue))) return Number(envValue);
    return envValue; // عنوان/نطاق محدَّد — راجع توثيق Express لـtrust proxy
}

module.exports = { computeTrustProxySetting };
