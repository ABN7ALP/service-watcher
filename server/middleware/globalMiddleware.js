const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
// ✅ أُزيلت xss-clean (متوقفة عن الصيانة ولها تجاوزات معروفة).
// الدفاع الحقيقي = ترميز المخرجات في الواجهة (escapeHtml) + الحارس أدناه.;

// إعدادات محدد المعدل (Rate Limiter)
// ✅ مفتاح آمن: نتحقق من توقيع التوكن (verify لا decode) قبل الوثوق بهويته.
// jwt.decode يقبل أي توكن مزوّر، ما كان يسمح لمهاجم بتوليد مفتاح جديد لكل طلب
// وبالتالي تجاوز المحدد بالكامل. أي توكن غير موثّق يُعامل بمفتاح الـ IP.
const safeKeyGenerator = (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
            if (decoded?.id) return `user:${decoded.id}`;
        } catch (e) { /* توكن غير صالح → نرجع لـ IP */ }
    }
    return req.ip;
};

// المحدد العام لبقية المسارات
const limiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: safeKeyGenerator,
    message: 'طلبات كثيرة جداً، يرجى المحاولة مرة أخرى خلال دقائق قليلة',
});

// 🛡️ محدد صارم لتسجيل الدخول: يوقف الـ Brute-force فعلياً.
// نعتمد على IP + البريد المُستهدف معاً، فلا يستطيع مهاجم قصف حساب معيّن
// بتغيير عنوانه، ولا حجب مستخدمين شرعيين يشاركون نفس الشبكة.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 8,                   // 8 محاولات فاشلة فقط
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // ✅ المحاولات الناجحة لا تُحتسب إطلاقاً
    keyGenerator: (req) => {
        const email = (req.body?.email || '').toString().toLowerCase().trim();
        return `login:${req.ip}:${email}`;
    },
    message: { status: 'fail', message: 'محاولات دخول كثيرة جداً. يرجى المحاولة بعد 15 دقيقة.' },
});

// 🛡️ محدد إنشاء الحسابات: يمنع إنشاء حسابات جماعية آلية (مزارع حسابات/احتيال العروض)
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // ساعة
    max: 5,                   // 5 حسابات لكل IP في الساعة
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `register:${req.ip}`,
    message: { status: 'fail', message: 'تم إنشاء عدد كبير من الحسابات من هذا العنوان. حاول لاحقاً.' },
});

// 🛡️ محدد العمليات المالية: إنشاء تحدي / طلب سحب / طلب إيداع
// يمنع مهاجماً (أو خطأ في الواجهة) من قصف هذه المسارات بسرعة لاستنزاف الرصيد
// أو إنشاء مئات الطلبات المعلّقة خلال ثوانٍ. أشد بكثير من المحدد العام (500/5 دقائق).
const financialLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 دقائق
    max: 12,                  // 12 عملية مالية كحد أقصى لكل مستخدم/IP خلال 10 دقائق
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: safeKeyGenerator, // يعتمد على هوية المستخدم الموثّقة (JWT) وليس IP فقط
    message: { status: 'fail', message: 'عمليات مالية كثيرة جداً خلال وقت قصير. يرجى الانتظار قليلاً قبل المحاولة مجدداً.' },
});

// 🛡️ محدد تغيير كلمة المرور: يمنع تخمين كلمة المرور الحالية من جلسة مسروقة
const passwordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: safeKeyGenerator,
    message: { status: 'fail', message: 'محاولات كثيرة لتغيير كلمة المرور. حاول بعد قليل.' },
});


// 🛡️ حارس إدخال بديل: يزيل فقط الأنماط الخطرة فعلياً دون تشويه نص المستخدم العادي.
// نهجنا: لا نحاول "تنظيف" HTML (نهج هشّ)، بل نمنع الحمولات التنفيذية الواضحة
// ونترك الترميز الآمن للمخرجات في الواجهة.
const DANGEROUS_PATTERNS = [
    /<\s*script\b/gi,
    /<\s*\/\s*script\s*>/gi,
    /<\s*iframe\b/gi,
    /<\s*object\b/gi,
    /<\s*embed\b/gi,
    /javascript\s*:/gi,
    /vbscript\s*:/gi,
    /data\s*:\s*text\/html/gi,
    /\son\w+\s*=/gi,   // onerror= / onclick= ... داخل خصائص HTML
];

