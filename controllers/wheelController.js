// 📁 controllers/wheelController.js
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const WheelSpin = require('../models/WheelSpin');
const wheelService = require('../services/wheelService');

// 🎡 تدوير العجلة
exports.spinWheel = async (req, res) => {
    const session = await User.startSession();
    session.startTransaction();
    
    try {
        const userId = req.userId;
        const userIp = req.ip;
        const spinCost = wheelService.wheelConfig.spinCost;
        
        // 1. التحقق من رصيد المستخدم
        const user = await User.findById(userId).session(session);
        const NotificationService = require('../services/notificationService');
        
        
        if (user.balance < spinCost) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: '❌ رصيدك غير كافي لتدوير العجلة',
                required: spinCost,
                current: user.balance
            });
        }
        
        // 2. خصم سعر الدوران
        user.balance -= spinCost;
        user.totalSpent += spinCost;
        await user.save({ session });
        
        // 3. تسجيل عملية الخصم
        const debitTransaction = new Transaction({
            userId: user._id,
            type: 'spin',
            amount: -spinCost,
            description: `خصم سعر تدوير العجلة`
        });
        await debitTransaction.save({ session });
        
        // 4. تشغيل العجلة (تحديد الجائزة)
        const spinResult = wheelService.spin();
        
        // 5. إذا كان هناك ربح، إضافته للرصيد
        if (spinResult.prize > 0) {
            user.balance += spinResult.prize;
            user.totalWon += spinResult.prize;
            await user.save({ session });
            
            // تسجيل عملية الربح
            const creditTransaction = new Transaction({
                userId: user._id,
                type: 'spin',
                amount: spinResult.prize,
                description: `ربح من العجلة: ${spinResult.prize}$`
            });
            await creditTransaction.save({ session });
        }

// إرسال إشعار بالمكسب/الخسارة
if (spinResult.prize > 0) {
    await NotificationService.sendUserNotification(
        userId,
        NotificationService.types.WHEEL_SPIN_WIN,
        {
            amount: spinResult.prize,
            netProfit: spinResult.prize - spinCost,
            message: `فزت بـ ${spinResult.prize}$!`
        }
    );
    
    // إذا كان الفوز كبيراً (>5$)، أرسل إشعاراً للجميع
    if (spinResult.prize >= 5) {
        const { io } = require('../server');
        io.emit('big_win_announcement', {
            userId: userId,
            amount: spinResult.prize,
            timestamp: new Date()
        });
    }
} else {
    await NotificationService.sendUserNotification(
        userId,
        NotificationService.types.WHEEL_SPIN_LOSE,
        {
            amount: spinCost,
            message: 'حظ أوكد في المرة القادمة!'
        }
    );
}
        
        // 6. حفظ سجل الدوران
        const wheelSpin = new WheelSpin({
            userId: user._id,
            cost: spinCost,
            prize: spinResult.prize,
            resultIndex: spinResult.index,
            ipAddress: userIp,
            netProfit: spinResult.prize - spinCost // صافي الربح/الخسارة للمستخدم
        });
        await wheelSpin.save({ session });
        
        // 7. تأكيد العملية
        await session.commitTransaction();
        session.endSession();
        
        // 8. إرجاع النتيجة مع بعض المؤثرات
        const winMessages = [
            "🎉 مبروك! فزت بجائزة رائعة!",
            "💰 حظك اليوم ممتاز!",
            "🌟 هذا رائع! استمر!",
            "🚀 فوز كبير! تهانينا!"
        ];
        
        const loseMessages = [
            "😅 حظك أوكد في المرة القادمة!",
            "🎯 كادت أن تكون جائزة كبيرة!",
            "🔮 العجولة تدور لصالحك قريباً!",
            "💫 كل محاولة تقربك من الفوز الكبير!"
        ];
        
        const randomMessage = spinResult.prize > spinCost 
            ? winMessages[Math.floor(Math.random() * winMessages.length)]
            : loseMessages[Math.floor(Math.random() * loseMessages.length)];
        
        res.json({
            success: true,
            message: randomMessage,
            result: {
                prize: spinResult.prize,
                index: spinResult.index,
                cost: spinCost,
                net: spinResult.prize - spinCost,
                newBalance: user.balance,
                isWin: spinResult.prize > 0
            },
            animation: {
                duration: 3000 + (spinResult.index * 200), // مدة الدوران (مللي ثانية)
                sound: spinResult.prize > 1 ? 'big_win.mp3' : 'spin.mp3',
                effect: spinResult.prize > 5 ? 'fireworks' : 'confetti'
            }
        });
        
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        
        console.error('❌ خطأ في تدوير العجلة:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء تدوير العجلة',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


// 📊 الحصول على إحصائيات العجلة
exports.getWheelStats = async (req, res) => {
    try {
        const stats = {
            config: {
                prizes: wheelService.prizes,
                spinCost: wheelService.wheelConfig.spinCost,
                minWithdrawal: wheelService.wheelConfig.minWithdrawal
            },
            probabilities: wheelService.weights.map((weight, index) => ({
                prize: wheelService.prizes[index],
                weight: weight,
                percentage: (weight * 100).toFixed(1) + '%'
            })),
            expectedValue: wheelService.calculateExpectedValue() + '$',
            expectedProfitPer1000Spins: wheelService.calculateExpectedProfit(1000) + '$',
            lastUpdated: wheelService.wheelConfig.lastUpdated
        };
        
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '❌ خطأ في جلب الإحصائيات'
        });
    }
};
