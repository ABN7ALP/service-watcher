const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const { voiceUpload } = require('../middleware/upload'); // تغيير هنا

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google', authController.googleAuth);
router.get('/verify-email/:token', authController.verifyEmail);

// Protected routes
router.post('/upload-voice', 
  auth, 
  voiceUpload, // استخدام voiceUpload مباشرة
  authController.uploadVoice
);

// Get user profile
router.get('/profile', auth, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;
