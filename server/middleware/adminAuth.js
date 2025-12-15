// المكان: server/middleware/adminAuth.js

const authenticate = require('./auth'); // نستورد middleware المصادقة الأساسي

const adminAuth = (req, res, next) => {
    // أولاً، تحقق من أن المستخدم مسجل دخوله
    authenticate(req, res, () => {
        // ثانياً، تحقق من أن دوره هو 'admin'
        if (req.user && req.user.role === 'admin') {
            next(); // إذا كان مديراً، اسمح له بالمرور
        } else {
            res.status(403).json({ message: 'الوصول مرفوض. هذه المنطقة مخصصة للمديرين فقط.' });
        }
    });
};

module.exports = adminAuth;
