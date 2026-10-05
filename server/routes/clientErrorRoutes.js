const express = require('express');
const router = express.Router();
const clientErrorController = require('../controllers/clientErrorController');

// بلا authMiddleware عمداً — راجع التعليق في clientErrorController.reportError
router.post('/', clientErrorController.reportError);

module.exports = router;
