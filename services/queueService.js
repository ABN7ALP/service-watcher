// 📁 services/queueService.js - النسخة المحدثة
const Queue = require('bull');
const DepositRequest = require('../models/DepositRequest');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const User = require('../models/User');

// استخدام REDIS_URL من متغيرات البيئة
const redisConfig = process.env.REDIS_URL 
    ? { redis: process.env.REDIS_URL }
    : {
        redis: {
            host: 'localhost',
            port: 6379
        }
    };

// طابور الإيداع
const depositQueue = new Queue('depositProcessing', {
    ...redisConfig,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 20, // الاحتفاظ بـ 20 وظيفة مكتملة
        removeOnFail: 50 // الاحتفاظ بـ 50 وظيفة فاشلة
    }
});

// طابور السحب الجديد
const withdrawalQueue = new Queue('withdrawalProcessing', {
    ...redisConfig,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 10000 },
        removeOnComplete: 20,
        removeOnFail: 30
    }
});

// طابور الإشعارات
const notificationQueue = new Queue('notifications', {
    ...redisConfig,
    defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: false
    }
});

// ========== معالجة طلبات الإيداع ==========
depositQueue.process('notify_user', async (job) => {
    const { depositId } = job.data;
    const deposit = await DepositRequest.findById(depositId).populate('userId');
    
    if (deposit) {
        // هنا يمكنك إرسال إشعار للمستخدم (سنضيفه لاحقاً)
        console.log(`📧 إشعار: طلب الإيداع #${depositId} قيد المراجعة`);
    }
});

depositQueue.process('auto_check', async (job) => {
    const { depositId } = job.data;
    const deposit = await DepositRequest.findById(depositId);
    
    if (!deposit) return;
    
    // فحص الاحتيال الأساسي
    const similarCount = await DepositRequest.countDocuments({
        transactionId: deposit.transactionId,
        _id: { $ne: deposit._id }
    });
    
    if (similarCount > 0) {
        deposit.status = 'rejected';
        deposit.adminNotes = 'رقم المعاملة مكرر - اشتباه بالاحتيال';
        await deposit.save();
        
        // إضافة إشعار
        await notificationQueue.add('deposit_rejected', {
            userId: deposit.userId,
            depositId: deposit._id,
            reason: 'رقم معاملة مكرر'
        });
    }
});

// ========== معالجة طلبات السحب ==========
withdrawalQueue.process('notify_withdrawal_request', async (job) => {
    const { withdrawalId } = job.data;
    const withdrawal = await WithdrawalRequest.findById(withdrawalId)
        .populate('userId');
    
    if (withdrawal) {
        // إشعار للأدمن بوجود طلب سحب جديد
        await notificationQueue.add('new_withdrawal_admin', {
            withdrawalId: withdrawal._id,
            amount: withdrawal.amount,
            userId: withdrawal.userId._id,
            username: withdrawal.userId.username
        });
        
        console.log(`🔔 طلب سحب جديد #${withdrawalId} - ${withdrawal.amount}$`);
    }
});

withdrawalQueue.process('auto_process_withdrawal', async (job) => {
    const { withdrawalId } = job.data;
    const withdrawal = await WithdrawalRequest.findById(withdrawalId)
        .populate('userId');
    
    if (!withdrawal || withdrawal.status !== 'processing') return;
    
    // هنا يمكنك دمج مع خدمة الدفع التلقائي إذا كانت متاحة
    // حالياً، سنتركها للأدمن للتعامل اليدوي
    
    // بعد 12 ساعة، إذا كانت لا تزال processing، نرسل تذكير
    await notificationQueue.add('withdrawal_reminder', {
        withdrawalId: withdrawal._id,
        delay: 12 * 60 * 60 * 1000 // 12 ساعة
    });
});

// ========== إدارة الإشعارات ==========
notificationQueue.process('deposit_rejected', async (job) => {
    const { userId, depositId, reason } = job.data;
    // TODO: إرسال إشعار للمستخدم (سنضيف WebSocket لاحقاً)
    console.log(`🚨 رفض إيداع للمستخدم ${userId}: ${reason}`);
});

notificationQueue.process('new_withdrawal_admin', async (job) => {
    const { withdrawalId, amount, username } = job.data;
    // TODO: إشعار للأدمن في الوقت الحقيقي
    console.log(`💸 طلب سحب جديد من ${username}: ${amount}$ (#${withdrawalId})`);
});

// ========== دالات المساعدة ==========
exports.addToQueue = async (queueName, jobType, data, options = {}) => {
    let queue;
    
    switch (queueName) {
        case 'deposit':
            queue = depositQueue;
            break;
        case 'withdrawal':
            queue = withdrawalQueue;
            break;
        case 'notification':
            queue = notificationQueue;
            break;
        default:
            throw new Error('طابور غير معروف');
    }
    
    const job = await queue.add(jobType, data, options);
    return job.id;
};

exports.getQueueStats = async () => {
    const [depositStats, withdrawalStats, notificationStats] = await Promise.all([
        depositQueue.getJobCounts(),
        withdrawalQueue.getJobCounts(),
        notificationQueue.getJobCounts()
    ]);
    
    return {
        deposit: depositStats,
        withdrawal: withdrawalStats,
        notification: notificationStats
    };
};

// تنظيف الوظائف القديمة (تشغيل مرة يومياً)
setInterval(async () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    await depositQueue.clean(weekAgo, 'completed');
    await depositQueue.clean(weekAgo, 'failed');
    await withdrawalQueue.clean(weekAgo, 'completed');
    await withdrawalQueue.clean(weekAgo, 'failed');
}, 24 * 60 * 60 * 1000); // كل 24 ساعة

// تصدير الطوابير للاستخدام في أماكن أخرى
module.exports.depositQueue = depositQueue;
module.exports.withdrawalQueue = withdrawalQueue;
module.exports.notificationQueue = notificationQueue;
