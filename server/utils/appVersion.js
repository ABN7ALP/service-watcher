// ✅ feat/gift-display-engine (بند 5 — تخزين مؤقت طويل الأمد): معرّف نشرة واحد (commit hash)
// يُحقَن بوسوم style.css/browser-gate.js بـindex.html (راجع server.js) ويُمرَّر يدوياً من
// browser-gate.js لـgiftEngine.js/app.js — كي تُخدَّم جميعها Cache-Control: immutable لعام
// كامل بأمان؛ أي نشرة جديدة تغيّر هذا المعرّف فيصبح رابطاً جديداً كلياً، لا نسخة قديمة مخبّأة
// بالهاتف. Railway يضبط RAILWAY_GIT_COMMIT_SHA تلقائياً بكل نشرة حقيقية — git rev-parse احتياط
// محلي فقط، وطابع زمني الاحتياط الأخير (لا يمنع العمل، فقط يفقد مزية "لا إعادة تنزيل" بين
// إعادة تشغيل الخادم بلا نشرة حقيقية، وهي حالة تطوير محلي لا إنتاج)
const { execSync } = require('child_process');

function resolveAppVersion(env = process.env) {
    if (env.RAILWAY_GIT_COMMIT_SHA) return env.RAILWAY_GIT_COMMIT_SHA.slice(0, 12);
    if (env.APP_VERSION) return env.APP_VERSION;
    try {
        const sha = execSync('git rev-parse HEAD', { cwd: __dirname, timeout: 2000 }).toString().trim();
        if (sha) return sha.slice(0, 12);
    } catch (_) { /* لا git متاح (مثلاً داخل حاوية نشر بلا .git) — نسقط للطابع الزمني أدناه */ }
    return Date.now().toString(36);
}

module.exports = { resolveAppVersion };
