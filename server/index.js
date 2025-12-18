// المكان: server/index.js (النسخة الكاملة والجديدة لنظام التحديات)

// --- 1. استيراد المكتبات ---
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const jwt = require('jsonwebtoken');

// --- 2. تحميل الإعدادات وإنشاء الخادم ---
dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- 3. إعداد Middleware ---
// المكان: server/index.js

// --- استبدل هذا السطر ---
// app.use(helmet());

// --- بهذا الكود ---
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "script-src": ["'self'", "d3js.org", "https://d3js.org"], // السماح بـ d3.js
                "connect-src": ["'self'", "cdn.jsdelivr.net"], // للسماح بتحميل بيانات الخريطة
            },
        },
    })
);

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// --- 4. ربط قاعدة البيانات واستيراد النماذج ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));
const User = require('./models/User');

// --- 5. middleware مصادقة Socket.io (مهم جداً للأمان) ---
io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error: Token not provided.'));
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.user.id).select('-password');
        if (!user) {
            return next(new Error('Authentication error: User not found.'));
        }
        socket.user = user; // إرفاق معلومات المستخدم بالـ socket
        next();
    } catch (err) {
        next(new Error('Authentication error: Invalid token.'));
    }
});

// --- 6. استيراد وتشغيل مدير التحديات ---
const initializeChallengeManager = require('./challengeManager');
initializeChallengeManager(io);

// --- 7. استيراد وتطبيق المسارات (Routes) ---
// لقد قمنا بإزالة كل المسارات المتعلقة باللعبة القديمة
const authRoutes = require('./routes/auth');
// يمكنك إضافة مسارات أخرى هنا مثل payment, admin, etc.
app.use('/api/auth', authRoutes);

// --- 8. معالجة الأخطاء وتشغيل الخادم ---
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
