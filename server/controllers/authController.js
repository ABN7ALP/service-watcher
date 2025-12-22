const jwt = require('jsonwebtoken');
const User = require('../models/User');

// دالة مساعدة لإنشاء توكن JWT
const signToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE,
    });
};

// دالة مساعدة لإرسال التوكن مع الاستجابة
const createSendToken = (user, statusCode, res) => {
    const token = signToken(user._id);

    // إزالة كلمة المرور من المخرجات
    user.password = undefined;

    res.status(statusCode).json({
        status: 'success',
        token,
        data: {
            user,
        },
    });
};

// --- إنشاء حساب جديد ---
exports.register = async (req, res, next) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ status: 'fail', message: 'يرجى تقديم اسم المستخدم والبريد الإلكتروني وكلمة المرور' });
        }

        const newUser = await User.create({ username, email, password });
        
        createSendToken(newUser, 201, res);

    } catch (error) {
        // معالجة خطأ تكرار اسم المستخدم أو البريد الإلكتروني
        if (error.code === 11000) {
            return res.status(400).json({ status: 'fail', message: 'البريد الإلكتروني أو اسم المستخدم مسجل بالفعل' });
        }
        next(error); // إرسال الأخطاء الأخرى إلى معالج الأخطاء العام
    }
};

// --- تسجيل الدخول ---
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ status: 'fail', message: 'يرجى تقديم البريد الإلكتروني وكلمة المرور' });
        }

        // 1) البحث عن المستخدم وإرجاع كلمة المرور للتحقق
        const user = await User.findOne({ email }).select('+password');

        // 2) التحقق من وجود المستخدم وصحة كلمة المرور
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ status: 'fail', message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }

        // 3) إذا كان كل شيء صحيحاً، أرسل التوكن
        createSendToken(user, 200, res);

    } catch (error) {
        next(error);
    }
};
