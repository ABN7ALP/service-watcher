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


module.exports = {
    cloudinary,
    upload,
    deleteFromCloudinary,
    getPublicIdFromUrl
};
