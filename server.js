// server.js

// تحميل متغيرات البيئة في وضع التطوير
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const path = require('path');
const connectDB = require('./db');

// --- إعدادات Express ---
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware (برامج وسيطة)
app.use(express.json()); // للسماح باستقبال بيانات JSON
app.use(express.static(path.join(__dirname, 'public'))); // لتقديم ملفات الواجهة الأمامية

// --- الاتصال بقاعدة البيانات ---
connectDB().then(() => {
    // --- استيراد وتشغيل نقاط النهاية (Routes) ---
    const authRoutes = require('./routes/auth');
    const gameRoutes = require('./routes/game');

    app.use('/api/auth', authRoutes);
    app.use('/api/game', gameRoutes);

    // --- تشغيل السيرفر بعد التأكد من الاتصال بالـ DB ---
    app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);
        console.log(`🔗 Live at: http://localhost:${PORT}`);
    });

}).catch(err => {
    console.error("🔴 Failed to connect to the database. Server not started.");
    console.error(err);
    process.exit(1); // إيقاف التطبيق إذا فشل الاتصال بقاعدة البيانات
});
