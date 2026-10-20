// ✅ مُستخرَجة من server.js لتكون قابلة للاختبار مباشرة (راجع
// __tests__/trustProxy.security.test.js) — نفس منطق إعداد trust proxy بالضبط، بلا تكرار.
// راجع التعليق الكامل بـserver.js (مراجعة أمنية — redteam-audit-1، البند #4) لسبب التحويل من
// قيمة ثابتة (1) لمتغيّر بيئة صريح يفتَرِض "لا خادم وكيل" افتراضياً
//
// 🛡️ تصحيح لاحق (مراجعة PR #111 — البند #5، BLOCKER حقيقي رصده المُراجِع): الإصلاح الأصلي
// جعل false الافتراضي دوماً بلا TRUST_PROXY صريح — لكن الإنتاج الفعلي يعمل على Railway خلف
// وكيلها الحقيقي (edge proxy) دوماً. false هناك يعني req.ip = عنوان Railway الداخلي نفسه
// لكل المستخدمين جميعاً بلا استثناء — فكل محددات المعدل المفاتيحها req.ip (العام/الدخول/
// التسجيل) تتقاسم دلواً واحداً فعلياً: محاولات دخول فاشلة من مستخدم واحد تُقفِل الموقع كاملاً
// لكل المستخدمين بضع دقائق فقط. الحل: افتراض ذكي حسب بيئة التشغيل الفعلية بدل قيمة ثابتة —
// TRUST_PROXY صريح (كما كان) أولاً، ثم اكتشاف Railway تلقائياً (RAILWAY_ENVIRONMENT/
// RAILWAY_PROJECT_ID مُضبوطتان تلقائياً بكل بيئة Railway حقيقية) فـ1 (وكيل حقيقي واحد يُعيد
// كتابة X-Forwarded-For بنفسه فعلياً، فالقفزة الأولى موثوقة بدقّة)، وإلا false كالسابق (لا خادم
// وكيل افتراضياً خارج Railway — الاتصال المباشر محصّن ضد التزوير)
function computeTrustProxySetting(envValue) {
    if (envValue === undefined || envValue === '') return false;
    if (envValue === 'true') return true;
    if (envValue === 'false') return false;
    if (!isNaN(Number(envValue))) return Number(envValue);
    return envValue; // عنوان/نطاق محدَّد — راجع توثيق Express لـtrust proxy
}

function isRailwayEnvironment(env = process.env) {
    return !!(env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID);
}

// ✅ نقطة الدخول الفعلية التي يستخدمها server.js — تجمع: صراحة TRUST_PROXY > اكتشاف Railway
// التلقائي > false الآمن افتراضياً. مُصمَّمة لتأخذ env كاملاً (لا envValue واحدة فقط) لتبقى
// قابلة للاختبار بسهولة لكل تركيبة بيئة محتملة
function resolveTrustProxySetting(env = process.env) {
    if (env.TRUST_PROXY !== undefined && env.TRUST_PROXY !== '') {
        return computeTrustProxySetting(env.TRUST_PROXY);
    }
    if (isRailwayEnvironment(env)) return 1;
    return false;
}

// ✅ لا تعتمد Socket.IO/Engine.IO على إعداد trust proxy بتطبيق Express إطلاقاً —
// socket.handshake.address مصدرها req.connection.remoteAddress الخام دوماً (راجع
// engine.io/build/socket.js) بصرف النظر عن app.set('trust proxy', ...). أي كود سوكيت
// يحتاج عنوان العميل الحقيقي (حظر IP، سجلّ تدقيق) يجب أن يستخدم هذي الدالة بدل
// socket.handshake.address مباشرة متى ما كان التطبيق خلف وكيل حقيقي (نفس منطق resolveTrustProxySetting)
function getRealClientIp(headers, handshakeAddress, trustProxySetting) {
    if (!trustProxySetting) return handshakeAddress;
    const hops = typeof trustProxySetting === 'number' ? trustProxySetting : 1;
    const xff = headers && headers['x-forwarded-for'];
    if (!xff) return handshakeAddress;
    const chain = xff.split(',').map(s => s.trim()).filter(Boolean);
    if (chain.length === 0) return handshakeAddress;
    const idx = Math.max(0, chain.length - hops);
    return chain[idx];
}

module.exports = { computeTrustProxySetting, isRailwayEnvironment, resolveTrustProxySetting, getRealClientIp };