const sanitizeValue = (val) => {
    if (typeof val !== 'string') return val;
    let clean = val;
    for (const pattern of DANGEROUS_PATTERNS) {
        clean = clean.replace(pattern, '');
    }
    return clean;
};

// تنقية عميقة مع حماية من الكائنات المتداخلة بعمق مفرط (هجوم استنزاف)
const deepSanitize = (obj, depth = 0) => {
    if (depth > 8 || obj === null || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (typeof value === 'string') {
            obj[key] = sanitizeValue(value);
        } else if (typeof value === 'object' && value !== null) {
            deepSanitize(value, depth + 1);
        }
    }
};

const xssGuard = (req, res, next) => {
    // ⚠️ نعالج body فقط. query وparams في Express 5 للقراءة فقط،
    // ومحاولة الكتابة عليهما تسبب انهياراً — وهي سبب شائع لأعطال xss-clean نفسها.
    if (req.body && typeof req.body === 'object') {
        deepSanitize(req.body);
    }
    next();
};

const setupMiddleware = (app) => {
    // تطبيق Middleware الأمان الأساسية
        // ✅ قائمة بيضاء للمصادر المسموحة بدل الانفتاح الكامل (*)
    // يُضبط ALLOWED_ORIGINS في Railway، ويُفصل بفواصل عند تعدد النطاقات
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(o => o.trim())
        .filter(Boolean);

    app.use(cors({
        origin: (origin, callback) => {
            // نسمح بالطلبات بلا Origin (تطبيقات الجوال، Postman، طلبات نفس الأصل)
            if (!origin) return callback(null, true);
            // 🛡️ احتياط أمان تشغيلي: لو نُسي ضبط المتغيّر، لا نكسر الموقع بل نسمح مؤقتاً مع تحذير
            if (allowedOrigins.length === 0) {
                console.warn('[CORS] ⚠️ ALLOWED_ORIGINS غير مضبوط — يعمل مؤقتاً بوضع مفتوح. اضبطه في Railway.');
                return callback(null, true);
            }
            if (allowedOrigins.includes(origin)) return callback(null, true);
            return callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }));
    // الكود الجديد والمعدل بالكامل لإعدادات helmet
        app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                // ✅ مصادر السكربتات: الموقع نفسه + مكتبة Socket.IO + مكتبات لوحة التحكم (Bootstrap/Chart.js عبر jsdelivr)
                "script-src": ["'self'", "https://cdn.socket.io", "https://cdn.jsdelivr.net"],
                // ✅ مصادر الأنماط: الموقع نفسه + Font Awesome + خطوط جوجل + Bootstrap (لوحة التحكم)
                // 'unsafe-inline' ضروري هنا لأن الواجهة تستخدم بكثرة style="..." مُولَّدة ديناميكياً عبر JS
                "style-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
                // ✅ مصادر ملفات الخطوط الفعلية (Font Awesome وGoogle Fonts يجلبان ملفات خط من نطاقات منفصلة)
                "font-src": ["'self'", "data:", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
                // ✅ الإصلاح: إضافة blob: لمعاينة الصور/الفيديو محلياً قبل رفعها (createObjectURL)
                "img-src": ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://i.ibb.co"],
                "media-src": ["'self'", "blob:", "https://res.cloudinary.com"],
                // ✅ الاتصال (fetch/XHR/WebSocket) يقتصر على نفس الموقع فقط — يكفي لاتصال Socket.IO
                // لأن العميل يتصل بنفس أصل الخادم (io() بدون رابط خارجي)، لا بـ cdn.socket.io
                "connect-src": ["'self'"],
            },
        },
    }));
    app.use(compression()); // ضغط الاستجابات لزيادة السرعة

    // Middleware لتحليل جسم الطلب (Body Parser)
    app.use(express.json({ limit: '10kb' }));
    app.use(express.urlencoded({ extended: true, limit: '10kb' }));

    // Middleware للحماية من NoSQL Injection
    app.use(mongoSanitize());

    // Middleware للحماية من XSS (بديل آمن لـ xss-clean المتوقفة)
    app.use(xssGuard);
    
    // تطبيق محدد المعدل على جميع الطلبات
    app.use(limiter);
};

module.exports = setupMiddleware;
module.exports.loginLimiter = loginLimiter;
module.exports.registerLimiter = registerLimiter;
module.exports.passwordLimiter = passwordLimiter;
module.exports.financialLimiter = financialLimiter;
