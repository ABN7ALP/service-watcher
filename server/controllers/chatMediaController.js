const { 
    uploadChatImage, 
    uploadChatVoice, 
    uploadChatVideo, 
    deleteChatMedia 
} = require('../utils/cloudinary');
const PrivateMessage = require('../models/PrivateMessage');
const User = require('../models/User');

// =================================================
// رفع صورة للدردشة
// =================================================
exports.uploadImage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { receiverId, metadata = {} } = req.body;

        console.log(`[CHAT MEDIA] Uploading image from ${userId} to ${receiverId}`);

        if (!req.file) {
            return res.status(400).json({
                status: 'fail',
                message: 'لم يتم رفع أي صورة'
            });
        }

        if (!receiverId) {
            return res.status(400).json({
                status: 'fail',
                message: 'معرف المستقبل مطلوب'
            });
        }

        // التحقق من الحظر
        const [sender, receiver] = await Promise.all([
            User.findById(userId).select('blockedUsers'),
            User.findById(receiverId).select('blockedUsers')
        ]);

        if (!sender || !receiver) {
            return res.status(404).json({
                status: 'fail',
                message: 'المستخدم غير موجود'
            });
        }

        const senderBlocked = sender.blockedUsers.map(id => id.toString());
        const receiverBlocked = receiver.blockedUsers.map(id => id.toString());

        if (senderBlocked.includes(receiverId) || receiverBlocked.includes(userId)) {
            return res.status(403).json({
                status: 'fail',
                message: 'لا يمكنك إرسال وسائط لمستخدم حظرك أو حظرته'
            });
        }

        // التحقق من حجم الصورة (5MB كحد أقصى)
        if (req.file.size > 5 * 1024 * 1024) {
            return res.status(400).json({
                status: 'fail',
                message: 'حجم الصورة يتجاوز 5MB'
            });
        }

        // رفع الصورة إلى Cloudinary
        const uploadResult = await uploadChatImage(req.file.buffer, {
            viewOnce: metadata.viewOnce || false,
            disableSave: metadata.disableSave || false,
            hasWatermark: metadata.hasWatermark || false,
            watermarkText: metadata.watermarkText || 'Battle Platform'
        });

        // إنشاء رابط thumbnail (مصغر)
        const thumbnailUrl = uploadResult.secure_url.replace('/upload/', '/upload/w_300,h_200,c_fill/');

        res.status(200).json({
            status: 'success',
            message: 'تم رفع الصورة بنجاح',
            data: {
                url: uploadResult.secure_url,
                thumbnail: thumbnailUrl,
                publicId: uploadResult.public_id,
                format: uploadResult.format,
                width: uploadResult.width,
                height: uploadResult.height,
                bytes: uploadResult.bytes
            }
        });

    } catch (error) {
        console.error('[ERROR] in uploadImage:', error);
        
        let errorMessage = 'حدث خطأ أثناء رفع الصورة';
        if (error.message.includes('File size too large')) {
            errorMessage = 'حجم الملف كبير جداً';
        } else if (error.message.includes('Invalid image file')) {
            errorMessage = 'ملف الصورة غير صالح';
        }

        res.status(500).json({
            status: 'error',
            message: errorMessage
        });
    }
};

// =================================================
// رفع رسالة صوتية
// =================================================
exports.uploadVoice = async (req, res) => {
    try {
        const userId = req.user.id;
        const { receiverId, duration } = req.body;

        console.log(`[CHAT MEDIA] Uploading voice from ${userId} to ${receiverId}, duration: ${duration}s`);

        if (!req.file) {
            return res.status(400).json({
                status: 'fail',
                message: 'لم يتم رفع أي رسالة صوتية'
            });
        }

        if (!receiverId) {
            return res.status(400).json({
                status: 'fail',
                message: 'معرف المستقبل مطلوب'
            });
        }

        // التحقق من المدة (15 ثانية كحد أقصى)
        const voiceDuration = parseInt(duration) || 0;
        if (voiceDuration > 15) {
            return res.status(400).json({
                status: 'fail',
                message: 'مدة الرسالة الصوتية تتجاوز 15 ثانية'
            });
        }

        // التحقق من الحظر
        const [sender, receiver] = await Promise.all([
            User.findById(userId).select('blockedUsers'),
            User.findById(receiverId).select('blockedUsers')
        ]);

        if (!sender || !receiver) {
            return res.status(404).json({
                status: 'fail',
                message: 'المستخدم غير موجود'
            });
        }

        const senderBlocked = sender.blockedUsers.map(id => id.toString());
        const receiverBlocked = receiver.blockedUsers.map(id => id.toString());

        if (senderBlocked.includes(receiverId) || receiverBlocked.includes(userId)) {
            return res.status(403).json({
                status: 'fail',
                message: 'لا يمكنك إرسال وسائط لمستخدم حظرك أو حظرته'
            });
        }

        // رفع الصوت إلى Cloudinary
        const uploadResult = await uploadChatVoice(req.file.buffer, voiceDuration);

        res.status(200).json({
            status: 'success',
            message: 'تم رفع الرسالة الصوتية بنجاح',
            data: {
                url: uploadResult.secure_url,
                publicId: uploadResult.public_id,
                duration: voiceDuration,
                format: uploadResult.format,
                bytes: uploadResult.bytes
            }
        });

    } catch (error) {
        console.error('[ERROR] in uploadVoice:', error);
        
        let errorMessage = 'حدث خطأ أثناء رفع الرسالة الصوتية';
        if (error.message.includes('exceeds 15 seconds')) {
            errorMessage = 'مدة الرسالة الصوتية تتجاوز 15 ثانية';
        }

        res.status(500).json({
            status: 'error',
            message: errorMessage
        });
    }
};

