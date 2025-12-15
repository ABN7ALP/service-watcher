const express = require('express');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

module.exports = (upload) => {
    const router = express.Router();
    
    // شحن الرصيد
    router.post('/deposit', upload.single('receipt'), async (req, res) => {
        try {
            const { fullName, amount } = req.body;
            
            if (!req.file) {
                return res.status(400).json({ message: 'يجب رفع صورة الإيصال' });
            }
            
            if (!amount || amount <= 0) {
                return res.status(400).json({ message: 'المبلغ غير صالح' });
            }
            
            // إنشاء معاملة شحن
            const transaction = new Transaction({
                user: req.user._id,
                type: 'deposit',
                amount: parseFloat(amount),
                fullName,
                receiptImage: req.file.path,
                status: 'pending'
            });
            
            await transaction.save();
            
            res.status(201).json({
                message: 'تم إرسال طلب الشحن بنجاح',
                transactionId: transaction._id
            });
        } catch (error) {
            console.error('Deposit error:', error);
            res.status(500).json({ message: 'خطأ في الخادم' });
        }
    });
    
    // سحب الأرباح
    router.post('/withdraw', async (req, res) => {
        try {
            const { fullName, shamCashNumber, amount } = req.body;
            const withdrawAmount = parseFloat(amount);
            
            // التحقق من البيانات
            if (!fullName || !shamCashNumber || !withdrawAmount) {
                return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
            }
            
            if (withdrawAmount < 5) {
                return res.status(400).json({ message: 'الحد الأدنى للسحب هو $5' });
            }
            
            if (withdrawAmount > 1000) {
                return res.status(400).json({ message: 'الحد الأقصى للسحب هو $1000' });
            }
            
            if (withdrawAmount > req.user.balance) {
                return res.status(400).json({ message: 'رصيدك غير كافٍ للسحب' });
            }
            
            // إنشاء معاملة سحب
            const transaction = new Transaction({
                user: req.user._id,
                type: 'withdraw',
                amount: withdrawAmount,
                fullName,
                shamCashNumber,
                status: 'pending'
            });
            
            await transaction.save();
            
            res.status(201).json({
                message: 'تم إرسال طلب السحب بنجاح',
                transactionId: transaction._id
            });
        } catch (error) {
            console.error('Withdraw error:', error);
            res.status(500).json({ message: 'خطأ في الخادم' });
        }
    });
    
    // الحصول على جميع المعاملات (للإدارة)
    router.get('/admin/transactions', async (req, res) => {
        try {
            // في التطبيق الحقيقي، تأكد أن المستخدم هو مدير
            const transactions = await Transaction.find()
                .populate('user', 'username email')
                .populate('processedBy', 'username')
                .sort({ createdAt: -1 });
            
            res.json(transactions);
        } catch (error) {
            console.error('Admin transactions error:', error);
            res.status(500).json({ message: 'خطأ في الخادم' });
        }
    });
    
    // تحديث حالة المعاملة (للإدارة)
    router.put('/admin/transactions/:id', async (req, res) => {
    try {
        const { status, adminNote } = req.body;
        const transactionId = req.params.id;
        const { io, onlineUsers } = req; // <-- الحصول على io من الطلب

        const transaction = await Transaction.findById(transactionId).populate('user');
        if (!transaction) {
            return res.status(404).json({ message: 'المعاملة غير موجودة' });
        }

        // --- بداية منطق الإشعارات الفورية ---
        const user = transaction.user;
        let notificationPayload = null;

        // إذا تمت الموافقة على الشحن
        if (transaction.type === 'deposit' && status === 'approved' && transaction.status !== 'approved') {
            await user.updateBalance(transaction.amount, 'deposit');
            transaction.note = `تمت إضافة $${transaction.amount} إلى رصيدك.`;
            notificationPayload = {
                type: 'success',
                message: `تمت الموافقة على طلب الشحن. أُضيف $${transaction.amount} إلى رصيدك.`,
                newBalance: user.balance
            };
        }
        
        // إذا تمت الموافقة على السحب
        if (transaction.type === 'withdraw' && status === 'approved' && transaction.status !== 'approved') {
            // الرصيد يتم خصمه عند تقديم الطلب، لا حاجة لخصمه مرة أخرى
            transaction.note = `تمت الموافقة على سحب $${transaction.amount}.`;
            notificationPayload = {
                type: 'success',
                message: `تمت الموافقة على طلب السحب بقيمة $${transaction.amount}.`,
                newBalance: user.balance
            };
        }

        // إذا تم رفض الطلب
        if (status === 'rejected' && transaction.status !== 'rejected') {
            // إذا كان الطلب سحباً مرفوضاً، يجب إعادة المبلغ للرصيد
            if (transaction.type === 'withdraw') {
                await user.updateBalance(transaction.amount, 'deposit'); // "deposit" لإعادة المبلغ
            }
            transaction.note = `تم رفض طلبك. السبب: ${adminNote || 'غير محدد'}`;
            notificationPayload = {
                type: 'error',
                message: transaction.note,
                newBalance: user.balance
            };
        }

        // إرسال الإشعار إذا كان المستخدم متصلاً
        if (notificationPayload) {
            const userSocketId = onlineUsers.get(user._id.toString());
            if (userSocketId) {
                io.to(userSocketId).emit('notification', notificationPayload);
            }
        }
        // --- نهاية منطق الإشعارات الفورية ---

        transaction.status = status;
        transaction.adminNote = adminNote;
        transaction.processedBy = req.user._id; // يفترض أن المدير مسجل دخوله
        transaction.processedAt = new Date();
        await transaction.save();
        
        res.json({ message: 'تم تحديث حالة المعاملة', transaction });
    } catch (error) {
        console.error('Update transaction error:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

return router;
};
