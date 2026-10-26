const mongoose = require('mongoose');
const User = require('../models/User');
const LedgerEntry = require('../models/LedgerEntry');

// ✅ الحقل المخزَّن على User لكل محفظة — المرجع الوحيد؛ لا مكان آخر بالكود يجب أن يعرف هذا الربط
const WALLET_TO_USER_FIELD = {
    coins_paid: 'walletCoinsPaid',
    coins_bonus: 'walletCoinsBonus',
    beans_w: 'walletBeansW',
    beans_p: 'walletBeansP',
    usd_cents: 'walletUsdCents'
};

/**
 * الدالة الوحيدة المخوَّلة بتغيير أي رصيد بالتطبيق (coins_paid/coins_bonus/beans_w/beans_p/
 * usd_cents). تُطبَّق كل entries ذرّياً ضمن معاملة المستدعي (session إلزامية): لكل entry خصم
 * (delta سالب) حارسة $gte تمنع رصيداً سالباً، ثم قيد LedgerEntry واحد يُكتَب. عند تصادم
 * idempotencyKey (إعادة محاولة لعملية طُبِّقت فعلاً) يُعاد القيد الموجود بلا أي $inc إضافي.
 * @param {Array<{user, wallet, delta:number, type, refType?, refId?, idempotencyKey, meta?}>} entries
 * @param {import('mongoose').ClientSession} session
 * @returns {Promise<Array>} مستندات LedgerEntry (الموجودة فعلاً أو المُنشأة الآن)
 */
async function post(entries, session) {
    if (!session) throw new Error('walletService.post يتطلب session ضمن معاملة Mongo فعلية');
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error('walletService.post: entries يجب أن تكون مصفوفة غير فارغة');
    }

    const results = [];
    for (const entry of entries) {
        const { user, wallet, delta, type, refType = null, refId = null, idempotencyKey, meta = {} } = entry;
        if (!user || !wallet || !Number.isInteger(delta) || delta === 0 || !type || !idempotencyKey) {
            throw new Error('walletService.post: entry غير مكتمل (user/wallet/type/idempotencyKey مطلوبة، delta عدد صحيح غير صفري)');
        }
        const userField = WALLET_TO_USER_FIELD[wallet];
        if (!userField) throw new Error(`walletService.post: محفظة غير معروفة "${wallet}"`);

        const existing = await LedgerEntry.findOne({ idempotencyKey }).session(session);
        if (existing) { results.push(existing); continue; }

        const condition = { _id: user };
        if (delta < 0) condition[userField] = { $gte: -delta };
        const updatedUser = await User.findOneAndUpdate(
            condition,
            { $inc: { [userField]: delta } },
            { new: true, session }
        );
        if (!updatedUser) {
            throw Object.assign(new Error('رصيد غير كافٍ لإتمام العملية'), { code: 'INSUFFICIENT_FUNDS', wallet, user });
        }

        // ✅ coins/balance (الحقلان القديمان اللذان تعتمد عليهما كل واجهات العرض الحالية) يبقيان
        // مرآة متزامنة تلقائياً مع كل تحديث محفظة — لا حاجة لأي تعديل بواجهة المستخدم بهذي المرحلة
        const newCoinsTotal = updatedUser.walletCoinsPaid + updatedUser.walletCoinsBonus;
        const newBalance = Math.round(updatedUser.walletUsdCents) / 100;
        if (updatedUser.coins !== newCoinsTotal || updatedUser.balance !== newBalance) {
            await User.updateOne({ _id: user }, { $set: { coins: newCoinsTotal, balance: newBalance } }, { session });
        }

        const created = await LedgerEntry.create([{
            user, wallet, delta, balanceAfter: updatedUser[userField], type, refType, refId, idempotencyKey, meta
        }], { session });
        results.push(created[0]);
    }
    return results;
}

/**
 * يحسب كيفية تقسيم خصم كوينز بين الرصيدين (البونص أولاً، ثم المدفوع) بناءً على قراءة حيّة
 * لرصيد المستخدم ضمن نفس المعاملة — القراءة الحيّة + حارسات $gte بـpost() معاً (لا القراءة
 * وحدها) هما ما يمنعان التسابق: أي تعارض كتابة متزامن على نفس المستند يُسقِط هذه المعاملة
 * بأكملها فتُعاد المحاولة تلقائياً (نمط Mongo write-conflict + session.withTransaction القائم).
 * @returns {Promise<{fromBonus:number, fromPaid:number}>}
 */
async function computeCoinSpendSplit(userId, amount, session) {
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('computeCoinSpendSplit: amount يجب أن يكون عدداً صحيحاً موجباً');
    const user = await User.findById(userId).select('walletCoinsBonus walletCoinsPaid').session(session);
    if (!user) throw Object.assign(new Error('المستخدم غير موجود'), { code: 'USER_NOT_FOUND' });
    if (user.walletCoinsBonus + user.walletCoinsPaid < amount) {
        throw Object.assign(new Error('رصيد غير كافٍ لإتمام العملية'), { code: 'INSUFFICIENT_FUNDS' });
    }
    const fromBonus = Math.min(user.walletCoinsBonus, amount);
    const fromPaid = amount - fromBonus;
    return { fromBonus, fromPaid };
}

/** مفتاح idempotency موحَّد: مصدر + نوع + معرّف ثابتَين يصفان العملية بلا تكرار محتمل */
function idempotencyKeyFor(...parts) {
    return parts.map(String).join(':');
}

module.exports = { post, computeCoinSpendSplit, idempotencyKeyFor, WALLET_TO_USER_FIELD };
