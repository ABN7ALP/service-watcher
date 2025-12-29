// server/controllers/userController.js
const User = require('../models/User');
const { cloudinary, deleteFromCloudinary, getPublicIdFromUrl } = require('../utils/cloudinary');

exports.updateUsername = async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ message: 'اسم المستخدم مطلوب.' });
        const updatedUser = await User.findByIdAndUpdate(req.user.id, { username }, { new: true, runValidators: true });
        res.status(200).json({ status: 'success', data: { user: updatedUser } });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ أثناء تحديث اسم المستخدم.' });
    }
};

exports.updateProfilePicture = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'الرجاء اختيار ملف صورة.' });
        const user = await User.findById(req.user.id);
        if (user.profileImage && user.profileImage.includes('cloudinary')) {
            const oldPublicId = getPublicIdFromUrl(user.profileImage);
            if (oldPublicId) await deleteFromCloudinary(oldPublicId);
        }
        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream({ folder: 'battle_platform_users', public_id: req.user.id, overwrite: true, format: 'webp', transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }] }, (error, result) => error ? reject(error) : resolve(result));
            uploadStream.end(req.file.buffer);
        });
        const updatedUser = await User.findByIdAndUpdate(req.user.id, { profileImage: result.secure_url }, { new: true });
        res.status(200).json({ status: 'success', data: { user: updatedUser } });
    } catch (error) {
        res.status(500).json({ message: 'فشل رفع الصورة.' });
    }
};

exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'لم يتم العثور على المستخدم.' });
        res.status(200).json({ status: 'success', data: { user } });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم.' });
    }
};

exports.getMeDetails = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('friends', 'username profileImage customId').populate('friendRequestsReceived', 'username profileImage customId');
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود.' });
        res.status(200).json({ status: 'success', data: { user } });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};

exports.blockUser = async (req, res) => {
    try {
        const userToBlockId = req.params.id;
        const currentUserId = req.user.id;
        if (userToBlockId === currentUserId) return res.status(400).json({ message: 'لا يمكنك حظر نفسك.' });
        await User.findByIdAndUpdate(currentUserId, { $addToSet: { blockedUsers: userToBlockId } });
        await User.findByIdAndUpdate(currentUserId, { $pull: { friends: userToBlockId, friendRequestsSent: userToBlockId, friendRequestsReceived: userToBlockId } });
        await User.findByIdAndUpdate(userToBlockId, { $pull: { friends: currentUserId, friendRequestsSent: currentUserId, friendRequestsReceived: currentUserId } });
        res.status(200).json({ status: 'success', message: 'تم حظر المستخدم بنجاح.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};

exports.unblockUser = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, { $pull: { blockedUsers: req.params.id } });
        res.status(200).json({ status: 'success', message: 'تم إلغاء حظر المستخدم بنجاح.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};
