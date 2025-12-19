const cloudinary = require('cloudinary').v2;
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Deposit Request
exports.depositRequest = async (req, res) => {
  try {
    const { userId } = req.user;
    const { amount, method = 'sham_kash' } = req.body;

    // Validate amount
    if (amount < 1 || amount > 1000) {
      return res.status(400).json({
        success: false,
        message: 'المبلغ يجب أن يكون بين 1 و 1000 دولار'
      });
    }

    // Create deposit transaction
    const transaction = await Transaction.create({
      user: userId,
      type: 'deposit',
      amount,
      currency: 'USD',
      method,
      status: 'pending',
      description: `طلب شحن ${amount}$`
    });

    // Get Sham Kash wallet info
    const walletInfo = {
      walletNumber: process.env.SHAM_KASH_WALLET || '1234567890',
      instructions: 'قم بتحويل المبلغ إلى الرقم أعلاه وأرفع صورة الإيصاد'
    };

    res.json({
      success: true,
      message: 'تم إنشاء طلب الشحن',
      transactionId: transaction._id,
      walletInfo,
      instructions: 'انتظر موافقة الإدارة على طلبك'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Upload Receipt
exports.uploadReceipt = async (req, res) => {
  try {
    const { userId } = req.user;
    const { transactionId } = req.body;
    const receiptFile = req.file;

    if (!receiptFile) {
      return res.status(400).json({
        success: false,
        message: 'صورة الإيصاد مطلوبة'
      });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(receiptFile.path, {
      folder: 'receipts',
      resource_type: 'image'
    });

    // Update transaction
    const transaction = await Transaction.findById(transactionId);
    if (!transaction || transaction.user.toString() !== userId) {
      return res.status(404).json({
        success: false,
        message: 'المعاملة غير موجودة'
      });
    }

    transaction.receiptImage = result.secure_url;
    transaction.status = 'pending'; // Still pending admin approval
    await transaction.save();

    res.json({
      success: true,
      message: 'تم رفع الإيصاد بنجاح',
      receiptUrl: result.secure_url
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Withdrawal Request
exports.withdrawalRequest = async (req, res) => {
  try {
    const { userId } = req.user;
    const { amount, walletNumber } = req.body;

    // Validate amount
    if (amount < 1 || amount > 1000) {
      return res.status(400).json({
        success: false,
        message: 'المبلغ يجب أن يكون بين 1 و 1000 دولار'
      });
    }

    // Check user balance
    const user = await User.findById(userId);
    if (user.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'رصيدك غير كافي'
      });
    }

    // Calculate fee (0.50$ for every 10$)
    const fee = Math.floor(amount / 10) * 0.50;
    const netAmount = amount - fee;

    // Create withdrawal record
    const withdrawal = await Withdrawal.create({
      user: userId,
      amount,
      fee,
      netAmount,
      walletNumber,
      status: 'pending'
    });

    // Create transaction record
    const transaction = await Transaction.create({
      user: userId,
      type: 'withdrawal',
      amount: amount * -1, // Negative for withdrawal
      currency: 'USD',
      method: 'sham_kash',
      status: 'pending',
      description: `طلب سحب ${amount}$ (صافي: ${netAmount}$ رسوم: ${fee}$)`,
      fees: fee
    });

    // Reserve balance (deduct from available balance but not total)
    user.balance -= amount;
    await user.save();

    res.json({
      success: true,
      message: 'تم إنشاء طلب السحب بنجاح',
      withdrawalId: withdrawal._id,
      transactionId: transaction._id,
      amount,
      fee,
      netAmount,
      estimatedTime: '24-48 ساعة'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Buy Coins
exports.buyCoins = async (req, res) => {
  try {
    const { userId } = req.user;
    const { coinsAmount } = req.body;

    // Calculate USD amount (100 coins = 1 USD)
    const usdAmount = coinsAmount / 100;

    // Check user balance
    const user = await User.findById(userId);
    if (user.balance < usdAmount) {
      return res.status(400).json({
        success: false,
        message: 'رصيدك الدولاري غير كافي'
      });
    }

    // Check for active offers
    const Gift = require('../models/Gift');
    const activeOffers = await Gift.find({
      discount: { $gt: 0 },
      isActive: true
    }).sort('-discount');

    let finalCoins = coinsAmount;
    let discountApplied = 0;

    if (activeOffers.length > 0 && coinsAmount >= 1000) {
      // Apply best discount for large purchases
      const bestOffer = activeOffers[0];
      discountApplied = bestOffer.discount;
      finalCoins = Math.floor(coinsAmount * (1 + discountApplied / 100));
    }

    // Process transaction
    user.balance -= usdAmount;
    user.coins += finalCoins;
    await user.save();

    // Create transaction
    await Transaction.create({
      user: userId,
      type: 'deposit', // For tracking
      amount: usdAmount,
      currency: 'USD',
      status: 'completed',
      description: `شراء ${finalCoins} عملة${discountApplied > 0 ? ` (خصم ${discountApplied}%)` : ''}`
    });

    res.json({
      success: true,
      message: `تم شراء ${finalCoins} عملة بنجاح`,
      coins: finalCoins,
      usdSpent: usdAmount,
      discountApplied
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Send Gift
exports.sendGift = async (req, res) => {
  try {
    const { userId } = req.user;
    const { recipientId, giftId, isPublic = false, specificRecipients = [] } = req.body;

    // Get gift details
    const Gift = require('../models/Gift');
    const gift = await Gift.findById(giftId);
    if (!gift || !gift.isActive) {
      return res.status(404).json({
        success: false,
        message: 'الهدية غير متوفرة'
      });
    }

    const giftPrice = gift.discountedPrice || gift.price;

    // Check sender's coins
    const sender = await User.findById(userId);
    if (sender.coins < giftPrice) {
      return res.status(400).json({
        success: false,
        message: 'رصيدك من العملات غير كافي'
      });
    }

    // Process gift sending
    sender.coins -= giftPrice;
    sender.totalGifted += giftPrice;
    await sender.save();

    let recipients = [];
    
    if (isPublic) {
      // Send to all online users
      // This would require socket connection tracking
      // For now, we'll just record it
      recipients = ['all'];
    } else if (specificRecipients.length > 0) {
      recipients = specificRecipients;
      
      // Send to specific recipients
      for (const recipientId of specificRecipients) {
        const recipient = await User.findById(recipientId);
        if (recipient) {
          recipient.coins += Math.floor(giftPrice * 0.6); // 60% value
          recipient.totalReceivedGifts += Math.floor(giftPrice * 0.6);
          await recipient.save();

          // Create transaction for recipient
          await Transaction.create({
            user: recipientId,
            type: 'gift_receive',
            amount: Math.floor(giftPrice * 0.6),
            currency: 'coins',
            sender: userId,
            description: `هدية: ${gift.name}`
          });

          // Send real-time notification via socket
          // This would be handled in socket handlers
        }
      }
    } else {
      // Send to single recipient
      const recipient = await User.findById(recipientId);
      if (!recipient) {
        return res.status(404).json({
          success: false,
          message: 'المستلم غير موجود'
        });
      }

      recipient.coins += Math.floor(giftPrice * 0.6);
      recipient.totalReceivedGifts += Math.floor(giftPrice * 0.6);
      await recipient.save();

      recipients = [recipientId];

      await Transaction.create({
        user: recipientId,
        type: 'gift_receive',
        amount: Math.floor(giftPrice * 0.6),
        currency: 'coins',
        sender: userId,
        description: `هدية: ${gift.name}`
      });
    }

    // Create transaction for sender
    await Transaction.create({
      user: userId,
      type: 'gift_send',
      amount: giftPrice,
      currency: 'coins',
      status: 'completed',
      description: `إرسال هدية: ${gift.name}`
    });

    res.json({
      success: true,
      message: 'تم إرسال الهدية بنجاح',
      gift: gift.name,
      price: giftPrice,
      recipients,
      coinsGiven: Math.floor(giftPrice * 0.6)
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Wallet Info
exports.getWalletInfo = async (req, res) => {
  try {
    res.json({
      success: true,
      walletInfo: {
        number: process.env.SHAM_KASH_WALLET || '1234567890',
        name: 'Sham Kash',
        minDeposit: 1,
        maxDeposit: 1000,
        minWithdrawal: 1,
        maxWithdrawal: 1000,
        withdrawalFee: '0.50$ لكل 10$',
        depositFee: 'بدون رسوم',
        processingTime: '24-48 ساعة'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
