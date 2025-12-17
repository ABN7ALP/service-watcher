// المكان: server/index.js (النسخة الكاملة والنهائية لنظام الجولات)

// ===================================================================
// 1. استيراد المكتبات الأساسية
// ===================================================================
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// ===================================================================
// 2. تحميل متغيرات البيئة وإعداد الخادم
// ===================================================================
dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// ===================================================================
// 3. إعداد Middleware العام
// ===================================================================
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "script-src": ["'self'", "d3js.org"],
                "connect-src": ["'self'", "cdn.jsdelivr.net", "res.cloudinary.com"], // أضفنا cloudinary هنا
            },
        },
    })
);
app.use(cors());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, '../public')));

// ===================================================================
// 4. إعداد Cloudinary و Multer لرفع الملفات
// ===================================================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: { folder: 'spin-wheel-receipts', allowed_formats: ['jpg', 'png'] }
});
const upload = multer({ storage: storage });

// ===================================================================
// 5. ربط قاعدة البيانات واستيراد النماذج
// ===================================================================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/spin-wheel')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

const User = require('./models/User');
const Transaction = require('./models/Transaction');
const Spin = require('./models/Spin');

// ===================================================================
// 6. منطق Socket.io ومدير المستخدمين المتصلين
// ===================================================================
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

// ===================================================================
// 7. منطق نظام الجولات الفوري (قلب النظام الجديد)
// ===================================================================
const rounds = new Map();
const ROUND_DURATION = 5000; // 5 ثوانٍ
// ذاكرة السوق: تحتفظ بنتيجة آخر جولة جماعية ناجحة
let marketMemory = {
    averagePrize: 0.90, // القيمة الافتراضية (لاعب واحد يستعيد 90%)
    volatility: 0.1 // مدى تقلب الجوائز
};

// استبدل processRound القديمة بهذه النسخة الكاملة والجديدة
async function processRound(roundId, io) {
    const round = rounds.get(roundId);
    if (!round || round.processed) return;
    round.processed = true;
    rounds.delete(roundId); // احذف الجولة من الذاكرة

    const participants = round.participants;
    const numParticipants = participants.length;

    // 1. حساب إجمالي المساهمات والعمولة
    const totalContribution = numParticipants * 1; // SPIN_COST
    const developerCut = totalContribution * 0.10;
    let amountToDistribute = totalContribution - developerCut;

    let prizes = [];

    // ======================================================
    // --- بداية المحرك الدرامي ---
    // ======================================================

    if (numParticipants > 1) {
        // --- أ. منطق الجولة الجماعية (منافسة حقيقية) ---
        console.log(`Processing GROUP round with ${numParticipants} players.`);

        // استخدم خوارزمية "تقسيم العصا" لتوزيع المبلغ بالكامل
        let breaks = [0, amountToDistribute];
        for (let i = 0; i < numParticipants - 1; i++) {
            breaks.push(Math.random() * amountToDistribute);
        }
        breaks.sort((a, b) => a - b);
        for (let i = 0; i < breaks.length - 1; i++) {
            prizes.push(breaks[i + 1] - breaks[i]);
        }
        prizes.sort(() => Math.random() - 0.5); // خلط عشوائي للجوائز

        // --- تحديث ذاكرة السوق ---
        const average = amountToDistribute / numParticipants;
        const variance = prizes.reduce((acc, p) => acc + Math.pow(p - average, 2), 0) / numParticipants;
        marketMemory.averagePrize = average;
        marketMemory.volatility = Math.sqrt(variance); // الانحراف المعياري
        console.log(`Market Memory Updated: Avg=${marketMemory.averagePrize}, Volatility=${marketMemory.volatility}`);

    } else {
        // --- ب. منطق الجولة الفردية (محاكاة السوق) ---
        console.log(`Processing SOLO round. Simulating market.`);
        
        // اللاعب يلعب ضد "شبح" آخر جولة جماعية
        // يتم توليد جائزة بناءً على متوسط وتقلب السوق
        const basePrize = marketMemory.averagePrize;
        const volatilityEffect = (Math.random() - 0.5) * 2 * marketMemory.volatility; // تأثير التقلب
        let prizeAmount = basePrize + volatilityEffect;

        // تأكد من أن الجائزة لا تكون سالبة
        prizeAmount = Math.max(0, prizeAmount);
        
        prizes.push(prizeAmount);
    }

    // ======================================================
    // --- نهاية المحرك الدرامي ---
    // ======================================================

    // 3. توزيع الجوائز وإرسال النتائج
    for (let i = 0; i < numParticipants; i++) {
        const participant = participants[i];
        const prizeAmount = parseFloat(prizes[i].toFixed(2));
        
        try {
            const user = await User.findById(participant.userId);
            if (user) {
                user.balance += prizeAmount;
                await user.save();

                // تسجيل الدورة في قاعدة البيانات (مهم جداً للإحصائيات)
                const spin = new Spin({
                    user: user._id,
                    amount: prizeAmount,
                    cost: 1, // SPIN_COST
                    status: prizeAmount >= 1 ? 'win' : 'lose',
                    netResult: prizeAmount - 1
                });
                await spin.save();

                if (participant.socketId) {
                    io.to(participant.socketId).emit('roundResult', {
                        winAmount: prizeAmount,
                        newBalance: user.balance
                    });
                }
            }
        } catch (error) {
            console.error(`Error processing prize for user ${participant.userId}:`, error);
        }
    }
}





