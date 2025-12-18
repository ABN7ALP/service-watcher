const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'bet', 'win', 'loss', 'gift_send', 'gift_receive', 'commission'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    enum: ['USD', 'coins'],
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  method: {
    type: String,
    enum: ['sham_kash', 'credit_card', 'paypal', 'crypto', null],
    default: null
  },
  transactionId: {
    type: String,
    unique: true
  },
  receiptImage: String,
  walletNumber: String,
  description: String,
  battle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Battle'
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adminNotes: String,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: Date,
  fees: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

const Transaction = mongoose.model('Transaction', transactionSchema);
module.exports = Transaction;
