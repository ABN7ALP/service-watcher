// ملف: server/routes/fanClubRoutes.js
const express = require('express');
const fanClubController = require('../controllers/fanClubController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

// 🛡️ feat/fanclub-final: كل الأرقام بصفحة الشرح من هنا — لا رقم ثابت بالعميل
router.get('/config', fanClubController.getConfig);
router.get('/leaderboard', fanClubController.getLeaderboard);
router.get('/:ownerId/summary', fanClubController.getSummary);
router.post('/:ownerId/join', fanClubController.joinFanClub);
// 🛡️ fanclub-v2: مغادرة النادي — جديدة (لا تأكيد مطلوب هنا، المتصل/العميل مسؤول عن ذلك)
router.post('/:ownerId/leave', fanClubController.leaveFanClub);
router.get('/:ownerId/members', fanClubController.getMembers);
// 🛡️ feat/fanclub-final: "أعلى المعجبين" العامة (range=week|all)، مقسّمة صفحات، بلا مرتبطين
router.get('/:ownerId/top-fans', fanClubController.getTopFans);
// ✅ تخصيص النادي (الاسم فقط) — صاحب النادي فقط، يُستخرج من req.user (توكن الجلسة)
router.patch('/settings', fanClubController.updateSettings);
// ✅ شارات "نجم النادي الأسبوعي" الدائمة لمستخدم معيّن — تُعرض بملفه الشخصي، رهناً
// بفحص fanClubBadgesVisible بالخادم (راجع الدالة) لمن ليس صاحبها
router.get('/:userId/weekly-wins', fanClubController.getWeeklyWins);
// ✅ مهام المعجب اليومية لهذا النادي (حالة العضو الحالي) + مطالبة حضور اليوم
router.get('/:ownerId/missions', fanClubController.getMissions);
router.post('/:ownerId/missions/checkin', fanClubController.claimCheckIn);
// 🛡️ feat/fanclub-v2-ui: أهلية "هدية النادي" الحصرية (مستوى 13+) لهذا المستخدم بهذا النادي
router.get('/:ownerId/exclusive-gift', fanClubController.getExclusiveGiftEligibility);

module.exports = router;
