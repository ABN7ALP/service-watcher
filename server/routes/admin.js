const withdrawalController = require('../controllers/withdrawalController');
const customGiftController = require('../controllers/customGiftController');
const frameController = require('../controllers/frameController');
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');
const depositIntentController = require('../controllers/depositIntentController');
const { frameAssetUpload } = require('../utils/cloudinary');
const { financialLimiter } = require('../middleware/globalMiddleware');

// 🛡️ "فحص الآن" (صحة النظام): مفتاح ثابت وليس هوية الأدمن — الحد مرة كل 5 دقائق إجمالاً
// عبر كل الأدمنز معاً، لا لكل أدمن منفرد، لأن الفحص يشغّل npm outdated/audit (مُكلف نسبياً)
const systemHealthCheckLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 1,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: () => 'system-health-manual-check',
    message: { success: false, message: 'تم تنفيذ فحص مؤخراً. يرجى الانتظار قبل إعادة المحاولة.' }
});

// 🛡️ "فحص الآن" (صحة المحفظة): نفس منطق systemHealthCheckLimiter بالضبط — الفحص يمرّ على كل
// مستخدم بالقاعدة فيُكلِّف نسبياً، لا داعٍ لتشغيله بالتوازي من أكثر من مشرف بنفس اللحظة
const walletHealthCheckLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 1,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: () => 'wallet-health-manual-check',
    message: { success: false, message: 'تم تنفيذ فحص مؤخراً. يرجى الانتظار قبل إعادة المحاولة.' }
});

router.use(adminAuth);

router.get('/dashboard', adminController.getDashboardStats);

router.get('/users', adminController.getUsers);
router.get('/users/:userId', adminController.getUserDetails);
router.post('/users/:userId/ban', adminController.banUser);
router.post('/users/:userId/unban', adminController.unbanUser);
router.post('/users/:userId/set-agent', adminController.setAgentStatus);
router.post('/users/:userId/adjust-funds', adminController.adjustUserFunds);
// 🛡️ مراجعة ما قبل الدمج v2 (البند 2): مُحدَّد معدَّل مالي عادي (نفس financialLimiter
// بالمسارات المالية الأخرى) — يمنع قصف هذا المسار الحسّاس بسرعة من حساب أدمن مخترَق
router.post('/users/:userId/transfer-beans-to-withdrawable', financialLimiter, adminController.transferBeansToWithdrawable);

router.get('/deposits', adminController.getDeposits);
router.post('/deposits/:transactionId/approve', adminController.approveDeposit);
router.post('/deposits/:transactionId/reject', adminController.rejectTransaction);

// ✅ طلبات شحن الكوينزات عبر شام كاش (feat/wallet-recharge-v1) — يستبدل نظام CoinPurchase القديم
router.get('/deposit-intents', depositIntentController.adminListIntents);
router.post('/deposit-intents/:id/approve', depositIntentController.adminApproveIntent);
router.post('/deposit-intents/:id/reject', depositIntentController.adminRejectIntent);

router.get('/withdrawals', withdrawalController.getAllWithdrawals);
router.post('/withdrawals/:withdrawalId/review', withdrawalController.reviewWithdrawal);

router.get('/custom-gifts', customGiftController.adminListCustomGifts);
router.post('/custom-gifts/:id/review', customGiftController.adminReviewCustomGift);

router.get('/transactions', adminController.getAllTransactions);

router.get('/gifts', adminController.getGifts);
router.post('/gifts', adminController.saveGift);
router.put('/gifts/:giftId', adminController.saveGift);
router.delete('/gifts/:giftId', adminController.deleteGift);

// ✅ استوديو الإطارات — frameAssetUpload (multer) فقط على create/update (الوحيدان اللذان قد
// يحملان ملفاً مرفوعاً)؛ delete حذف ناعم بلا ملف، list بلا ملف
router.get('/frames', frameController.adminListFrames);
router.post('/frames', frameAssetUpload, frameController.adminCreateFrame);
router.put('/frames/:frameId', frameAssetUpload, frameController.adminUpdateFrame);
router.delete('/frames/:frameId', frameController.adminDeleteFrame);

router.get('/reports', adminController.getReports);
router.post('/reports/:reportId/resolve', adminController.resolveReport);
router.get('/investigate/:userId', adminController.getUserInvestigation);
router.get('/support-tickets', adminController.getSupportTickets);
router.post('/support-tickets/:ticketId/resolve', adminController.resolveSupportTicket);

router.get('/music-tracks', adminController.getMusicTracks);
router.post('/music-tracks', adminController.saveMusicTrack);
router.delete('/music-tracks/:trackId', adminController.deleteMusicTrack);

router.get('/suggestions', adminController.getSuggestions);
router.post('/suggestions/:suggestionId/resolve', adminController.resolveSuggestion);

router.get('/logs', adminController.getLogs);
router.get('/client-errors', adminController.getClientErrors);
router.get('/client-compat', adminController.getClientCompatStats);
router.get('/system-health', adminController.getSystemHealth);
router.post('/system-health/check-now', systemHealthCheckLimiter, adminController.runSystemHealthCheckNow);
router.get('/wallet-health', adminController.getWalletHealth);
router.post('/wallet-health/check-now', walletHealthCheckLimiter, adminController.runWalletHealthCheckNow);

router.get('/settings', adminController.getSystemSettings);
router.post('/settings', adminController.updateSystemSettings);

module.exports = router;
