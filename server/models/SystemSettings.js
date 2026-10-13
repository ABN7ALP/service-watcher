const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
    singletonKey: { type: String, default: 'main', unique: true },

    coinExchangeRate: { type: Number, default: 100 },
    minPurchaseUSD: { type: Number, default: 1 },
    maxPurchaseUSD: { type: Number, default: 1000 },

    shamCashWallet: { type: String, default: '' },
    shamCashHolderName: { type: String, default: '' },
    shamCashQrUrl: { type: String, default: '' },

    visaCardNumber: { type: String, default: '' },
    visaHolderName: { type: String, default: '' },

    minWithdrawUSD: { type: Number, default: 5 },
    withdrawalFeePer10USD: { type: Number, default: 0.5 },

    coinsToUsdRedemptionRate: { type: Number, default: 100 }, // كم كوينز = 1$ عند الاستبدال (اجعلها = coinExchangeRate لتكافؤ عادل)
    giftRedemptionHaircutPercent: { type: Number, default: 90, min: 1, max: 100 }, // النسبة المستردة فعلياً (الباقي "ضريبة" مضادة للتلاعب)
    maxDailyWithdrawalUSD: { type: Number, default: 500 }, // ✅ سيُستخدم لاحقاً بالبند 10

    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: 'الموقع تحت الصيانة حالياً، عد لاحقاً' },

    // ✅ صيغة نقاط دوري PK الأسبوعي (قابلة للتعديل من لوحة الإدارة) — راجع pkLeagueEngine.js
    // للصيغة الكاملة: lp = نتيجة_الثابتة + floor(الدعم_الحقيقي_المُستلَم ÷ pkSupportLpDivisor)،
    // بحد أقصى pkLpCapPerBattle لكل تحدٍّ واحد مهما بلغ الدعم
    pkWinLp: { type: Number, default: 300 },
    pkLossLp: { type: Number, default: 50 },
    pkDrawLp: { type: Number, default: 120 },
    pkSupportLpDivisor: { type: Number, default: 100 }, // كل N كوينز دعم حقيقي = نقطة دوري واحدة
    pkLpCapPerBattle: { type: Number, default: 2000 },
    // ✅ مكافحة التلاعب — راجع pkLeagueEngine.checkAntiCheat للتفاصيل الكاملة
    pkMinDurationSeconds: { type: Number, default: 60 },
    pkMinSupportCoins: { type: Number, default: 50 },
    pkMaxDailyMatchesPerPair: { type: Number, default: 3 },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

systemSettingsSchema.statics.getSettings = async function () {
    let settings = await this.findOne({ singletonKey: 'main' });
    if (!settings) settings = await this.create({ singletonKey: 'main' });
    return settings;
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
