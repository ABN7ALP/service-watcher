// تحميل متغيرات البيئة أولاً
require('dotenv').config();

const express = require('express');
const path = require('path');
const connectDB = require('./config/db');

// استدعاء نقاط النهاية
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const walletRoutes = require('./routes/wallet');

// تهيئة التطبيق
const app = express();

// Middleware
app.use(express.json()); // للسماح باستقبال بيانات JSON
app.use(express.static(path.join(__dirname, 'public'))); // لتقديم الملفات الثابتة

// ربط نقاط النهاية
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/wallet', walletRoutes);

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);
    });
});
