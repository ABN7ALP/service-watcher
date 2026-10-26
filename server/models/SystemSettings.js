const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
    singletonKey: { type: String, default: 'main', unique: true },
    // ✅ علم استئناف تضخيم ×10 لهذا المستند (singleton — لكن نفس الآلية الموحّدة لبقية المجموعات)
    redenominatedV1: { type: Boolean, default: false },

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

    // ✅ هدايا v2 — المرحلة 4: "صمّم هديتك" — رسم تصميم لمرة واحدة (createCost) وسعر كل
    // إرسال لاحق (sendPrice) للهدايا المخصّصة. يُقرآن هنا فقط عند إنشاء CustomGift جديدة
    // (تُجمَّدان بالوثيقة نفسها بعدها) — أبداً من قيمة يرسلها العميل مباشرة
    customGiftDesignFeeCoins: { type: Number, default: 500 },
    customGiftSendPriceCoins: { type: Number, default: 100 },

    // ✅ دفتر الأستاذ (feat/wallet-ledger-v1): سعر الصرف الجديد بعد إعادة التسمية ×10 (=
    // coinExchangeRate القديم × 10) — يُستخدَم بترحيل إعادة التسمية ومطابقة الالتزامات، منفصل
    // عمداً عن coinExchangeRate القديم (لا يزال buyWithBalance يعتمده) تفادياً لأي تغيير سلوك
    // خارج نطاق هذه المهمة
    coinsPerUsd: { type: Number, default: 1000 },
    // وكلاء الشحن — ثلاث شرائح أسعار (كوينز لكل دولار)، تُضبَط من لوحة الإدارة لاحقاً
    agentTier1Rate: { type: Number, default: 1050 },
    agentTier2Rate: { type: Number, default: 1080 },
    agentTier3Rate: { type: Number, default: 1100 },
    // نسبة صرف الفول (beans_w) إلى دولار: فترة الإطلاق أسخى (جذب مبكر)، ثم القاعدة، أو الأعلى
    // للمضيفين بمستوى highHostLevel فأعلى بصرف النظر عن الفترة
    payoutLaunchPct: { type: Number, default: 70 },
    payoutLaunchEndsAt: { type: Date, default: () => { const d = new Date(); d.setMonth(d.getMonth() + 3); return d; } },
    payoutBasePct: { type: Number, default: 65 },
    payoutHighPct: { type: Number, default: 70 },
    highHostLevel: { type: Number, default: 30 },
    // فول أقل عمراً من هذا (ساعات) لا يمكن صرفه نقداً (beans_w فقط، beans_p لا تصل USD أبداً)
    beanHoldHours: { type: Number, default: 72 },
    // ميزانية دعم مضيف جديد (دولار) حتى نهاية فترة الإطلاق، وهامش أمان النسبة المئوية عليها
    hostBudgetSeedUsd: { type: Number, default: 50 },
    hostBudgetMarginPct: { type: Number, default: 30 },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// 🛡️ طلب صريح بمراجعة PR (سيل الهدايا، البند 1-3): "find-then-create" السابقة لم تكن ذرّية —
// عدة طلبات متزامنة (كعدة مرسلين يسجّلون الدخول بنفس اللحظة تقريباً، أو عدة هدايا متزامنة
// تصل هنا عبر مسارات أخرى تستدعي getSettings) على قاعدة بيانات لم تُنشأ بها الوثيقة الوحيدة
// بعد، تجد جميعها null فتحاول الإنشاء معاً — فيصطدم كل طلب لاحق بفهرس unique على singletonKey
// (E11000)، بنفس فئة علّة "سباق find-then-create" المُصلَحة سابقاً بمسارات أخرى بهذا المشروع
// (راجع PrivateChat.findOneAndUpdate بـgiftController.js). upsert ذرّي على مستوى القاعدة
// يغلق هذا تماماً: إما يجد الوثيقة الموجودة، أو يُنشئها، دون نافذة سباق بينهما إطلاقاً
systemSettingsSchema.statics.getSettings = async function () {
    return this.findOneAndUpdate(
        { singletonKey: 'main' },
        { $setOnInsert: { singletonKey: 'main' } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
