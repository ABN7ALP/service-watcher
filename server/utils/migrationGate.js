// ملف: server/utils/migrationGate.js
// 🛡️ مراجعة ما قبل الدمج (6 عوائق قبل الدمج — PR #131) — عائق #1: كان server.listen() يُشغَّل
// بالتوازي مع runMigration() (إعادة تسمية العملة ×10) فعلياً — فيتداول المستخدمون فترة قصيرة
// بأرصدة مُضخَّمة ×10 فعلاً بينما أسعار الهدايا/الكتالوج لم تُضخَّم بعد (هدايا أرخص ×10
// فعلياً)، وGiftLogs تُنشَأ خلال تلك الفترة تُضخَّم مجدداً لاحقاً عند اكتمال الترحيل. الحل:
// علم جاهزية واحد يبقى false حتى تنتهي سلسلة الإقلاع الكاملة (migration + المهام الأخرى)،
// تتحقق منه middleware واحدة لكل طلب HTTP (503 فوري) وmiddleware واحدة لكل اتصال Socket.IO
// (رفض الاتصال فوراً) — وserver.js لا يستدعي server.listen() إطلاقاً إلا بعد ضبط هذا العلم
let ready = false;

const MAINTENANCE_MESSAGE = 'صيانة قصيرة، نعود خلال دقائق';
const MAINTENANCE_HTML = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>صيانة قصيرة</title></head>
<body style="font-family:sans-serif;text-align:center;padding:4rem 1rem">
<h1>🛠️ ${MAINTENANCE_MESSAGE}</h1>
</body></html>`;

function isReady() {
    return ready;
}

function markReady() {
    ready = true;
}

function maintenanceMiddleware(req, res, next) {
    if (ready) return next();
    const wantsHtml = req.accepts(['html', 'json']) === 'html';
    if (wantsHtml) {
        res.status(503).type('html').send(MAINTENANCE_HTML);
    } else {
        res.status(503).json({ status: 'fail', message: MAINTENANCE_MESSAGE });
    }
}

function socketGate(socket, next) {
    if (ready) return next();
    next(new Error(MAINTENANCE_MESSAGE));
}

module.exports = { isReady, markReady, maintenanceMiddleware, socketGate, MAINTENANCE_MESSAGE };
