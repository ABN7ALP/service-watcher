const jwt = require('jsonwebtoken');
const User = require('../models/User');

const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      throw new Error();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // ✅ الإصلاح: التوكن عندنا يحمل الحقل "id" وليس "userId"
        const user = await User.findOne({ 
      _id: decoded.id,
      isAdmin: true,
      isBanned: false 
    }).select('-password +passwordChangedAt');

    if (!user) {
      throw new Error();
    }

    // ✅ إبطال توكنات الأدمن القديمة بعد تغيير كلمة المرور (أهم من حساب المستخدم العادي)
    if (user.changedPasswordAfter(decoded.iat)) {
      throw new Error();
    }

    req.admin = user;
    next();
  } catch (error) {
    res.status(403).json({ 
      success: false, 
      message: 'Admin access required' 
    });
  }
};

module.exports = adminAuth;
