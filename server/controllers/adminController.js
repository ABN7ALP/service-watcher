const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const Gift = require('../models/Gift');
const AdminLog = require('../models/AdminLog');
const ClientErrorLog = require('../models/ClientErrorLog');
const ClientCompatLog = require('../models/ClientCompatLog');
const SystemHealth = require('../models/SystemHealth');
const WalletReconciliation = require('../models/WalletReconciliation');
const walletService = require('../utils/walletService');

// Admin Dashboard Stats
exports.getDashboardStats = async (req, res) => {
  try {
    const GiftLog = require('../models/GiftLog');
    const CoinPurchase = require('../models/CoinPurchase');
    const ChatReport = require('../models/ChatReport');
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // ✅ Promise.allSettled بدل Promise.all: فشل استعلام واحد لا يُسقط لوحة التحكم بالكامل
    const results = await Promise.allSettled([
      User.countDocuments(),                                                     // 0
      Transaction.aggregate([                                                    // 1
        { $match: { type: 'deposit', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Withdrawal.aggregate([                                                     // 2
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.countDocuments({ type: 'deposit', status: 'pending' }),         // 3
      Withdrawal.countDocuments({ status: 'pending' }),                          // 4
      Transaction.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }), // 5
      Transaction.aggregate([                                                    // 6
        { $match: { type: 'deposit', status: 'completed' } },
        { $group: { _id: '$user', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } }, { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $unwind: '$u' },
        { $project: { _id: '$u._id', username: '$u.username', profileImage: '$u.profileImage', totalDeposited: '$total' } }
      ]),
      GiftLog.aggregate([                                                        // 7
        { $match: { createdAt: { $gte: startOfMonth } } },
        { $group: { _id: '$sender', total: { $sum: '$totalPrice' } } },
        { $sort: { total: -1 } }, { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $unwind: '$u' },
        { $project: { _id: '$u._id', username: '$u.username', profileImage: '$u.profileImage', totalGifted: '$total' } }
      ]),
      CoinPurchase.countDocuments({ status: 'pending_review' }),                  // 8
      ChatReport.countDocuments({ status: 'pending' }),                           // 9
      User.countDocuments({ isBanned: true })                                     // 10
    ]);

    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[ADMIN DASHBOARD] فشل الاستعلام رقم ${i}:`, r.reason?.message || r.reason);
    });
    const val = (i, fallback) => (results[i].status === 'fulfilled' ? results[i].value : fallback);

    res.json({
      success: true,
      stats: {
        totalUsers: val(0, 0),
        onlineUsers: 0,
        totalDeposits: val(1, [])[0]?.total || 0,
        totalWithdrawals: val(2, [])[0]?.total || 0,
        pendingDeposits: val(3, 0),
        pendingWithdrawals: val(4, 0),
        todayTransactions: val(5, 0),
        pendingCoinPurchases: val(8, 0),
        pendingReports: val(9, 0),
        bannedUsers: val(10, 0)
      },
      // 🗑️ أُزيل "winners" (أكثر الفائزين بلعبة التحدي) مع حذف اللعبة بالكامل — كان أصلاً
      // يعتمد على نوع معاملة 'win' لا يُنشئه أي كود حالي (رصيد الفوز يُحدَّث مباشرة)، فكان
      // دوماً فارغاً، لكن إزالته تماماً أنظف من ترك استعلام ميت يخص لعبة محذوفة
      topUsers: { depositors: val(6, []), gifters: val(7, []) }
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
    // 🛡️ إصلاح جذري (مراجعة أمنية — redteam-audit-1، البند #11، Low): كان trimmed يُستخدَم
    // مباشرة بـ$regex بلا أي تعقيم — نفس اتفاقية التعقيم المُستخدَمة أصلاً بـgetClientErrors
    // بهذا الملف وVoiceRoom.listRooms/MusicTrack.search (الحل الجذري الحقيقي: استخدام الدالة
    // المشتركة الموجودة فعلاً queryHelpers.safeSearchRegex بدل تكرار تعقيم مختلف بكل موضع)
    const { safeSearchRegex } = require('../utils/queryHelpers');
    const searchRegex = safeSearchRegex(search, 100);
    if (searchRegex) {
      query.$or = [
        { username: searchRegex },
        { email: searchRegex },
        { customId: searchRegex }
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

    res.json({
      success: true,
      user,
      transactions
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

    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ success: false, message: 'يجب كتابة سبب الحظر' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    if (user.isAdmin) return res.status(403).json({ success: false, message: 'لا يمكن حظر حساب إداري' });

    user.isBanned = true;
    user.banReason = reason.trim();
    // ✅ نضبط banExpires صراحةً دائماً (null = دائم) لمنع بقاء تاريخ انتهاء قديم
    // من حظر مؤقت سابق يتسبب بفك حظر تلقائي خاطئ لاحقاً عند تطبيق حظر دائم جديد
    user.banExpires = duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;
    await user.save();

    await AdminLog.create({
      admin: admin._id, action: 'ban_user', targetUser: userId,
      details: { reason: user.banReason, duration }, severity: 'warning', ipAddress: req.ip
    });

    // ✅ إنفاذ فوري: لو كان متصلاً الآن، يصله إشعار الحظر لحظياً بدل انتظار طلبه القادم
    const io = req.app.get('socketio');
    if (io && user.socketId) {
      io.to(user.socketId).emit('account-banned', {
        reason: user.banReason, banExpires: user.banExpires, isPermanent: !user.banExpires
      });
      // 🛡️ إصلاح جذري (مراجعة أمنية — البند #1): الإشعار وحده لا يكفي — كان يعتمد على التزام
      // العميل بقطع اتصاله بنفسه (قابل للتجاوز بتجاهل الإشعار/تعديل العميل). نقطع اتصال
      // السوكيت فعلياً هنا (بعد إرسال الإشعار له مباشرة)، بالإضافة لفحص verifySocketToken
      // الجديد عند أي محاولة اتصال لاحقة — راجع تعليقه الكامل بـsocketService.js
      require('../services/socketService').forceDisconnectUserSocket(io, user.socketId);
    }

    res.json({
      success: true,
      message: `تم حظر المستخدم ${duration ? `لمدة ${duration} يوم` : 'بشكل دائم'}`,
      user: { id: user._id, username: user.username, isBanned: true, banReason: user.banReason, banExpires: user.banExpires }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

    // 🛡️ إصلاح جذري (مراجعة أمنية — redteam-audit-1، البند #6): كان الفحص (status!=='pending')
    // وإضافة الرصيد لاحقاً (user.balance += ...; save()) عمليتين منفصلتين بلا أي قفل — أُثبِت
    // فعلياً: 5 طلبات موافقة متزامنة على نفس المعاملة أنتجت رصيداً مُضاعَفاً في 4/5 محاولات.
    // نفس نمط adminReviewCustomGift: حجز ذرّي واحد (findOneAndUpdate بشرط status:'pending')
    // يضمن أن أي محاولة ثانية تصطدم بفشل الحجز نفسه فوراً — لا فرصة لإضافة الرصيد مرتين
    const session = await mongoose.startSession();
    let transaction = null;
    let user = null;
    try {
      await session.withTransaction(async () => {
        transaction = await Transaction.findOneAndUpdate(
          { _id: transactionId, status: 'pending' },
          { $set: { status: 'completed', processedBy: admin._id, processedAt: new Date() } },
          { new: true, session }
        );
        if (!transaction) {
          throw Object.assign(new Error('المعاملة غير موجودة أو تمت معالجتها مسبقاً'), { code: 'ALREADY_PROCESSED' });
        }
        await walletService.post([{
          user: transaction.user, wallet: 'usd_cents', delta: Math.round(transaction.amount * 100), type: 'deposit',
          refType: 'Transaction', refId: transaction._id, idempotencyKey: `${transaction._id}:deposit`
        }], session);
        user = await User.findById(transaction.user).select('balance socketId').session(session);
      });
    } catch (txError) {
      if (txError.code === 'ALREADY_PROCESSED') {
        return res.status(400).json({ success: false, message: txError.message });
      }
      throw txError;
    } finally {
      await session.endSession();
    }

    if (user) {
      const io = req.app.get('socketio');

      // ✅ تحديث الرصيد لحظياً في واجهة المستخدم إن كان متصلاً الآن
      if (io && user.socketId) {
        io.to(user.socketId).emit('balanceUpdate', { newBalance: user.balance });
      }

      // ✅ بوت الموقع: إشعار تفصيلي بنجاح الشحن
      const { sendBotMessage } = require('../utils/botMessenger');
      await sendBotMessage(io, user._id, `تم شحن رصيدك بمبلغ ${transaction.amount}$ بنجاح \nرصيدك الحالي: ${user.balance.toFixed(2)}$`);
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

    // 🛡️ إصلاح جذري (مراجعة أمنية — redteam-audit-1، البند #6): نفس علّة approveDeposit
    // بالضبط، بل أسوأ — هذي الدالة لم تكن تتحقق من status:'pending' إطلاقاً قبل الرفض،
    // فمعاملة واحدة يمكن رفضها عدة مرات (كل مرة تُضيف استرداداً جديداً للسحب). حجز ذرّي واحد
    // (findOneAndUpdate بشرط status:'pending') يضمن رفضاً واحداً فعلياً بالضبط، والاسترداد
    // (لمعاملات السحب فقط) يُنفَّذ بنفس المعاملة الذرّية — لا فرصة لاسترداد مزدوج
    const session = await mongoose.startSession();
    let transaction = null;
    let refundedUser = null;
    try {
      await session.withTransaction(async () => {
        transaction = await Transaction.findOneAndUpdate(
          { _id: transactionId, status: 'pending' },
          { $set: { status: 'failed', adminNotes: reason, processedBy: admin._id, processedAt: new Date() } },
          { new: true, session }
        );
        if (!transaction) {
          throw Object.assign(new Error('المعاملة غير موجودة أو تمت معالجتها مسبقاً'), { code: 'ALREADY_PROCESSED' });
        }
        // If deposit was rejected, no need to adjust balance
        // If withdrawal was rejected, return reserved balance
        if (transaction.type === 'withdrawal') {
          await walletService.post([{
            user: transaction.user, wallet: 'usd_cents', delta: Math.round(Math.abs(transaction.amount) * 100), type: 'refund',
            refType: 'Transaction', refId: transaction._id, idempotencyKey: `${transaction._id}:refund`
          }], session);
          refundedUser = await User.findById(transaction.user).select('balance socketId').session(session);
        }
      });
    } catch (txError) {
      if (txError.code === 'ALREADY_PROCESSED') {
        return res.status(400).json({ success: false, message: txError.message });
      }
      throw txError;
    } finally {
      await session.endSession();
    }

    const io = req.app.get('socketio');
    const { sendBotMessage } = require('../utils/botMessenger');
    if (refundedUser && io && refundedUser.socketId) {
      // ✅ تحديث الرصيد لحظياً في واجهة المستخدم إن كان متصلاً الآن
      io.to(refundedUser.socketId).emit('balanceUpdate', { newBalance: refundedUser.balance });
    }

    // ✅ بوت الموقع: إشعار المستخدم برفض طلبه والسبب (كان مفقوداً تماماً)
    const reasonText = reason && reason.trim() ? reason.trim() : 'لم يُحدد سبب';
    const botMessage = transaction.type === 'withdrawal'
      ? `❌ تم رفض طلب سحبك بمبلغ ${Math.abs(transaction.amount).toFixed(2)}$.\nالسبب: ${reasonText}\nتم إرجاع المبلغ إلى رصيدك.`
      : `❌ تم رفض طلب شحن رصيدك بمبلغ ${Math.abs(transaction.amount).toFixed(2)}$.\nالسبب: ${reasonText}`;
    await sendBotMessage(io, transaction.user, botMessage);

    await AdminLog.logAction({
      admin: admin._id,
      action: 'reject_transaction',
      targetUser: transaction.user,
      targetEntity: 'transaction',
      entityId: transaction._id,
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
    const { page = 1, limit = 50, action = '', severity = '' } = req.query;
    const result = await AdminLog.getFilteredLogs(
      { action: action || undefined, severity: severity || undefined },
      parseInt(page), parseInt(limit)
    );
    res.json({ success: true, logs: result.logs, totalPages: result.pages, currentPage: result.currentPage });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// ✅ سجل أخطاء العميل (الواجهة) — راجع server/controllers/clientErrorController.js
exports.getClientErrors = async (req, res) => {
  try {
    const { page = 1, limit = 50, q = '' } = req.query;
    const query = {};
    if (q && q.trim()) {
      const safe = q.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { message: { $regex: safe, $options: 'i' } },
        { username: { $regex: safe, $options: 'i' } },
        { url: { $regex: safe, $options: 'i' } }
      ];
    }
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const [errors, total] = await Promise.all([
      ClientErrorLog.find(query).sort('-createdAt').limit(limitNum).skip((pageNum - 1) * limitNum).lean(),
      ClientErrorLog.countDocuments(query)
    ]);
    res.json({ success: true, errors, totalPages: Math.ceil(total / limitNum), currentPage: pageNum });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =====================================================
// ✅ room-ux-v2 (بند 5) — "إجماليات" توافق المتصفحات (آخر 30 يوماً، نفس مدة TTL المستند):
// أكثر عائلات/إصدارات متصفحات واجهت فحصاً فاشلاً، وأكثر الميزات نقصاً تحديداً — لا سجل خام
// مُصفَّح (العدد عادة صغير جداً مقارنة بأخطاء الواجهة العامة)، مجموع جاهز مباشرة للوحة التحكم
// =====================================================
exports.getClientCompatStats = async (req, res) => {
  try {
    const [byBrowser, byFeature, byCategory, total] = await Promise.all([
      ClientCompatLog.aggregate([
        { $group: { _id: { uaFamily: '$uaFamily', uaVersion: '$uaVersion' }, count: { $sum: 1 }, lastSeen: { $max: '$createdAt' } } },
        { $sort: { count: -1 } },
        { $limit: 100 }
      ]),
      ClientCompatLog.aggregate([
        { $unwind: '$missingFeatures' },
        { $group: { _id: '$missingFeatures', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      // ✅ مراجعة PR #116: 'in-app' (متصفح تطبيق مدمج/WebRTC وحدها الناقصة) مقابل 'legacy'
      // (متصفح قديم فعلياً) — يوضّح هل مشكلة التوافق الأكبر فعلياً متصفحات تطبيقات مدمجة
      // (لا يحلّها "حدّث متصفحك" إطلاقاً) أو متصفحات قديمة حقيقية
      ClientCompatLog.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      ClientCompatLog.countDocuments()
    ]);
    res.json({
      success: true,
      total,
      byBrowser: byBrowser.map(b => ({ uaFamily: b._id.uaFamily, uaVersion: b._id.uaVersion, count: b.count, lastSeen: b.lastSeen })),
      byFeature: byFeature.map(f => ({ feature: f._id, count: f.count })),
      byCategory: byCategory.map(c => ({ category: c._id || 'legacy', count: c.count }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =====================================================
// ✅ chore/dependency-health — "صحة النظام": نتائج آخر فحص npm outdated/audit (dependencyHealthJob)
// + عدّادات توافق المتصفحات (PR #116) مجمَّعة لعرض موحّد بلوحة التحكم
// =====================================================
exports.getSystemHealth = async (req, res) => {
  try {
    // ✅ نقرأ بـcheckRunId الأحدث فقط لا كل المجموعة: لو تداخل تشغيلان (تلقائي + يدوي بالتزامن
    // النادر) تبقى القراءة متّسقة بنتائج تشغيل واحد فعلي بدل مزيج من دفعتين مختلفتين
    const [latestRun, clientCompatByCategory] = await Promise.all([
      SystemHealth.findOne().sort({ createdAt: -1 }),
      ClientCompatLog.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ])
    ]);
    const findings = latestRun ? await SystemHealth.find({ checkRunId: latestRun.checkRunId }) : [];

    const vulnerabilities = findings.filter(f => f.type === 'vulnerability');
    const outdated = findings.filter(f => f.type === 'outdated');
    const errors = findings.filter(f => f.type === 'error');

    const severityCounts = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
    for (const v of vulnerabilities) {
      if (severityCounts[v.severity] !== undefined) severityCounts[v.severity]++;
    }

    const clientCompat = { legacy: 0, inApp: 0 };
    for (const c of clientCompatByCategory) {
      if (c._id === 'in-app') clientCompat.inApp = c.count;
      else clientCompat.legacy += c.count; // أي قيمة غير 'in-app' (أو null قديمة) تُحسب legacy
    }

    const lastCheckAt = latestRun ? latestRun.createdAt : null;

    res.json({
      success: true,
      lastCheckAt,
      severityCounts,
      vulnerabilities: vulnerabilities.map(v => ({
        package: v.package, severity: v.severity, advisoryTitle: v.advisoryTitle, advisoryUrl: v.advisoryUrl
      })),
      outdated: outdated.map(o => ({
        package: o.package, current: o.current, wanted: o.wanted, latest: o.latest, isMajorUpdate: o.isMajorUpdate
      })),
      errors: errors.map(e => ({ source: e.source, message: e.errorMessage })),
      clientCompat
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ زر "فحص الآن" — يشغّل الفحص مباشرة (محدَّد المعدل بمسار الراوتر: مرة واحدة كل 5 دقائق
// إجمالاً لكل الأدمنز معاً، لا لكل أدمن منفرد — الفحص مُكلف نسبياً (execFile لـnpm) ولا داعي
// لتشغيله بالتوازي من أكثر من مشرف بنفس اللحظة)
exports.runSystemHealthCheckNow = async (req, res) => {
  try {
    const { admin } = req;
    const { runDependencyHealthCheck } = require('../utils/dependencyHealthJob');
    const result = await runDependencyHealthCheck();

    await AdminLog.logAction({
      admin: admin._id,
      action: 'system_maintenance',
      targetEntity: 'system',
      details: { action: 'manual_dependency_health_check', ...result },
      isAutomated: false,
      ipAddress: req.ip
    });
    console.log(`🩺 [SYSTEM HEALTH] فحص يدوي بواسطة ${admin.username || admin._id}: ${result.vulnerabilityCount} ثغرة، ${result.outdatedCount} حزمة قديمة`);

    res.json({ success: true, message: 'تم تنفيذ الفحص بنجاح', result });
  } catch (error) {
    console.error('[SYSTEM HEALTH] فشل الفحص اليدوي:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// =====================================================
// ✅ "صحة المحفظة" (feat/wallet-ledger-v1): نتائج آخر فحص تصالح walletReconciliationJob —
// نفس نمط getSystemHealth بالضبط (آخر checkRunId فقط، لا كل المجموعة)
// =====================================================
exports.getWalletHealth = async (req, res) => {
  try {
    const latestSummary = await WalletReconciliation.findOne({ type: 'summary' }).sort({ createdAt: -1 });
    if (!latestSummary) {
      return res.json({ success: true, lastCheckAt: null, usersChecked: 0, mismatchCount: 0, liabilityUsd: 0, cashReceivedUsd: 0, mismatches: [] });
    }
    const mismatches = await WalletReconciliation.find({ checkRunId: latestSummary.checkRunId, type: 'mismatch' })
      .populate('user', 'username customId')
      .limit(20);

    res.json({
      success: true,
      lastCheckAt: latestSummary.createdAt,
      usersChecked: latestSummary.usersChecked,
      mismatchCount: latestSummary.mismatchCount,
      liabilityUsd: latestSummary.liabilityUsd,
      cashReceivedUsd: latestSummary.cashReceivedUsd,
      mismatches: mismatches.map(m => ({
        user: m.user ? { id: m.user._id, username: m.user.username, customId: m.user.customId } : null,
        wallet: m.wallet, ledgerSum: m.ledgerSum, cachedBalance: m.cachedBalance, diff: m.diff
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ زر "فحص الآن" — نفس منطق runSystemHealthCheckNow (التحديد بمعدَّل مُطبَّق بمسار الراوتر)
exports.runWalletHealthCheckNow = async (req, res) => {
  try {
    const { admin } = req;
    const { runWalletReconciliation } = require('../utils/walletReconciliationJob');
    const result = await runWalletReconciliation();

    await AdminLog.logAction({
      admin: admin._id,
      action: 'system_maintenance',
      targetEntity: 'system',
      details: { action: 'manual_wallet_reconciliation_check', ...result },
      isAutomated: false,
      ipAddress: req.ip
    });
    console.log(`💰 [WALLET HEALTH] فحص يدوي بواسطة ${admin.username || admin._id}: ${result.mismatchCount} تعارض`);

    res.json({ success: true, message: 'تم تنفيذ الفحص بنجاح', result });
  } catch (error) {
    console.error('[WALLET HEALTH] فشل الفحص اليدوي:', error);
    res.status(500).json({ success: false, message: error.message });
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
exports.getSystemSettings = async (req, res) => {
  try {
    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.getSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSystemSettings = async (req, res) => {
  try {
    const SystemSettings = require('../models/SystemSettings');
    const { admin } = req;
    const allowedFields = [
      'coinExchangeRate', 'minPurchaseUSD', 'maxPurchaseUSD',
      'shamCashWallet', 'shamCashHolderName', 'shamCashQrUrl',
      'visaCardNumber', 'visaHolderName',
      'minWithdrawUSD', 'withdrawalFeePer10USD',
      'battleCommissionRate', 'maintenanceMode', 'maintenanceMessage',
      'coinsToUsdRedemptionRate', 'giftRedemptionHaircutPercent', 'maxDailyWithdrawalUSD',
      'pkWinLp', 'pkLossLp', 'pkDrawLp', 'pkSupportLpDivisor', 'pkLpCapPerBattle',
      'pkMinDurationSeconds', 'pkMinSupportCoins', 'pkMaxDailyMatchesPerPair',
      'customGiftDesignFeeCoins', 'customGiftSendPriceCoins',
      // 🛡️ مراجعة ما قبل الدمج v2 (البند 3): توقيت عرض الإطلاق — يُضبَط يدوياً من هنا فقط،
      // لا تلقائياً عند الإقلاع (راجع currentPayoutRatePercent)
      'payoutLaunchPct', 'payoutLaunchStartsAt', 'payoutLaunchEndsAt', 'payoutBasePct', 'payoutHighPct', 'highHostLevel'
    ];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        // ✅ تواريخ الإطلاق تصل كنصّ ISO من الواجهة — null صريح يعني "لا تاريخ" (العرض لم يبدأ/لا نهاية محدَّدة)
        if ((field === 'payoutLaunchStartsAt' || field === 'payoutLaunchEndsAt') && req.body[field] !== null) {
          updates[field] = new Date(req.body[field]);
        } else {
          updates[field] = req.body[field];
        }
      }
    }
    updates.updatedBy = admin._id;

    const settings = await SystemSettings.findOneAndUpdate(
      { singletonKey: 'main' }, updates, { new: true, upsert: true, runValidators: true }
    );

    await AdminLog.logAction({
      admin: admin._id, action: 'update_settings', details: updates, severity: 'warning', ipAddress: req.ip
    });

    res.json({ success: true, message: 'تم تحديث الإعدادات بنجاح', settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

    // 🛡️ إصلاح جذري (مراجعة أمنية — redteam-audit-1، البند #6 — نفس عائلة العلّة): كانت
    // user.balance += ...; user.save() عمليتين منفصلتين بعد قراءة سابقة للمستند — طلبا تعديل
    // متزامنان (مثلاً سحب يدوي مزدوج من لوحتين مفتوحتين) يمكن أن يتجاوزا فحص "لن يصبح سالباً"
    // معاً بالاعتماد على نفس القراءة القديمة، فيصل الرصيد/الكوينز لقيمة سالبة فعلياً. الحل:
    // شرط $gte الذري ضمن findOneAndUpdate نفسه (بالضبط نمط createWithdrawal السليم أصلاً
    // بهذا المشروع) — يستحيل تجاوز الشرط لطلبين متزامنين لأن القاعدة تُنفّذهما بالتتابع
    // الذري، + Transaction.create بنفس المعاملة (session) حتى لا يُسجَّل تعديل فعلي بلا سجل
    // محاسبي مطابق لو تعطّل أي شيء بالمنتصف
    const session = await mongoose.startSession();
    let user = null;
    try {
      await session.withTransaction(async () => {
        // ✅ دفتر الأستاذ (feat/wallet-ledger-v1): تعديل يدوي = قيود 'adjustment' (إدارية فقط،
        // بسبب موثَّق) — الكوينز السالبة تُخصَم بونص أولاً ثم مدفوع (نفس ترتيب الإنفاق المعتاد)،
        // الموجبة تُضاف كـcoins_paid (الافتراض المحايد لمنحة إدارية لا مصدر حقيقي محدَّد لها)
        const idemBase = new mongoose.Types.ObjectId();
        const entries = [];
        if (balChange !== 0) {
          entries.push({
            user: userId, wallet: 'usd_cents', delta: Math.round(balChange * 100), type: 'adjustment',
            refType: 'AdminAdjustment', refId: idemBase, idempotencyKey: `${idemBase}:balance`,
            meta: { reason: reason.trim(), admin: admin._id }
          });
        }
        try {
          if (coinChange < 0) {
            const { fromBonus, fromPaid } = await walletService.computeCoinSpendSplit(userId, -coinChange, session);
            if (fromBonus > 0) entries.push({ user: userId, wallet: 'coins_bonus', delta: -fromBonus, type: 'adjustment', refType: 'AdminAdjustment', refId: idemBase, idempotencyKey: `${idemBase}:coins-bonus`, meta: { reason: reason.trim(), admin: admin._id } });
            if (fromPaid > 0) entries.push({ user: userId, wallet: 'coins_paid', delta: -fromPaid, type: 'adjustment', refType: 'AdminAdjustment', refId: idemBase, idempotencyKey: `${idemBase}:coins-paid`, meta: { reason: reason.trim(), admin: admin._id } });
          } else if (coinChange > 0) {
            entries.push({ user: userId, wallet: 'coins_paid', delta: coinChange, type: 'adjustment', refType: 'AdminAdjustment', refId: idemBase, idempotencyKey: `${idemBase}:coins-paid`, meta: { reason: reason.trim(), admin: admin._id } });
          }
          if (entries.length > 0) await walletService.post(entries, session);
        } catch (err) {
          if (err.code === 'INSUFFICIENT_FUNDS') {
            throw Object.assign(new Error('تعذّر تنفيذ التعديل'), { code: 'CLAIM_FAILED' });
          }
          throw err;
        }
        user = await User.findById(userId).select('coins balance socketId').session(session);
        if (!user) {
          throw Object.assign(new Error('تعذّر تنفيذ التعديل'), { code: 'CLAIM_FAILED' });
        }
        if (balChange !== 0) {
          await Transaction.create([{
            user: user._id,
            type: balChange > 0 ? 'deposit' : 'withdrawal',
            amount: Math.abs(balChange),
            currency: 'USD',
            status: 'completed',
            description: `تعديل يدوي من الإدارة: ${reason.trim()}`,
            processedBy: admin._id,
            processedAt: new Date()
          }], { session });
        }
      });
    } catch (txError) {
      if (txError.code === 'CLAIM_FAILED') {
        const exists = await User.exists({ _id: userId });
        if (!exists) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        return res.status(400).json({ success: false, message: 'الرصيد/الكوينز الحالي لا يكفي لتنفيذ هذا التعديل (سيصبح سالباً)' });
      }
      throw txError;
    } finally {
      await session.endSession();
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
    const { sendBotMessage } = require('../utils/botMessenger');
    const parts = [];
    if (balChange !== 0) parts.push(`${balChange > 0 ? '+' : ''}${balChange}$ على رصيدك`);
    if (coinChange !== 0) parts.push(`${coinChange > 0 ? '+' : ''}${coinChange} كوينز`);
    await sendBotMessage(io, user._id, `تم تعديل حسابك من قِبل الإدارة: ${parts.join(' و ')}\nالسبب: ${reason.trim()}`);

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
// 🛡️ مراجعة ما قبل الدمج v2 (البند 2): ترحيل ×10 يفتح كل الهدايا القديمة غير المستبدَلة
// كـbeans_p (ألماس ترويجي — لا يصل للدولار أبداً، "بداية نظيفة" بقرار المالك). هذي الدالة
// هي المسار اليدوي الوحيد لتحويل جزء منها إلى beans_w (قابل للسحب نقداً) لحالات مستقبلية
// فردية موثَّقة (تسوية نزاع، تعويض مستخدم استلم هدايا حقيقية قبل الترحيل...) — إدارة فقط،
// بسبب مكتوب، وقيدا دفتر أستاذ 'adjustment' حقيقيان (لا تعديل صامت على الحقل مباشرة)
// =====================================================
exports.transferBeansToWithdrawable = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, reason } = req.body;
    const { admin } = req;

    const transferAmount = parseInt(amount, 10);
    if (!Number.isInteger(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({ success: false, message: 'المبلغ يجب أن يكون عدداً صحيحاً موجباً' });
    }
    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ success: false, message: 'يجب كتابة سبب التحويل (3 أحرف على الأقل) لأغراض التوثيق' });
    }

    // ✅ نفس نمط adjustUserFunds أعلاه بالضبط: حجز ذرّي عبر walletService.post (شرط $gte
    // داخل المعاملة نفسها) — لا قراءة-ثم-كتابة منفصلتين يمكن أن تتجاوزا الرصيد مع تزامن
    const idemBase = new mongoose.Types.ObjectId();
    const session = await mongoose.startSession();
    let user = null;
    try {
      await session.withTransaction(async () => {
        const entries = [
          { user: userId, wallet: 'beans_p', delta: -transferAmount, type: 'adjustment', refType: 'AdminAdjustment', refId: idemBase, idempotencyKey: `${idemBase}:debit-p`, meta: { reason: reason.trim(), admin: admin._id } },
          { user: userId, wallet: 'beans_w', delta: transferAmount, type: 'adjustment', refType: 'AdminAdjustment', refId: idemBase, idempotencyKey: `${idemBase}:credit-w`, meta: { reason: reason.trim(), admin: admin._id } }
        ];
        await walletService.post(entries, session);
        user = await User.findById(userId).select('socketId').session(session);
        if (!user) {
          throw Object.assign(new Error('تعذّر تنفيذ التحويل'), { code: 'CLAIM_FAILED' });
        }
      });
    } catch (txError) {
      if (txError.code === 'INSUFFICIENT_FUNDS') {
        return res.status(400).json({ success: false, message: 'رصيد الألماس الترويجي (beans_p) الحالي لا يكفي لهذا التحويل' });
      }
      if (txError.code === 'CLAIM_FAILED') {
        return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
      }
      throw txError;
    } finally {
      await session.endSession();
    }

    await AdminLog.logAction({
      admin: admin._id, action: 'transfer_beans_to_withdrawable', targetUser: user._id,
      details: { amount: transferAmount, reason: reason.trim() }, severity: 'warning', ipAddress: req.ip
    });

    const io = req.app.get('socketio');
    const { sendBotMessage } = require('../utils/botMessenger');
    await sendBotMessage(io, user._id, `تم تحويل ${transferAmount} من ألماسك الترويجي إلى ألماس قابل للسحب من قِبل الإدارة.\nالسبب: ${reason.trim()}`);

    res.json({ success: true, message: 'تم التحويل بنجاح' });
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

    // 🛡️ إصلاح جذري (مراجعة أمنية — redteam-audit-1، البند #6 — نفس العلّة بالضبط): حجز ذرّي
    // واحد (findOneAndUpdate بشرط status:'pending_review') + إيداع الكوينز بنفس المعاملة —
    // لا فرصة لإيداع مزدوج من موافقتين متزامنتين على نفس الطلب
    const session = await mongoose.startSession();
    let purchase = null;
    let user = null;
    try {
      await session.withTransaction(async () => {
        purchase = await CoinPurchase.findOneAndUpdate(
          { _id: purchaseId, status: 'pending_review' },
          { $set: { status: 'approved', processedBy: admin._id, processedAt: new Date() } },
          { new: true, session }
        );
        if (!purchase) {
          throw Object.assign(new Error('هذا الطلب ليس قيد المراجعة حالياً'), { code: 'NOT_PENDING' });
        }
        await walletService.post([{
          user: purchase.user, wallet: 'coins_paid', delta: purchase.coinsAmount, type: 'coin_purchase',
          refType: 'CoinPurchase', refId: purchase._id, idempotencyKey: `${purchase._id}:approve`
        }], session);
        user = await User.findById(purchase.user).select('coins socketId').session(session);
      });
    } catch (txError) {
      if (txError.code === 'NOT_PENDING') {
        return res.status(400).json({ success: false, message: txError.message });
      }
      throw txError;
    } finally {
      await session.endSession();
    }

    if (user) {
      const io = req.app.get('socketio');
      if (io && user.socketId) {
        io.to(user.socketId).emit('coinsUpdated', { newCoins: user.coins, purchaseId: purchase._id });
      }
      const { sendBotMessage } = require('../utils/botMessenger');
      await sendBotMessage(io, user._id, `تم إيداع ${purchase.coinsAmount} كوينز في حسابك بنجاح 🪙\nرصيدك الحالي: ${user.coins} كوينز`);
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

    // 🛡️ إصلاح جذري (مراجعة أمنية — redteam-audit-1، البند #6 — للاتساق): نفس نمط الحجز
    // الذري المستخدم بباقي مسارات المراجعة بهذا الملف — يمنع معالجة الطلب مرتين من مراجعتين
    // متزامنتين (رفض مزدوج: سجلّ إداري مكرر + رسالة بوت مكررة للمستخدم)، وإن لم يكن هناك
    // استرداد مالي هنا أصلاً (لا يُضاف للرصيد إلا عند الموافقة)
    const purchase = await CoinPurchase.findOneAndUpdate(
      { _id: purchaseId, status: { $in: ['pending_payment', 'pending_review'] } },
      { $set: { status: 'rejected', adminNotes: (reason || '').trim(), processedBy: admin._id, processedAt: new Date() } },
      { new: true }
    );
    if (!purchase) {
      const exists = await CoinPurchase.exists({ _id: purchaseId });
      if (!exists) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
      return res.status(400).json({ success: false, message: 'لا يمكن رفض طلب تمت معالجته مسبقاً' });
    }

    await AdminLog.logAction({
      admin: admin._id, action: 'reject_deposit', targetUser: purchase.user,
      targetEntity: 'transaction', entityId: purchase._id,
      details: { type: 'coin_purchase', reason }, ipAddress: req.ip
    });

    // ✅ إشعار المستخدم عبر بوت المنصة برفض طلب شراء الكوينز
    const io = req.app.get('socketio');
    const { sendBotMessage } = require('../utils/botMessenger');
    await sendBotMessage(io, purchase.user, `❌ تم رفض طلب شراء الكوينز الخاص بك (${purchase.amountUSD}$).${purchase.adminNotes ? '\nالسبب: ' + purchase.adminNotes : ''}`);

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
      // 🛡️ إصلاح جذري (مراجعة أمنية — redteam-audit-1، البند #11، Low): نفس العلّة بالضبط
      // بـgetUsers أعلى بهذا الملف — search كان يُستخدَم مباشرة بـ$regex بلا تعقيم
      const { safeSearchRegex } = require('../utils/queryHelpers');
      const searchRegex = safeSearchRegex(search, 100);
      if (searchRegex) {
        const matchedUsers = await User.find({
          $or: [
            { username: searchRegex },
            { customId: searchRegex }
          ]
        }).select('_id');
        query.user = { $in: matchedUsers.map(u => u._id) };
      }
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
    const { status, action, notes, duration } = req.body; // duration بالأيام؛ null = حظر دائم
    const { admin } = req;

    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ success: false, message: 'البلاغ غير موجود' });

    report.status = status || 'resolved';
    if (action) {
      report.resolution = {
        action, duration: duration || undefined, notes: (notes || '').trim(),
        resolvedBy: admin._id, resolvedAt: new Date()
      };
    }
    await report.save();

    if (action === 'ban' && report.reportedUser) {
      const user = await User.findById(report.reportedUser);
      if (user && !user.isBanned && !user.isAdmin) {
        user.isBanned = true;
        user.banReason = (notes || '').trim() || 'مخالفة إثر بلاغ مستخدم';
        user.banExpires = duration ? new Date(Date.now() + parseInt(duration) * 24 * 60 * 60 * 1000) : null;
        await user.save();

        const io = req.app.get('socketio');
        if (io && user.socketId) {
          io.to(user.socketId).emit('account-banned', { reason: user.banReason, banExpires: user.banExpires, isPermanent: !user.banExpires });
          // 🛡️ إصلاح جذري (مراجعة أمنية — البند #1) — راجع تعليق banUser أعلاه لنفس السبب بالضبط
          require('../services/socketService').forceDisconnectUserSocket(io, user.socketId);
        }
        await AdminLog.logAction({
          admin: admin._id, action: 'ban_user', targetUser: user._id,
          details: { reason: user.banReason, duration, source: 'report_resolution' }, severity: 'warning', ipAddress: req.ip
        });
      }
        } else if (action === 'warning' && report.reportedUser) {
      const { sendBotMessage } = require('../utils/botMessenger');
      await sendBotMessage(req.app.get('socketio'), report.reportedUser, `⚠️ تحذير من الإدارة: ${(notes || '').trim() || 'يرجى الالتزام بقواعد المنصة'}`);
    }

    await AdminLog.logAction({
      admin: admin._id, action: 'update_settings', targetEntity: 'user', targetUser: report.reportedUser,
      details: { type: 'report_resolution', reportId, status: report.status, action }, ipAddress: req.ip
    });

    res.json({ success: true, message: 'تم تحديث البلاغ بنجاح', report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =====================================================
// ✅ قسم "التحقيق والمراجعة": يجلب كل محادثات المُبلَّغ عنه
// للمراجعة اليدوية قبل اتخاذ القرار — يتجاوز عمداً حالات
// الحذف/الإخفاء الظاهرة للمستخدم العادي (صلاحية إشرافية)
// =====================================================
exports.getUserInvestigation = async (req, res) => {
  try {
    const { userId } = req.params;
    const Report = require('../models/Report');
    const PrivateChat = require('../models/PrivateChat');
    const PrivateMessage = require('../models/PrivateMessage');
    const Message = require('../models/Message');

    const targetUser = await User.findById(userId).select('username profileImage customId isBanned banReason createdAt');
    if (!targetUser) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

    const chats = await PrivateChat.find({ participants: userId })
      .populate('participants', 'username profileImage customId')
      .sort('-lastMessageAt')
      .limit(30);

    const chatsWithMessages = await Promise.all(chats.map(async (chat) => {
      const messages = await PrivateMessage.find({ chatId: chat.chatId })
        .sort('-createdAt').limit(100)
        .populate('sender', 'username profileImage').lean();
      return {
        chatId: chat.chatId,
        otherParticipant: chat.participants.find(p => p._id.toString() !== userId.toString()),
        messages: messages.reverse()
      };
    }));

    // ✅ جديد: آخر 10 رسائل من الشات العام لهذا المستخدم — تُعرض في تبويب منفصل بالتحقيق
    const publicMessages = await Message.find({ sender: userId })
      .sort('-createdAt').limit(10)
      .populate('sender', 'username profileImage').lean();

    const relatedReports = await Report.find({ reportedUser: userId })
      .sort('-createdAt').limit(20).populate('reporter', 'username profileImage');

    res.json({
      success: true, targetUser, chats: chatsWithMessages,
      publicMessages: publicMessages.reverse(), relatedReports
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};



exports.getSupportTickets = async (req, res) => {
  try {
    const SupportTicket = require('../models/SupportTicket');
    const { status = 'pending', type = 'all', page = 1, limit = 50 } = req.query;
    const query = {};
    if (status !== 'all') query.status = status;
    if (type !== 'all') query.type = type;

    const tickets = await SupportTicket.find(query)
      .populate('user', 'username profileImage customId isBanned')
      .sort('-createdAt').limit(limit * 1).skip((page - 1) * limit);
    const total = await SupportTicket.countDocuments(query);
    res.json({ success: true, tickets, totalPages: Math.ceil(total / limit), currentPage: parseInt(page) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.resolveSupportTicket = async (req, res) => {
  try {
    const SupportTicket = require('../models/SupportTicket');
    const { ticketId } = req.params;
    const { adminReply, status, unbanUser: shouldUnban } = req.body;
    const { admin } = req;

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: 'التذكرة غير موجودة' });

    ticket.status = status || 'resolved';
    ticket.adminReply = (adminReply || '').trim();
    ticket.resolvedBy = admin._id;
    ticket.resolvedAt = new Date();
    await ticket.save();

    if (shouldUnban && ticket.type === 'ban_appeal') {
      const user = await User.findById(ticket.user);
      if (user && user.isBanned) {
        user.isBanned = false; user.banReason = null; user.banExpires = null;
        await user.save();
        await AdminLog.logAction({ admin: admin._id, action: 'unban_user', targetUser: user._id, details: { source: 'ban_appeal_ticket' }, ipAddress: req.ip });
      }
    }

        const io = req.app.get('socketio');
    const { sendBotMessage } = require('../utils/botMessenger');
    await sendBotMessage(io, ticket.user, `رد فريق الدعم على طلبك "${ticket.subject}":\n${ticket.adminReply || 'تمت مراجعة طلبك'}`);

    res.json({ success: true, message: 'تم تحديث التذكرة', ticket });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// =====================================================
// ✅ إدارة مكتبة الموسيقى المشتركة للغرف الصوتية — منسَّقة بالكامل من لوحة التحكم
// (لا رفع ولا إضافة مباشرة من المضيفين — راجع Suggestion لاقتراحات الأغاني الواردة منهم)
// =====================================================
exports.getMusicTracks = async (req, res) => {
  try {
    const MusicTrack = require('../models/MusicTrack');
    const { q, page = 1, limit = 30 } = req.query;
    const query = {};
    if (q && q.trim()) {
      const safe = q.trim().slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [{ title: { $regex: safe, $options: 'i' } }, { artist: { $regex: safe, $options: 'i' } }];
    }
    const tracks = await MusicTrack.find(query).sort('-createdAt').limit(limit * 1).skip((page - 1) * limit);
    const total = await MusicTrack.countDocuments(query);
    res.json({ success: true, tracks, totalPages: Math.ceil(total / limit), currentPage: parseInt(page) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.saveMusicTrack = async (req, res) => {
  try {
    const MusicTrack = require('../models/MusicTrack');
    const { admin } = req;
    const { title, artist, url, coverImage, category } = req.body;

    const cleanTitle = String(title || '').trim();
    const cleanUrl = String(url || '').trim();
    if (!cleanTitle || cleanTitle.length > 80) {
      return res.status(400).json({ success: false, message: 'عنوان الأغنية مطلوب (حتى 80 حرفاً)' });
    }
    if (!cleanUrl || !/^https?:\/\//.test(cleanUrl)) {
      return res.status(400).json({ success: false, message: 'رابط ملف صوتي صالح (http/https) مطلوب' });
    }

    const track = await MusicTrack.create({
      title: cleanTitle,
      artist: String(artist || '').trim().slice(0, 60),
      url: cleanUrl,
      coverImage: coverImage || null,
      category: String(category || 'عام').trim().slice(0, 30),
      addedBy: admin._id
    });

    await AdminLog.logAction({ admin: admin._id, action: 'add_music_track', details: { title: cleanTitle }, ipAddress: req.ip });

    res.status(201).json({ success: true, message: 'تمت إضافة الأغنية للمكتبة المشتركة', track });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.deleteMusicTrack = async (req, res) => {
  try {
    const MusicTrack = require('../models/MusicTrack');
    const { admin } = req;
    const track = await MusicTrack.findByIdAndDelete(req.params.trackId);
    if (!track) return res.status(404).json({ success: false, message: 'الأغنية غير موجودة' });

    await AdminLog.logAction({ admin: admin._id, action: 'delete_music_track', details: { title: track.title }, ipAddress: req.ip });

    res.json({ success: true, message: 'تم حذف الأغنية من المكتبة' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// =====================================================
// ✅ صندوق الاقتراحات/الملاحظات العام (اقتراحات أغاني + أي ملاحظة أخرى من المستخدمين)
// =====================================================
exports.getSuggestions = async (req, res) => {
  try {
    const Suggestion = require('../models/Suggestion');
    const { status = 'pending', type = 'all', page = 1, limit = 50 } = req.query;
    const query = {};
    if (status !== 'all') query.status = status;
    if (type !== 'all') query.type = type;

    const suggestions = await Suggestion.find(query)
      .populate('submittedBy', 'username profileImage customId')
      .sort('-createdAt').limit(limit * 1).skip((page - 1) * limit);
    const total = await Suggestion.countDocuments(query);
    res.json({ success: true, suggestions, totalPages: Math.ceil(total / limit), currentPage: parseInt(page) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.resolveSuggestion = async (req, res) => {
  try {
    const Suggestion = require('../models/Suggestion');
    const { suggestionId } = req.params;
    const { status, adminNote } = req.body;
    const { admin } = req;

    const suggestion = await Suggestion.findById(suggestionId);
    if (!suggestion) return res.status(404).json({ success: false, message: 'الاقتراح غير موجود' });

    suggestion.status = ['reviewed', 'dismissed'].includes(status) ? status : 'reviewed';
    suggestion.adminNote = String(adminNote || '').trim().slice(0, 300);
    suggestion.resolvedBy = admin._id;
    suggestion.resolvedAt = new Date();
    await suggestion.save();

    res.json({ success: true, message: 'تم تحديث الاقتراح', suggestion });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
