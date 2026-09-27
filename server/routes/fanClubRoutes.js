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
// ✅ تخصيص النادي (اسم/شعار/هدية انضمام) — صاحب النادي فقط، يُستخرج من req.user (توكن الجلسة)
router.patch('/settings', fanClubController.updateSettings);

module.exports = router;
