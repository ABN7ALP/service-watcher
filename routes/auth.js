const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const connectDB = require('../config/db');

const router = express.Router();

// --- نقطة النهاية: POST /api/auth/register ---
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. التحقق من المدخلات
        if (!username || !password) {
            return res.status(400).json({ message: "Please provide username and password." });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters long." });
        }

        const db = await connectDB();
        const usersCollection = db.collection('users');

        // 2. التحقق من أن اسم المستخدم غير مستخدم
        const existingUser = await usersCollection.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ message: "Username already exists." });
        }

        // 3. تشفير كلمة المرور
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 4. إنشاء كائن المستخدم الجديد بناءً على النموذج الذي صممناه
        const newUser = {
            username: username.toLowerCase(),
            password: hashedPassword,
            balance: { available: 0, pending: 0 },
            stats: { totalSpins: 0, totalWon: 0, totalDeposited: 0 },
            lastSpinAt: null,
            createdAt: new Date()
        };

        // 5. حفظ المستخدم في قاعدة البيانات
        await usersCollection.insertOne(newUser);

        res.status(201).json({ message: "Account created successfully!" });

    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ message: "Server error during registration." });
    }
});

// --- نقطة النهاية: POST /api/auth/login ---
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: "Please provide username and password." });
        }

        const db = await connectDB();
        const usersCollection = db.collection('users');

        // 1. البحث عن المستخدم
        const user = await usersCollection.findOne({ username: username.toLowerCase() });
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials." });
        }

        // 2. مقارنة كلمة المرور
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials." });
        }

        // 3. إنشاء وإصدار التوكن (بطاقة الهوية الرقمية)
        const payload = {
            user: {
                id: user._id.toString() // نحول الـ ID إلى نص
            }
        };

        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // صلاحية التوكن: 7 أيام
        );

        res.json({ token });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: "Server error during login." });
    }
});

module.exports = router;
