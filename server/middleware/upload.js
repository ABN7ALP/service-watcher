const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const createUploadsDir = () => {
  const dirs = [
    'server/uploads',
    'server/uploads/profiles',
    'server/uploads/voices',
    'server/uploads/receipts',
    'server/uploads/gifts',
    'server/uploads/chat'
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// Call on module load
createUploadsDir();

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'server/uploads';
    
    if (file.fieldname === 'voice') {
      folder = 'server/uploads/voices';
    } else if (file.fieldname === 'receipt') {
      folder = 'server/uploads/receipts';
    } else if (file.fieldname === 'profile') {
      folder = 'server/uploads/profiles';
    } else if (file.fieldname === 'gift') {
      folder = 'server/uploads/gifts';
    } else if (file.fieldname === 'image') {
      folder = 'server/uploads/chat';
    }
    
    // Ensure directory exists
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
    
    cb(null, folder);
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

// Create multer instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  }
});

// Export specific upload configurations
module.exports = {
  // Main multer instance
  upload,
  
  // Specific middleware configurations
  profileUpload: upload.single('profile'),
  voiceUpload: upload.single('voice'),
  receiptUpload: upload.single('receipt'),
  giftUpload: upload.single('gift'),
  chatImageUpload: upload.single('image'),
  chatVoiceUpload: upload.single('voice'),
  
  // Error handling middleware
  handleUploadError: (err, req, res, next) => {
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
  },
  
  // Utility functions
  deleteUploadedFile: (filePath) => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  },
  
  getFileExtension: (filename) => {
    return path.extname(filename).toLowerCase();
  },
  
  isImageFile: (mimetype) => {
    return mimetype.startsWith('image/');
  },
  
  isAudioFile: (mimetype) => {
    return mimetype.startsWith('audio/');
  },
  
  isVideoFile: (mimetype) => {
    return mimetype.startsWith('video/');
  }
};
