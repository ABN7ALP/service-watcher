const express = require('express');
const { ObjectId } = require('mongodb');
const connectDB = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// =================================================================
// ==                  نقاط النهاية للمستخدم العادي                  ==
// =================================================================

// --- نقطة النهاية: POST /api/wallet/deposit ---
// لإنشاء طلب إيداع جديد
router.post('/deposit', authMiddleware, async (req, res) => {
    try {
        const { amount, transactionId } = req.body;
        const userId = new ObjectId(req.user.id);

        // 1. التحقق من المدخلات
        if (!amount || !transactionId) {
            return res.status(400).json({ message: "Please provide amount and transaction ID." });
        }
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ message: "Invalid amount." });
        }

        const db = await connectDB();
        
        // 2. جلب اسم المستخدم من قاعدة البيانات
        const user = await db.collection('users').findOne({ _id: userId });
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // 3. إنشاء سجل المعاملة في قاعدة البيانات
        await db.collection('transactions').insertOne({
            userId: userId,
            username: user.username,
            type: 'deposit',
            amount: numericAmount,
            transactionId: transactionId,
            status: 'pending',
            createdAt: new Date()
        });

        // 4. تحديث رصيد المستخدم "المعلق" (Pending)
        await db.collection('users').updateOne(
            { _id: userId },
            { $inc: { 'balance.pending': numericAmount } }
        );

        res.status(201).json({ message: "Deposit request received. It will be reviewed shortly." });

    } catch (error) {
        console.error("Deposit Request Error:", error);
        res.status(500).json({ message: "Server error during deposit request." });
    }
});


// =================================================================
// ==                     نقاط النهاية للمدير                       ==
// =================================================================

// --- وسيط حماية خاص بالمدير (Admin Middleware) ---
// بسيط وفعال: يتحقق من مفتاح سري يتم إرساله في الهيدر
const adminAuth = (req, res, next) => {
    const adminKey = req.header('x-admin-key');
    if (adminKey !== process.env.ADMIN_SECRET_KEY) { // سنضيف هذا المتغير لملف .env
        return res.status(403).json({ message: "Forbidden: Access denied." });
    }
    next();
};

// --- نقطة النهاية: GET /api/wallet/admin/pending-deposits ---
// لجلب كل طلبات الإيداع المعلقة
router.get('/admin/pending-deposits', adminAuth, async (req, res) => {
    try {
        const db = await connectDB();
        const pendingDeposits = await db.collection('transactions')
            .find({ type: 'deposit', status: 'pending' })
            .sort({ createdAt: 1 }) // الأقدم أولاً
            .toArray();
        res.json(pendingDeposits);
    } catch (error) {
        console.error("Admin Fetch Error:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// --- نقطة النهاية: POST /api/wallet/admin/approve-deposit/:id ---
// للموافقة على طلب إيداع
router.post('/admin/approve-deposit/:id', adminAuth, async (req, res) => {
    try {
        const transactionId = new ObjectId(req.params.id);
        const db = await connectDB();

        // 1. البحث عن المعاملة والتأكد من أنها طلب إيداع معلق
        const transaction = await db.collection('transactions').findOne({ _id: transactionId, type: 'deposit', status: 'pending' });
        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found or already processed.' });
        }

        // --- بداية العملية المالية (Transaction) ---
        // 2. تحديث حالة المعاملة إلى "مكتملة"
        const updateTransactionPromise = db.collection('transactions').updateOne(
            { _id: transactionId },
            { $set: { status: 'completed', processedAt: new Date() } }
        );

        // 3. تحويل الرصيد من "معلق" إلى "متاح" لدى المستخدم
        const updateUserPromise = db.collection('users').updateOne(
            { _id: transaction.userId },
            {
                $inc: {
                    'balance.available': transaction.amount, // زيادة الرصيد المتاح
                    'balance.pending': -transaction.amount,  // إنقاص الرصيد المعلق
                    'stats.totalDeposited': transaction.amount
                }
            }
        );
        
        // 4. تنفيذ العمليتين معاً لضمان التناسق
        await Promise.all([updateTransactionPromise, updateUserPromise]);
        // --- نهاية العملية المالية ---

        res.json({ message: `Deposit of ${transaction.amount} for user ${transaction.username} has been approved.` });

    } catch (error) {
        console.error('Approve Deposit Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// --- نقطة النهاية: POST /api/wallet/admin/reject-deposit/:id ---
// لرفض طلب إيداع
router.post('/admin/reject-deposit/:id', adminAuth, async (req, res) => {
    try {
        const transactionId = new ObjectId(req.params.id);
        const db = await connectDB();

        const transaction = await db.collection('transactions').findOne({ _id: transactionId, type: 'deposit', status: 'pending' });
        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found or already processed.' });
        }

        // تحديث حالة المعاملة إلى "مرفوضة"
        await db.collection('transactions').updateOne(
            { _id: transactionId },
            { $set: { status: 'rejected', processedAt: new Date() } }
        );

        // إعادة الرصيد المعلق إلى الصفر للمستخدم
        await db.collection('users').updateOne(
            { _id: transaction.userId },
            { $inc: { 'balance.pending': -transaction.amount } }
        );

        res.json({ message: `Deposit for user ${transaction.username} has been rejected.` });
    } catch (error) {
        console.error('Reject Deposit Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
