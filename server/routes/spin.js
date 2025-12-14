const express = require('express');
const router = express.Router();
const Spin = require('../models/Spin');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

// قيم عجلة الحظ
const WHEEL_SEGMENTS = [0.5, 0.75, 1, 2, 3, 4, 5, 7, 9, 10];

// إدارة العجلة
router.post('/', async (req, res) => {
    try {
        const user = req.user;
        const spinCost = 1;
        
        // التحقق من الرصيد الكافي
        if (user.balance < spinCost) {
            return res.status(400).json({ message: 'رصيدك غير كافٍ' });
        }
        
        // اختيار قيمة عشوائية من العجلة
        const randomIndex = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
        const winAmount = WHEEL_SEGMENTS[randomIndex];
        
        // حساب النتيجة الصافية
        const netResult = winAmount - spinCost;
        const status = netResult >= 0 ? 'win' : 'lose';
        
        // تحديث رصيد المستخدم
        await user.updateBalance(spinCost, 'spin');
        
        if (status === 'win') {
            await user.updateBalance(winAmount, 'win');
        }
        
        // حفظ محاولة الدوران
        const spin = new Spin({
            user: user._id,
            amount: winAmount,
            cost: spinCost,
            status: status,
            netResult: netResult
        });
        
        await spin.save();
        
        // إنشاء معاملة
        const transaction = new Transaction({
            user: user._id,
            type: 'spin',
            amount: spinCost,
            status: status,
            note: status === 'win' 
                ? `ربحت $${winAmount} من عجلة الحظ` 
                : 'دوران عجلة الحظ'
        });
        
        await transaction.save();
        
        res.json({
            amount: winAmount,
            cost: spinCost,
            netResult: netResult,
            status: status
        });
    } catch (error) {
        console.error('Spin error:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

module.exports = router;
