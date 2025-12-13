// 📁 worker.js
require('dotenv').config();
const Queue = require('bull');
const mongoose = require('mongoose');

// الاتصال بقاعدة البيانات
mongoose.connect(process.env.MONGODB_URI);

// استيراد الطوابير
const { depositQueue, withdrawalQueue, notificationQueue } = require('./services/queueService');

console.log('🚀 بدأ تشغيل Worker للمهام الخلفية...');

// معالجة الطوابير
depositQueue.on('completed', (job) => {
    console.log(`✅ تمت معالجة إيداع: ${job.id}`);
});

depositQueue.on('failed', (job, error) => {
    console.error(`❌ فشل إيداع ${job.id}:`, error);
});

withdrawalQueue.on('completed', (job) => {
    console.log(`✅ تمت معالجة سحب: ${job.id}`);
});

notificationQueue.on('completed', (job) => {
    console.log(`📨 تم إرسال إشعار: ${job.id}`);
});

// تنظيف دوري
setInterval(async () => {
    const oldDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    await depositQueue.clean(oldDate, 'completed');
    await withdrawalQueue.clean(oldDate, 'completed');
    await notificationQueue.clean(oldDate, 'completed');
    
    console.log('🧹 تم تنظيف المهام القديمة');
}, 60 * 60 * 1000); // كل ساعة
