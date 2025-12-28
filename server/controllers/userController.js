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

const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ status: 'fail', message: 'لم يتم العثور على المستخدم.' });
        }
        res.status(200).json({ status: 'success', data: { user } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم.' });
    }
};

// --- ✅ هذه هي الدالة التي أضفناها مؤخرًا ---
const getMeDetails = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('friends', 'username profileImage customId')
            .populate('friendRequestsReceived', 'username profileImage customId');
        
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود.' });
        }
        res.status(200).json({ status: 'success', data: { user } });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};

// server/controllers/userController.js
// ... (الدوال الموجودة مثل getMeDetails)

// --- ✅✅ أضف هاتين الدالتين الجديدتين ---

const blockUser = async (req, res) => {
    try {
        const userToBlockId = req.params.id;
        const currentUserId = req.user.id;

        if (userToBlockId === currentUserId) {
            return res.status(400).json({ message: 'لا يمكنك حظر نفسك.' });
        }

        // أضف المستخدم إلى قائمة الحظر إذا لم يكن موجودًا بالفعل
        await User.findByIdAndUpdate(currentUserId, { $addToSet: { blockedUsers: userToBlockId } });
        
        // قم بإزالة أي علاقة صداقة أو طلب صداقة موجود
        await User.findByIdAndUpdate(currentUserId, { 
            $pull: { friends: userToBlockId, friendRequestsSent: userToBlockId, friendRequestsReceived: userToBlockId } 
        });
        await User.findByIdAndUpdate(userToBlockId, { 
            $pull: { friends: currentUserId, friendRequestsSent: currentUserId, friendRequestsReceived: currentUserId } 
        });

        res.status(200).json({ status: 'success', message: 'تم حظر المستخدم بنجاح.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};

const unblockUser = async (req, res) => {
    try {
        const userToUnblockId = req.params.id;
        const currentUserId = req.user.id;

        // أزل المستخدم من قائمة الحظر
        await User.findByIdAndUpdate(currentUserId, { $pull: { blockedUsers: userToUnblockId } });

        res.status(200).json({ status: 'success', message: 'تم إلغاء حظر المستخدم بنجاح.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};


// --- ✅✅ التصدير الصحيح في النهاية ---
// server/controllers/userController.js

// --- ✅✅ قم بتحديث module.exports ---
module.exports = {
    updateUsername,
    updateProfilePicture,
    getUserById,
    getMeDetails,
    blockUser,      // ✅ تصدير الدالة الجديدة
    unblockUser     // ✅ تصدير الدالة الجديدة
};

