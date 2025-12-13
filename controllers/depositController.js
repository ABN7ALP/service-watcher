// 📁 controllers/depositController.js
const DepositRequest = require('../models/DepositRequest');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { addToQueue } = require('../services/queueService');
const path = require('path');

// 📥 تقديم طلب إيداع جديد
exports.createDepositRequest = async (req, res) => {
    const session = await User.startSession();
    session.startTransaction();
    
    try {
        const userId = req.userId;
        const { amount, senderName, transactionId } = req.body;
        
        // 1. التحقق من البيانات
        if (!amount || !senderName || !transactionId || !req.file) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: '❌ جميع البيانات مطلوبة: المبلغ، الاسم، رقم المعاملة، وصورة الإيصال'
            });
        }
        
        // 2. التحقق من عدم تكرار رقم المعاملة
        const existingDeposit = await DepositRequest.findOne({ transactionId });
        if (existingDeposit) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: '❌ رقم المعاملة هذا مستخدم مسبقاً'
            });
        }
        
        // 3. إنشاء طلب الإيداع
        const deposit = new DepositRequest({
            userId,
            amount: parseFloat(amount),
            senderName,
            transactionId,
            screenshot: `/uploads/deposits/${req.file.filename}`,
            status: 'pending'
        });
        
        await deposit.save({ session });
        
        // 4. إضافة للطابور للمعالجة
        
        await addToQueue('deposit', 'notify_user', { depositId: deposit._id });
        await addToQueue('deposit', 'auto_check', { depositId: deposit._id }, { delay: 60000 });
        
        // 5. تأكيد العملية
        await session.commitTransaction();
        session.endSession();
        
        // 6. إرسال رد ناجح مع التنبيه
        res.json({
            success: true,
            message: '✅ تم استلام طلب الإيداع بنجاح',
            notice: '⏳ المعاملة يدوية، ستأخذ من 5 إلى 30 دقيقة للمراجعة والموافقة.',
            data: {
                requestId: deposit._id,
                amount: deposit.amount,
                transactionId: deposit.transactionId,
                estimatedTime: '5-30 دقيقة',
                status: deposit.status
            }
        });
        
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        
        console.error('❌ خطأ في طلب الإيداع:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء إنشاء طلب الإيداع',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 📋 الحصول على طلبات الإيداع الخاصة بالمستخدم
exports.getMyDeposits = async (req, res) => {
    try {
        const userId = req.userId;
        const { status, limit = 20, page = 1 } = req.query;
        
        const query = { userId };
        if (status) query.status = status;
        
        const deposits = await DepositRequest.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .select('-adminNotes'); // إخفاء الملاحظات السرية
        
        const total = await DepositRequest.countDocuments(query);
        
        res.json({
            success: true,
            deposits,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '❌ خطأ في جلب طلبات الإيداع'
        });
    }
};

// 👀 رؤية تفاصيل طلب إيداع واحد
exports.getDepositDetails = async (req, res) => {
    try {
        const deposit = await DepositRequest.findById(req.params.id)
            .populate('userId', 'username email')
            .populate('reviewedBy', 'username');
        
        if (!deposit) {
            return res.status(404).json({
                success: false,
                message: '❌ طلب الإيداع غير موجود'
            });
        }
        
        // التحقق من ملكية الطلب (ما لم يكن أدمن)
        if (deposit.userId._id.toString() !== req.userId.toString() && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: '❌ ليس لديك صلاحية لعرض هذا الطلب'
            });
        }
        
        // إخفاء adminNotes إذا لم يكن أدمن
        const responseData = deposit.toObject();
        if (req.user.role !== 'admin') {
            delete responseData.adminNotes;
        }
        
        res.json({
            success: true,
            deposit: responseData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '❌ خطأ في جلب تفاصيل الطلب'
        });
    }
};
