// المكان: server/middleware/auth.js

const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function(req, res, next) {
    // الحصول على التوكن من الـ header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    // التحقق من عدم وجود توكن
    if (!token) {
        return res.status(401).json({ message: 'الوصول مرفوض. لا يوجد توكن مصادقة.' });
    }

    try {
        // التحقق من صحة التوكن
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // إيجاد المستخدم من قاعدة البيانات وإرفاقه بالطلب
        req.user = await User.findById(decoded.user.id).select('-password');

        if (!req.user) {
            return res.status(401).json({ message: 'المستخدم غير موجود.' });
        }
        
        next(); // الانتقال إلى المسار التالي
    } catch (err) {
        res.status(401).json({ message: 'التوكن غير صالح.' });
    }
};
