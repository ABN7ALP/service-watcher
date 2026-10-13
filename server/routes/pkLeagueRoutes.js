const express = require('express');
const pkLeagueController = require('../controllers/pkLeagueController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

router.get('/standings', pkLeagueController.getStandings);
router.get('/my-room', pkLeagueController.getMyStanding);
router.get('/room/:roomId', pkLeagueController.getRoomStanding);

module.exports = router;
