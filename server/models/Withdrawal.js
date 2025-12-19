const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 1,
    max: 1000
  },
  fee: {
    type: Number,
    default: 0
  },
  netAmount: {
    type: Number,
    required: true
  },
  walletNumber: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'rejected', 'cancelled'],
    default: 'pending'
  },
  transactionId: {
    type: String,
    unique: true
  },
  adminNotes: String,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: Date,
  rejectionReason: String,
  proofImage: String, // Optional: proof of payment from admin
  requestedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  attemptCount: {
    type: Number,
    default: 0
  },
  lastAttemptAt: Date,
  isUrgent: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for faster queries
withdrawalSchema.index({ user: 1, status: 1, createdAt: -1 });
withdrawalSchema.index({ status: 1, createdAt: 1 });
withdrawalSchema.index({ transactionId: 1 }, { unique: true });

// Pre-save hook to generate transaction ID
withdrawalSchema.pre('save', function(next) {
  if (!this.transactionId) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    this.transactionId = `WDR${timestamp}${random}`;
  }
  next();
});

// Virtual for formatted amount
withdrawalSchema.virtual('formattedAmount').get(function() {
  return `${this.amount.toFixed(2)}$`;
});

// Virtual for formatted net amount
withdrawalSchema.virtual('formattedNetAmount').get(function() {
  return `${this.netAmount.toFixed(2)}$`;
});

// Method to check if withdrawal can be cancelled
withdrawalSchema.methods.canBeCancelled = function() {
  return this.status === 'pending' || this.status === 'processing';
};

// Method to get status in Arabic
withdrawalSchema.methods.getStatusInArabic = function() {
  const statusMap = {
    'pending': 'قيد الانتظار',
    'processing': 'قيد المعالجة',
    'completed': 'مكتمل',
    'rejected': 'مرفوض',
    'cancelled': 'ملغي'
  };
  return statusMap[this.status] || this.status;
};

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
module.exports = Withdrawal;
