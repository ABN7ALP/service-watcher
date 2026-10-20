// ملف: trustProxy.security.test.js
// 🛡️ مراجعة أمنية (redteam-audit-1 — البند #4، Critical): app.set('trust proxy', 1) كانت ثابتة
// دوماً — تجعل Express يثق بآخر قيمة X-Forwarded-For كعنوان العميل "الحقيقي" حتى بلا أي خادم
// وكيل حقيقي أمامها يُعيد كتابة هذا الرأس فعلياً. أُثبِت فعلياً: 520 طلباً بقيمة
// X-Forwarded-For مختلفة كل مرة لم تُصطَد بمحدد المعدل العام/تسجيل الدخول/التسجيل إطلاقاً
// (كلها مفاتيحها من req.ip) — تجاوز كامل لحماية التخمين/إنشاء حسابات جماعية. يختبر هذا الملف
// (1) computeTrustProxySetting كدالة خالصة لكل قيم TRUST_PROXY الممكنة، و(2) تطبيق Express
// حقيقي (خادم HTTP حقيقي على منفذ فعلي، لا محاكاة) يثبت أن req.ip لا يتأثر إطلاقاً بأي
// X-Forwarded-For مُزوَّر طالما TRUST_PROXY غير مضبوط — بالضبط سيناريو إعادة إنتاج التقرير
const http = require('http');
const express = require('express');
const { computeTrustProxySetting } = require('../trustProxy');

describe('computeTrustProxySetting — دالة خالصة', () => {
    test('غير مضبوط إطلاقاً (أو فارغ): false — لا ثقة بأي وكيل افتراضياً', () => {
        expect(computeTrustProxySetting(undefined)).toBe(false);
        expect(computeTrustProxySetting('')).toBe(false);
    });
    test('"1"/"2": تُحوَّل لعدد — ثقة بعدد محدَّد من القفزات فقط', () => {
        expect(computeTrustProxySetting('1')).toBe(1);
        expect(computeTrustProxySetting('2')).toBe(2);
    });
    test('"true"/"false": قيمة منطقية صريحة', () => {
        expect(computeTrustProxySetting('true')).toBe(true);
        expect(computeTrustProxySetting('false')).toBe(false);
    });
    test('نص غير رقمي (عنوان/نطاق محدَّد): يُمرَّر كما هو لـExpress', () => {
        expect(computeTrustProxySetting('loopback')).toBe('loopback');
    });
});

describe('trust proxy الافتراضي (TRUST_PROXY غير مضبوط) — خادم Express حقيقي', () => {
    let server;
    let baseUrl;
    const capturedIps = [];

    beforeAll(async () => {
        const app = express();
        app.set('trust proxy', computeTrustProxySetting(undefined));
        app.get('/whoami', (req, res) => {
            capturedIps.push(req.ip);
            res.json({ ip: req.ip });
        });
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    test('اتصال مباشر حقيقي بدون أي وكيل: X-Forwarded-For مُزوَّر لا يُغيِّر req.ip إطلاقاً', async () => {
        const res1 = await fetch(`${baseUrl}/whoami`, { headers: { 'X-Forwarded-For': '1.2.3.4' } });
        const body1 = await res1.json();
        const res2 = await fetch(`${baseUrl}/whoami`, { headers: { 'X-Forwarded-For': '9.9.9.9' } });
        const body2 = await res2.json();
        const res3 = await fetch(`${baseUrl}/whoami`); // بلا أي رأس مزوَّر إطلاقاً
        const body3 = await res3.json();

        // ✅ جوهر الإصلاح: الثلاثة طلبات (رأسان مزوَّران مختلفان + بلا رأس) من نفس الاتصال
        // الفعلي يُعيدون بالضبط نفس req.ip الحقيقي — لا يتأثر بقيمة X-Forwarded-For إطلاقاً
        expect(body1.ip).toBe(body3.ip);
        expect(body2.ip).toBe(body3.ip);
        expect(body1.ip).not.toBe('1.2.3.4');
        expect(body2.ip).not.toBe('9.9.9.9');
    });
});
