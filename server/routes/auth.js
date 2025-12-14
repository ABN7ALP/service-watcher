const express = require('express');
const router = express.Router();
const User = require('../models/User');

// تسجيل الدخول
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // إيجاد المستخدم
        const user = await User.findOne({ 
            $or: [
                { username },
                { email: username }
            ]
        });
        
        if (!user) {
            return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
        
        if (!user.isActive) {
            return res.status(403).json({ message: 'الحساب معطل، يرجى التواصل مع الإدارة' });
        }
        
        // التحقق من كلمة المرور
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
        
        // تحديث وقت آخر دخول
        user.lastLogin = new Date();
        await user.save();
        
        // في بيئة الإنتاج، استخدم JWT
        // هنا نرجع معرف المستخدم للتبسيط
        res.json({
            token: user._id.toString(),
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                balance: user.balance,
                phone: user.phone
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// التسجيل
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, phone } = req.body;
        
        // التحقق من عدم وجود مستخدم بنفس الاسم أو البريد
        const existingUser = await User.findOne({
            $or: [
                { username },
                { email }
            ]
        });
        
        if (existingUser) {
            return res.status(400).json({ 
                message: 'اسم المستخدم أو البريد الإلكتروني مسجل بالفعل' 
            });
        }
        
        // إنشاء مستخدم جديد
        const user = new User({
            username,
            email,
            password,
            phone
        });
        
        await user.save();
        
        res.status(201).json({ 
            message: 'تم إنشاء الحساب بنجاح',
            userId: user._id 
        });
    } catch (error) {
        console.error('Registration error:', error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

module.exports = router;