// =================================================
// رفع فيديو
// =================================================
exports.uploadVideo = async (req, res) => {
    try {
        const userId = req.user.id;
        const { receiverId, duration, metadata = {} } = req.body;

        console.log(`[CHAT MEDIA] Uploading video from ${userId} to ${receiverId}, duration: ${duration}s`);

        if (!req.file) {
            return res.status(400).json({
                status: 'fail',
                message: 'لم يتم رفع أي فيديو'
            });
        }

        if (!receiverId) {
            return res.status(400).json({
                status: 'fail',
                message: 'معرف المستقبل مطلوب'
            });
        }

        // التحقق من المدة (30 ثانية كحد أقصى)
        const videoDuration = parseInt(duration) || 0;
        if (videoDuration > 30) {
            return res.status(400).json({
                status: 'fail',
                message: 'مدة الفيديو تتجاوز 30 ثانية'
            });
        }

        // التحقق من الحظر
        const [sender, receiver] = await Promise.all([
            User.findById(userId).select('blockedUsers'),
            User.findById(receiverId).select('blockedUsers')
        ]);

        if (!sender || !receiver) {
            return res.status(404).json({
                status: 'fail',
                message: 'المستخدم غير موجود'
            });
        }

        const senderBlocked = sender.blockedUsers.map(id => id.toString());
        const receiverBlocked = receiver.blockedUsers.map(id => id.toString());

        if (senderBlocked.includes(receiverId) || receiverBlocked.includes(userId)) {
            return res.status(403).json({
                status: 'fail',
                message: 'لا يمكنك إرسال وسائط لمستخدم حظرك أو حظرته'
            });
        }

        // رفع الفيديو إلى Cloudinary
        const uploadResult = await uploadChatVideo(req.file.buffer, videoDuration, {
            disableSave: metadata.disableSave || false,
            hasWatermark: metadata.hasWatermark || false,
            watermarkText: metadata.watermarkText || 'Battle Platform'
        });

        // إنشاء رابط thumbnail
        const thumbnailUrl = uploadResult.secure_url.replace('/upload/', '/upload/w_300,h_200,c_fill/');

        res.status(200).json({
            status: 'success',
            message: 'تم رفع الفيديو بنجاح',
            data: {
                url: uploadResult.secure_url,
                thumbnail: thumbnailUrl,
                publicId: uploadResult.public_id,
                duration: videoDuration,
                format: uploadResult.format,
                bytes: uploadResult.bytes,
                width: uploadResult.width,
                height: uploadResult.height
            }
        });

    } catch (error) {
        console.error('[ERROR] in uploadVideo:', error);
        
        let errorMessage = 'حدث خطأ أثناء رفع الفيديو';
        if (error.message.includes('exceeds 30 seconds')) {
            errorMessage = 'مدة الفيديو تتجاوز 30 ثانية';
        }

        res.status(500).json({
            status: 'error',
            message: errorMessage
        });
    }
};

// =================================================
// حذف وسائط (لـ View Once أو المستخدم)
// =================================================
exports.deleteMedia = async (req, res) => {
    try {
        const userId = req.user.id;
        const { publicId, resourceType = 'image' } = req.body;

        console.log(`[CHAT MEDIA] Deleting media: ${publicId} by ${userId}`);

        if (!publicId) {
            return res.status(400).json({
                status: 'fail',
                message: 'معرف الملف مطلوب'
            });
        }

        // التحقق من أن الملف للمستخدم
        const message = await PrivateMessage.findOne({
            'metadata.publicId': publicId,
            $or: [
                { sender: userId },
                { receiver: userId }
            ]
        });

        if (!message) {
            return res.status(403).json({
                status: 'fail',
                message: 'ليس لديك صلاحية لحذف هذا الملف'
            });
        }

        // حذف من Cloudinary
        const deleted = await deleteChatMedia(publicId, resourceType);

        if (deleted) {
            // تحديث الرسالة في قاعدة البيانات
            message.content = 'تم حذف الوسائط';
            message.metadata.deleted = true;
            await message.save();

            res.status(200).json({
                status: 'success',
                message: 'تم حذف الوسائط بنجاح'
            });
        } else {
            res.status(500).json({
                status: 'error',
                message: 'فشل حذف الوسائط'
            });
        }

    } catch (error) {
        console.error('[ERROR] in deleteMedia:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ أثناء حذف الوسائط'
        });
    }
};

module.exports = exports;
