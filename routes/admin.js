// routes/admin.js
const express = require('express');
const connectDB = require('../db');
const { ObjectId } = require('mongodb');

const router = express.Router();

// --- وسيط حماية خاص بالمدير ---
const adminAuth = (req, res, next) => {
    const adminKey = req.header('x-admin-key');
    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
        return res.status(403).json({ message: "Forbidden: Invalid Admin Key" });
    }
    next();
};

// --- نقاط نهاية المدير ---

// جلب كل طلبات الإيداع المعلقة
router.get('/deposits/pending', adminAuth, async (req, res) => {
    try {
        const db = await connectDB();
        const pendingDeposits = await db.collection('deposits').find({ status: 'pending' }).sort({ createdAt: 1 }).toArray();
        res.json(pendingDeposits);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// الموافقة على طلب إيداع
router.post('/deposits/approve/:id', adminAuth, async (req, res) => {
    try {
        const depositId = req.params.id;
        const db = await connectDB();
        const depositsCollection = db.collection('deposits');
        const usersCollection = db.collection('users');

        const deposit = await depositsCollection.findOne({ _id: new ObjectId(depositId) });

        if (!deposit || deposit.status !== 'pending') {
            return res.status(404).json({ message: 'Deposit not found or already processed.' });
        }

        // --- عملية حرجة: تحديث رصيد المستخدم وتغيير حالة الطلب ---
        // 1. تحديث رصيد المستخدم
        await usersCollection.updateOne(
            { _id: deposit.userId },
            { $inc: { balance: deposit.amount } } // $inc تزيد الرصيد بالقيمة المحددة
        );

        // 2. تحديث حالة طلب الإيداع
        await depositsCollection.updateOne(
            { _id: new ObjectId(depositId) },
            { $set: { status: 'completed' } }
        );

        res.json({ message: `Approved. User ${deposit.username}'s balance updated.` });

    } catch (error) {
        console.error('Approve Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// رفض طلب إيداع
router.post('/deposits/reject/:id', adminAuth, async (req, res) => {
    try {
        const depositId = req.params.id;
        const db = await connectDB();
        
        await db.collection('deposits').updateOne(
            { _id: new ObjectId(depositId), status: 'pending' },
            { $set: { status: 'rejected' } }
        );

        res.json({ message: 'Deposit rejected.' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});


module.exports = router;
