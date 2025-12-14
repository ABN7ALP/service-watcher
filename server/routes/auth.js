// المكان: server/routes/auth.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken'); // <-- إضافة جديدة

// تسجيل الدخول
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ 
            $or: [{ username }, { email: username }]
        });
        
        if (!user || !user.isActive) {
            return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة أو الحساب معطل' });
        }
        
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
        
        user.lastLogin = new Date();
        await user.save();
        
        // --- بداية التعديل: إنشاء توكن JWT ---
        const payload = {
            user: {
                id: user._id,
                username: user.username
                // يمكنك إضافة أدوار هنا مستقبلاً, مثال: role: user.role
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET, // مفتاح سري يجب إضافته في ملف .env
            { expiresIn: '3d' }, // صلاحية التوكن: 3 أيام
            (err, token) => {
                if (err) throw err;
                res.json({
                    token, // إرجاع التوكن بدلاً من user._id
                    user: {
                        _id: user._id,
                        username: user.username,
                        email: user.email,
                        balance: user.balance,
                        phone: user.phone
                    }
                });
            }
        );
        // --- نهاية التعديل ---

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// مسار التسجيل (لا تغيير هنا)
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, phone } = req.body;
        
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        
        if (existingUser) {
            return res.status(400).json({ message: 'اسم المستخدم أو البريد الإلكتروني مسجل بالفعل' });
        }
        
        const user = new User({ username, email, password, phone });
        await user.save();
        
        res.status(201).json({ message: 'تم إنشاء الحساب بنجاح', userId: user._id });
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
