const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const compression = require('compression');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // ✅ أضف هذا السطر

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"]
  }
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware
// استخدام helmet مع CSP مخصص
// الكود الجديد والمعدل
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // ✅ السماح بتحميل السكربتات من CDN الخاص بـ Socket.IO
      scriptSrc: ["'self'", "https://cdn.socket.io"],
      // ✅ السماح بتحميل الأنماط من Cloudflare و Google Fonts
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      // ✅ السماح بتحميل الصور من Cloudinary وصور placeholder
      imgSrc: ["'self'", "https://res.cloudinary.com", "https://via.placeholder.com", "data:"],
      // ✅ السماح بالاتصال بالخادم نفسه و Socket.IO
      connectSrc: ["'self'", "ws:", "wss:"],
      // ✅ السماح بتحميل الوسائط من Mixkit (لصوت الإشعار)
      mediaSrc: ["'self'", "https://assets.mixkit.co"],
      // ✅ السماح بتحميل الخطوط من Cloudflare و Google Fonts
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(mongoSanitize());
app.use(xss());
app.use(compression());
app.use('/api', limiter);

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/battle-platform', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Socket.IO
require('./sockets')(io);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/user', require('./routes/user'));
app.use('/api/battle', require('./routes/battle'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/payment', require('./routes/payment'));

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
