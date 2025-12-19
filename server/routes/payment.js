const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const auth = require('../middleware/auth');
const { receiptUpload } = require('../middleware/upload');
const { paymentLimiter } = require('../middleware/rateLimiter');

// Apply rate limiting to payment routes
router.use(paymentLimiter);

// Get wallet information
router.get('/wallet-info', auth, paymentController.getWalletInfo);

// Deposit routes
router.post('/deposit', auth, paymentController.depositRequest);
router.post('/upload-receipt', auth, receiptUpload, paymentController.uploadReceipt);

// Withdrawal routes
router.post('/withdraw', auth, paymentController.withdrawalRequest);

// Coin purchase
router.post('/buy-coins', auth, paymentController.buyCoins);

// Gift routes
router.post('/send-gift', auth, paymentController.sendGift);

// Get user transactions
router.get('/transactions', auth, async (req, res) => {
    try {
        const { page = 1, limit = 20, type } = req.query;
        const { userId } = req.user;
        
        const Transaction = require('../models/Transaction');
        
        const query = { user: userId };
        if (type) query.type = type;
        
        const transactions = await Transaction.find(query)
            .sort('-createdAt')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .populate('recipient', 'username profileImage')
            .populate('battle', 'type status');
            
        const total = await Transaction.countDocuments(query);
        
        res.json({
            success: true,
            transactions,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get withdrawal history
router.get('/withdrawals', auth, async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        const { userId } = req.user;
        
        const Withdrawal = require('../models/Withdrawal');
        
        const query = { user: userId };
        if (status) query.status = status;
        
        const withdrawals = await Withdrawal.find(query)
            .sort('-createdAt')
            .limit(limit * 1)
            .skip((page - 1) * limit);
            
        const total = await Withdrawal.countDocuments(query);
        
        res.json({
            success: true,
            withdrawals,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get available gifts
router.get('/gifts', auth, async (req, res) => {
    try {
        const Gift = require('../models/Gift');
        
        const gifts = await Gift.find({ isActive: true })
            .sort('sortOrder price');
            
        res.json({
            success: true,
            gifts
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get gift categories
router.get('/gifts/categories', auth, async (req, res) => {
    try {
        const Gift = require('../models/Gift');
        
        const categories = await Gift.aggregate([
            { $match: { isActive: true } },
            { $group: {
                _id: '$category',
                count: { $sum: 1 },
                minPrice: { $min: '$discountedPrice' },
                maxPrice: { $max: '$discountedPrice' }
            }},
            { $sort: { _id: 1 } }
        ]);
        
        res.json({
            success: true,
            categories: categories.map(cat => ({
                name: cat._id,
                displayName: getCategoryName(cat._id),
                count: cat.count,
                priceRange: {
                    min: cat.minPrice,
                    max: cat.maxPrice
                }
            }))
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Helper function for category names
function getCategoryName(category) {
    const names = {
        'common': 'عادي',
        'rare': 'نادر',
        'epic': 'ملحمي',
        'legendary': 'أسطوري'
    };
    return names[category] || category;
}

module.exports = router;
