const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google', authController.googleAuth);
router.get('/verify-email/:token', authController.verifyEmail);

// Protected routes
router.post('/upload-voice', 
  auth, 
  upload.single('voice'), 
  authController.uploadVoice
);

router.get('/profile', auth, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;
