const mongoose = require('mongoose');

const systemStatsSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true,
    default: () => new Date().setHours(0, 0, 0, 0)
  },
  
  // User statistics
  totalUsers: {
    type: Number,
    default: 0
  },
  newUsers: {
    type: Number,
    default: 0
  },
  activeUsers: {
    type: Number,
    default: 0
  },
  bannedUsers: {
    type: Number,
    default: 0
  },
  
  // Financial statistics
  totalDeposits: {
    amount: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },
  totalWithdrawals: {
    amount: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },
  pendingDeposits: {
    amount: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },
  pendingWithdrawals: {
    amount: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },
  totalCommission: {
    type: Number,
    default: 0
  },
  totalFees: {
    type: Number,
    default: 0
  },
  
  // Battle statistics
  totalBattles: {
    type: Number,
    default: 0
  },
  completedBattles: {
    type: Number,
    default: 0
  },
  cancelledBattles: {
    type: Number,
    default: 0
  },
  totalBetAmount: {
    type: Number,
    default: 0
  },
  totalPrizes: {
    type: Number,
    default: 0
  },
  
  // Gift statistics
  giftsSent: {
    type: Number,
    default: 0
  },
  giftsReceived: {
    type: Number,
    default: 0
  },
  totalGiftValue: {
    type: Number,
    default: 0
  },
  
  // Chat statistics
  messagesSent: {
    type: Number,
    default: 0
  },
  imagesSent: {
    type: Number,
    default: 0
  },
  voiceMessagesSent: {
    type: Number,
    default: 0
  },
  
  // System performance
  averageResponseTime: {
    type: Number,
    default: 0
  },
  errorCount: {
    type: Number,
    default: 0
  },
  serverUptime: {
    type: Number,
    default: 0
  },
  
  // Peak hours
  peakHour: {
    hour: Number,
    users: Number
  },
  
  // Revenue
  dailyRevenue: {
    type: Number,
    default: 0
  },
  
  // Calculated metrics
  conversionRate: {
    type: Number,
    default: 0
  },
  averageDeposit: {
    type: Number,
    default: 0
  },
  averageWithdrawal: {
    type: Number,
    default: 0
  },
  userRetention: {
    type: Number,
    default: 0
  },
  
  // Timestamps
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
systemStatsSchema.index({ date: -1 });
systemStatsSchema.index({ 'totalDeposits.amount': -1 });
systemStatsSchema.index({ 'totalWithdrawals.amount': -1 });

// Pre-save hook to calculate metrics
systemStatsSchema.pre('save', function(next) {
  // Calculate average deposit
  if (this.totalDeposits.count > 0) {
    this.averageDeposit = this.totalDeposits.amount / this.totalDeposits.count;
  }
  
  // Calculate average withdrawal
  if (this.totalWithdrawals.count > 0) {
    this.averageWithdrawal = this.totalWithdrawals.amount / this.totalWithdrawals.count;
  }
  
  // Calculate conversion rate (depositing users / total users)
  if (this.totalUsers > 0) {
    const depositingUsers = this.totalDeposits.count; // This is transactions count, not users
    this.conversionRate = (depositingUsers / this.totalUsers) * 100;
  }
  
  this.updatedAt = new Date();
  next();
});

// Static method to get or create today's stats
systemStatsSchema.statics.getTodayStats = async function() {
  const today = new Date().setHours(0, 0, 0, 0);
  
  let stats = await this.findOne({ date: today });
  
  if (!stats) {
    // Get yesterday's stats to carry over totals
    const yesterday = new Date(today - 24 * 60 * 60 * 1000);
    const yesterdayStats = await this.findOne({ date: yesterday });
    
    stats = new this({
      date: today,
      totalUsers: yesterdayStats ? yesterdayStats.totalUsers : 0,
      bannedUsers: yesterdayStats ? yesterdayStats.bannedUsers : 0
    });
    
    await stats.save();
  }
  
  return stats;
};

// Method to update stats
systemStatsSchema.methods.updateStats = async function(updates) {
  for (const key in updates) {
    if (key in this.schema.paths) {
      if (typeof updates[key] === 'number') {
        this[key] = (this[key] || 0) + updates[key];
      } else if (typeof updates[key] === 'object') {
        for (const subKey in updates[key]) {
          if (subKey in this[key]) {
            this[key][subKey] = (this[key][subKey] || 0) + updates[key][subKey];
          }
        }
      }
    }
  }
  
  return this.save();
};

// Static method to get stats for period
systemStatsSchema.statics.getStatsForPeriod = async function(startDate, endDate) {
  const stats = await this.find({
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).sort('date');
  
  // Aggregate the stats
  const aggregated = {
    totalUsers: 0,
    newUsers: 0,
    activeUsers: 0,
    totalDeposits: { amount: 0, count: 0 },
    totalWithdrawals: { amount: 0, count: 0 },
    totalBattles: 0,
    totalCommission: 0,
    dailyRevenue: 0,
    dates: []
  };
  
  stats.forEach(stat => {
    aggregated.totalUsers = Math.max(aggregated.totalUsers, stat.totalUsers);
    aggregated.newUsers += stat.newUsers;
    aggregated.activeUsers += stat.activeUsers;
    aggregated.totalDeposits.amount += stat.totalDeposits.amount;
    aggregated.totalDeposits.count += stat.totalDeposits.count;
    aggregated.totalWithdrawals.amount += stat.totalWithdrawals.amount;
    aggregated.totalWithdrawals.count += stat.totalWithdrawals.count;
    aggregated.totalBattles += stat.totalBattles;
    aggregated.totalCommission += stat.totalCommission;
    aggregated.dailyRevenue += stat.dailyRevenue;
    aggregated.dates.push(stat.date.toISOString().split('T')[0]);
  });
  
  // Calculate averages
  const days = stats.length;
  aggregated.averageDailyUsers = aggregated.activeUsers / days;
  aggregated.averageDailyDeposits = aggregated.totalDeposits.amount / days;
  aggregated.averageDailyWithdrawals = aggregated.totalWithdrawals.amount / days;
  
  return aggregated;
};

const SystemStats = mongoose.model('SystemStats', systemStatsSchema);
module.exports = SystemStats;
