// معالج الأخطاء العام
const globalErrorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    console.error('💥 ERROR:', err);

    res.status(err.statusCode).json({
        status: err.status,
        message: err.message || 'حدث خطأ غير متوقع!',
        // أضف تفاصيل الخطأ فقط في وضع التطوير
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
