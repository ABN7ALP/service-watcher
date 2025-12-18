const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendVerificationEmail } = require('../utils/emailService');

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Register User
exports.register = async (req, res) => {
  try {
    const { 
      username, 
      email, 
      phone, 
      password, 
      gender, 
      age,
      relationship,
      education,
      agreedToTerms 
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }, { phone }] 
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Create new user
    const user = new User({
      username,
      email,
      phone,
      password,
      gender,
      age,
      relationship,
      education,
      agreedToTerms,
      emailVerified: false
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Send verification email
    await sendVerificationEmail(email, user._id);

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        gender: user.gender,
        needsVoiceVerification: user.gender === 'female'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Login User
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if banned
    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Account is banned',
        banReason: user.banReason,
        banExpires: user.banExpires
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last active
    user.lastActive = Date.now();
    user.isOnline = true;
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profileImage: user.profileImage,
        balance: user.balance,
        coins: user.coins,
        level: user.level,
        isAdmin: user.isAdmin
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Google OAuth
exports.googleAuth = async (req, res) => {
  try {
    const { tokenId } = req.body;
    
    // Here you would verify the Google token
    // For now, we'll simulate it
    const googleUser = {
      email: 'example@gmail.com',
      name: 'Google User'
    };

    // Check if user exists
    let user = await User.findOne({ email: googleUser.email });

    if (!user) {
      // Create new user
      user = new User({
        username: googleUser.name,
        email: googleUser.email,
        password: Math.random().toString(36).slice(-8), // Random password
        gender: 'male', // Default
        agreedToTerms: true,
        emailVerified: true
      });
      await user.save();
    }

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Google authentication successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profileImage: user.profileImage,
        balance: user.balance,
        coins: user.coins,
        level: user.level
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Upload Voice Verification
exports.uploadVoice = async (req, res) => {
  try {
    const { userId } = req.user;
    const voiceFile = req.file;

    if (!voiceFile) {
      return res.status(400).json({
        success: false,
        message: 'Voice file is required'
      });
    }

    // Upload to Cloudinary
    const cloudinary = require('cloudinary').v2;
    const result = await cloudinary.uploader.upload(voiceFile.path, {
      resource_type: 'video',
      folder: 'voice-verifications'
    });

    // Here you would add gender detection logic
    // For now, we'll simulate it
    const genderDetected = 'female'; // This should come from an AI service

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.voiceVerification = {
      url: result.secure_url,
      verified: genderDetected === 'female',
      genderDetected
    };

    await user.save();

    res.json({
      success: true,
      message: 'Voice uploaded successfully',
      verified: user.voiceVerification.verified
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Verify Email
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    
    // Decode token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.emailVerified = true;
    await user.save();

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};
