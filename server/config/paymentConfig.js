module.exports = {
    // ✅ سعر الصرف: 1 دولار = كم كوينز
    COIN_EXCHANGE_RATE: 100,

    MIN_PURCHASE_USD: 1,
    MAX_PURCHASE_USD: 1000,

    // ✅ عدّل هذه القيم عبر متغيرات البيئة (.env) بدون الحاجة لتعديل الكود
    SHAM_CASH: {
        walletNumber: process.env.SHAM_CASH_WALLET || '09XXXXXXXX',
        accountHolderName: process.env.SHAM_CASH_HOLDER || 'اسم صاحب الحساب',
        qrImageUrl: process.env.SHAM_CASH_QR_URL || 'https://res.cloudinary.com/dntlt5xry/image/upload/v1/payment/sham_cash_qr.png'
    },

    VISA: {
        cardNumber: process.env.VISA_CARD_NUMBER || '0000 0000 0000 0000',
        accountHolderName: process.env.VISA_HOLDER || 'اسم صاحب البطاقة',
        instructions: 'قم بتحويل المبلغ إلى رقم البطاقة أعلاه عبر تطبيق البنك أو أي وسيلة تحويل فيزا متاحة لديك'
    }
};
