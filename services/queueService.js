// 📁 services/queueService.js
const Queue = require('bull');
const DepositRequest = require('../models/DepositRequest');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// إنشاء طابور جديد
const depositQueue = new Queue('depositProcessing', {
    redis: {
        host: process.env.REDIS_URL || 'redis://localhost:6379',
        // في Railway، ستضيف متغير REDIS_URL لاحقاً
    },
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000
        },
        removeOnComplete: true,
        removeOnFail: false
    }
});

// معالج الوظائف في الخلفية
depositQueue.process(async (job) => {
    const { depositId, action } = job.data;
    
    try {
        const deposit = await DepositRequest.findById(depositId)
            .populate('userId', 'username balance');
        
        if (!deposit) {
            throw new Error('طلب الإيداع غير موجود');
        }
        
        if (action === 'notify_user') {
            // هنا يمكنك إرسال إشعار للمستخدم
            console.log(`📧 إشعار للمستخدم ${deposit.userId.username}: طلبك قيد المراجعة`);
            
        } else if (action === 'auto_check') {
            // فحص تلقائي للاحتيال (يمكن تطويره)
            const similarDeposits = await DepositRequest.countDocuments({
                transactionId: deposit.transactionId,
                _id: { $ne: deposit._id }
            });
            
            if (similarDeposits > 0) {
                deposit.status = 'rejected';
                deposit.adminNotes = 'رقم المعاملة مكرر - يشتبه بالاحتيال';
                await deposit.save();
                console.log(`🚨 اشتباه بالاحتيال في طلب ${depositId}`);
            }
        }
        
        return { success: true, depositId };
    } catch (error) {
        console.error('❌ خطأ في معالجة الطابور:', error);
        throw error;
    }
});

// إضافة وظائف للطابور
exports.addToQueue = async (depositId, action, delay = 0) => {
    const job = await depositQueue.add(
        { depositId, action },
        { delay } // تأخير بالميلي ثانية
    );
    return job.id;
};

// إحصائيات الطابور
exports.getQueueStats = async () => {
    const counts = await depositQueue.getJobCounts();
    return counts;
};

module.exports.depositQueue = depositQueue;
