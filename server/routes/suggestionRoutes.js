const express = require('express');
const suggestionController = require('../controllers/suggestionController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// ✅ إرسال اقتراح/ملاحظة — لأي مستخدم مسجّل دخول (إدارتها/مراجعتها حصراً عبر لوحة التحكم)
router.post('/', authMiddleware, suggestionController.submitSuggestion);

module.exports = router;
