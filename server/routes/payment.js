// المكان: server/routes/payment.js (النسخة الكاملة والنهائية والمصححة)

const express = require('express');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

// الدالة المصدرة يجب أن تستقبل 'upload' middleware من multer
module.exports = (upload) => {
    const router = express.Router();
    
    // ===================================================================
    // مسار شحن الرصيد (هنا كان يكمن الخطأ على الأرجح)
    // ===================================================================
    // نطبق 'upload.single('receipt')' كـ middleware على هذا المسار تحديداً
    // هذا يخبر multer بمعالجة الملف المرفق الذي يحمل اسم 'receipt'
    router.post('/deposit', upload.single('receipt'), async (req, res) => {
        try {
            // 1. استخراج البيانات من الطلب
            // req.body يحتوي على الحقول النصية (fullName, amount)
            // req.file يحتوي على معلومات الملف الذي تم رفعه بواسطة multer
            const { fullName, amount } = req.body;
            
            // 2. التحقق من وجود الملف (أهم خطوة)
            if (!req.file) {
                // إذا لم يجد multer أي ملف، سيرجع هذا الخطأ
                return res.status(400).json({ message: 'صورة الإيصال مطلوبة. يرجى رفع الملف.' });
            }
            
            // 3. التحقق من صحة المبلغ
            const depositAmount = parseFloat(amount);
            if (!depositAmount || depositAmount <= 0) {
                return res.status(400).json({ message: 'المبلغ المحول غير صالح.' });
            }

            // 4. التحقق من وجود الاسم الكامل
            if (!fullName || fullName.trim() === '') {
                return res.status(400).json({ message: 'الاسم الكامل مطلوب.' });
            }
            
            // 5. إنشاء معاملة شحن جديدة
            const transaction = new Transaction({
                user: req.user._id, // req.user يأتي من middleware المصادقة
                type: 'deposit',
                amount: depositAmount,
                fullName: fullName.trim(),
                receiptImage: req.file.path, // .path هو الرابط الذي يرجعه Cloudinary
                status: 'pending'
            });
            
            await transaction.save();
            
            // 6. إرسال رد ناجح
            res.status(201).json({
                message: 'تم إرسال طلب الشحن بنجاح، سيتم مراجعته من قبل الإدارة.',
                transactionId: transaction._id
            });

        } catch (error) {
            console.error('Deposit error:', error);
            res.status(500).json({ message: 'حدث خطأ غير متوقع في الخادم أثناء معالجة طلب الشحن.' });
        }
    });
    
    // ===================================================================
    // مسار سحب الأرباح (لا تغييرات كبيرة هنا)
    // ===================================================================
    router.post('/withdraw', async (req, res) => {
        try {
            const { fullName, shamCashNumber, amount } = req.body;
            const withdrawAmount = parseFloat(amount);
            
            if (!fullName || !shamCashNumber || !withdrawAmount) {
                return res.status(400).json({ message: 'جميع الحقول مطلوبة لإتمام عملية السحب.' });
            }
            
            if (withdrawAmount < 5) {
                return res.status(400).json({ message: 'الحد الأدنى لمبلغ السحب هو 5 دولارات.' });
            }
            
            // تحديث رصيد المستخدم في الذاكرة قبل التحقق
            const user = await User.findById(req.user._id);
            if (withdrawAmount > user.balance) {
                return res.status(400).json({ message: 'رصيدك الحالي غير كافٍ لإتمام عملية السحب.' });
            }

            // خصم المبلغ من رصيد المستخدم فوراً عند تقديم الطلب
            user.balance -= withdrawAmount;
            await user.save();
            
            const transaction = new Transaction({
                user: req.user._id,
                type: 'withdraw',
                amount: withdrawAmount,
                fullName,
                shamCashNumber,
                status: 'pending' // الطلب الآن معلق لموافقة المدير
            });
            
            await transaction.save();
            
            res.status(201).json({
                message: 'تم إرسال طلب السحب بنجاح وهو قيد المراجعة.',
                transactionId: transaction._id,
                newBalance: user.balance // إرجاع الرصيد الجديد لتحديث الواجهة
            });
        } catch (error) {
            console.error('Withdraw error:', error);
            res.status(500).json({ message: 'حدث خطأ في الخادم أثناء معالجة طلب السحب.' });
        }
    });
    
    // هذا المسار لم يعد مستخدماً لأننا نقلنا منطقه إلى admin.js
    // يمكنك حذفه أو إبقاءه كمرجع
    // router.get('/admin/transactions', ...);
    // router.put('/admin/transactions/:id', ...);
    
    return router;
};
