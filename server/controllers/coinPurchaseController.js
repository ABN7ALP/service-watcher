const mongoose = require('mongoose');
const CoinPurchase = require('../models/CoinPurchase');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const walletService = require('../utils/walletService');

// ✅ شراء فوري بدون انتظار مراجعة إدارية — التحويل داخلي بين رصيدين مملوكين لنفس المستخدم
// (نظام شحن الكوينزات عبر شام كاش الخارجي انتقل بالكامل لـ/api/wallet — راجع depositIntentController.js)
exports.buyWithBalance = async (req, res) => {
    try {
        const userId = req.user.id;
        const { amountUSD } = req.body;
        const SystemSettings = require('../models/SystemSettings');
        const settings = await SystemSettings.getSettings();

        const amount = parseFloat(amountUSD);
        if (!amount || amount < settings.minPurchaseUSD || amount > settings.maxPurchaseUSD) {
            return res.status(400).json({ status: 'fail', message: `المبلغ يجب أن يكون بين ${settings.minPurchaseUSD}$ و ${settings.maxPurchaseUSD}$` });
        }

        const coinsAmount = Math.round(amount * settings.coinExchangeRate);
        const amountCents = Math.round(amount * 100);
        const idemBase = new mongoose.Types.ObjectId();

        // ✅ دفتر الأستاذ (feat/wallet-ledger-v1): خصم usd_cents وإيداع coins_paid معاً بمعاملة
        // Mongo واحدة — تحويل داخلي بين محفظتي نفس المستخدم، لا مصدر خارجي
        const session = await mongoose.startSession();
        let updatedUser = null;
        let purchase = null;
        try {
            await session.withTransaction(async () => {
                await walletService.post([
                    { user: userId, wallet: 'usd_cents', delta: -amountCents, type: 'coin_purchase', refType: 'CoinPurchase', refId: idemBase, idempotencyKey: `${idemBase}:debit` },
                    { user: userId, wallet: 'coins_paid', delta: coinsAmount, type: 'coin_purchase', refType: 'CoinPurchase', refId: idemBase, idempotencyKey: `${idemBase}:credit` }
                ], session);
                updatedUser = await User.findById(userId).select('coins balance socketId').session(session);

                const docs = await CoinPurchase.create([{
                    _id: idemBase, user: userId, method: 'balance', amountUSD: amount, coinsAmount,
                    status: 'approved', processedAt: new Date()
                }], { session });
                purchase = docs[0];

                await Transaction.create([{
                    user: userId, type: 'withdrawal', amount, currency: 'USD', status: 'completed',
                    description: `شراء ${coinsAmount} كوينز من الرصيد`
                }], { session });
            });
        } catch (txError) {
            if (txError.code === 'INSUFFICIENT_FUNDS') {
                return res.status(400).json({ status: 'fail', message: 'رصيدك الدولاري غير كافٍ لإتمام العملية' });
            }
            throw txError;
        } finally {
            await session.endSession();
        }

        const io = req.app.get('socketio');
        if (io && updatedUser.socketId) {
            io.to(updatedUser.socketId).emit('balanceUpdate', { newBalance: updatedUser.balance });
            io.to(updatedUser.socketId).emit('coinsUpdated', { newCoins: updatedUser.coins });
        }

        res.status(200).json({
            status: 'success', message: `تم شراء ${coinsAmount} كوينز من رصيدك بنجاح`,
            data: { newBalance: updatedUser.balance, newCoins: updatedUser.coins, purchase }
        });
    } catch (error) {
        console.error('[ERROR] in buyWithBalance:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};
