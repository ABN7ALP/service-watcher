require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const setupMiddleware = require('./middleware/globalMiddleware');
const setupErrorHandlers = require('./middleware/errorHandlers');
const initializeSocket = require('./services/socketService');

// --- تهيئة التطبيق والخادم ---
const app = express();
const server = http.createServer(app);

// --- إعدادات أساسية ---
app.set('trust proxy', 1);

// --- تطبيق الـ Middleware العام ---
setupMiddleware(app);



// --- تهيئة وتشغيل Socket.IO ---
const io = initializeSocket(server);
app.use((req, res, next) => {
    req.io = io;
    next();
});


// --- خدمة الملفات الثابتة للواجهة الأمامية ---
// يخدم ملفات مثل style.css, app.js من مجلد dist و public
app.use(express.static(path.join(__dirname, '../public')));
app.use('/dist', express.static(path.join(__dirname, '../public/dist')));


// --- مسارات API (سيتم إضافتها هنا لاحقاً) ---
// مثال: app.use('/api/auth', require('./routes/authRoutes'));
// --- مسارات API ---
app.use('/api/auth', require('./routes/authRoutes')); // ✅ أضف هذا السطر
app.use('/api/messages', require('./routes/messageRoutes')); // ✅ أضف هذا السطر
app.use('/api/battles', require('./routes/battleRoutes')); // ✅ أضف هذا السطر



// --- مسار "التقاط الكل" لخدمة الواجهة الأمامية --
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html')); 
});

// --- معالجة الأخطاء (يجب أن يكون آخر middleware) ---
setupErrorHandlers(app);

// --- الاتصال بقاعدة البيانات ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected successfully.'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// --- تشغيل الخادم ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// --- معالجة الأخطاء غير المتوقعة ---
process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    server.close(() => {
        process.exit(1);
    });
});
