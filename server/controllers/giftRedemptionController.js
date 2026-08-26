const GiftLog = require('../models/GiftLog');
const GiftRedemption = require('../models/GiftRedemption');
const User = require('../models/User');

const REDEMPTION_RATE = 0.90; // ✅ 90% - يعاقب دورة التلاعب (شحن → إهداء نفسي → استبدال → سحب) بخسارة 10% كل دورة
const COIN_TO_USD_RATE = 1000; // 1000 كوينز = 1 دولار (نفس معدل الشراء)

// ملخص الهدايا المستلمة القابلة للاستبدال
exports.getRedeemableGifts = async (req, res) => {
    try {
        const userId = req.user.id;

        const unredeemed = await GiftLog.find({ receiver: userId, redeemed: false });

        const totalCoinsValue = unredeemed.reduce((sum, g) => sum + g.totalPrice, 0);
        const usdIfRedeemed = ((totalCoinsValue / COIN_TO_USD_RATE) * REDEMPTION_RATE);
        const coinsIfRedeemed = Math.floor(totalCoinsValue * REDEMPTION_RATE);

        const history = await GiftRedemption.find({ user: userId }).sort('-createdAt').limit(20);

        res.status(200).json({
            status: 'success',
            data: {
                totalGiftsCount: unredeemed.length,
                totalCoinsValue,
                usdIfRedeemed: parseFloat(usdIfRedeemed.toFixed(2)),
                coinsIfRedeemed,
                redemptionRatePercent: REDEMPTION_RATE * 100,
                history
            }
        });
    } catch (error) {
        console.error('[ERROR] in getRedeemableGifts:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// تنفيذ الاستبدال
exports.redeemGifts = async (req, res) => {
    try {
        const userId = req.user.id;
        const { redeemTo } = req.body; // 'balance' | 'coins'

        if (!['balance', 'coins'].includes(redeemTo)) {
            return res.status(400).json({ status: 'fail', message: 'وجهة استبدال غير صالحة' });
        }

        // ✅ حماية أساسية من السباق (race condition): نستخدم findOneAndUpdate بشكل ذري
        // لضمان عدم استبدال نفس الهدية مرتين حتى لو ضغط المستخدم بسرعة متتالية
        const unredeemed = await GiftLog.find({ receiver: userId, redeemed: false });

        if (unredeemed.length === 0) {
            return res.status(400).json({ status: 'fail', message: 'لا توجد هدايا قابلة للاستبدال حالياً' });
        }

        const totalCoinsValue = unredeemed.reduce((sum, g) => sum + g.totalPrice, 0);
        const giftLogIds = unredeemed.map(g => g._id);

        // ✅ تعليم كل الهدايا كمُستبدلة أولاً بعملية ذرية (atomic) لمنع الاستبدال المزدوج
        const markResult = await GiftLog.updateMany(
            { _id: { $in: giftLogIds }, redeemed: false },
            { $set: { redeemed: true } }
        );

        if (markResult.modifiedCount !== giftLogIds.length) {
            // حدث تعارض (طلب متزامن آخر سبقنا) — نوقف العملية بأمان
            return res.status(409).json({ status: 'fail', message: 'حدث تعارض بالعملية، حاول مجدداً' });
        }

        const user = await User.findById(userId);
        let finalAmount;

        if (redeemTo === 'balance') {
            finalAmount = parseFloat(((totalCoinsValue / COIN_TO_USD_RATE) * REDEMPTION_RATE).toFixed(2));
            user.balance += finalAmount;
        } else {
            finalAmount = Math.floor(totalCoinsValue * REDEMPTION_RATE);
            user.coins += finalAmount;
        }

        await user.save();

        await GiftRedemption.create({
            user: userId,
            sourceGiftLogIds: giftLogIds,
            originalCoinsValue: totalCoinsValue,
            redeemedTo: redeemTo,
            redemptionRate: REDEMPTION_RATE,
            finalAmount: finalAmount
        });

        const io = req.app.get('socketio');
        if (io && user.socketId) {
            io.to(user.socketId).emit('balanceUpdate', { newBalance: user.balance });
            io.to(user.socketId).emit('coinsUpdated', { newCoins: user.coins });
        }

        res.status(200).json({
            status: 'success',
            message: `تم استبدال هداياك بنجاح مقابل ${redeemTo === 'balance' ? finalAmount + '$' : finalAmount + ' كوينز'}`,
            data: { finalAmount, redeemTo, newBalance: user.balance, newCoins: user.coins }
        });

    } catch (error) {
        console.error('[ERROR] in redeemGifts:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء الاستبدال' });
    }
};
