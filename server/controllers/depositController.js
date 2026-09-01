const Transaction = require('../models/Transaction');
const paymentConfig = require('../config/paymentConfig');
const { uploadReceiptImage } = require('../utils/cloudinary');
const { generateTransactionId } = require('../utils/helpers');

exports.getWalletInfo = async (req, res) => {
    try {
        res.status(200).json({
            status: 'success',
            data: {
                minUSD: paymentConfig.MIN_PURCHASE_USD,
                maxUSD: paymentConfig.MAX_PURCHASE_USD,
                shamCash: paymentConfig.SHAM_CASH
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.getMyDeposits = async (req, res) => {
    try {
        const deposits = await Transaction.find({ user: req.user.id, type: 'deposit' })
            .sort('-createdAt')
            .limit(20);
        res.status(200).json({ status: 'success', data: { deposits } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.createDepositRequest = async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, walletNumber } = req.body;

        const numAmount = parseFloat(amount);
        if (!numAmount || numAmount < paymentConfig.MIN_PURCHASE_USD || numAmount > paymentConfig.MAX_PURCHASE_USD) {
            return res.status(400).json({
                status: 'fail',
                message: `المبلغ يجب أن يكون بين ${paymentConfig.MIN_PURCHASE_USD}$ و ${paymentConfig.MAX_PURCHASE_USD}$`
            });
        }

        // ✅ دعم استكمال طلب سابق لم يُرفَع له إيصال بعد بنفس المبلغ (تجنب تكرار الطلبات)
        let deposit = await Transaction.findOne({
            user: userId, type: 'deposit', amount: numAmount, status: 'pending', receiptImage: { $exists: false }
        }).sort('-createdAt');

        if (!deposit) {
            deposit = await Transaction.create({
                user: userId,
                type: 'deposit',
                amount: numAmount,
                currency: 'USD',
                status: 'pending',
                method: 'sham_kash',
                walletNumber: walletNumber || undefined,
                transactionId: generateTransactionId(),
                description: 'طلب شحن رصيد'
            });
        }

        res.status(201).json({ status: 'success', data: { deposit } });
    } catch (error) {
        console.error('[ERROR] in createDepositRequest:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.uploadDepositReceipt = async (req, res) => {
    try {
        const userId = req.user.id;
        const { depositId } = req.params;

        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'الرجاء رفع صورة إشعار التحويل' });
        }

        const deposit = await Transaction.findOne({ _id: depositId, user: userId, type: 'deposit' });
        if (!deposit) return res.status(404).json({ status: 'fail', message: 'طلب الشحن غير موجود' });
        if (deposit.status !== 'pending') {
            return res.status(400).json({ status: 'fail', message: 'لا يمكن تعديل هذا الطلب بعد الآن' });
        }

        const uploadResult = await uploadReceiptImage(req.file.buffer);
        deposit.receiptImage = uploadResult.secure_url;
        await deposit.save();

        res.status(200).json({
            status: 'success',
            message: 'تم استلام طلبك، سيتم إيداع الرصيد بعد مراجعة الإدارة',
            data: { deposit }
        });
    } catch (error) {
        console.error('[ERROR] in uploadDepositReceipt:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء رفع الإشعار' });
    }
};
