// المكان: server/routes/admin.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const SystemStats = require('../models/SystemStats');

// مسار لجلب الإحصائيات العامة
router.get('/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalTransactions = await Transaction.countDocuments();
        const pendingTransactions = await Transaction.countDocuments({ status: 'pending' });
        const systemStats = await SystemStats.findById('main_stats');

        res.json({
            totalUsers,
            totalTransactions,
            pendingTransactions,
            totalSpins: systemStats?.totalSpins || 0,
            totalWins: systemStats?.totalWins || 0,
            serverProfit: ((systemStats?.totalSpins || 0) * 1) - (systemStats?.totalWins || 0)
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في جلب الإحصائيات', error });
    }
});

// مسار لجلب جميع المستخدمين مع إمكانية البحث
router.get('/users', async (req, res) => {
    try {
        const { search } = req.query;
        let query = {};
        if (search) {
            query = {
                $or: [
                    { username: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            };
        }
        const users = await User.find(query).sort({ createdAt: -1 }).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في جلب المستخدمين', error });
    }
});

// مسار لتغيير حالة المستخدم (تفعيل/تعطيل)
router.put('/users/:id/status', async (req, res) => {
    try {
        const { isActive } = req.body;
        const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في تحديث حالة المستخدم', error });
    }
});

// مسار لجلب جميع المعاملات مع إمكانية الفلترة
router.get('/transactions', async (req, res) => {
    try {
        const { status, type, search } = req.query;
        let query = {};
        if (status && status !== 'all') query.status = status;
        if (type && type !== 'all') query.type = type;

        const transactions = await Transaction.find(query)
            .populate('user', 'username email') // جلب معلومات المستخدم المرتبط
            .sort({ createdAt: -1 });
        
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في جلب المعاملات', error });
    }
});

// مسار تحديث المعاملة (نقلناه من payment.js إلى هنا لمركزية التحكم)
router.put('/transactions/:id/status', async (req, res) => {
    try {
        const { status, adminNote } = req.body;
        const { io, onlineUsers } = req;

        const transaction = await Transaction.findById(req.params.id).populate('user');
        if (!transaction) return res.status(404).json({ message: 'المعاملة غير موجودة' });

        const user = transaction.user;
        let notificationPayload = null;

        if (transaction.status !== status) { // تأكد من أن الحالة تتغير فعلاً
            if (transaction.type === 'deposit' && status === 'approved') {
                await user.updateBalance(transaction.amount, 'deposit');
                notificationPayload = { type: 'success', message: `تمت الموافقة على شحن $${transaction.amount}`, newBalance: user.balance };
            } else if (status === 'rejected') {
                if (transaction.type === 'withdraw') {
                    await user.updateBalance(transaction.amount, 'deposit'); // إعادة المبلغ
                }
                notificationPayload = { type: 'error', message: `تم رفض طلبك. السبب: ${adminNote || 'غير محدد'}`, newBalance: user.balance };
            } else if (transaction.type === 'withdraw' && status === 'approved') {
                notificationPayload = { type: 'success', message: `تمت الموافقة على سحب $${transaction.amount}`, newBalance: user.balance };
            }
        }

        transaction.status = status;
        transaction.adminNote = adminNote;
        transaction.processedBy = req.user._id;
        transaction.processedAt = new Date();
        await transaction.save();

        if (notificationPayload) {
            const userSocketId = onlineUsers.get(user._id.toString());
            if (userSocketId) {
                io.to(userSocketId).emit('notification', notificationPayload);
            }
        }
        
        res.json(transaction);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في تحديث المعاملة', error });
    }
});

module.exports = router;
