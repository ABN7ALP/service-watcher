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

// --- تأكد من وجود .exports هنا ---
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

        // 3. حذف الصورة القديمة من Cloudinary
        if (user.profileImage && user.profileImage.includes('cloudinary')) {
            const oldPublicIdWithFolder = user.profileImage.split('/upload/')[1].split('.')[0];
            const oldPublicId = oldPublicIdWithFolder.substring(oldPublicIdWithFolder.indexOf('/') + 1);
            if (oldPublicId) {
                cloudinary.uploader.destroy(`profiles/${oldPublicId}`).catch(err => console.error("Failed to delete old image:", err));
            }
        }

        // 4. إنشاء public_id فريد ورفع الصورة الجديدة
        const newPublicId = `profiles/user_${user._id}_${Date.now()}`;
        const result = await cloudinary.uploader.upload(req.file.path, {
            public_id: newPublicId,
            overwrite: true,
            transformation: [
                { width: 250, height: 250, gravity: "face", crop: "thumb" },
                { quality: "auto" }
            ]
        });

        // 5. تحديث رابط الصورة في قاعدة البيانات
        user.profileImage = result.secure_url;
        await user.save({ validateBeforeSave: false });

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

// --- تأكد من أن هذا الجزء صحيح أيضًا في نهاية الملف ---
module.exports = {
    updateMe: exports.updateMe,
    updateMyPassword: exports.updateMyPassword,
    updateProfilePicture: exports.updateProfilePicture
};
