// 📁 config/upload.js
const multer = require('multer');
const path = require('path');

// تحديد مكان حفظ الصور
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/deposits/');
    },
    filename: (req, file, cb) => {
        const uniqueName = `deposit_${Date.now()}_${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// التحقق من نوع الملف
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('❌ نوع الملف غير مسموح به. المسموح: jpg, png, gif, webp'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB كحد أقصى
    fileFilter: fileFilter
});

module.exports = upload;
