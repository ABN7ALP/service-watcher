// ملف: server/controllers/userController.js

const User = require('../models/User');

// دالة لتصفية الحقول المسموح بتحديثها
const filterObj = (obj, ...allowedFields) => {
    const newObj = {};
    Object.keys(obj).forEach(el => {
        if (allowedFields.includes(el)) newObj[el] = obj[el];
    });
    return newObj;
};

exports.updateMe = async (req, res, next) => {
    try {
        // 1. تصفية الحقول غير المرغوب فيها مثل (balance, isAdmin, etc.)
        const filteredBody = filterObj(req.body, 'username', 'profileImage');

        // 2. تحديث بيانات المستخدم
        const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
            new: true, // إرجاع المستند المحدث
            runValidators: true // تشغيل المدققات (مثل minlength)
        });

        res.status(200).json({
            status: 'success',
            data: {
                user: updatedUser
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ أثناء تحديث البيانات.' });
    }
};
