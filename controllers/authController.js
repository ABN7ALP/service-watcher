// 📁 controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// 🔧 دالة لإنشاء التوكن
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { 
        expiresIn: '7d' // صلاحية أسبوع
    });
};

// 📝 التسجيل (إنشاء حساب جديد)
exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // 1. التحقق من عدم وجود مستخدم بنفس البريد أو الاسم
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: '❌ البريد الإلكتروني أو اسم المستخدم موجود مسبقاً'
            });
        }
        
        // 2. إنشاء المستخدم الجديد
        const user = new User({
            username,
            email,
            password // ستتشفير تلقائياً في مودل User
        });
        
        await user.save();
        
        // 3. إنشاء توكن
        const token = generateToken(user._id);
        
        // 4. إرجاع النتيجة (بدون كلمة المرور)
        res.status(201).json({
            success: true,
            message: '✅ تم إنشاء الحساب بنجاح',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                balance: user.balance,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ في السيرفر',
            error: error.message
        });
    }
};

// 🔑 تسجيل الدخول
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // 1. البحث عن المستخدم
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: '❌ البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }
        
        // 2. التحقق من كلمة المرور
        const isMatch = await user.comparePassword(password);
        
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: '❌ البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }
        
        // 3. التحقق من تفعيل الحساب
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: '❌ حسابك موقوف، يرجى التواصل مع الدعم'
            });
        }
        
        // 4. إنشاء توكن جديد
        const token = generateToken(user._id);
        
        // 5. إرجاع النتيجة
        res.json({
            success: true,
            message: '✅ تم تسجيل الدخول بنجاح',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                balance: user.balance,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ في السيرفر',
            error: error.message
        });
    }
};

// 👤 الحصول على بيانات المستخدم الحالي
exports.getProfile = async (req, res) => {
    try {
        res.json({
            success: true,
            user: req.user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ في السيرفر'
        });
    }
};
