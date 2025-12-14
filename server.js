// 📁 server.js - الملف الرئيسي للتطبيق
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // تحميل متغيرات .env
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

// استدعاء اتصال قاعدة البيانات
const connectDB = require('./config/database');

// استدعاء المسارات (سيتم إنشاؤها لاحقاً)
const authRoutes = require('./routes/auth');
const wheelRoutes = require('./routes/wheel');
const depositRoutes = require('./routes/deposit');
const adminRoutes = require('./routes/admin');
const withdrawalRoutes = require('./routes/withdrawal');

// تهيئة التطبيق
const app = express();
const PORT = process.env.PORT || 5000;

// middleware أساسية
app.use(express.static('public'));
app.use(cors()); // للسماح بالطلبات من الواجهة
app.use(express.json()); // لتحويل JSON في الطلبات
app.use(express.urlencoded({ extended: true })); // لتحليل البيانات من النماذج
app.use('/uploads', express.static('public/uploads')); // لعرض الصور المخزنة

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // غير هذا لاحقاً للنطاق الخاص بك
        methods: ["GET", "POST"]
    }
});

// الاتصال بقاعدة البيانات
connectDB();

// تعريف المسارات
app.use('/api/auth', authRoutes);
app.use('/api/wheel', wheelRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/withdrawal', withdrawalRoutes);


// ========== منطق Socket.io ==========
const jwt = require('jsonwebtoken');
const User = require('./models/User');

// تخزين المستخدمين المتصلين
const onlineUsers = new Map();

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('التوكن مطلوب'));
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return next(new Error('المستخدم غير موجود'));
        }
        
        socket.userId = user._id;
        socket.userRole = user.role;
        next();
    } catch (error) {
        next(new Error('غير مصرح'));
    }
});

io.on('connection', (socket) => {
    console.log(`🔗 مستخدم متصل: ${socket.userId}`);
    
    // إضافة المستخدم للقائمة المتصلة
    onlineUsers.set(socket.userId.toString(), {
        socketId: socket.id,
        userId: socket.userId,
        role: socket.userRole,
        connectedAt: new Date()
    });
    
    // إرسال حدث اتصال ناجح
    socket.emit('connected', {
        message: '✅ متصل بنجاح بالخادم',
        userId: socket.userId,
        onlineCount: onlineUsers.size
    });
    
    // غرفة الأدمن (إذا كان أدمن)
    if (socket.userRole === 'admin') {
        socket.join('admin-room');
        console.log(`👑 أدمن انضم للغرفة: ${socket.userId}`);
    }
    
    // غرفة المستخدم الشخصية
    socket.join(`user-${socket.userId}`);
    
    // ========== الأحداث الرئيسية ==========
    
    // حدث تدوير العجلة
    socket.on('wheel_spin_start', (data) => {
        console.log(`🎡 تدوير عجلة من: ${socket.userId}`);
        
        // إرسال للجميع (للحماس)
        socket.broadcast.emit('user_spinning', {
            userId: socket.userId,
            timestamp: new Date()
        });
    });
    
    // حدث فوز كبير
    socket.on('big_win', (data) => {
        const { amount, username } = data;
        
        // إرسال للجميع بفوز كبير (للتحفيز)
        io.emit('big_win_announcement', {
            username: username || 'لاعب',
            amount: amount,
            message: `🎉 ${username || 'لاعب'} فاز بـ ${amount}$!`,
            timestamp: new Date()
        });
        
        console.log(`💰 فوز كبير: ${amount}$ للمستخدم ${socket.userId}`);
    });
    
    // حدث طلب سحب جديد (للأدمن فقط)
    socket.on('new_withdrawal', (data) => {
        if (socket.userRole === 'admin') {
            io.to('admin-room').emit('withdrawal_request', {
                ...data,
                timestamp: new Date()
            });
        }
    });
    
    // حدث قطع الاتصال
    socket.on('disconnect', () => {
        console.log(`🔌 مستخدم منقطع: ${socket.userId}`);
        onlineUsers.delete(socket.userId.toString());
        
        // تحديث عدد المتصلين للجميع
        io.emit('online_count', { count: onlineUsers.size });
    });
});

// ========== إنشاء وإدارة خدمة الإشعارات ==========
const NotificationService = require('./services/notificationService');
const notificationService = new NotificationService(io);

// تحديث خدمة الإشعارات بقائمة المستخدمين المتصلين
setInterval(() => {
    notificationService.updateOnlineUsers(onlineUsers);
}, 5000);

// ========== تصدير ==========
module.exports = {
    io,
    onlineUsers,
    notificationService  // تصدير خدمة الإشعارات
};

app.get(/^(?!\/api|\/socket\.io).*/, (req, res) => {
    if (!req.path.includes('.')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        // إذا كان الطلب على ملف غير موجود، أعد خطأ 404
        res.status(404).send('File not found');
    }
});
// أضف هذه المسارات بعد المسارات الحالية
app.get('/wheel', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'wheel.html'));
});

app.get('/deposit', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'deposit.html'));
});

app.get('/deposit/requests', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'deposit-requests.html'));
});

// تشغيل الخادم
server.listen(PORT, () => {
    console.log(`✅ الخادم يعمل على الرابط: http://localhost:${PORT}`);
});
