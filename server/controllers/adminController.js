const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const Battle = require('../models/Battle');
const Gift = require('../models/Gift');
const AdminLog = require('../models/AdminLog');

// Admin Dashboard Stats
exports.getDashboardStats = async (req, res) => {
  try {
    const { admin } = req;

    if (!admin.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'صلاحيات غير كافية'
      });
    }

    // Get statistics
    const [
      totalUsers,
      onlineUsers,
      totalDeposits,
      totalWithdrawals,
      pendingDeposits,
      pendingWithdrawals,
      activeBattles,
      todayTransactions
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isOnline: true }),
      Transaction.aggregate([
        { $match: { type: 'deposit', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { type: 'withdrawal', status: 'completed' } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
      ]),
      Transaction.countDocuments({ type: 'deposit', status: 'pending' }),
      Withdrawal.countDocuments({ status: 'pending' }),
      Battle.countDocuments({ status: { $in: ['waiting', 'ready', 'in_progress'] } }),
      Transaction.countDocuments({
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      })
    ]);

    // Top users
    const topDepositors = await User.find()
      .sort('-totalDeposited')
      .limit(10)
      .select('username totalDeposited profileImage');

    const topGifters = await User.find()
      .sort('-totalGifted')
      .limit(10)
      .select('username totalGifted profileImage');

    const topWinners = await User.find()
      .sort('-totalWon')
      .limit(10)
      .select('username totalWon profileImage');

    res.json({
      success: true,
      stats: {
        totalUsers,
        onlineUsers,
        totalDeposits: totalDeposits[0]?.total || 0,
        totalWithdrawals: totalWithdrawals[0]?.total || 0,
        pendingDeposits,
        pendingWithdrawals,
        activeBattles,
        todayTransactions
      },
      topUsers: {
        depositors: topDepositors,
        gifters: topGifters,
        winners: topWinners
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Manage Users
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    
    const query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get User Details
exports.getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود'
      });
    }

    // Get user transactions
    const transactions = await Transaction.find({ user: userId })
      .sort('-createdAt')
      .limit(100);

    // Get user battles
    const battles = await Battle.find({
      $or: [
        { 'teamA.user': userId },
        { 'teamB.user': userId }
      ]
    }).sort('-createdAt').limit(50);

    res.json({
      success: true,
      user,
      transactions,
      battles,
      stats: {
        totalBattles: battles.length,
        winRate: battles.filter(b => 
          (b.winner === 'teamA' && b.teamA.some(p => p.user.toString() === userId)) ||
          (b.winner === 'teamB' && b.teamB.some(p => p.user.toString() === userId))
        ).length / battles.length * 100 || 0
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update User
exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    const { admin } = req;

    // Log admin action
    await AdminLog.create({
      admin: admin._id,
      action: 'update_user',
      targetUser: userId,
      details: updates,
      ipAddress: req.ip
    });

    const user = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'تم تحديث بيانات المستخدم',
      user
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Ban User
exports.banUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, duration = null } = req.body;
    const { admin } = req;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود'
      });
    }

    user.isBanned = true;
    user.banReason = reason;
    
    if (duration) {
      const durationMs = duration * 24 * 60 * 60 * 1000; // Convert days to ms
      user.banExpires = new Date(Date.now() + durationMs);
    }

    await user.save();

    // Log action
    await AdminLog.create({
      admin: admin._id,
      action: 'ban_user',
      targetUser: userId,
      details: { reason, duration },
      ipAddress: req.ip
    });

    // Broadcast ban via sockets
    // This would be handled in socket handlers

    res.json({
      success: true,
      message: `تم حظر المستخدم ${duration ? `لمدة ${duration} يوم` : 'بشكل دائم'}`,
      user: {
        id: user._id,
        username: user.username,
        isBanned: user.isBanned,
        banReason: user.banReason,
        banExpires: user.banExpires
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Unban User
exports.unbanUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { admin } = req;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود'
      });
    }

    user.isBanned = false;
    user.banReason = null;
    user.banExpires = null;
    await user.save();

    await AdminLog.create({
      admin: admin._id,
      action: 'unban_user',
      targetUser: userId,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'تم إلغاء حظر المستخدم',
      user: {
        id: user._id,
        username: user.username,
        isBanned: user.isBanned
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Manage Admin Permissions
exports.updatePermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;
    const { admin } = req;

    if (!admin.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'صلاحيات غير كافية'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود'
      });
    }

    user.adminPermissions = permissions;
    await user.save();

    await AdminLog.create({
      admin: admin._id,
      action: 'update_permissions',
      targetUser: userId,
      details: { permissions },
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'تم تحديث الصلاحيات',
      permissions: user.adminPermissions
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Approve Deposit
exports.approveDeposit = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { admin } = req;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'المعاملة غير موجودة'
      });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'المعاملة غير قابلة للمعالجة'
      });
    }

    // Update transaction
    transaction.status = 'completed';
    transaction.processedBy = admin._id;
    transaction.processedAt = new Date();
    await transaction.save();

    // Add balance to user
    const user = await User.findById(transaction.user);
    if (user) {
      user.balance += transaction.amount;
      user.totalDeposited += transaction.amount;
      await user.save();
    }

    // Log action
    await AdminLog.create({
      admin: admin._id,
      action: 'approve_deposit',
      targetUser: transaction.user,
      details: { amount: transaction.amount },
      ipAddress: req.ip
    });

    // Send notification to user via socket
    // This would be handled in socket handlers

    res.json({
      success: true,
      message: 'تمت الموافقة على الشحن',
      transaction
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Approve Withdrawal
exports.approveWithdrawal = async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const { admin } = req;

    const withdrawal = await Withdrawal.findById(withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'طلب السحب غير موجود'
      });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'طلب السحب غير قابلة للمعالجة'
      });
    }

    // Update withdrawal
    withdrawal.status = 'completed';
    withdrawal.processedBy = admin._id;
    withdrawal.processedAt = new Date();
    await withdrawal.save();

    // Update transaction
    await Transaction.findOneAndUpdate(
      { description: { $regex: `طلب سحب.*${withdrawal.amount}` }, user: withdrawal.user },
      {
        status: 'completed',
        processedBy: admin._id,
        processedAt: new Date()
      }
    );

    // Log action
    await AdminLog.create({
      admin: admin._id,
      action: 'approve_withdrawal',
      targetUser: withdrawal.user,
      details: { amount: withdrawal.amount, netAmount: withdrawal.netAmount },
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'تمت الموافقة على السحب',
      withdrawal
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Reject Transaction
exports.rejectTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { reason } = req.body;
    const { admin } = req;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'المعاملة غير موجودة'
      });
    }

    transaction.status = 'failed';
    transaction.adminNotes = reason;
    transaction.processedBy = admin._id;
    transaction.processedAt = new Date();
    await transaction.save();

    // If deposit was rejected, no need to adjust balance
    // If withdrawal was rejected, return reserved balance
    if (transaction.type === 'withdrawal') {
      const user = await User.findById(transaction.user);
      if (user) {
        user.balance += Math.abs(transaction.amount); // Return the reserved amount
        await user.save();
      }
    }

    await AdminLog.create({
      admin: admin._id,
      action: 'reject_transaction',
      targetUser: transaction.user,
      details: { reason, transactionType: transaction.type },
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'تم رفض المعاملة',
      transaction
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Manage Gifts
exports.getGifts = async (req, res) => {
  try {
    const gifts = await Gift.find().sort('sortOrder price');
    res.json({
      success: true,
      gifts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Create/Update Gift
exports.saveGift = async (req, res) => {
  try {
    const giftData = req.body;
    const { giftId } = req.params;
    const { admin } = req;

    let gift;
    if (giftId) {
      gift = await Gift.findByIdAndUpdate(giftId, giftData, { new: true });
    } else {
      gift = new Gift(giftData);
      await gift.save();
    }

    await AdminLog.create({
      admin: admin._id,
      action: giftId ? 'update_gift' : 'create_gift',
      details: giftData,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: giftId ? 'تم تحديث الهدية' : 'تم إنشاء الهدية',
      gift
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get System Logs
exports.getLogs = async (req, res) => {
  try {
    const { page = 1, limit = 100, action = '' } = req.query;
    
    const query = {};
    if (action) {
      query.action = action;
    }

    const logs = await AdminLog.find(query)
      .populate('admin', 'username')
      .populate('targetUser', 'username')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await AdminLog.countDocuments(query);

    res.json({
      success: true,
      logs,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update System Settings
exports.updateSettings = async (req, res) => {
  try {
    const settings = req.body;
    const { admin } = req;

    // Save to database or environment
    // This would typically be stored in a SystemSettings collection

    await AdminLog.create({
      admin: admin._id,
      action: 'update_settings',
      details: settings,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'تم تحديث الإعدادات',
      settings
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
