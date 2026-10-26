// ملف: server/utils/depositIntentExpiryJob.js
// ✅ شحن الكوينزات عبر شام كاش (feat/wallet-recharge-v1) — مهمة دورية تحوّل كل طلب بوضع
// awaiting_payment تجاوز expiresAt (30 دقيقة افتراضياً) إلى 'expired'. الطلبات submitted لا
// تنتهي صلاحيتها تلقائياً أبداً (المستخدم أرسل إشعار تحويل فعلياً، بانتظار مراجعة الإدارة فقط)

const DepositIntent = require('../models/DepositIntent');

const expireStaleDepositIntents = async () => {
    try {
        const result = await DepositIntent.updateMany(
            { status: 'awaiting_payment', expiresAt: { $lte: new Date() } },
            { $set: { status: 'expired' } }
        );
        if (result.modifiedCount > 0) {
            console.log(`[DEPOSIT INTENT EXPIRY] ${result.modifiedCount} طلب(ات) شحن منتهية الصلاحية`);
        }
    } catch (error) {
        console.error('[DEPOSIT INTENT EXPIRY ERROR]:', error);
    }
};

const startDepositIntentExpiryJob = () => {
    expireStaleDepositIntents();
    setInterval(expireStaleDepositIntents, 2 * 60 * 1000);
    console.log('[DEPOSIT INTENT EXPIRY] Job started (runs every 2 minutes)');
};

module.exports = { startDepositIntentExpiryJob, expireStaleDepositIntents };
