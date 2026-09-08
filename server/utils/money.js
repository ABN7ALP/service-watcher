// ملف: server/utils/money.js
// 🛡️ طبقة دقة مالية مركزية — تمنع تراكم أخطاء Float في الأرصدة والعمولات

/**
 * تقريب مالي آمن إلى منزلتين عشريتين.
 * نستخدم Number.EPSILON لتصحيح حالات مثل 1.005 التي يخطئ فيها toFixed.
 */
const toMoney = (value) => {
    const num = Number(value);
    if (!isFinite(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
};

/** جمع آمن لعدة مبالغ */
const addMoney = (...values) => toMoney(values.reduce((sum, v) => sum + Number(v || 0), 0));

/** طرح آمن */
const subMoney = (a, b) => toMoney(Number(a || 0) - Number(b || 0));

/** ضرب آمن (للعمولات والنسب) */
const mulMoney = (amount, rate) => toMoney(Number(amount || 0) * Number(rate || 0));

/**
 * تحقق صارم من مبلغ وارد من العميل.
 * يرفض: NaN، السالب، اللانهائي، والنصوص غير الرقمية، وأكثر من منزلتين عشريتين.
 */
const parseMoneyInput = (value, { min = 0.01, max = 1000000 } = {}) => {
    const num = Number(value);
    if (!isFinite(num) || isNaN(num)) return null;
    if (num < min || num > max) return null;
    // نرفض الدقة المفرطة (محاولة تمرير 10.999999 لاستغلال التقريب)
    if (Math.round(num * 100) / 100 !== num) return null;
    return toMoney(num);
};

module.exports = { toMoney, addMoney, subMoney, mulMoney, parseMoneyInput };
