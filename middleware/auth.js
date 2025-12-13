// 📁 middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
    try {
        // 1. الحصول على التوكن من الهيدر
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: '❌ غير مصرح لك بالدخول، يلزم تسجيل الدخول' 
            });
        }
        
        // 2. فك تشفير التوكن والتحقق منه
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 3. البحث عن المستخدم
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: '❌ المستخدم غير موجود' 
            });
        }
        
        // 4. إضافة بيانات المستخدم للطلب لاستخدامها في الخطوات التالية
        req.user = user;
        req.userId = user._id;
        next();
    } catch (error) {
        res.status(401).json({ 
            success: false, 
            message: '❌ جلسة منتهية، يلزم تسجيل الدخول مرة أخرى' 
        });
    }
};

module.exports = authMiddleware;
