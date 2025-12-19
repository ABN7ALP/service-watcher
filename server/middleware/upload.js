const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = 'uploads';
        
        if (file.fieldname === 'voice') {
            folder = 'uploads/voices';
        } else if (file.fieldname === 'receipt') {
            folder = 'uploads/receipts';
        } else if (file.fieldname === 'profile') {
            folder = 'uploads/profiles';
        } else if (file.fieldname === 'gift') {
            folder = 'uploads/gifts';
        }
        
        const fullPath = path.join(__dirname, `../${folder}`);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
        
        cb(null, fullPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    const allowedTypes = {
        'image/jpeg': true,
        'image/jpg': true,
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
        cb(new Error('نوع الملف غير مدعوم'), false);
    }
};

// Create upload middleware
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1
    }
});

// Specific upload configurations
exports.profileUpload = upload.single('profile');
exports.voiceUpload = upload.single('voice');
exports.receiptUpload = upload.single('receipt');
exports.giftUpload = upload.single('gift');
exports.chatImageUpload = upload.single('image');
exports.chatVoiceUpload = upload.single('voice');

// Handle upload errors
exports.handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'حجم الملف كبير جداً. الحد الأقصى 10 ميجابايت'
            });
        }
        
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'لا يمكن رفع أكثر من ملف واحد'
            });
        }
    }
    
    if (err.message === 'نوع الملف غير مدعوم') {
        return res.status(400).json({
            success: false,
            message: 'نوع الملف غير مدعوم. المسموح: صور، صوت، فيديو'
        });
    }
    
    next(err);
};

// Delete uploaded file
exports.deleteUploadedFile = (filePath) => {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
};

// Get file extension
exports.getFileExtension = (filename) => {
    return path.extname(filename).toLowerCase();
};

// Check if file is image
exports.isImageFile = (mimetype) => {
    return mimetype.startsWith('image/');
};

// Check if file is audio
exports.isAudioFile = (mimetype) => {
    return mimetype.startsWith('audio/');
};

// Check if file is video
exports.isVideoFile = (mimetype) => {
    return mimetype.startsWith('video/');
};
