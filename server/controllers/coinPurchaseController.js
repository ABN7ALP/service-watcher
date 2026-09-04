const CoinPurchase = require('../models/CoinPurchase');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const paymentConfig = require('../config/paymentConfig');
const { uploadReceiptImage } = require('../utils/cloudinary');

// جلب بيانات طرق الدفع (تُعرض بالواجهة)
exports.getPaymentInfo = async (req, res) => {
    try {
        const SystemSettings = require('../models/SystemSettings');
        const settings = await SystemSettings.getSettings();

        const agents = await User.find({ isAgent: true })
            .select('username profileImage agentWhatsapp socketId');

        res.status(200).json({
            status: 'success',
            data: {
                coinRate: settings.coinExchangeRate,
                minUSD: settings.minPurchaseUSD,
                maxUSD: settings.maxPurchaseUSD,
                shamCash: { walletNumber: settings.shamCashWallet, accountHolderName: settings.shamCashHolderName, qrImageUrl: settings.shamCashQrUrl },
                visa: { cardNumber: settings.visaCardNumber, accountHolderName: settings.visaHolderName, instructions: paymentConfig.VISA.instructions },
                agents: agents.map(a => ({ id: a._id, username: a.username, profileImage: a.profileImage, whatsapp: a.agentWhatsapp, isOnline: !!a.socketId }))
            }
        });
    } catch (error) {
        console.error('[ERROR] in getPaymentInfo:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ✅ جلب طلبات الشراء غير المكتملة الخاصة بالمستخدم (لدعم الاستكمال بعد إعادة التحميل)
exports.getMyPendingPurchases = async (req, res) => {
    try {
        const purchases = await CoinPurchase.find({
            user: req.user.id,
            status: { $in: ['pending_payment', 'pending_review'] }
        }).sort('-createdAt');

        res.status(200).json({ status: 'success', data: { purchases } });
    } catch (error) {
        console.error('[ERROR] in getMyPendingPurchases:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// إنشاء طلب شراء جديد (شام كاش أو فيزا)
exports.createPurchaseRequest = async (req, res) => {
    try {
        const userId = req.user.id;
        const { method, amountUSD } = req.body;

        if (!['sham_cash', 'visa'].includes(method)) {
            return res.status(400).json({ status: 'fail', message: 'طريقة دفع غير صالحة لهذا المسار' });
        }

        const amount = parseFloat(amountUSD);
        if (!amount || amount < paymentConfig.MIN_PURCHASE_USD || amount > paymentConfig.MAX_PURCHASE_USD) {
            return res.status(400).json({
                status: 'fail',
                message: `المبلغ يجب أن يكون بين ${paymentConfig.MIN_PURCHASE_USD}$ و ${paymentConfig.MAX_PURCHASE_USD}$`
            });
        }

        // ✅ دعم الاستكمال: إذا كان هناك طلب سابق لم يُرفع له إيصال بعد بنفس الطريقة والمبلغ، نعيد استخدامه
        let purchase = await CoinPurchase.findOne({
            user: userId,
            method,
            amountUSD: amount,
            status: 'pending_payment'
        }).sort('-createdAt');

        if (!purchase) {
            purchase = await CoinPurchase.create({
                user: userId,
                method,
                amountUSD: amount,
                coinsAmount: Math.round(amount * paymentConfig.COIN_EXCHANGE_RATE),
                status: 'pending_payment'
            });
        }

        res.status(201).json({ status: 'success', data: { purchase } });
    } catch (error) {
        console.error('[ERROR] in createPurchaseRequest:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// رفع صورة إشعار التحويل
exports.uploadReceipt = async (req, res) => {
    try {
        const userId = req.user.id;
        const { purchaseId } = req.params;

        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'الرجاء رفع صورة إشعار التحويل' });
        }

        const purchase = await CoinPurchase.findOne({ _id: purchaseId, user: userId });
        if (!purchase) {
            return res.status(404).json({ status: 'fail', message: 'طلب الشراء غير موجود' });
        }

        if (!['pending_payment', 'pending_review'].includes(purchase.status)) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكن تعديل هذا الطلب بعد الآن' });
        }

        const uploadResult = await uploadReceiptImage(req.file.buffer);

        purchase.receiptImage = uploadResult.secure_url;
        purchase.status = 'pending_review';
        await purchase.save();

        res.status(200).json({
            status: 'success',
            message: 'تم استلام طلبك، سيتم إيداع الرصيد خلال 5 إلى 10 دقائق كحد أقصى',
            data: { purchase }
        });
    } catch (error) {
        console.error('[ERROR] in uploadReceipt:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء رفع الإشعار' });
    }
};

// ===== إدارة الطلبات (للمشرفين فقط) =====
exports.approvePurchase = async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ status: 'fail', message: 'صلاحيات غير كافية' });
        }

        const { purchaseId } = req.params;
        const purchase = await CoinPurchase.findById(purchaseId);
        if (!purchase) return res.status(404).json({ status: 'fail', message: 'الطلب غير موجود' });
        if (purchase.status !== 'pending_review') {
            return res.status(400).json({ status: 'fail', message: 'الطلب ليس قيد المراجعة' });
        }

        purchase.status = 'approved';
        purchase.processedBy = req.user.id;
        purchase.processedAt = new Date();
        await purchase.save();

        const user = await User.findById(purchase.user);
        if (user) {
            user.coins += purchase.coinsAmount;
            await user.save();

            const io = req.app.get('socketio');
            if (io && user.socketId) {
                io.to(user.socketId).emit('coinsUpdated', { newCoins: user.coins, purchaseId: purchase._id });
            }
        }

        res.status(200).json({ status: 'success', message: 'تمت الموافقة وإيداع الرصيد', data: { purchase } });
    } catch (error) {
        console.error('[ERROR] in approvePurchase:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.rejectPurchase = async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ status: 'fail', message: 'صلاحيات غير كافية' });
        }

        const { purchaseId } = req.params;
        const { reason } = req.body;

        const purchase = await CoinPurchase.findById(purchaseId);
        if (!purchase) return res.status(404).json({ status: 'fail', message: 'الطلب غير موجود' });

        purchase.status = 'rejected';
        purchase.adminNotes = reason || '';
        purchase.processedBy = req.user.id;
        purchase.processedAt = new Date();
        await purchase.save();

        res.status(200).json({ status: 'success', message: 'تم رفض الطلب', data: { purchase } });
    } catch (error) {
        console.error('[ERROR] in rejectPurchase:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};


// ✅ شراء فوري بدون انتظار مراجعة إدارية — التحويل داخلي بين رصيدين مملوكين لنفس المستخدم
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

        // ✅ خصم وإيداع ذريّان بعملية واحدة — يمنع أي فرصة رصيد سالب حتى مع طلبات متزامنة
        const updatedUser = await User.findOneAndUpdate(
            { _id: userId, balance: { $gte: amount } },
            { $inc: { balance: -amount, coins: coinsAmount } },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(400).json({ status: 'fail', message: 'رصيدك الدولاري غير كافٍ لإتمام العملية' });
        }

        const purchase = await CoinPurchase.create({
            user: userId, method: 'balance', amountUSD: amount, coinsAmount,
            status: 'approved', processedAt: new Date()
        });

        await Transaction.create({
            user: userId, type: 'withdrawal', amount, currency: 'USD', status: 'completed',
            description: `شراء ${coinsAmount} كوينز من الرصيد`
        });

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
