const express = require('express');
const agentController = require('../controllers/agentController');
const authMiddleware = require('../middleware/authMiddleware');
const { financialLimiter } = require('../middleware/globalMiddleware');

const router = express.Router();
router.use(authMiddleware);

router.get('/active', agentController.listActiveAgents);
router.get('/me', agentController.getMyAgentProfile);
router.get('/lookup-user', agentController.lookupUserByCustomId);
router.get('/me/transfers', agentController.getMyTransfers);
router.post('/transfer', financialLimiter, agentController.transfer);
router.get('/received', agentController.getMyReceivedTransfers);
router.post('/transfers/:transferId/rate', agentController.rateTransfer);
router.post('/transfers/:transferId/report', agentController.reportTransfer);

module.exports = router;
