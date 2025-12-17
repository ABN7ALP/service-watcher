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
const authenticate = require('./middleware/auth');
const http = require('http');
const { Server } = require("socket.io");


// المكان: server/index.js (أضف هذا الكود بعد استيراد المكتبات)

// ===================================================================
// مدير جولات التوزيع الفوري
// ===================================================================
const rounds = new Map();
const ROUND_DURATION = 5000; // 5 ثوانٍ

function getRound(io) {
    const now = Date.now();
    let activeRound = null;

    // ابحث عن جولة نشطة لم تنتهِ بعد
    for (const round of rounds.values()) {
        if (now < round.endsAt) {
            activeRound = round;
            break;
        }
    }

    // إذا لم تجد جولة نشطة، أنشئ واحدة جديدة
    if (!activeRound) {
        const roundId = `round_${now}`;
        activeRound = {
            id: roundId,
            participants: [],
            endsAt: now + ROUND_DURATION,
            processed: false,
            // إنشاء تايمر لإغلاق الجولة وتوزيع الجوائز
            timer: setTimeout(() => processRound(roundId, io), ROUND_DURATION + 500) // +500ms كهامش أمان
        };
        rounds.set(roundId, activeRound);
        console.log(`New round started: ${roundId}`);
    }
    return activeRound;
}
// ===================================================================

// المكان: server/index.js

async function processRound(roundId, io) {
    const round = rounds.get(roundId);
    if (!round || round.processed) return;

    round.processed = true;
    console.log(`Processing round: ${roundId} with ${round.participants.length} participants.`);

    const totalContribution = round.participants.length * 1; // 1 هو SPIN_COST
    const developerCut = totalContribution * 0.10;
    let amountToDistribute = totalContribution - developerCut;

    // --- خوارزمية التوزيع الذكي ---
    let prizes = [];
    if (round.participants.length === 1) {
        // حالة اللاعب الوحيد
        prizes.push(amountToDistribute);
    } else {
        // حالة اللاعبين المتعددين
        // استخدم خوارزمية "تقسيم العصا" (Stick-breaking) لتوزيع عشوائي عادل
        let breaks = [0, amountToDistribute];
        for (let i = 0; i < round.participants.length - 1; i++) {
            breaks.push(Math.random() * amountToDistribute);
        }
        breaks.sort((a, b) => a - b);

        for (let i = 0; i < breaks.length - 1; i++) {
            prizes.push(breaks[i+1] - breaks[i]);
        }
        // خلط الجوائز لضمان عدم وجود علاقة بين وقت الانضمام وحجم الجائزة
        prizes.sort(() => Math.random() - 0.5);
    }

    // --- توزيع الجوائز على المشاركين ---
    for (let i = 0; i < round.participants.length; i++) {
        const participant = round.participants[i];
        const prizeAmount = parseFloat(prizes[i].toFixed(2));
        
        try {
            const user = await User.findById(participant.userId);
            if (user) {
                user.balance += prizeAmount;
                await user.save();

                // إرسال النتيجة إلى المستخدم المحدد عبر Socket.io
                const socketId = participant.socketId;
                if (socketId) {
                    io.to(socketId).emit('roundResult', {
                        winAmount: prizeAmount,
                        newBalance: user.balance
                    });
                }
            }
        } catch (error) {
            console.error(`Error processing prize for user ${participant.userId}:`, error);
        }
    }

    // حذف الجولة بعد معالجتها
    rounds.delete(roundId);
    console.log(`Round ${roundId} finished.`);
}

app.post('/api/spin', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const SPIN_COST = 1;

        if (user.balance < SPIN_COST) return res.status(400).json({ message: 'رصيدك غير كافٍ' });

        user.balance -= SPIN_COST;
        await user.save();

        const socketId = req.onlineUsers.get(user._id.toString());
        if (!socketId) {
            user.balance += (SPIN_COST * 0.9); // أعد له 90%
            await user.save();
            return res.status(400).json({ message: 'فشل الاتصال بجولة اللعب.' });
        }

        // --- منطق الانضمام إلى الجولة ---
        const now = Date.now();
        let activeRound = null;
        for (const round of rounds.values()) {
            if (now < round.endsAt) {
                activeRound = round;
                break;
            }
        }

        if (!activeRound) {
            const roundId = `round_${now}`;
            activeRound = {
                id: roundId,
                participants: [],
                endsAt: now + ROUND_DURATION,
                processed: false,
                timer: setTimeout(() => processRound(roundId, req.io), ROUND_DURATION + 500)
            };
            rounds.set(roundId, activeRound);
        }
        
        activeRound.participants.push({ userId: user._id.toString(), socketId: socketId });
        // --- نهاية منطق الانضمام ---

        res.json({
            message: "تم الانضمام إلى جولة، انتظر النتيجة...",
            newBalance: user.balance
        });

    } catch (error) {
        console.error('Spin error:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// احذف السطر: app.use('/api/spin', authenticate, spinRoutes);
// ... (بقية الكود)



dotenv.config();

const app = express();
const server = http.createServer(app); // <-- إنشاء خادم HTTP
const io = new Server(server, { // <-- ربط socket.io بالخادم
    cors: {
        origin: "*", // في بيئة الإنتاج، يجب تحديد رابط الواجهة الأمامية فقط
        methods: ["GET", "POST"]
    }
});


// Middleware
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "script-src": ["'self'", "d3js.org"], // القاعدة القديمة
                "connect-src": ["'self'", "cdn.jsdelivr.net"], // <-- القاعدة الجديدة: السماح بالاتصال بهذا النطاق
            },
        },
    })
);

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));




 
// --- بداية منطق Socket.io ---
// مصفوفة لتخزين المستخدمين المتصلين حالياً
const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // عند تسجيل المستخدم دخوله من الواجهة الأمامية
    socket.on('registerUser', (userId) => {
        console.log(`Registering user ${userId} with socket ${socket.id}`);
        onlineUsers.set(userId, socket.id);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // إزالة المستخدم من قائمة المتصلين عند قطع الاتصال
        for (let [userId, socketId] of onlineUsers.entries()) {
            if (socketId === socket.id) {
                onlineUsers.delete(userId);
                break;
            }
        }
    });
});

// تمرير io و onlineUsers إلى المسارات عبر middleware
app.use((req, res, next) => {
    req.io = io;
    req.onlineUsers = onlineUsers;
    next();
});


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
const adminRoutes = require('./routes/admin'); // <-- إضافة جديدة
const adminAuth = require('./middleware/adminAuth'); // <-- إضافة جديدة


// استخدام المسارات
app.use('/api/auth', authRoutes);
app.use('/api/payment', authenticate, paymentRoutes(upload));
//app.use('/api/spin', authenticate, spinRoutes);
app.use('/api/admin', adminAuth, adminRoutes); // <-- إضافة جديدة: حماية كل مسارات الأدمن


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
server.listen(PORT, () => { // <-- نستخدم server.listen بدلاً من app.listen
    console.log(`Server running on port ${PORT}`);
});
