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
// --- استبدل دالة register فقط في authController.js ---

exports.register = async (req, res, next) => {
    try {
        const { username, email, password, gender, birthDate, socialStatus } = req.body;

        // التحقق من وجود البيانات الأساسية
        if (!username || !email || !password || !gender || !birthDate) {
            return res.status(400).json({ status: 'fail', message: 'يرجى ملء جميع الحقول المطلوبة.' });
        }

        // --- ✅✅ العودة إلى User.create() ---
        // هذه الدالة ستشغل كل الـ hooks (pre('validate') و pre('save'))
        // وستعيد المستند الكامل مع كل القيم الافتراضية.
        const newUser = await User.create({
            username,
            email,
            password,
            gender,
            birthDate,
            socialStatus // هذا الحقل له قيمة افتراضية، لذا لا بأس إذا لم يتم إرساله
        });
        // --- نهاية الإصلاح ---

        // دالة مساعدة لإرسال التوكن (موجودة لديك بالفعل)
        createSendToken(newUser, 201, res);

    } catch (error) {
        // معالجة خطأ تكرار اسم المستخدم أو البريد الإلكتروني
        if (error.code === 11000) {
            return res.status(400).json({ status: 'fail', message: 'البريد الإلكتروني أو اسم المستخدم مسجل بالفعل.' });
        }
        // معالجة أخطاء التحقق من الصحة الأخرى
        if (error.name === 'ValidationError') {
            return res.status(400).json({ status: 'fail', message: Object.values(error.errors).map(e => e.message).join(', ') });
        }
        // إرسال أي أخطاء أخرى إلى معالج الأخطاء العام
        next(error);
    }
};



// --- تسجيل الدخول ---
// --- استبدل دالة login بالكامل في authController.js ---
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. التحقق من وجود email و password
        if (!email || !password) {
            return res.status(400).json({ status: 'fail', message: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور.' });
        }

        // 2. التحقق من وجود المستخدم وكلمة المرور
        // ✅ نستخدم .populate() هنا لضمان الحصول على كل البيانات الافتراضية (virtuals) مثل 'age'
        const user = await User.findOne({ email }).select('+password');

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ status: 'fail', message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        }

        // 3. إذا كان كل شيء صحيحًا، أرسل التوكن إلى العميل
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '90d'
        });

        // إزالة كلمة المرور من المخرجات
        user.password = undefined;

        res.status(200).json({
            status: 'success',
            token,
            data: {
                user // ✅ إرجاع كائن المستخدم الكامل
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ ما.' });
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
