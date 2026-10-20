// ملف: adminController.regexEscape.test.js
// 🛡️ مراجعة أمنية (redteam-audit-1 — البند #11، Low): getUsers وgetAllTransactions كانا
// يبنيان {$regex: <قيمة الاستعلام الخام>, $options:'i'} بلا أي تعقيم، بخلاف النمط المطابق
// بـgetClientErrors بنفس الملف. أُصلِحا الآن باستخدام الدالة المشتركة الموجودة فعلاً
// queryHelpers.safeSearchRegex. يختبر هذا الملف أن رمز meta بالـregex (مثل ".*") يُعامَل
// كنص حرفي بعد الإصلاح، لا كنمط — عبر فحص مباشر لما يُمرَّر فعلياً لـUser.find/countDocuments
const User = require('../../models/User');
const adminController = require('../adminController');

function mockRes() {
    return { json: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis() };
}
function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.sort = () => p;
    p.limit = () => p;
    p.skip = () => p;
    return p;
}

describe('getUsers — تعقيم $regex (البند #11)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('رمز meta بالـregex (".*") داخل مصطلح البحث: يُعامَل كنص حرفي، لا كنمط مطابق للكل', async () => {
        let capturedQuery = null;
        jest.spyOn(User, 'find').mockImplementation((query) => { capturedQuery = query; return chainable([]); });
        jest.spyOn(User, 'countDocuments').mockResolvedValue(0);

        const req = { query: { search: '.*' } };
        const res = mockRes();
        await adminController.getUsers(req, res);

        expect(capturedQuery.$or).toBeDefined();
        const regex = capturedQuery.$or[0].username;
        expect(regex).toBeInstanceOf(RegExp);
        // ✅ جوهر الإصلاح: ".*" الحرفي بات هو النمط (نقطة مهرَّبة + نجمة مهرَّبة)، لا "أي شيء"
        expect(regex.source).toBe('\\.\\*');
        expect(regex.test('hello world')).toBe(false); // لم يعد يطابق كل شيء
        expect(regex.test('literal .* text')).toBe(true); // يطابق النص الحرفي فقط
    });

    test('بحث عادي بلا رموز خاصة: يعمل كما هو متوقَّع (غير مقطوع)', async () => {
        let capturedQuery = null;
        jest.spyOn(User, 'find').mockImplementation((query) => { capturedQuery = query; return chainable([]); });
        jest.spyOn(User, 'countDocuments').mockResolvedValue(0);

        const req = { query: { search: 'ahmad' } };
        const res = mockRes();
        await adminController.getUsers(req, res);

        const regex = capturedQuery.$or[0].username;
        expect(regex.test('Ahmad Ali')).toBe(true);
    });
});

describe('getAllTransactions — تعقيم $regex (البند #11)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('رمز meta بالـregex بحقل search: يُعامَل كنص حرفي، لا كنمط', async () => {
        let capturedUserQuery = null;
        jest.spyOn(User, 'find').mockImplementation((query) => {
            capturedUserQuery = query;
            return { select: () => Promise.resolve([]) };
        });
        const Transaction = require('../../models/Transaction');
        jest.spyOn(Transaction, 'find').mockImplementation(() => chainable([]));
        jest.spyOn(Transaction, 'countDocuments').mockResolvedValue(0);

        const req = { query: { search: '(a+)+$' } };
        const res = mockRes();
        await adminController.getAllTransactions(req, res);

        const regex = capturedUserQuery.$or[0].username;
        expect(regex).toBeInstanceOf(RegExp);
        expect(regex.source).not.toBe('(a+)+$'); // ✅ لم يُستخدَم كنمط خام غير مهرَّب
    });
});
