const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  roomType: {
    type: String,
    enum: ['public', 'private', 'battle', 'admin'],
    required: true
  },
  roomId: {
    type: String,
    required: true,
    index: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  messages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'voice', 'gift'],
      default: 'text'
    },
    content: String,
    imageUrl: String,
    voiceUrl: String,
    voiceDuration: Number,
    gift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gift'
    },
    allowSave: {
      type: Boolean,
      default: true
    },
    allowScreenshot: {
      type: Boolean,
      default: true
    },
    viewCount: {
      type: Number,
      default: 0,
      max: 1
    },
    readBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    expiresAt: {
      type: Date,
      index: { expires: '12h' } // Auto delete after 12 hours
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const Chat = mongoose.model('Chat', chatSchema);
module.exports = Chat;
