// ملف: server/utils/cloudinary.js

const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');

// 1. إعداد Cloudinary باستخدام متغيرات البيئة
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

// 2. إعداد Multer لتخزين الملفات مؤقتًا في الذاكرة
const storage = multer.memoryStorage();

// 3. دالة للتحقق من أن الملف هو صورة
const fileFilter = (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
        return cb(null, true);
    }
    cb(new Error(`خطأ: الرفع مسموح للصور فقط (jpeg, jpg, png, gif).`));
};

// 4. تصدير middleware الرفع
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // حد أقصى 2 ميغابايت
}).single('profileImage'); // 'profileImage' هو اسم الحقل في النموذج

// 5. دالة مساعدة لحذف الصورة القديمة من Cloudinary
const deleteFromCloudinary = async (publicId) => {
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error("Error deleting old image from Cloudinary:", error);
    }
};

// 6. دالة مساعدة لاستخراج Public ID من رابط Cloudinary
const getPublicIdFromUrl = (url) => {
    try {
        const parts = url.split('/');
        const publicIdWithExtension = parts[parts.length - 1];
        const publicId = publicIdWithExtension.split('.')[0];
        return publicId;
    } catch (error) {
        return null;
    }
};

// 7. دالة لرفع صور الدردشة مع خيارات حماية
exports.uploadChatImage = (fileBuffer, options = {}) => {
    return new Promise((resolve, reject) => {
        const uploadOptions = {
            folder: 'chat_images',
            resource_type: 'image',
            transformation: []
        };

        // خيارات الحماية
        if (options.viewOnce) {
            uploadOptions.tags = ['view_once'];
            uploadOptions.context = `view_once=true`;
        }

        if (options.disableSave) {
            uploadOptions.type = 'private';
            uploadOptions.access_mode = 'authenticated';
        }

        if (options.hasWatermark) {
            uploadOptions.transformation.push({
                overlay: {
                    font_family: 'Arial',
                    font_size: 20,
                    text: options.watermarkText || 'Battle Platform',
                    color: 'white'
                },
                gravity: 'south_east',
                x: 10,
                y: 10,
                opacity: 50
            });
        }

        // ضغط الصورة
        uploadOptions.transformation.push({
            quality: 'auto:good',
            fetch_format: 'webp'
        });

        const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );

        uploadStream.end(fileBuffer);
    });
};

// 8. دالة لرفع صوت الدردشة
exports.uploadChatVoice = (fileBuffer, duration) => {
    return new Promise((resolve, reject) => {
        // التحقق من المدة (15 ثانية كحد أقصى)
        if (duration && duration > 15) {
            reject(new Error('مدة الرسالة الصوتية تتجاوز 15 ثانية'));
            return;
        }

        const uploadOptions = {
            folder: 'chat_voice',
            resource_type: 'video', // Cloudinary يعامل الصوت كـ video
            format: 'mp3'
        };

        const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );

        uploadStream.end(fileBuffer);
    });
};

// 9. دالة لرفع فيديو الدردشة
exports.uploadChatVideo = (fileBuffer, duration, options = {}) => {
    return new Promise((resolve, reject) => {
        // التحقق من المدة (30 ثانية كحد أقصى)
        if (duration && duration > 30) {
            reject(new Error('مدة الفيديو تتجاوز 30 ثانية'));
            return;
        }

        const uploadOptions = {
            folder: 'chat_videos',
            resource_type: 'video',
            format: 'mp4'
        };

        // خيارات الحماية
        if (options.disableSave) {
            uploadOptions.type = 'private';
            uploadOptions.access_mode = 'authenticated';
        }

        if (options.hasWatermark) {
            uploadOptions.overlay = {
                font_family: 'Arial',
                font_size: 24,
                text: options.watermarkText || 'Battle Platform',
                color: 'white'
            };
            uploadOptions.gravity = 'south_east';
            uploadOptions.x = 10;
            uploadOptions.y = 10;
            uploadOptions.opacity = 60;
        }

        const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );

        uploadStream.end(fileBuffer);
    });
};

// 10. دالة حذف وسائط الدردشة
exports.deleteChatMedia = async (publicId, resourceType = 'image') => {
    try {
        await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
            invalidate: true
        });
        return true;
    } catch (error) {
        console.error("Error deleting chat media:", error);
        return false;
    }
};



// 11. Multer للدردشات مع تحسينات
const chatUpload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB كحد أقصى
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = {
            'image/jpeg': true,
            'image/png': true,
            'image/gif': true,
            'image/webp': true,
            'audio/mpeg': true,
            'audio/wav': true,
            'audio/ogg': true,
            'video/mp4': true,
            'video/webm': true
        };

        if (allowedTypes[file.mimetype]) {
            cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مدعوم. المسموح: صور، صوت، فيديو'), false);
        }
    }
});

// 12. Export جميع الـ uploads
module.exports = {
    cloudinary,
    upload, // للملفات الشخصية
    uploadChatImage,
    uploadChatVoice,
    uploadChatVideo,
    deleteChatMedia,
    deleteFromCloudinary,
    getPublicIdFromUrl,
    chatUpload // للدردشات
};
