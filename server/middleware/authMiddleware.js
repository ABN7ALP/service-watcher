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
        // نطلب passwordChangedAt صراحةً لأنه select:false في المخطط
        const currentUser = await User.findById(decoded.id).select('+passwordChangedAt');
        if (!currentUser) {
            return res.status(401).json({ status: 'fail', message: 'المستخدم المرتبط بهذا التوكن لم يعد موجوداً.' });
        }

        // ✅ إبطال فوري لكل التوكنات الصادرة قبل آخر تغيير لكلمة المرور
        // (يقطع جلسة أي مهاجم يحمل توكناً مسروقاً بمجرد تغيير الضحية لكلمة مرورها)
        if (currentUser.changedPasswordAfter(decoded.iat)) {
            return res.status(401).json({
                status: 'fail',
                code: 'PASSWORD_CHANGED',
                message: 'تم تغيير كلمة المرور مؤخراً. يرجى تسجيل الدخول من جديد.'
            });
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
