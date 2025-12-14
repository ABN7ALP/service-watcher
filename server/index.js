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
const authenticate = require('./middleware/auth'); // <-- استيراد الـ middleware

// تحميل المتغيرات البيئية
dotenv.config();

// تهيئة التطبيق
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
        folder: 'spin-wheel-receipts',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ربط قاعدة البيانات
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/spin-wheel', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// استيراد النماذج
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const Spin = require('./models/Spin');

// استيراد المسارات
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');
const spinRoutes = require('./routes/spin');

// Middleware المصادقة
const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ message: 'الوصول مرفوض. يرجى تسجيل الدخول.' });
        }
        
        // في بيئة الإنتاج، استخدم JWT
        // هنا نستخدم معرف المستخدم مباشرةً للتبسيط
        const user = await User.findById(token);
        
        if (!user) {
            return res.status(401).json({ message: 'الوصول مرفوض. يرجى تسجيل الدخول.' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ message: 'الوصول مرفوض. يرجى تسجيل الدخول.' });
    }
};

// استخدام المسارات
app.use('/api/auth', authRoutes);
app.use('/api/payment', authenticate, paymentRoutes(upload));
app.use('/api/spin', authenticate, spinRoutes);


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

// صفحة 404
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '../public/index.html'));
});

// إدارة الأخطاء
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        message: err.message || 'حدث خطأ في الخادم',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
