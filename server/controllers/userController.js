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

const updateProfilePicture = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'الرجاء اختيار ملف صورة.' });
        }

        const user = await User.findById(req.user.id);
        if (user.profileImage && user.profileImage.includes('cloudinary')) {
            const oldPublicId = getPublicIdFromUrl(user.profileImage);
            if (oldPublicId) {
                await deleteFromCloudinary(oldPublicId);
            }
        }

        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'battle_platform_users',
                    public_id: req.user.id,
                    overwrite: true,
                    format: 'webp',
                    transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }]
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            uploadStream.end(req.file.buffer);
        });

        const updatedUser = await User.findByIdAndUpdate(req.user.id, { profileImage: result.secure_url }, { new: true });
        res.status(200).json({ status: 'success', data: { user: updatedUser } });

    } catch (error) {
        console.error("Error in updateProfilePicture:", error);
        res.status(500).json({ status: 'error', message: 'فشل رفع الصورة.' });
    }
};

// --- ✅✅ التصدير في النهاية كمجموعة واحدة ---
module.exports = {
    updateUsername,
    updateProfilePicture
};
