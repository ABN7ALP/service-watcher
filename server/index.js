const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');

// تحميل المتغيرات البيئية
dotenv.config();

// تهيئة التطبيق
const app = express();

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "http:"],
        }
    }
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// تكوين Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// إعداد multer مع Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'spin-wheel/receipts',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }],
        resource_type: 'image'
    }
});

const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('يجب أن تكون الصورة من نوع jpg, jpeg, png, gif, أو webp'));
        }
    }
});

// استيراد وإعداد قاعدة البيانات
const { connectDB } = require('./config/database');
connectDB();

// استيراد النماذج بعد الاتصال بقاعدة البيانات
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const Spin = require('./models/Spin');

// Middleware المصادقة المحسن
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                message: 'الوصول مرفوض. يرجى تسجيل الدخول.' 
            });
        }
        
        const token = authHeader.replace('Bearer ', '').trim();
        
        if (!token) {
            return res.status(401).json({ 
                success: false,
                message: 'رمز الدخول غير صالح.' 
            });
        }
        
        // البحث عن المستخدم باستخدام المعرف
        const user = await User.findById(token);
        
        if (!user) {
            return res.status(401).json({ 
                success: false,
                message: 'المستخدم غير موجود.' 
            });
        }
        
        if (!user.isActive) {
            return res.status(403).json({ 
                success: false,
                message: 'الحساب معطل، يرجى التواصل مع الإدارة.' 
            });
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ 
            success: false,
            message: 'خطأ في المصادقة.' 
        });
    }
};

// استيراد المسارات
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');
const spinRoutes = require('./routes/spin');

// استخدام المسارات
app.use('/api/auth', authRoutes);
app.use('/api/payment', authenticate, paymentRoutes(upload));
app.use('/api/spin', authenticate, spinRoutes);

// مسار فحص حالة النظام
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        service: 'Spin Wheel',
        version: '2.0.0'
    });
});

// مسار الحصول على معلومات المستخدم
app.get('/api/auth/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password -__v');
        
        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

// مسار التحقق من الرمز
app.get('/api/auth/verify', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password -__v');
        
        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Verify error:', error);
        res.status(401).json({ 
            success: false,
            message: 'رمز غير صالح' 
        });
    }
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
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            query.createdAt = { $gte: startDate, $lte: endDate };
        }
        
        const transactions = await Transaction.find(query)
            .sort({ createdAt: -1 })
            .limit(50)
            .select('-__v');
        
        res.json({
            success: true,
            transactions
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
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
        .limit(10)
        .select('-__v');
        
        res.json({
            success: true,
            wins
        });
    } catch (error) {
        console.error('Error loading recent wins:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
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
        
        const todayWinsAgg = await Spin.aggregate([
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
            success: true,
            todaySpins,
            todayWins: todayWinsAgg.length > 0 ? todayWinsAgg[0].total : 0
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في الخادم' 
        });
    }
});

// صفحة 404
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '../public/index.html'));
});

// إدارة الأخطاء المحسنة
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.stack);
    
    // أخطاء multer
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'حجم الملف كبير جداً. الحد الأقصى 5MB.'
            });
        }
        return res.status(400).json({
            success: false,
            message: 'خطأ في رفع الملف: ' + err.message
        });
    }
    
    // أخطاء التحقق
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({
            success: false,
            message: messages.join(', ')
        });
    }
    
    // أخطاء MongoDB
    if (err.name === 'MongoError' || err.name === 'MongoServerError') {
        console.error('MongoDB Error:', err.code, err.message);
        
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'هذا الاسم أو البريد الإلكتروني مستخدم بالفعل.'
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'خطأ في قاعدة البيانات.'
        });
    }
    
    // أخطاء عامة
    const statusCode = err.status || 500;
    const message = process.env.NODE_ENV === 'production' 
        ? 'حدث خطأ في الخادم' 
        : err.message || 'حدث خطأ في الخادم';
    
    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// إغلاق نظيف عند إيقاف السيرفر
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Database: ${mongoose.connection.name}`);
    console.log(`🔗 Environment: ${process.env.NODE_ENV || 'development'}`);
});
