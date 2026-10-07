// ملف: server/routes/fanClubRoutes.js
const express = require('express');
const fanClubController = require('../controllers/fanClubController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

router.get('/leaderboard', fanClubController.getLeaderboard);
router.get('/:ownerId/summary', fanClubController.getSummary);
router.post('/:ownerId/join', fanClubController.joinFanClub);
router.get('/:ownerId/members', fanClubController.getMembers);
// ✅ تخصيص النادي (الاسم فقط) — صاحب النادي فقط، يُستخرج من req.user (توكن الجلسة)
router.patch('/settings', fanClubController.updateSettings);
// ✅ شارات "نجم النادي الأسبوعي" الدائمة لمستخدم معيّن — تُعرض بملفه الشخصي، رهناً
// بفحص fanClubBadgesVisible بالخادم (راجع الدالة) لمن ليس صاحبها
router.get('/:userId/weekly-wins', fanClubController.getWeeklyWins);
// ✅ مهام المعجب اليومية لهذا النادي (حالة العضو الحالي) + مطالبة حضور اليوم
router.get('/:ownerId/missions', fanClubController.getMissions);
router.post('/:ownerId/missions/checkin', fanClubController.claimCheckIn);

module.exports = router;
