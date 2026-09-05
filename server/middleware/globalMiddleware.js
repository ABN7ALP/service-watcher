const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

// إعدادات محدد المعدل (Rate Limiter)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 200, // السماح بـ 200 طلب لكل IP خلال 15 دقيقة
    standardHeaders: true,
    legacyHeaders: false,
    message: 'طلبات كثيرة جداً من هذا الـ IP، يرجى المحاولة مرة أخرى بعد 15 دقيقة',
});

const setupMiddleware = (app) => {
    // تطبيق Middleware الأمان الأساسية
    app.use(cors()); // السماح بالطلبات من مصادر مختلفة
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

    // Middleware للحماية من XSS
    app.use(xss());

    // تطبيق محدد المعدل على جميع الطلبات
    app.use(limiter);
};

module.exports = setupMiddleware;
