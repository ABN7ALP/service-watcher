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
// --- استبدل دالة register بالكامل في authController.js ---

exports.register = async (req, res) => {
    console.log('--- Received Registration Request ---');
    console.log('Request Body:', req.body);

    try {
        // --- ✅✅ الإصلاح الحقيقي والنهائي هنا ---
        // هذا السطر كان مفقودًا أو غير مكتمل
        const { username, email, password, gender, birthDate, socialStatus } = req.body;
        // --- نهاية الإصلاح ---

        // التحقق من وجود الحقول المطلوبة
        if (!username || !email || !password || !gender || !birthDate) {
            return res.status(400).json({ status: 'fail', message: 'الرجاء ملء جميع الحقول المطلوبة.' });
        }

        const newUser = await User.create({
            username,
            email,
            password,
            gender,
            birthDate,
            socialStatus // هذا الحقل له قيمة افتراضية
        });

        // إنشاء توكن JWT
        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '90d'
        });

        // إزالة كلمة المرور من المخرجات
        newUser.password = undefined;

        res.status(201).json({
            status: 'success',
            token,
            data: {
                user: newUser
            }
        });

    } catch (error) {
        console.error('--- Registration Error ---', error);
        let message = 'حدث خطأ أثناء إنشاء الحساب.';
        if (error.code === 11000) {
            message = 'اسم المستخدم أو البريد الإلكتروني مسجل بالفعل.';
        } else if (error.errors) {
            const firstError = Object.values(error.errors)[0].message;
            message = firstError;
        }
        res.status(400).json({ status: 'fail', message });
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
// --- أضف هذه الدالة الجديدة في authController.js ---

exports.updatePassword = async (req, res) => {
    try {
        // 1. جلب المستخدم من قاعدة البيانات
        const user = await User.findById(req.user.id).select('+password');

        // 2. التحقق من أن كلمة المرور الحالية صحيحة
        const { currentPassword, newPassword, newPasswordConfirm } = req.body;
        if (!(await user.comparePassword(currentPassword))) {
            return res.status(401).json({ status: 'fail', message: 'كلمة المرور الحالية غير صحيحة.' });
        }

        // 3. التحقق من أن كلمة المرور الجديدة وتأكيدها متطابقان
        if (newPassword !== newPasswordConfirm) {
            return res.status(400).json({ status: 'fail', message: 'كلمة المرور الجديدة وتأكيدها غير متطابقين.' });
        }

        // 4. تحديث كلمة المرور
        user.password = newPassword;
        await user.save();

        // 5. (اختياري ولكن موصى به) إنشاء توكن جديد وإرساله
        // هذا يضمن أن أي جلسات قديمة تصبح غير صالحة
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '90d'
        });

        res.status(200).json({
            status: 'success',
            token,
            message: 'تم تغيير كلمة المرور بنجاح.'
        });

    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ ما.' });
    }
};
