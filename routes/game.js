// routes/game.js
const express = require('express');
const connectDB = require('../db');
const authMiddleware = require('../middleware/auth'); // <-- استيراد وسيط الحماية

const router = express.Router();

// --- تعريف الجوائز والاحتمالات على السيرفر (مهم للأمان) ---
const prizes = [
    // { prize: 1.00, probability: 0.01 }, // 1% فرصة لربح دولار (يمكن إضافتها)
    { prize: 0.50, probability: 0.05 }, // 5% فرصة
    { prize: 0.25, probability: 0.15 }, // 15% فرصة
    { prize: 0.10, probability: 0.30 }, // 30% فرصة
    { prize: 0.00, probability: 0.49 }, // 49% فرصة لعدم الربح
];

// دالة لاختيار جائزة عشوائية بناءً على الاحتمالات
function selectPrize() {
    const rand = Math.random(); // رقم عشوائي بين 0 و 1
    let cumulativeProbability = 0;
    for (const item of prizes) {
        cumulativeProbability += item.probability;
        if (rand < cumulativeProbability) {
            return item.prize;
        }
    }
    return 0; // كاحتياط
}


// --- نقطة النهاية: POST /api/game/spin ---
// لاحظ كيف نضع `authMiddleware` قبل منطق الدالة.
// لن يتم تشغيل هذا الكود إلا إذا نجح التحقق من التوكن.
router.post('/spin', authMiddleware, async (req, res) => {
    try {
        const db = await connectDB();
        const usersCollection = db.collection('users');
        const userId = req.user.id; // نحصل على ID المستخدم من التوكن الذي تم التحقق منه

        // --- منطق الأمان ومنع الغش ---
        const costPerSpin = 0.10; // تكلفة اللفة الواحدة

        // 1. جلب بيانات المستخدم من قاعدة البيانات
        const user = await usersCollection.findOne({ _id: new require('mongodb').ObjectId(userId) });

        // 2. التحقق من الرصيد
        if (user.balance < costPerSpin) {
            return res.status(402).json({ message: "رصيدك غير كافٍ للعب." });
        }

        // 3. التحقق من الوقت (لمنع الإغراق) - يسمح بلفة كل 5 ثوانٍ
        if (user.lastSpin) {
            const timeSinceLastSpin = (new Date() - new Date(user.lastSpin)) / 1000;
            if (timeSinceLastSpin < 5) {
                return res.status(429).json({ message: `يجب أن تنتظر ${Math.ceil(5 - timeSinceLastSpin)} ثوانٍ قبل اللعب مجدداً.` });
            }
        }

        // --- منطق اللعبة ---
        // 4. السيرفر يقرر الجائزة
        const wonPrize = selectPrize();
        const newBalance = user.balance - costPerSpin + wonPrize;

        // 5. تحديث بيانات المستخدم في قاعدة البيانات
        await usersCollection.updateOne(
            { _id: new require('mongodb').ObjectId(userId) },
            { $set: { balance: newBalance, lastSpin: new Date() } }
        );

        // 6. إرسال النتيجة إلى الواجهة الأمامية
        res.json({
            message: `لقد ربحت ${wonPrize.toFixed(2)}$!`,
            prize: wonPrize,
            newBalance: newBalance
        });

    } catch (error) {
        console.error("Spin Game Error:", error);
        res.status(500).json({ message: "حدث خطأ في السيرفر." });
    }
});

// --- نقطة النهاية: POST /api/game/deposit ---
// محمية أيضاً، يجب أن يكون المستخدم مسجلاً دخوله ليطلب إيداعاً
router.post('/deposit', authMiddleware, async (req, res) => {
    try {
        const { amount, transactionId } = req.body;
        const userId = req.user.id;

        // 1. التحقق من المدخلات
        if (!amount || !transactionId) {
            return res.status(400).json({ message: "الرجاء إدخال المبلغ ومعرّف العملية." });
        }
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({ message: "الرجاء إدخال مبلغ صحيح." });
        }

        const db = await connectDB();
        const depositsCollection = db.collection('deposits');

        // 2. إنشاء طلب إيداع جديد في قاعدة البيانات بحالة "قيد المراجعة"
        await depositsCollection.insertOne({
            userId: new require('mongodb').ObjectId(userId),
            username: req.user.username, // نحفظ اسم المستخدم لتسهيل المراجعة
            amount: parseFloat(amount),
            transactionId: transactionId,
            status: 'pending', // الحالة الأولية دائماً قيد المراجعة
            createdAt: new Date()
        });

        res.status(201).json({ message: "تم استلام طلب الإيداع الخاص بك. ستتم مراجعته قريباً." });

    } catch (error) {
        console.error("Deposit Request Error:", error);
        res.status(500).json({ message: "حدث خطأ في السيرفر." });
    }
});




module.exports = router;
