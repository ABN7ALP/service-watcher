const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');
const { chatUpload } = require('../utils/cloudinary');

router.use(authMiddleware);

router.post('/', reportController.createReport);
router.post('/upload-evidence', chatUpload.single('file'), reportController.uploadEvidence);

module.exports = router;