// ===================================================================
// 8. استيراد وتطبيق المسارات (Routes)
// ===================================================================
const authenticate = require('./middleware/auth');
const adminAuth = require('./middleware/adminAuth');
const paymentRoutes = require('./routes/payment');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

// أ. مسار رفع الملفات (يجب أن يأتي قبل express.json)
app.use('/api/payment', authenticate, paymentRoutes(upload));

// ب. الآن نطبق middleware قراءة JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ج. تمرير io و onlineUsers إلى كل الطلبات القادمة
app.use((req, res, next) => {
    req.io = io;
    req.onlineUsers = onlineUsers;
    next();
});

// د. مسار Spin الجديد (مباشرة هنا)
app.post('/api/spin', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const SPIN_COST = 1;
        if (user.balance < SPIN_COST) return res.status(400).json({ message: 'رصيدك غير كافٍ' });

        user.balance -= SPIN_COST;
        await user.save();

        const socketId = req.onlineUsers.get(user._id.toString());
        if (!socketId) {
            user.balance += (SPIN_COST * 0.9);
            await user.save();
            return res.status(400).json({ message: 'فشل الاتصال بجولة اللعب.' });
        }

          const now = Date.now();
        let activeRoundId = await redis.get('active_round_id');
        let round;

        if (activeRoundId) {
            const roundJSON = await redis.get(activeRoundId);
            if (roundJSON) {
                round = JSON.parse(roundJSON);
            }
        }

        if (!round || now >= round.endsAt) {
            // إنشاء جولة جديدة
            const newRoundId = `round_${now}`;
            round = {
                id: newRoundId,
                participants: [],
                endsAt: now + ROUND_DURATION,
            };
            // جدولة معالجة الجولة
            setTimeout(() => processRound(newRoundId, req.io), ROUND_DURATION + 500);
            await redis.set('active_round_id', newRoundId, 'PX', ROUND_DURATION + 1000); // PX: صلاحية بالمللي ثانية
        }
        
        round.participants.push({ userId: user._id.toString(), socketId: socketId });
        await redis.set(round.id, JSON.stringify(round), 'PX', ROUND_DURATION + 2000); // تحديث بيانات الجولة
        // --- نهاية منطق Redis ---

        res.json({ message: "تم الانضمام إلى جولة...", newBalance: user.balance });

    } catch (error) {
        console.error('Spin error:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});


// هـ. بقية مسارات الـ API
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

// ===================================================================
// 9. معالجة الأخطاء وتشغيل الخادم
// ===================================================================
app.use((req, res, next) => {
    res.status(404).json({ message: "Resource not found." });
});
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: err.message || 'Server Error' });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
