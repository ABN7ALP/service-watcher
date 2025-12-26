// ملف: server/controllers/userController.js

const User = require('../models/User');
const { cloudinary, deleteFromCloudinary, getPublicIdFromUrl } = require('../utils/cloudinary');

// --- تعريف الدوال أولاً ---

const updateUsername = async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ status: 'fail', message: 'اسم المستخدم مطلوب.' });
        }
        const updatedUser = await User.findByIdAndUpdate(req.user.id, { username }, { new: true, runValidators: true });
        res.status(200).json({ status: 'success', data: { user: updatedUser } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ أثناء تحديث اسم المستخدم.' });
    }
};

// --- استبدل دالة updateProfilePicture بالكامل ---

exports.updateProfilePicture = async (req, res) => {
    try {
        // 1. التأكد من وجود ملف
        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'الرجاء إرفاق ملف صورة.' });
        }

        // 2. الحصول على المستخدم الحالي
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود.' });
        }

        // 3. حذف الصورة القديمة من Cloudinary (إذا كانت موجودة وليست الصورة الافتراضية)
        if (user.profileImage && user.profileImage.includes('cloudinary')) {
            // استخراج public_id من الرابط القديم
            const oldPublicId = user.profileImage.split('/').pop().split('.')[0];
            // لا ننتظر الحذف، دعه يعمل في الخلفية
            cloudinary.uploader.destroy(oldPublicId).catch(err => console.error("Failed to delete old image:", err));
        }

        // --- ✅✅ الإصلاح الرئيسي: إنشاء public_id فريد ---
        // نستخدم ID المستخدم + الطابع الزمني الحالي لضمان التفرد
        const newPublicId = `profiles/user_${user._id}_${Date.now()}`;

        // 4. رفع الصورة الجديدة إلى Cloudinary بالـ public_id الجديد
        const result = await cloudinary.uploader.upload(req.file.path, {
            public_id: newPublicId,
            overwrite: true, // على الرغم من أننا نستخدم ID جديد، هذا جيد كإجراء أمان
            transformation: [ // تحويلات لضمان حجم وجودة مناسبين
                { width: 250, height: 250, gravity: "face", crop: "thumb" },
                { quality: "auto" }
            ]
        });
        // --- نهاية الإصلاح ---

        // 5. تحديث رابط الصورة في قاعدة البيانات
        user.profileImage = result.secure_url;
        await user.save({ validateBeforeSave: false }); // نتجاوز التحقق لأننا نحدّث حقلاً واحدًا فقط

        // 6. إرسال الاستجابة الناجحة
        res.status(200).json({
            status: 'success',
            message: 'تم تحديث صورة الملف الشخصي بنجاح.',
            data: {
                user: {
                    profileImage: user.profileImage
                }
            }
        });

    } catch (error) {
        console.error('--- Update Picture Error ---', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ أثناء تحديث الصورة.' });
    }
};


// --- ✅✅ التصدير في النهاية كمجموعة واحدة ---
module.exports = {
    updateUsername,
    updateProfilePicture
};
