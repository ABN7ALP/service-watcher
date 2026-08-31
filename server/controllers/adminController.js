const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const Battle = require('../models/Battle');
const Gift = require('../models/Gift');
const AdminLog = require('../models/AdminLog');

// Admin Dashboard Stats
exports.getDashboardStats = async (req, res) => {
  try {
    const GiftLog = require('../models/GiftLog');
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // ✅ الإصلاح الجذري: Promise.allSettled بدل Promise.all — إذا فشل استعلام واحد
    // (مثلاً بسبب بيانات فارغة أو تعارض بسيط)، لا تنهار لوحة التحكم بالكامل،
    // بل تُعرض بقية البيانات ويُسجَّل الخطأ الفعلي في سجل الخادم للتشخيص.
    const results = await Promise.allSettled([
      User.countDocuments(),
      Transaction.aggregate([
        { $match: { type: 'deposit', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Withdrawal.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.countDocuments({ type: 'deposit', status: 'pending' }),
      Withdrawal.countDocuments({ status: 'pending' }),
      Battle.countDocuments({ status: { $in: ['waiting', 'in-progress'] } }),
      Transaction.countDocuments({
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      }),
      Transaction.aggregate([
        { $match: { type: 'deposit', status: 'completed' } },
        { $group: { _id: '$user', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } }, { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $unwind: '$u' },
        { $project: { _id: '$u._id', username: '$u.username', profileImage: '$u.profileImage', totalDeposited: '$total' } }
      ]),
      GiftLog.aggregate([
        { $match: { createdAt: { $gte: startOfMonth } } },
        { $group: { _id: '$sender', total: { $sum: '$totalPrice' } } },
        { $sort: { total: -1 } }, { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $unwind: '$u' },
        { $project: { _id: '$u._id', username: '$u.username', profileImage: '$u.profileImage', totalGifted: '$total' } }
      ]),
      Transaction.aggregate([
        { $match: { type: 'win', status: 'completed' } },
        { $group: { _id: '$user', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } }, { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $unwind: '$u' },
        { $project: { _id: '$u._id', username: '$u.username', profileImage: '$u.profileImage', totalWon: '$total' } }
      ])
    ]);

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[ADMIN DASHBOARD] فشل الاستعلام رقم ${i}:`, r.reason?.message || r.reason);
      }
    });

    const val = (i, fallback) => (results[i].status === 'fulfilled' ? results[i].value : fallback);

    const totalUsers = val(0, 0);
    const totalDepositsAgg = val(1, []);
    const totalWithdrawalsAgg = val(2, []);
    const pendingDeposits = val(3, 0);
    const pendingWithdrawals = val(4, 0);
    const activeBattles = val(5, 0);
    const todayTransactions = val(6, 0);
    const topDepositors = val(7, []);
    const topGifters = val(8, []);
    const topWinners = val(9, []);

    res.json({
      success: true,
      stats: {
        totalUsers,
        onlineUsers: 0,
        totalDeposits: totalDepositsAgg[0]?.total || 0,
        totalWithdrawals: totalWithdrawalsAgg[0]?.total || 0,
        pendingDeposits,
        pendingWithdrawals,
        activeBattles,
        todayTransactions
      },
      topUsers: { depositors: topDepositors, gifters: topGifters, winners: topWinners }
    });

  } catch (error) {
    console.error('[ADMIN DASHBOARD ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
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

    const user = await User.findById(userId).select('-password')
      .populate('friends', 'username profileImage');
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    const transactions = await Transaction.find({ user: userId })
      .sort('-createdAt')
      .limit(100);

    // ✅ الإصلاح الجذري: المسار الصحيح لأعضاء الفرق هو teams.teamA / teams.teamB
    // (المسار القديم 'teamA.user' لم يكن يطابق أي مستند إطلاقاً، فكانت هذه الدالة
    // ترجع دائماً قائمة تحديات فارغة ونسبة فوز = 0 مهما كانت بيانات المستخدم الحقيقية)
    const battles = await Battle.find({
      $or: [
        { 'teams.teamA': userId },
        { 'teams.teamB': userId },
        { players: userId }
      ]
    }).sort('-createdAt').limit(50);

    const completedBattles = battles.filter(b => b.status === 'completed');
    const wins = completedBattles.filter(b => {
      const inTeamA = (b.teams?.teamA || []).some(p => p.toString() === userId);
      const inTeamB = (b.teams?.teamB || []).some(p => p.toString() === userId);
      return (b.winner === 'teamA' && inTeamA) || (b.winner === 'teamB' && inTeamB);
    }).length;

    res.json({
      success: true,
      user,
      transactions,
      battles,
      stats: {
        totalBattles: completedBattles.length,
        totalWins: wins,
        winRate: completedBattles.length > 0 ? (wins / completedBattles.length * 100) : 0
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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


// تعيين/إلغاء صلاحية الوكيل لمستخدم
exports.setAgentStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isAgent, agentWhatsapp } = req.body;
    const { admin } = req;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    user.isAgent = !!isAgent;
    user.agentWhatsapp = isAgent ? (agentWhatsapp || null) : null;
    await user.save();

    await AdminLog.logAction({
      admin: admin._id,
      action: 'update_user',
      targetUser: userId,
      details: { action: 'set_agent_status', isAgent: user.isAgent },
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: isAgent ? 'تم تعيين المستخدم كوكيل شحن' : 'تم إلغاء صلاحية الوكيل',
      user: { id: user._id, isAgent: user.isAgent, agentWhatsapp: user.agentWhatsapp }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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


// =====================================================
// ✅ تعديل رصيد/كوينز مستخدم يدوياً — عملية مالية آمنة وموثّقة بالكامل
// - يمنع الرصيد السالب رياضياً
// - يفرض سبباً مكتوباً لكل عملية (سجل تدقيق كامل)
// - يُنشئ سجل Transaction حقيقي (وليس تعديلاً صامتاً على الحقل مباشرة)
// - يُسجَّل في AdminLog بخطورة "warning" لسهولة المراجعة لاحقاً
// =====================================================
exports.adjustUserFunds = async (req, res) => {
  try {
    const { userId } = req.params;
    const { balanceChange = 0, coinsChange = 0, reason } = req.body;
    const { admin } = req;

    const balChange = parseFloat(balanceChange) || 0;
    const coinChange = parseInt(coinsChange) || 0;

    if (balChange === 0 && coinChange === 0) {
      return res.status(400).json({ success: false, message: 'يجب تحديد قيمة تغيير واحدة على الأقل' });
    }
    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ success: false, message: 'يجب كتابة سبب التعديل (3 أحرف على الأقل) لأغراض التوثيق' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

    if (balChange < 0 && user.balance + balChange < 0) {
      return res.status(400).json({ success: false, message: 'العملية سترجع رصيد المستخدم سالباً — غير مسموح' });
    }
    if (coinChange < 0 && user.coins + coinChange < 0) {
      return res.status(400).json({ success: false, message: 'العملية سترجع كوينز المستخدم سالبة — غير مسموح' });
    }

    user.balance += balChange;
    user.coins += coinChange;
    await user.save();

    if (balChange !== 0) {
      await Transaction.create({
        user: user._id,
        type: balChange > 0 ? 'deposit' : 'withdrawal',
        amount: Math.abs(balChange),
        currency: 'USD',
        status: 'completed',
        description: `تعديل يدوي من الإدارة: ${reason.trim()}`,
        processedBy: admin._id,
        processedAt: new Date()
      });
    }

    await AdminLog.logAction({
      admin: admin._id,
      action: 'manual_transaction',
      targetUser: user._id,
      details: { balanceChange: balChange, coinsChange: coinChange, reason: reason.trim() },
      severity: 'warning',
      ipAddress: req.ip
    });

    const io = req.app.get('socketio');
    if (io && user.socketId) {
      io.to(user.socketId).emit('balanceUpdate', { newBalance: user.balance });
      io.to(user.socketId).emit('coinsUpdated', { newCoins: user.coins });
    }

    res.json({
      success: true,
      message: 'تم تعديل رصيد المستخدم بنجاح',
      user: { balance: user.balance, coins: user.coins }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =====================================================
// ✅ طلبات الشحن (الإيداعات عبر Transaction)
// =====================================================
exports.getDeposits = async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 50 } = req.query;
    const query = { type: 'deposit' };
    if (status !== 'all') query.status = status;

    const deposits = await Transaction.find(query)
      .populate('user', 'username profileImage customId')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(query);
    res.json({ success: true, deposits, totalPages: Math.ceil(total / limit), currentPage: parseInt(page) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =====================================================
// ✅ طلبات شراء الكوينزات (CoinPurchase)
// =====================================================
exports.getCoinPurchases = async (req, res) => {
  try {
    const CoinPurchase = require('../models/CoinPurchase');
    const { status = 'pending_review', page = 1, limit = 50 } = req.query;
    const query = {};
    if (status !== 'all') query.status = status;

    const purchases = await CoinPurchase.find(query)
      .populate('user', 'username profileImage customId')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await CoinPurchase.countDocuments(query);
    res.json({ success: true, purchases, totalPages: Math.ceil(total / limit), currentPage: parseInt(page) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveCoinPurchase = async (req, res) => {
  try {
    const CoinPurchase = require('../models/CoinPurchase');
    const { purchaseId } = req.params;
    const { admin } = req;

    const purchase = await CoinPurchase.findById(purchaseId);
    if (!purchase) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    if (purchase.status !== 'pending_review') {
      return res.status(400).json({ success: false, message: 'هذا الطلب ليس قيد المراجعة حالياً' });
    }

    purchase.status = 'approved';
    purchase.processedBy = admin._id;
    purchase.processedAt = new Date();
    await purchase.save();

    const user = await User.findById(purchase.user);
    if (user) {
      user.coins += purchase.coinsAmount;
      await user.save();
      const io = req.app.get('socketio');
      if (io && user.socketId) {
        io.to(user.socketId).emit('coinsUpdated', { newCoins: user.coins, purchaseId: purchase._id });
      }
    }

    await AdminLog.logAction({
      admin: admin._id, action: 'approve_deposit', targetUser: purchase.user,
      targetEntity: 'transaction', entityId: purchase._id,
      details: { type: 'coin_purchase', coinsAmount: purchase.coinsAmount }, ipAddress: req.ip
    });

    res.json({ success: true, message: 'تمت الموافقة وإيداع الكوينز بنجاح', purchase });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectCoinPurchase = async (req, res) => {
  try {
    const CoinPurchase = require('../models/CoinPurchase');
    const { purchaseId } = req.params;
    const { reason } = req.body;
    const { admin } = req;

    const purchase = await CoinPurchase.findById(purchaseId);
    if (!purchase) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    if (!['pending_payment', 'pending_review'].includes(purchase.status)) {
      return res.status(400).json({ success: false, message: 'لا يمكن رفض طلب تمت معالجته مسبقاً' });
    }

    purchase.status = 'rejected';
    purchase.adminNotes = (reason || '').trim();
    purchase.processedBy = admin._id;
    purchase.processedAt = new Date();
    await purchase.save();

    await AdminLog.logAction({
      admin: admin._id, action: 'reject_deposit', targetUser: purchase.user,
      targetEntity: 'transaction', entityId: purchase._id,
      details: { type: 'coin_purchase', reason }, ipAddress: req.ip
    });

    res.json({ success: true, message: 'تم رفض الطلب', purchase });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =====================================================
// ✅ المعاملات المالية العامة (سجل شامل قابل للبحث والفلترة)
// =====================================================
exports.getAllTransactions = async (req, res) => {
  try {
    const { type = 'all', status = 'all', page = 1, limit = 50, search = '' } = req.query;
    const query = {};
    if (type !== 'all') query.type = type;
    if (status !== 'all') query.status = status;

    if (search) {
      const matchedUsers = await User.find({
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { customId: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      query.user = { $in: matchedUsers.map(u => u._id) };
    }

    const transactions = await Transaction.find(query)
      .populate('user', 'username profileImage customId')
      .populate('recipient', 'username')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(query);
    res.json({ success: true, transactions, totalPages: Math.ceil(total / limit), currentPage: parseInt(page) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =====================================================
// ✅ إدارة التحديات (مراقبة حية + إنهاء قسري مع استرداد الرهانات)
// =====================================================
exports.getBattles = async (req, res) => {
  try {
    const { status = 'active', page = 1, limit = 50 } = req.query;
    const query = {};
    if (status === 'active') query.status = { $in: ['waiting', 'in-progress'] };
    else if (status !== 'all') query.status = status;

    const battles = await Battle.find(query)
      .populate('players', 'username profileImage')
      .populate('teams.teamA', 'username profileImage')
      .populate('teams.teamB', 'username profileImage')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Battle.countDocuments(query);
    res.json({ success: true, battles, totalPages: Math.ceil(total / limit), currentPage: parseInt(page) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.forceEndBattle = async (req, res) => {
  try {
    const { battleId } = req.params;
    const { refund = true } = req.body;
    const { admin } = req;

    const battle = await Battle.findById(battleId);
    if (!battle) return res.status(404).json({ success: false, message: 'التحدي غير موجود' });
    if (['completed', 'cancelled'].includes(battle.status)) {
      return res.status(400).json({ success: false, message: 'هذا التحدي منتهٍ بالفعل' });
    }

    if (refund) {
      const allPlayers = [
        ...(battle.teams?.teamA || []),
        ...(battle.teams?.teamB || []),
        ...(battle.players || [])
      ];
      const uniqueIds = [...new Set(allPlayers.map(p => p.toString()))];
      const io = req.app.get('socketio');

      for (const uid of uniqueIds) {
        const u = await User.findById(uid);
        if (u) {
          u.balance += battle.betAmount || 0;
          await u.save();
          if (io && u.socketId) io.to(u.socketId).emit('balanceUpdate', { newBalance: u.balance });
        }
      }
    }

    battle.status = 'cancelled';
    await battle.save();

    const io = req.app.get('socketio');
    if (io) io.emit('battleUpdate', battle);

    await AdminLog.logAction({
      admin: admin._id, action: 'system_maintenance', targetEntity: 'battle',
      entityId: battle._id, details: { action: 'force_end', refunded: refund },
      severity: 'warning', ipAddress: req.ip
    });

    res.json({ success: true, message: 'تم إنهاء التحدي' + (refund ? ' واسترداد الرهانات بنجاح' : ' بدون استرداد') });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =====================================================
// ✅ حذف هدية من المتجر
// =====================================================
exports.deleteGift = async (req, res) => {
  try {
    const { giftId } = req.params;
    const { admin } = req;

    const gift = await Gift.findByIdAndDelete(giftId);
    if (!gift) return res.status(404).json({ success: false, message: 'الهدية غير موجودة' });

    await AdminLog.logAction({
      admin: admin._id, action: 'delete_gift', details: { giftName: gift.name }, ipAddress: req.ip
    });

    res.json({ success: true, message: 'تم حذف الهدية بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =====================================================
// ✅ إدارة البلاغات (Reports)
// =====================================================
exports.getReports = async (req, res) => {
  try {
    const Report = require('../models/Report');
    const { status = 'pending', page = 1, limit = 50 } = req.query;
    const query = {};
    if (status !== 'all') query.status = status;

    const reports = await Report.find(query)
      .populate('reporter', 'username profileImage customId')
      .populate('reportedUser', 'username profileImage customId isBanned')
      .sort('-priority -createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Report.countDocuments(query);
    res.json({ success: true, reports, totalPages: Math.ceil(total / limit), currentPage: parseInt(page) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.resolveReport = async (req, res) => {
  try {
    const Report = require('../models/Report');
    const { reportId } = req.params;
    const { status, action, notes } = req.body; // status: resolved | dismissed | escalated
    const { admin } = req;

    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ success: false, message: 'البلاغ غير موجود' });

    report.status = status || 'resolved';
    if (action) {
      report.resolution = {
        action, notes: (notes || '').trim(), resolvedBy: admin._id, resolvedAt: new Date()
      };
    }
    await report.save();

    // تنفيذ فعلي للإجراء إذا كان حظراً
    if (action === 'ban' && report.reportedUser) {
      const user = await User.findById(report.reportedUser);
      if (user && !user.isBanned) {
        user.isBanned = true;
        user.banReason = notes || 'مخالفة إثر بلاغ مستخدم';
        await user.save();
        await AdminLog.logAction({
          admin: admin._id, action: 'ban_user', targetUser: user._id,
          details: { reason: user.banReason, source: 'report_resolution' }, severity: 'warning', ipAddress: req.ip
        });
      }
    }

    await AdminLog.logAction({
      admin: admin._id, action: 'update_settings', targetEntity: 'user',
      details: { type: 'report_resolution', reportId, status: report.status, action }, ipAddress: req.ip
    });

    res.json({ success: true, message: 'تم تحديث حالة البلاغ', report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
