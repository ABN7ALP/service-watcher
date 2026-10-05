const ClientErrorLog = require('../models/ClientErrorLog');

// ✅ نقطة استقبال عامة (بلا authMiddleware عمداً) — أخطاء قد تحدث قبل تسجيل الدخول نفسه
// (صفحة الدخول/التسجيل) يجب أن تصل أيضاً، لا فقط أخطاء المستخدمين المسجَّلين. التوكن اختياري:
// لو أُرفق نتحقق منه (verify لا decode) لربط الخطأ بمستخدم حقيقي، وإلا يُسجَّل بلا مستخدم
exports.reportError = async (req, res) => {
    try {
        const { message, context, url, stack } = req.body || {};
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ status: 'fail' });
        }

        let userId = null;
        let username = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
                if (decoded?.id) {
                    userId = decoded.id;
                    const User = require('../models/User');
                    const u = await User.findById(userId).select('username');
                    username = u?.username || null;
                }
            } catch (_) { /* توكن غير صالح/منتهٍ — نسجّل الخطأ بلا مستخدم بدل رفضه بالكامل */ }
        }

        await ClientErrorLog.create({
            user: userId,
            username,
            message: String(message).slice(0, 500),
            context: String(context || '').slice(0, 100),
            url: String(url || '').slice(0, 300),
            userAgent: (req.headers['user-agent'] || '').slice(0, 300),
            stack: String(stack || '').slice(0, 2000)
        });

        res.status(201).json({ status: 'success' });
    } catch (error) {
        // ✅ فشل تسجيل الخطأ نفسه لا يجب أن يُعامَل كخطأ آخر يستحق محاولة تسجيل جديدة (حلقة) —
        // فقط نسجّله بـconsole السيرفر ونرد بنجاح ظاهري للعميل
        console.error('[CLIENT ERROR LOG] Failed to save:', error);
        res.status(200).json({ status: 'ignored' });
    }
};
