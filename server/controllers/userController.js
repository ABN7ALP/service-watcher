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
        const user = await User.findById(req.user. id)
            .populate('friends', 'username profileImage customId level')
            .populate('friendRequestsReceived', 'username profileImage customId')
            .populate('friendRequestsSent', 'username profileImage customId');

        res.status(200).json({
            status: 'success',
            data:  {
                user: {
                    ... user. toObject(),
                    // ✅ إضافة عدد الأصدقاء بصيغة محسنة
                    friendsStats: {
                        totalFriends:  user.friends.length,
                        // ✅ صيغ مختلفة لعرض العدد
                        displayText: user.friends.length === 0 
                            ? 'لا توجد أصدقاء' 
                            : user.friends.length === 1 
                            ? '1 صديق'
                            : user.friends.length <= 10
                            ? `${user.friends.length} أصدقاء`
                            : user.friends.length
                    },
                    pendingRequests: user.friendRequestsReceived.length,
                    sentRequests: user.friendRequestsSent.length
                }
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message:  'خطأ في الخادم.' });
    }
};

// ✅ دالة جديدة لجلب بيانات الملف الشخصي المصغر
const getUserMiniProfile = async (req, res) => {
    try {
        const currentUserId = req.user?. id;
        const targetUserId = req.params.id;

        const user = await User.findById(targetUserId)
            .select('username profileImage customId level friends')
            .populate('friends', '_id');

        if (!user) {
            return res.status(404).json({ status: 'fail', message: 'لم يتم العثور على المستخدم.' });
        }

        // التحقق من حالة الصداقة
        const areFriends = currentUserId && user.friends.some(f => f._id.toString() === currentUserId);

        res.status(200).json({
            status: 'success',
            data: {
                id:  user._id,
                username: user.username,
                profileImage: user.profileImage,
                customId: user.customId,
                level: user.level,
                friendsCount: user.friends.length,
                areFriends: areFriends || false
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم.' });
    }
};


// --- ✅✅ التصدير الصحيح في النهاية ---
module.exports = {
    updateUsername,
    updateProfilePicture,
    getUserById, // ✅ تصدير الدالة التي كانت موجودة
    getMeDetails,
    getUserMiniProfile
};
