const ClientCompatLog = require('../models/ClientCompatLog');

// ✅ نفس فئة ميزات الفحص الفعلية بـpublic/js/browser-gate.js بالحرف — allowlist صريحة تمنع
// حقن أي سلسلة نصية عشوائية بمصفوفة missingFeatures (ثغرة إدخال خام) بدل مجرد الوثوق بالعميل
const KNOWN_FEATURES = ['containerQueries', 'hasSelector', 'aspectRatio', 'webSocket', 'webRTC', 'optionalChaining'];
// ✅ مراجعة PR #116: نفس قيَم enum الحقل category بالموديل بالضبط — أي قيمة أخرى من العميل تُهمَل
// صامتاً (تتراجع لـ'legacy' الافتراضية بالموديل) بدل رفض الطلب كاملاً
const KNOWN_CATEGORIES = ['legacy', 'in-app'];

// ✅ نقطة استقبال عامة مجهولة الهوية (بلا authMiddleware عمداً — بوابة التوافق تعمل حتى قبل أي
// تسجيل دخول، ولا تحمل أي بيانات شخصية أصلاً لتحتاج ربطها بمستخدم) — محدودة المعدل بالراوت
// (clientCompatRoutes.js) لمنع إغراق قاعدة البيانات بسجلات وهمية
exports.reportClientCompat = async (req, res) => {
    try {
        const { uaFamily, uaVersion, missingFeatures, category } = req.body || {};
        const cleanMissing = Array.isArray(missingFeatures)
            ? [...new Set(missingFeatures.filter(f => typeof f === 'string' && KNOWN_FEATURES.includes(f)))]
            : [];
        if (!cleanMissing.length) {
            return res.status(400).json({ status: 'fail' });
        }
        const cleanCategory = KNOWN_CATEGORIES.includes(category) ? category : 'legacy';

        await ClientCompatLog.create({
            uaFamily: String(uaFamily || 'unknown').slice(0, 40),
            uaVersion: String(uaVersion || '').slice(0, 20),
            missingFeatures: cleanMissing,
            category: cleanCategory,
            userAgent: (req.headers['user-agent'] || '').slice(0, 300)
        });

        res.status(201).json({ status: 'success' });
    } catch (error) {
        // ✅ فشل التسجيل نفسه لا يستحق إعادة محاولة من العميل (حلقة) — نسجّله بـconsole السيرفر فقط
        console.error('[CLIENT COMPAT LOG] Failed to save:', error);
        res.status(200).json({ status: 'ignored' });
    }
};
