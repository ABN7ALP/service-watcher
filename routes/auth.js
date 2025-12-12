// routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const connectDB = require('../db');

const router = express.Router();
const saltRounds = 10;

// --- نقطة النهاية: POST /api/auth/register ---
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. التحقق من المدخلات
        if (!username || !password) {
            return res.status(400).json({ message: "الرجاء إدخال اسم مستخدم وكلمة مرور." });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: "يجب أن تكون كلمة المرور 6 أحرف على الأقل." });
        }

        const db = await connectDB();
        const usersCollection = db.collection('users');

        // 2. التحقق مما إذا كان المستخدم موجوداً بالفعل
        const existingUser = await usersCollection.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ message: "اسم المستخدم هذا مستخدم بالفعل." });
        }

        // 3. تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // 4. إنشاء المستخدم الجديد
        await usersCollection.insertOne({
            username: username.toLowerCase(),
            password: hashedPassword,
            balance: 0,
            lastSpin: null,
            createdAt: new Date()
        });

        res.status(201).json({ message: "تم تسجيل حسابك بنجاح!" });

    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ message: "حدث خطأ في السيرفر." });
    }
});

// سنضيف كود تسجيل الدخول هنا لاحقاً
// router.post('/login', ...);

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. التحقق من المدخلات
        if (!username || !password) {
            return res.status(400).json({ message: "الرجاء إدخال اسم مستخدم وكلمة مرور." });
        }

        const db = await connectDB();
        const usersCollection = db.collection('users');

        // 2. البحث عن المستخدم في قاعدة البيانات
        const user = await usersCollection.findOne({ username: username.toLowerCase() });
        if (!user) {
            return res.status(401).json({ message: "اسم المستخدم أو كلمة المرور غير صحيحة." });
        }

        // 3. مقارنة كلمة المرور المدخلة مع الكلمة المشفرة في قاعدة البيانات
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "اسم المستخدم أو كلمة المرور غير صحيحة." });
        }

        // 4. إنشاء التوكن (JWT)
        // لا تنس استيراد المكتبة في أعلى الملف
        const jwt = require('jsonwebtoken');

        const payload = {
            user: {
                id: user._id,
                username: user.username
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '7d' }, // صلاحية التوكن (مثلاً: 7 أيام)
            (err, token) => {
                if (err) throw err;
                // 5. إرسال التوكن إلى المستخدم
                res.json({ token });
            }
        );

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: "حدث خطأ في السيرفر." });
    }
});


module.exports = router;
