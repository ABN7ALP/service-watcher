const GiftLog = require('../models/GiftLog');
const GiftRedemption = require('../models/GiftRedemption');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');

exports.getRedeemableGifts = async (req, res) => {
    try {
        const userId = req.user.id;
        const settings = await SystemSettings.getSettings();
        const rate = settings.giftRedemptionHaircutPercent / 100;
        const coinRate = settings.coinsToUsdRedemptionRate;

        const unredeemed = await GiftLog.find({ receiver: userId, redeemed: false });
        const totalCoinsValue = unredeemed.reduce((sum, g) => sum + g.totalPrice, 0);
        const usdIfRedeemed = ((totalCoinsValue / coinRate) * rate);
        const coinsIfRedeemed = Math.floor(totalCoinsValue * rate);

        const history = await GiftRedemption.find({ user: userId }).sort('-createdAt').limit(20);

        res.status(200).json({
            status: 'success',
            data: {
                totalGiftsCount: unredeemed.length,
                totalCoinsValue,
                usdIfRedeemed: parseFloat(usdIfRedeemed.toFixed(2)),
                coinsIfRedeemed,
                redemptionRatePercent: settings.giftRedemptionHaircutPercent,
                history
            }
        });
    } catch (error) {
        console.error('[ERROR] in getRedeemableGifts:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.redeemGifts = async (req, res) => {
    try {
        const userId = req.user.id;
        const { redeemTo } = req.body;
        if (!['balance', 'coins'].includes(redeemTo)) {
            return res.status(400).json({ status: 'fail', message: 'وجهة استبدال غير صالحة' });
        }

        const settings = await SystemSettings.getSettings();
        const rate = settings.giftRedemptionHaircutPercent / 100;
        const coinRate = settings.coinsToUsdRedemptionRate;

        const unredeemed = await GiftLog.find({ receiver: userId, redeemed: false });
        if (unredeemed.length === 0) {
            return res.status(400).json({ status: 'fail', message: 'لا توجد هدايا قابلة للاستبدال حالياً' });
        }

        const totalCoinsValue = unredeemed.reduce((sum, g) => sum + g.totalPrice, 0);
        const giftLogIds = unredeemed.map(g => g._id);

        const markResult = await GiftLog.updateMany(
            { _id: { $in: giftLogIds }, redeemed: false },
            { $set: { redeemed: true } }
        );
        if (markResult.modifiedCount !== giftLogIds.length) {
            return res.status(409).json({ status: 'fail', message: 'حدث تعارض بالعملية، حاول مجدداً' });
        }

        const user = await User.findById(userId);
        let finalAmount;
        if (redeemTo === 'balance') {
            finalAmount = parseFloat(((totalCoinsValue / coinRate) * rate).toFixed(2));
            user.balance += finalAmount;
        } else {
            finalAmount = Math.floor(totalCoinsValue * rate);
            user.coins += finalAmount;
        }
        await user.save();

        await GiftRedemption.create({
            user: userId, sourceGiftLogIds: giftLogIds, originalCoinsValue: totalCoinsValue,
            redeemedTo: redeemTo, redemptionRate: rate, finalAmount
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
