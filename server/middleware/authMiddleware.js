const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ status: 'fail', message: 'أنت غير مسجل دخولك. يرجى تسجيل الدخول للوصول.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const currentUser = await User.findById(decoded.id);
        if (!currentUser) {
            return res.status(401).json({ status: 'fail', message: 'المستخدم المرتبط بهذا التوكن لم يعد موجوداً.' });
        }

        // ✅ إنفاذ الحظر فعلياً على كل طلب محمي — بدل السماح باستخدام توكن صالح
        // حتى انتهاء صلاحيته الطبيعية (قد تصل لأشهر) رغم أن الحساب محظور فعلياً
        if (currentUser.isBanned) {
            if (currentUser.banExpires && new Date(currentUser.banExpires) < new Date()) {
                // انتهت مدة الحظر المؤقت — فك الحظر تلقائياً والسماح بالمتابعة
                currentUser.isBanned = false;
                currentUser.banReason = null;
                currentUser.banExpires = null;
                await currentUser.save();
            } else {
                return res.status(403).json({
                    status: 'fail',
                    code: 'ACCOUNT_BANNED',
                    message: 'تم حظر حسابك.',
                    banReason: currentUser.banReason || 'مخالفة لشروط الاستخدام',
                    banExpires: currentUser.banExpires,
                    isPermanent: !currentUser.banExpires
                });
            }
        }

        req.user = currentUser;
        next();
    } catch (err) {
        return res.status(401).json({ status: 'fail', message: 'توكن غير صالح أو منتهي الصلاحية.' });
    }
};

module.exports = authMiddleware;
