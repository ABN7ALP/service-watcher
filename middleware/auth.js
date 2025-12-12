// middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
    // 1. احصل على التوكن من الـ header
    const token = req.header('x-auth-token');

    // 2. تحقق مما إذا كان التوكن غير موجود
    if (!token) {
        return res.status(401).json({ message: 'لا يوجد توكن، الدخول مرفوض. يرجى تسجيل الدخول.' });
    }

    // 3. تحقق من صحة التوكن
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // أضف معلومات المستخدم من التوكن إلى كائن الطلب (req)
        // حتى نتمكن من استخدامها في نقطة النهاية (مثل req.user.id)
        req.user = decoded.user;
        
        next(); // اسمح للطلب بالمرور إلى وجهته التالية (نقطة النهاية الفعلية)
    } catch (err) {
        res.status(401).json({ message: 'التوكن غير صالح.' });
    }
};
