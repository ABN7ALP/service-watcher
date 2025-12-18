const jwt = require('jsonwebtoken');
const User = require('../models/User');

const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      throw new Error();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ 
      _id: decoded.userId,
      isAdmin: true,
      isBanned: false 
    }).select('-password');

    if (!user) {
      throw new Error();
    }

    req.admin = user;
    next();
  } catch (error) {
    res.status(403).json({ 
      success: false, 
      message: 'Admin access required' 
    });
  }
};

module.exports = adminAuth;
