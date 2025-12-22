const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
    let token;
    // التحقق من وجود التوكن في هيدر Authorization
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ status: 'fail', message: 'أنت غير مسجل دخولك. يرجى تسجيل الدخول للوصول.' });
    }

    try {
        // 1. التحقق من صحة التوكن
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 2. التحقق من وجود المستخدم
        const currentUser = await User.findById(decoded.id);
        if (!currentUser) {
            return res.status(401).json({ status: 'fail', message: 'المستخدم المرتبط بهذا التوكن لم يعد موجوداً.' });
        }

        // 3. إضافة المستخدم إلى كائن الطلب (req)
        req.user = currentUser;
        next();
    } catch (err) {
        return res.status(401).json({ status: 'fail', message: 'توكن غير صالح أو منتهي الصلاحية.' });
    }
};

module.exports = authMiddleware;
