const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('../config/redis');

// Create Redis store for rate limiting
const redisStore = new RedisStore({
  sendCommand: (...args) => redis.sendCommand(args),
  prefix: 'rl:'
});

// General rate limiter for API routes
const apiLimiter = rateLimit({
  store: redisStore,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة بعد 15 دقيقة'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

// Strict limiter for sensitive routes
const strictLimiter = rateLimit({
  store: redisStore,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'الكثير من المحاولات. يرجى المحاولة بعد ساعة'
  },
  skipSuccessfulRequests: false
});

// Auth limiter for login/register
const authLimiter = rateLimit({
  store: redisStore,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts per hour
  message: {
    success: false,
    message: 'الكثير من محاولات تسجيل الدخول. يرجى المحاولة بعد ساعة'
  },
  skipSuccessfulRequests: false
});

// Deposit/Withdrawal limiter
const paymentLimiter = rateLimit({
  store: redisStore,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    message: 'الكثير من الطلبات المالية. يرجى المحاولة بعد ساعة'
  },
  skipSuccessfulRequests: false
});

// Chat message limiter
const chatLimiter = rateLimit({
  store: redisStore,
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 messages per minute
  message: {
    success: false,
    message: 'أنت ترسل الرسائل بسرعة كبيرة. يرجى التباطؤ'
  },
  skipSuccessfulRequests: false
});

// Admin endpoints limiter
const adminLimiter = rateLimit({
  store: redisStore,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  message: {
    success: false,
    message: 'تم تجاوز الحد الأقصى لطلبات الإدارة'
  },
  skipSuccessfulRequests: false
});

// IP based blocking (manual)
const blockedIPs = new Set();

const ipBlocker = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  if (blockedIPs.has(clientIP)) {
    return res.status(403).json({
      success: false,
      message: 'عنوان IP محظور'
    });
  }
  
  next();
};

// Dynamic rate limiting based on user behavior
const dynamicLimiter = (req, res, next) => {
  const clientIP = req.ip;
  const path = req.path;
  
  // More strict limits for certain paths
  if (path.includes('/api/payment/')) {
    return paymentLimiter(req, res, next);
  }
  
  if (path.includes('/api/auth/')) {
    return authLimiter(req, res, next);
  }
  
  if (path.includes('/api/chat/')) {
    return chatLimiter(req, res, next);
  }
  
  if (path.includes('/api/admin/')) {
    return adminLimiter(req, res, next);
  }
  
  return apiLimiter(req, res, next);
};

// Function to block IP (called from admin)
const blockIP = (ip, duration = 24 * 60 * 60 * 1000) => { // 24 hours default
  blockedIPs.add(ip);
  
  // Auto remove after duration
  setTimeout(() => {
    blockedIPs.delete(ip);
  }, duration);
  
  return true;
};

// Function to unblock IP
const unblockIP = (ip) => {
  return blockedIPs.delete(ip);
};

// Get blocked IPs
const getBlockedIPs = () => {
  return Array.from(blockedIPs);
};

module.exports = {
  apiLimiter,
  strictLimiter,
  authLimiter,
  paymentLimiter,
  chatLimiter,
  adminLimiter,
  dynamicLimiter,
  ipBlocker,
  blockIP,
  unblockIP,
  getBlockedIPs
};
