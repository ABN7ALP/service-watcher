const mongoose = require('mongoose');

const battleSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['1v1', '2v2', '4v4'],
    required: true
  },
  teamA: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    betAmount: Number,
    ready: {
      type: Boolean,
      default: false
    }
  }],
  teamB: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    betAmount: Number,
    ready: {
      type: Boolean,
      default: false
    }
  }],
  totalPrize: {
    type: Number,
    required: true
  },
  winner: {
    type: String,
    enum: ['teamA', 'teamB', 'draw', null],
    default: null
  },
  status: {
    type: String,
    enum: ['waiting', 'ready', 'in_progress', 'completed', 'cancelled'],
    default: 'waiting'
  },
  startTime: Date,
  endTime: Date,
  duration: Number, // in minutes
  commission: {
    type: Number,
    default: 0.20 // 20 cents commission
  },
  chatRoom: {
    type: String,
    unique: true
  },
  spectators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isPublic: {
    type: Boolean,
    default: true
  },
  password: String // for private battles
}, {
  timestamps: true
});

const Battle = mongoose.model('Battle', battleSchema);
module.exports = Battle;
