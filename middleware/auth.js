const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    // 1. احصل على التوكن من هيدر الطلب
    const token = req.header('x-auth-token');

    // 2. تحقق إذا كان التوكن غير موجود
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        // 3. تحقق من صحة التوكن وتوقيعه
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 4. أضف "حمولة" التوكن إلى كائن الطلب (req)
        // الآن، أي نقطة نهاية محمية يمكنها الوصول إلى req.user
        req.user = decoded.user;
        
        // 5. اسمح للطلب بالمرور إلى وجهته
        next();
    } catch (ex) {
        res.status(400).json({ message: 'Invalid token.' });
    }
};

module.exports = authMiddleware;
