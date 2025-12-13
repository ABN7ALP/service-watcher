const express = require('express');
const { ObjectId } = require('mongodb');
const connectDB = require('../config/db');
const authMiddleware = require('../middleware/auth');
const wheelService = require('../services/wheelService');

const router = express.Router();

// --- نقطة النهاية: POST /api/game/spin ---
// هذه هي نقطة النهاية الوحيدة في هذا الملف، وهي محمية
router.post('/spin', authMiddleware, async (req, res) => {
    try {
        const db = await connectDB();
        const usersCollection = db.collection('users');
        const spinsCollection = db.collection('spins');
        const userId = new ObjectId(req.user.id);

        // 1. جلب بيانات المستخدم الحالية من قاعدة البيانات (الحقيقة المطلقة)
        const user = await usersCollection.findOne({ _id: userId });
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // --- طبقات الحماية والتحقق ---
        // أ. التحقق من الرصيد
        if (user.balance.available < wheelService.COST_PER_SPIN) {
            return res.status(402).json({ message: "Insufficient balance." });
        }

        // ب. التحقق من فترة الانتظار (Cooldown)
        if (user.lastSpinAt) {
            const timeSinceLastSpin = (new Date() - user.lastSpinAt) / 1000;
            if (timeSinceLastSpin < wheelService.SPIN_COOLDOWN_SECONDS) {
                const timeLeft = Math.ceil(wheelService.SPIN_COOLDOWN_SECONDS - timeSinceLastSpin);
                return res.status(429).json({ message: `Please wait ${timeLeft} seconds before spinning again.` });
            }
        }

        // --- بداية العملية المالية (Transaction) ---
        // 2. استدعاء "العقل المدبر" لتحديد النتيجة
        const result = wheelService.determineSpinResult(user);

        // 3. حساب الأرصدة الجديدة
        const balanceBefore = user.balance.available;
        const balanceAfter = balanceBefore - wheelService.COST_PER_SPIN + result.value;

        // 4. تحديث بيانات المستخدم في قاعدة البيانات
        const updateUserPromise = usersCollection.updateOne(
            { _id: userId },
            {
                $set: {
                    'balance.available': balanceAfter,
                    'lastSpinAt': new Date()
                },
                $inc: {
                    'stats.totalSpins': 1,
                    'stats.totalWon': result.value
                }
            }
        );

        // 5. تسجيل عملية اللف في سجلات الدورات (Logs)
        const logSpinPromise = spinsCollection.insertOne({
            userId: userId,
            cost: wheelService.COST_PER_SPIN,
            prizeValue: result.value,
            prizeType: result.type,
            userBalanceBefore: balanceBefore,
            userBalanceAfter: balanceAfter,
            timestamp: new Date()
        });

        // 6. تنفيذ العمليتين معاً
        await Promise.all([updateUserPromise, logSpinPromise]);
        // --- نهاية العملية المالية ---

        // 7. إرسال الرد إلى الواجهة الأمامية
        // الرد يحتوي فقط على النتيجة، الواجهة مسؤولة عن عرض الحركة
        res.json({
            prize: result,
            newBalance: balanceAfter
        });

    } catch (error) {
        console.error("Spin Error:", error);
        res.status(500).json({ message: "Server error during spin." });
    }
});

module.exports = router;
