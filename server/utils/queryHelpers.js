// ملف: server/utils/queryHelpers.js
// 🛡️ تطبيع آمن لمعاملات الاستعلام القادمة من العميل

/**
 * يفرض حدوداً صارمة على page/limit لمنع استنزاف الخادم
 * (limit=999999 يجلب كل السجلات في الذاكرة = حجب خدمة)
 */
const parsePagination = (query = {}, { defaultLimit = 50, maxLimit = 100 } = {}) => {
    let page = parseInt(query.page, 10);
    let limit = parseInt(query.limit, 10);

    if (!Number.isFinite(page) || page < 1) page = 1;
    if (page > 10000) page = 10000; // سقف يمنع skip ضخم يبطئ القاعدة

    if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
    limit = Math.min(limit, maxLimit);

    return { page, limit, skip: (page - 1) * limit };
};

/**
 * تعقيم نص البحث قبل استخدامه في RegExp
 * 🛡️ يمنع ReDoS: نص مثل "(a+)+$" يعلّق المعالج بالكامل
 */
const safeSearchRegex = (input, maxLength = 50) => {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim().slice(0, maxLength);
    if (!trimmed) return null;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
};

module.exports = { parsePagination, safeSearchRegex };
