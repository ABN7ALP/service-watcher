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
            "script-src": ["'self'", "cdn.socket.io"],
            // --- استبدل سطر "img-src" بهذا ---
            "img-src": ["'self'", "data:", "https://res.cloudinary.com", "https://i.ibb.co"], // ✅ السطر الجديد
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
