const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [20, 'Username cannot exceed 20 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  googleId: {
    type: String,
    sparse: true
  },
  profileImage: {
    type: String,
    default: 'default-avatar.png'
  },
  gender: {
    type: String,
    enum: ['male', 'female'],
    required: true
  },
  voiceVerification: {
    url: String,
    verified: {
      type: Boolean,
      default: false
    },
    genderDetected: String
  },
  relationship: {
    type: String,
    enum: ['single', 'married', 'divorced', 'relationship', 'other']
  },
  education: {
    type: String,
    enum: ['student', 'graduate', 'uneducated', 'other']
  },
  age: {
    type: Number,
    min: 18
  },
  balance: {
    type: Number,
    default: 0
  },
  coins: {
    type: Number,
    default: 0
  },
  level: {
    type: Number,
    default: 1
  },
  experience: {
    type: Number,
    default: 0
  },
  totalDeposited: {
    type: Number,
    default: 0
  },
  totalWithdrawn: {
    type: Number,
    default: 0
  },
  totalWon: {
    type: Number,
    default: 0
  },
  totalLost: {
    type: Number,
    default: 0
  },
  totalGifted: {
    type: Number,
    default: 0
  },
  totalReceivedGifts: {
    type: Number,
    default: 0
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  adminPermissions: [{
    type: String,
    enum: ['ban', 'mute', 'kick', 'lock_seat', 'manage_users', 'manage_withdrawals']
  }],
  isBanned: {
    type: Boolean,
    default: false
  },
  banReason: String,
  banExpires: Date,
  isMuted: {
    type: Boolean,
    default: false
  },
  muteExpires: Date,
  lastActive: {
    type: Date,
    default: Date.now
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  currentSeat: {
    type: Number,
    default: null
  },
  socketId: String,
  ipAddress: String,
  agreedToTerms: {
    type: Boolean,
    required: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to calculate level based on experience
userSchema.methods.calculateLevel = function() {
  const exp = this.experience;
  let level = 1;
  let requiredExp = 100;
  
  while (exp >= requiredExp) {
    level++;
    requiredExp += requiredExp * 0.5; // 50% increase per level
  }
  
  return level;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
