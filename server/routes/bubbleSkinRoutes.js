const express = require('express');
const controller = require('../controllers/bubbleSkinController');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();
router.use(authMiddleware);
router.get('/shop', controller.getShop);
router.post('/purchase', controller.purchase);
router.post('/equip', controller.equip);
module.exports = router;
