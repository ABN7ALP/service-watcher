// 📁 server.js - الملف الرئيسي للتطبيق
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // تحميل متغيرات .env

// استدعاء اتصال قاعدة البيانات
const connectDB = require('./config/database');

// استدعاء المسارات (سيتم إنشاؤها لاحقاً)
const authRoutes = require('./routes/auth');
const wheelRoutes = require('./routes/wheel');
const depositRoutes = require('./routes/deposit');
const adminRoutes = require('./routes/admin');

// تهيئة التطبيق
const app = express();
const PORT = process.env.PORT || 5000;

// middleware أساسية
app.use(cors()); // للسماح بالطلبات من الواجهة
app.use(express.json()); // لتحويل JSON في الطلبات
app.use(express.urlencoded({ extended: true })); // لتحليل البيانات من النماذج
app.use('/uploads', express.static('public/uploads')); // لعرض الصور المخزنة

// الاتصال بقاعدة البيانات
connectDB();

// تعريف المسارات
app.use('/api/auth', authRoutes);
app.use('/api/wheel', wheelRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/admin', adminRoutes);

// مسار تجريبي للتأكد من عمل الخادم
app.get('/', (req, res) => {
    res.json({ message: '🚀 خادم عجلة الحظ يعمل بنجاح!' });
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`✅ الخادم يعمل على الرابط: http://localhost:${PORT}`);
});
