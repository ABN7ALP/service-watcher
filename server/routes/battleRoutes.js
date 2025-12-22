const express = require('express');
const battleController = require('../controllers/battleController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// حماية جميع المسارات التالية بالمصادقة
router.use(authMiddleware);

router.route('/')
    .get(battleController.getAvailableBattles) // GET /api/battles
    .post(battleController.createBattle);      // POST /api/battles


// (سيتم إضافة مسارات الانضمام والمغادرة هنا لاحقاً)
// router.post('/:id/join', battleController.joinBattle);
router.post('/:id/join', battleController.joinBattle); // POST /api/battles/some-battle-id/join


module.exports = router;
