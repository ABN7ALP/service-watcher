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

// 3. دالة للتحقق من أن الملف هو صورة (للملفات الشخصية)
const profileImageFilter = (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
        return cb(null, true);
    }
    cb(new Error(`خطأ: الرفع مسموح للصور فقط (jpeg, jpg, png, gif).`));
};

// 4. دالة للتحقق من ملفات الدردشة
const chatMediaFilter = (req, file, cb) => {
    const allowedTypes = {
    // صور
    'image/jpeg': true,
    'image/png': true,
    'image/gif': true,
    'image/webp': true,

    // صوت
    'audio/mpeg': true,
    'audio/wav': true,
    'audio/ogg': true,
    'audio/webm': true,

    // فيديو
    'video/mp4': true,
    'video/webm': true
};

    if (allowedTypes[file.mimetype]) {
        cb(null, true);
    } else {
        cb(new Error('نوع الملف غير مدعوم. المسموح: صور، صوت، فيديو'), false);
    }
};

// 5. Multer للملفات الشخصية
const upload = multer({
    storage: storage,
    fileFilter: profileImageFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
}).single('profileImage');

// 6. Multer للدردشات
const chatUpload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB كحد أقصى
        files: 1
    },
    fileFilter: chatMediaFilter
});

// =================================================
// 🛡️ 6.5 التحقق من النوع الحقيقي للملف عبر توقيع البايتات (Magic Numbers)
// السبب: mimetype واسم الملف يرسلهما العميل ويمكن تزويرهما بسهولة.
// هنا نقرأ البايتات الأولى من المحتوى الفعلي — وهي لا تُزوَّر لأنها الملف نفسه.
// =================================================

// يتحقق من تطابق تسلسل بايتات معيّن عند إزاحة محددة
const bytesMatch = (buf, offset, signature) =>
    signature.every((byte, i) => buf[offset + i] === byte);

const detectRealFileType = (buffer) => {
    if (!buffer || buffer.length < 12) return null;

    // --- صور ---
    if (bytesMatch(buffer, 0, [0xFF, 0xD8, 0xFF])) return 'image/jpeg';
    if (bytesMatch(buffer, 0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'image/png';
    if (bytesMatch(buffer, 0, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
    // WEBP: "RIFF" ثم "WEBP" عند الإزاحة 8
    if (bytesMatch(buffer, 0, [0x52, 0x49, 0x46, 0x46]) &&
        bytesMatch(buffer, 8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';

    // --- فيديو/حاويات ---
    // MP4/MOV: "ftyp" عند الإزاحة 4
    if (bytesMatch(buffer, 4, [0x66, 0x74, 0x79, 0x70])) return 'video/mp4';
    // WEBM/MKV (EBML) — تُستخدم للفيديو والصوت المسجّل من المتصفح
    if (bytesMatch(buffer, 0, [0x1A, 0x45, 0xDF, 0xA3])) return 'video/webm';

    // --- صوت ---
    // MP3: إما ترويسة ID3 أو إطار MPEG
    if (bytesMatch(buffer, 0, [0x49, 0x44, 0x33])) return 'audio/mpeg';
    if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) return 'audio/mpeg';
    // WAV: "RIFF" ثم "WAVE"
    if (bytesMatch(buffer, 0, [0x52, 0x49, 0x46, 0x46]) &&
        bytesMatch(buffer, 8, [0x57, 0x41, 0x56, 0x45])) return 'audio/wav';
    // OGG
    if (bytesMatch(buffer, 0, [0x4F, 0x67, 0x67, 0x53])) return 'audio/ogg';

    return null; // نوع غير معروف = مرفوض
};

// حارس يُستدعى بعد اكتمال الرفع للذاكرة، قبل أي إرسال لـ Cloudinary
const assertRealType = (buffer, allowedTypes) => {
    const realType = detectRealFileType(buffer);
    if (!realType) {
        throw new Error('تعذّر التعرف على نوع الملف. الملف تالف أو غير مدعوم.');
    }
    if (!allowedTypes.includes(realType)) {
        throw new Error('محتوى الملف لا يطابق نوعاً مسموحاً به.');
    }
    return realType;
};

// 7. دالة مساعدة لحذف الصورة القديمة من Cloudinary
const deleteFromCloudinary = async (publicId) => {
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error("Error deleting old image from Cloudinary:", error);
    }
};

// 8. دالة مساعدة لاستخراج Public ID من رابط Cloudinary
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

// 9. دالة لرفع صور الدردشة مع خيارات حماية
const uploadChatImage = (fileBuffer, options = {}) => {
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

// 10. دالة لرفع صوت الدردشة
const uploadChatVoice = (fileBuffer, duration) => {
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

// 11. دالة لرفع فيديو الدردشة
const uploadChatVideo = (fileBuffer, duration, options = {}) => {
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

// 12. دالة حذف وسائط الدردشة
const deleteChatMedia = async (publicId, resourceType = 'image') => {
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

// 12.5 دالة رفع صورة إشعار تحويل الكوينزات
const uploadReceiptImage = (fileBuffer) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'coin_purchase_receipts', resource_type: 'image' },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        uploadStream.end(fileBuffer);
    });
};

// 13. التصدير
module.exports = {
    cloudinary,
    upload,                    // للملفات الشخصية (middleware)
    chatUpload,               // للدردشات (middleware)
    uploadChatImage,          // دالة رفع صور الدردشة
    uploadChatVoice,          // دالة رفع صوت الدردشة
    uploadChatVideo,          // دالة رفع فيديو الدردشة
    deleteChatMedia,          // دالة حذف وسائط الدردشة
    uploadReceiptImage,        // دالة رفع صورة إشعار التحويل
    deleteFromCloudinary,     // دالة حذف عامة
        getPublicIdFromUrl,   // دالة استخراج publicId
    detectRealFileType,       //  كشف النوع الحقيقي من البايتات
    assertRealType            //  حارس التحقق قبل الرفع
};
