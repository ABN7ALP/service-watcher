const mongoose = require('mongoose');

const adminLogSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'login',
      'logout',
      'create_user',
      'update_user',
      'delete_user',
      'ban_user',
      'unban_user',
      'mute_user',
      'unmute_user',
      'approve_deposit',
      'reject_deposit',
      'approve_withdrawal',
      'reject_withdrawal',
      'update_permissions',
      'create_gift',
      'update_gift',
      'delete_gift',
      'update_settings',
      'system_maintenance',
      'manual_transaction',
      'ip_ban',
      'mass_notification'
    ]
  },
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  targetEntity: {
    type: String,
    enum: ['user', 'transaction', 'withdrawal', 'gift', 'system', 'battle', null],
    default: null
  },
  entityId: mongoose.Schema.Types.ObjectId,
  details: mongoose.Schema.Types.Mixed,
  ipAddress: String,
  userAgent: String,
  location: {
    country: String,
    city: String,
    timezone: String
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'error', 'critical'],
    default: 'info'
  },
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  isAutomated: {
    type: Boolean,
    default: false
  },
  responseTime: Number, // in milliseconds
  error: String
}, {
  timestamps: true
});

// Indexes
adminLogSchema.index({ admin: 1, createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });
adminLogSchema.index({ targetUser: 1, createdAt: -1 });
adminLogSchema.index({ severity: 1, createdAt: -1 });

// Pre-save hook to add location if available
adminLogSchema.pre('save', function(next) {
  if (this.ipAddress && !this.location) {
    // In production, you would use a geolocation service
    // This is just a placeholder
    this.location = {
      country: 'Unknown',
      city: 'Unknown',
      timezone: 'UTC'
    };
  }
  next();
});

// Static method to log admin action
adminLogSchema.statics.logAction = async function(data) {
  try {
    const log = new this(data);
    await log.save();
    return log;
  } catch (error) {
    console.error('Failed to log admin action:', error);
    return null;
  }
};

// Static method to get logs with filters
adminLogSchema.statics.getFilteredLogs = async function(filters = {}, page = 1, limit = 50) {
  const query = {};
  
  if (filters.admin) query.admin = filters.admin;
  if (filters.action) query.action = filters.action;
  if (filters.targetUser) query.targetUser = filters.targetUser;
  if (filters.severity) query.severity = filters.severity;
  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
  }
  if (filters.search) {
    query.$or = [
      { 'details': { $regex: filters.search, $options: 'i' } },
      { 'error': { $regex: filters.search, $options: 'i' } }
    ];
  }

  const total = await this.countDocuments(query);
  const logs = await this.find(query)
    .populate('admin', 'username profileImage')
    .populate('targetUser', 'username')
    .sort('-createdAt')
    .limit(limit)
    .skip((page - 1) * limit);

  return {
    logs,
    total,
    pages: Math.ceil(total / limit),
    currentPage: page
  };
};

// Method to get readable action name
adminLogSchema.methods.getActionName = function() {
  const actionNames = {
    'login': 'تسجيل الدخول',
    'logout': 'تسجيل الخروج',
    'create_user': 'إنشاء مستخدم',
    'update_user': 'تحديث مستخدم',
    'delete_user': 'حذف مستخدم',
    'ban_user': 'حظر مستخدم',
    'unban_user': 'إلغاء حظر مستخدم',
    'mute_user': 'كتم مستخدم',
    'unmute_user': 'إلغاء كتم مستخدم',
    'approve_deposit': 'موافقة على شحن',
    'reject_deposit': 'رفض شحن',
    'approve_withdrawal': 'موافقة على سحب',
    'reject_withdrawal': 'رفض سحب',
    'update_permissions': 'تحديث الصلاحيات',
    'create_gift': 'إنشاء هدية',
    'update_gift': 'تحديث هدية',
    'delete_gift': 'حذف هدية',
    'update_settings': 'تحديث الإعدادات',
    'system_maintenance': 'صيانة النظام',
    'manual_transaction': 'معاملة يدوية',
    'ip_ban': 'حظر IP',
    'mass_notification': 'إشعار جماعي'
  };
  
  return actionNames[this.action] || this.action;
};

const AdminLog = mongoose.model('AdminLog', adminLogSchema);
module.exports = AdminLog;
