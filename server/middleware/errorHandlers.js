// معالج الأخطاء العام
// 🛡️ إصلاح جذري (مراجعة أمنية — redteam-audit-1، البند #9، Medium): err.message كان يُمرَّر
// دوماً للعميل بكل البيئات بصرف النظر عن مصدره — أُثبِت فعلياً تسرّب أسماء حقول/نماذج وتفاصيل
// مكتبات داخلية (رسالة Cast خطأ من Mongoose، رسالة bcrypt الداخلية) عبر next(error) بمسارات
// تفتقد try/catch محلياً (authController.login/register، messageController) بخلاف ~20 دالة
// أخرى بهذا المشروع تمسك أخطاءها محلياً وترسل رسالة عربية مقصودة. الإصلاح: رسالة err.message
// الحقيقية تُمرَّر فقط للأخطاء المُعلَّمة صراحةً "تشغيلية" (status:'fail' — نفس اتفاقية الرفض
// المقصود المُستخدَمة أصلاً بكل هذا المشروع)؛ أي خطأ آخر (status الافتراضي 'error' — خطأ غير
// متوقع ببرمجة/مكتبة) يُعيد رسالة عربية عامة بكل البيئات — تفاصيل err الكاملة تبقى متاحة
// بوضع التطوير فقط عبر حقلي error/stack المنفصلين كما كانت
const globalErrorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    console.error('💥 ERROR:', err);

    const isOperational = err.status === 'fail';
    const clientMessage = isOperational
        ? (err.message || 'حدث خطأ غير متوقع!')
        : 'حدث خطأ غير متوقع في الخادم، يرجى المحاولة مرة أخرى';

    res.status(err.statusCode).json({
        status: err.status,
        message: clientMessage,
        // أضف تفاصيل الخطأ الكاملة فقط في وضع التطوير
        ...(process.env.NODE_ENV === 'development' && { error: err, stack: err.stack }),
    });
};

// معالج المسارات غير الموجودة
const routeNotFoundHandler = (req, res, next) => {
    const err = new Error(`لا يمكن العثور على المسار ${req.originalUrl} على هذا الخادم!`);
    err.statusCode = 404;
    err.status = 'fail';
    next(err);
};

const setupErrorHandlers = (app) => {
    // تطبيق معالج المسارات غير الموجودة على كل المسارات التي لم يتم العثور عليها
    app.all('*', routeNotFoundHandler);
    // تطبيق معالج الأخطاء العام
    app.use(globalErrorHandler);
};

module.exports = setupErrorHandlers;
