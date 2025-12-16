// المكان: server/index.js (النسخة النهائية والمصححة والمحصنة)

// 1. استيراد المكتبات الأساسية
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");

// 2. تحميل متغيرات البيئة
dotenv.config();

// 3. إعداد الخادم الرئيسي و Socket.io
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // للإنتاج، استخدم رابط موقعك: "https://your-frontend-domain.com"
        methods: ["GET", "POST"]
    }
});

// 4. إعداد Middleware العام (الذي لا يتعارض مع رفع الملفات)
app.use(helmet()); // للأمان
app.use(cors()); // للسماح بالطلبات من نطاقات أخرى
app.use(morgan('dev')); // لتسجيل الطلبات في الطرفية
app.use(express.static(path.join(__dirname, '../public'))); // لخدمة الملفات الثابتة (html, css, js)

// 5. إعداد Cloudinary و Multer (لا تغيير هنا)
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'spin-wheel-receipts',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
    }
});
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

// 6. ربط قاعدة البيانات
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/spin-wheel')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// 7. منطق Socket.io (لا تغيير هنا)
const onlineUsers = new Map();
io.on('connection', (socket) => {
    socket.on('registerUser', (userId) => {
        onlineUsers.set(userId, socket.id);
    });
    socket.on('disconnect', () => {
        for (let [userId, socketId] of onlineUsers.entries()) {
            if (socketId === socket.id) {
                onlineUsers.delete(userId);
                break;
            }
        }
    });
});

// 8. استيراد المسارات والمصادقة
const authenticate = require('./middleware/auth');
const adminAuth = require('./middleware/adminAuth');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');
const spinRoutes = require('./routes/spin');
const adminRoutes = require('./routes/admin');
const User = require('./models/User'); // استيرادات للـ API المباشر في هذا الملف
const Transaction = require('./models/Transaction');
const Spin = require('./models/Spin');

// ===================================================================
// 9. تطبيق المسارات (هنا التغيير الجذري والمهم)
// ===================================================================

// أ. المسارات التي تتعامل مع رفع الملفات (multipart/form-data)
// لا نستخدم express.json() قبلها
app.use('/api/payment', authenticate, paymentRoutes(upload));

// ب. الآن، وبعد مسارات رفع الملفات، يمكننا استخدام middleware قراءة JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ج. تمرير io و onlineUsers إلى بقية المسارات
app.use((req, res, next) => {
    req.io = io;
    req.onlineUsers = onlineUsers;
    next();
});

// د. بقية مسارات الـ API التي تعتمد على JSON
app.use('/api/auth', authRoutes);
app.use('/api/spin', authenticate, spinRoutes);
app.use('/api/admin', adminAuth, adminRoutes);

// هـ. مسارات API إضافية كانت في هذا الملف
// مسار إضافي للحصول على معلومات المستخدم
app.get('/api/auth/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// مسار التحقق من الرمز
app.get('/api/auth/verify', authenticate, (req, res) => {
    res.json(req.user);
});

// مسار المعاملات
app.get('/api/transactions', authenticate, async (req, res) => {
    try {
        const { type, date } = req.query;
        const query = { user: req.user._id };
        
        if (type && type !== 'all') {
            query.type = type;
        }
        
        if (date) {
            const startDate = new Date(date);
            const endDate = new Date(date);
            endDate.setDate(endDate.getDate() + 1);
            query.createdAt = { $gte: startDate, $lt: endDate };
        }
        
        const transactions = await Transaction.find(query)
            .sort({ createdAt: -1 })
            .limit(50);
        
        res.json(transactions);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// مسار الجوائز الأخيرة
app.get('/api/spin/recent-wins', authenticate, async (req, res) => {
    try {
        const wins = await Spin.find({ 
            user: req.user._id, 
            status: 'win' 
        })
        .sort({ createdAt: -1 })
        .limit(10);
        
        res.json(wins);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// مسار الإحصائيات
app.get('/api/spin/stats', authenticate, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const todaySpins = await Spin.countDocuments({
            user: req.user._id,
            createdAt: { $gte: today, $lt: tomorrow }
        });
        
        const todayWins = await Spin.aggregate([
            {
                $match: {
                    user: req.user._id,
                    status: 'win',
                    createdAt: { $gte: today, $lt: tomorrow }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' }
                }
            }
        ]);
        
        res.json({
            todaySpins,
            todayWins: todayWins.length > 0 ? todayWins[0].total : 0
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// 10. معالجة الأخطاء وصفحة 404 (يجب أن تكون في النهاية)
app.use((req, res, next) => {
    res.status(404).json({ message: "Sorry, the requested resource was not found." });
});

app.use((err, req, res, next) => {
    console.error("================ ERROR ================");
    console.error(err.stack);
    console.error("=====================================");
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        message: err.message || 'An unexpected server error occurred.',
        stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack
    });
});

// 11. تشغيل الخادم
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is shining on port ${PORT}`);
});
