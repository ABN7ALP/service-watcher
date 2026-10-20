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
const { computeTrustProxySetting, isRailwayEnvironment, resolveTrustProxySetting, getRealClientIp } = require('../trustProxy');

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

// 🛡️ تصحيح لاحق (مراجعة PR #111 — BLOCKER حقيقي رصده المُراجِع): false الافتراضي دوماً بلا
// TRUST_PROXY صريح يكسر الإنتاج الفعلي على Railway — خلف وكيلها الحقيقي، req.ip يصبح عنوان
// Railway الداخلي نفسه لكل المستخدمين، فتتقاسم كل محددات المعدل دلواً واحداً (قفل الموقع
// بالكامل بضع دقائق من محاولات دخول فاشلة لمستخدم واحد). الحل: اكتشاف Railway تلقائياً
describe('isRailwayEnvironment — اكتشاف بيئة Railway', () => {
    test('RAILWAY_ENVIRONMENT مضبوطة: Railway حقيقية', () => {
        expect(isRailwayEnvironment({ RAILWAY_ENVIRONMENT: 'production' })).toBe(true);
    });
    test('RAILWAY_PROJECT_ID مضبوطة (بلا RAILWAY_ENVIRONMENT): Railway حقيقية أيضاً', () => {
        expect(isRailwayEnvironment({ RAILWAY_PROJECT_ID: 'abc123' })).toBe(true);
    });
    test('لا أي منهما: ليست Railway', () => {
        expect(isRailwayEnvironment({})).toBe(false);
    });
});

describe('resolveTrustProxySetting — الأولوية: TRUST_PROXY الصريح > اكتشاف Railway > false', () => {
    test('TRUST_PROXY صريح موجود + Railway حقيقية أيضاً: TRUST_PROXY الصريح يفوز دوماً', () => {
        expect(resolveTrustProxySetting({ TRUST_PROXY: '3', RAILWAY_ENVIRONMENT: 'production' })).toBe(3);
        expect(resolveTrustProxySetting({ TRUST_PROXY: 'false', RAILWAY_ENVIRONMENT: 'production' })).toBe(false);
    });
    test('بيئة Railway حقيقية + TRUST_PROXY غير مضبوط إطلاقاً: 1 تلقائياً — جوهر إصلاح الـBLOCKER', () => {
        expect(resolveTrustProxySetting({ RAILWAY_ENVIRONMENT: 'production' })).toBe(1);
        expect(resolveTrustProxySetting({ RAILWAY_PROJECT_ID: 'abc123' })).toBe(1);
    });
    test('لا TRUST_PROXY ولا Railway: false الآمن الافتراضي (سلوك البند #4 الأصلي كما هو)', () => {
        expect(resolveTrustProxySetting({})).toBe(false);
    });
});

describe('getRealClientIp — عنوان العميل الحقيقي من X-Forwarded-For عند وكيل موثوق', () => {
    test('trustProxySetting=false (لا وكيل): يُرجِع عنوان الاتصال الخام كما هو — يتجاهل أي X-Forwarded-For', () => {
        expect(getRealClientIp({ 'x-forwarded-for': '1.2.3.4' }, '10.0.0.5', false)).toBe('10.0.0.5');
    });
    test('trustProxySetting=1 (قفزة وكيل واحدة موثوقة — حالة Railway): سلسلة مزوَّرة + الحقيقي بالنهاية → يُعيد الحقيقي فقط', () => {
        // ✅ بالضبط سيناريو المُراجِع: مهاجم يُرسل "X-Forwarded-For: 1.2.3.4" مزوَّراً، وRailway
        // (الوكيل الحقيقي الوحيد الموثوق) يُلحِق عنوان المهاجم الفعلي كما رأته هي بنفسها
        const headers = { 'x-forwarded-for': '1.2.3.4, 9.9.9.9' };
        expect(getRealClientIp(headers, '172.16.0.1', 1)).toBe('9.9.9.9');
        expect(getRealClientIp(headers, '172.16.0.1', 1)).not.toBe('1.2.3.4');
    });
    test('trustProxySetting=1 بلا أي تزوير (قيمة وحيدة بالسلسلة): يُعيدها كما هي', () => {
        expect(getRealClientIp({ 'x-forwarded-for': '9.9.9.9' }, '172.16.0.1', 1)).toBe('9.9.9.9');
    });
    test('trustProxySetting=1 بلا رأس X-Forwarded-For إطلاقاً: يرجع للعنوان الخام (لا يتعطّل)', () => {
        expect(getRealClientIp({}, '172.16.0.1', 1)).toBe('172.16.0.1');
    });
    test('متوافقة فعلياً مع سلوك Express/proxy-addr الحقيقي عند trust=1 (مُحقَّق تجريبياً بخادم حقيقي أدناه)', () => {
        // راجع 'trust proxy=1 (محاكاة Railway)' بالأسفل — نفس القيم بالضبط تُحقَّق بخادم Express حقيقي
        expect(getRealClientIp({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, 'x', 1)).toBe('5.6.7.8');
        expect(getRealClientIp({ 'x-forwarded-for': '1.2.3.4' }, 'x', 1)).toBe('1.2.3.4');
    });
});

describe('trust proxy=1 (محاكاة Railway) — خادم Express حقيقي، لا محاكاة', () => {
    let server, baseUrl;

    beforeAll(async () => {
        const app = express();
        app.set('trust proxy', resolveTrustProxySetting({ RAILWAY_ENVIRONMENT: 'production' })); // ✅ 1 تلقائياً
        app.get('/whoami', (req, res) => res.json({ ip: req.ip }));
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });
    afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

    test('سلسلة X-Forwarded-For بجزء مزوَّر + جزء حقيقي: req.ip هو الجزء الحقيقي (آخر عنصر) لا المزوَّر', async () => {
        const res = await fetch(`${baseUrl}/whoami`, { headers: { 'X-Forwarded-For': '1.2.3.4, 5.6.7.8' } });
        const body = await res.json();
        expect(body.ip).toBe('5.6.7.8');
        expect(body.ip).not.toBe('1.2.3.4');
    });

    test('قيمة وحيدة (كما يرسلها Railway فعلياً بوكيل حقيقي واحد أمام التطبيق): req.ip يطابقها', async () => {
        const res = await fetch(`${baseUrl}/whoami`, { headers: { 'X-Forwarded-For': '9.9.9.9' } });
        const body = await res.json();
        expect(body.ip).toBe('9.9.9.9');
    });
});
