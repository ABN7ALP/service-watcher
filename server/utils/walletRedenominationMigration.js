// ملف: server/utils/walletRedenominationMigration.js
// =====================================================
// 🛡️ إعادة تسمية العملة ×10 (feat/wallet-ledger-v1): $1 = 1000 كوينز بدل 100 (coinsPerUsd
// الجديدة بـSystemSettings) — نفس القيمة الحقيقية بالدولار بالضبط، أرقام أكبر فقط. تُنفَّذ
// فقط عند طلب المُشغِّل الصريح (WALLET_MIGRATION=apply — راجع resolveMigrationStartup/
// server.js)، قبل فتح المنفذ للترافيك العادي بالكامل (migrationGate.js — 503 صيانة لأي طلب
// حتى تكتمل).
//
// 🛡️ آمنة للتعطّل والاستئناف: JobRun تنتقل status 'running' -> 'completed'؛ فقط 'completed'
// تعني تخطٍّ كامل، أي حالة أخرى (أو عدم وجود JobRun أصلاً) تُستأنَف. كل قيمة/سعر مخزَّن يحمل
// علم redenominatedV1 خاصاً به (وكل مستخدم يحمل walletRedenominatedV1)، فكل تحديث مشروط
// بهذا العلم — إعادة التشغيل لا يمكن أن تُضخِّم قيمة مرتين إطلاقاً. الترتيب: المجموعات
// (الأسعار/القيم المخزَّنة) أولاً، ثم محافظ المستخدمين — الترافيك مقطوع بالكامل خلال العملية.
//
// 🛡️ مراجعة إنتاج ثانية (بعد دمج+تراجع PR #131 — "6 blockers v2"):
//   1) SystemSettings (singleton) تحديداً: $mul على حقل مفتقَد بالمستند المخزَّن يُنشئه بصفر
//      (قاعدة Mongo الرسمية)، لا بالقيمة الافتراضية بالمخطط — قراءة Mongoose العادية (hydration)
//      تُخفي هذي الفجوة (تُطبِّق الافتراضي تلقائياً على حقل مفتقَد)، فلم تُكتشَف إلا بترحيل
//      إنتاجي حقيقي. الحل: COLLECTION_SCALERS الخاص بـSystemSettings يقرأ المستند الخام (lean)،
//      يحسب effective = المخزَّن ?? الافتراضي القديم (SETTINGS_OLD_DEFAULTS)، ثم $set صريح —
//      لا $mul إطلاقاً على هذا المستند بعد الآن. assertScaledSettingsPositive تتحقق إيجابياً
//      بعد التطبيق وتُفجِّر خطأً (تبقى JobRun 'running' فتُستأنَف) لو صفر/سالب. أُضيف أيضاً
//      assertMoneyDivisorsSane كحارس إقلاع دائم (resolveMigrationStartup) بصرف النظر عن
//      اكتمال الترحيل — يرفض فتح الموقع إن كان أي قاسم مالي حقيقي ≤ صفر بالإعدادات الحيّة.
//   2) أرصدة الافتتاح = بداية نظيفة (قرار المالك — كل الحسابات الحالية حسابات اختبار، لا أموال
//      حقيقية استُلمت فعلاً): coins القديمة ×10 → coins_bonus (لا coins_paid)، الهدايا غير
//      المستبدَلة ×10 → beans_p (لا beans_w)، usd_cents الافتتاحي = صفر دوماً (balance القديم
//      يُحفَظ فقط بحقل meta.oldBalanceUsd بقيود الافتتاح مرجعاً تاريخياً). أثر جانبي مقصود:
//      walletService.post تُعيد مزامنة مرآة User.balance القديمة من walletUsdCents (=0) بمجرّد
//      أي قيد لهذا المستخدم (حتى لو كان القيد لمحفظة أخرى كـcoins_bonus) — فتُصفَّر فوراً، لا
//      تبقى على قيمتها القديمة المعزولة عن دفتر الأستاذ، تماماً كما يقتضيه "بداية نظيفة".
//
// الجرد الكامل لكل قيمة/صيغة مقوَّمة بالكوينز (مطلوب صريحاً بوصف المهمة):
//   - أرصدة المستخدمين: User.coins → تُصبح افتتاح محفظة coins_bonus (×10) عبر دفتر الأستاذ.
//     User.balance (دولار) → لا يُفتَح usd_cents إطلاقاً (بداية نظيفة) — يُحفَظ بـmeta فقط.
//     قيمة الهدايا غير المستبدلة (GiftLog.redeemed:false) → افتتاح محفظة beans_p (×10)،
//     ثم تُعلَّم تلك السجلات redeemed:true (قيمتها انتقلت فعلاً لدفتر الأستاذ).
//     User.supportMissions.bonusXP → يُضخَّم ×10 بنفس معاملة فتح محفظة المستخدم ذاتها.
//   - أسعار الكتالوج المخزَّنة: Gift.price/discountedPrice، ProfileFrame.prices.day1/3/7،
//     ChatBubbleSkin.price، CustomGift.createCost/sendPrice.
//   - سجلّات تاريخية: GiftLog.unitPrice/totalPrice، CoinPurchase.coinsAmount،
//     GiftRedemption.originalCoinsValue (دوماً)، GiftRedemption.finalAmount (فقط
//     redeemedTo:'coins' — حالة 'balance' دولار، لا تُضخَّم)، FanClubMembership.points.
//   - تراكمات الغرف/الدوري: VoiceRoom.supportPoints/sessionSupportPoints،
//     PkStanding.supportCoins.
//   - إعدادات النظام (SystemSettings الوحيدة): coinExchangeRate، pkSupportLpDivisor،
//     pkMinSupportCoins، customGiftDesignFeeCoins، customGiftSendPriceCoins (effective-value
//     — راجع البند 1 أعلاه).
//   مُستثنى عمداً (ليست كوينز، أو جديدة أصلاً بمقياسها الجديد، أو حالة لعب عابرة قصيرة العمر
//   لا تُقارَن بعتبة ثابتة): usd_cents/balance الحقيقي، coinsPerUsd/agentTier*/payout*/
//   beanHoldHours/hostBudget* (مُصمَّمة من الصفر بالمقياس الجديد)، coinsToUsdRedemptionRate/
//   giftRedemptionHaircutPercent (آلية استبدال قديمة مُستبدَلة بالكامل، لا تُقرَأ بعد الآن)،
//   User.level/experience (نظام XP منفصل، القاسم المُستخدَم بحساب XP الهدايا هو ما تغيّر لا
//   الرصيد المُخزَّن)، RoomBattle.scoreA/B وrealSupportA/B وSeatChallenge (حالة معركة/تحدٍّ
//   عابرة قصيرة العمر، تُسوَّى خلال دقائق، لا تُقارَن بعتبة ثابتة عبر الزمن). عتبات المستويات
//   الثابتة بالكود (supportLevels.js/fanClubLevels.js/VoiceRoom.LEVEL_THRESHOLDS) وقاسمَا XP
//   الهدايا (experienceManager.js) ×10 أيضاً، لكن كتعديل كود منفصل لا هنا (راجع تلك الملفات)
// =====================================================

const mongoose = require('mongoose');
const User = require('../models/User');
const Gift = require('../models/Gift');
const ProfileFrame = require('../models/ProfileFrame');
const ChatBubbleSkin = require('../models/ChatBubbleSkin');
const CustomGift = require('../models/CustomGift');
const GiftLog = require('../models/GiftLog');
const CoinPurchase = require('../models/CoinPurchase');
const GiftRedemption = require('../models/GiftRedemption');
const FanClubMembership = require('../models/FanClubMembership');
const VoiceRoom = require('../models/VoiceRoom');
const PkStanding = require('../models/PkStanding');
const SystemSettings = require('../models/SystemSettings');
const JobRun = require('../models/JobRun');
const walletService = require('../utils/walletService');

const JOB_NAME = 'wallet_redenomination_v1';
// ✅ ليست مهمة دورية حقيقية — "نافذة" رمزية ثابتة واحدة فقط لضمان ادّعاء مرّة واحدة للأبد
// عبر الفهرس الفريد الموجود أصلاً على (job, weekStart)، بلا الحاجة لحقل/نموذج جديد
const SENTINEL_WEEK_START = new Date(0);
const SCALE = 10;

// ✅ القيمة الافتراضية القديمة (قبل ×10) لكل حقل إعدادات مُضخَّم — تُستخدَم فقط لحساب
// "effective" لمستند SystemSettings مفتقِد الحقل أصلاً (المستند لم يُنشأ أبداً بعد إضافة
// الحقل هذا للمخطط). ليست نفس الافتراضي الحيّ بالمخطط الآن (ذاك أصبح ×10 أصلاً — يخدم غرضاً
// مختلفاً تماماً: إنشاء مستند جديد من الصفر بعد الترحيل/بمنشأة جديدة، لا حساب قيمة قديمة)
const SETTINGS_OLD_DEFAULTS = {
    coinExchangeRate: 100,
    pkSupportLpDivisor: 100,
    pkMinSupportCoins: 50,
    customGiftDesignFeeCoins: 500,
    customGiftSendPriceCoins: 100
};
const SETTINGS_SCALE_FIELDS = Object.keys(SETTINGS_OLD_DEFAULTS);

// ✅ قواسم مالية حقيقية (تُستخدَم بعمليات قسمة حيّة — pkLeagueEngine/giftRedemptionController/
// walletReconciliationJob) — حارس الإقلاع الدائم يرفض فتح الموقع إن كان أي منها ≤ صفر
const MONEY_DIVISOR_FIELDS = ['coinsPerUsd', 'pkSupportLpDivisor'];

// ✅ قراءة "القيمة الفعلية" لحقل إعدادات واحد قبل أي تضخيم بهذي العملية — bypass كامل لأي
// hydration (findOne().lean() يُعيد المستند الخام بالضبط كما هو مخزَّن)، effective = المخزَّن
// (حتى لو صفراً فعلياً — قيمة مُخزَّنة حقيقية لا تُستبدَل) ?? الافتراضي القديم لو الحقل غائب كلياً
async function readEffectiveOldSettingsValue(field) {
    const raw = await SystemSettings.findOne({ singletonKey: 'main' }).lean();
    if (!raw || raw.redenominatedV1 === true) return 0; // ✅ مُضخَّم فعلاً أو لا مستند بعد — لا "قبل" لهذي العملية
    const stored = raw[field];
    return (stored !== null && stored !== undefined) ? stored : SETTINGS_OLD_DEFAULTS[field];
}

// ✅ للعرض فقط (جدول dry-run/apply قبل/بعد) — إجماليات حقل بحقل، مستقلة تماماً عن شكل كتابة
// التحديث الفعلي أدناه. لا تُستخدَم لأي قرار كتابة إطلاقاً.
//
// 🛡️ كل فلتر هنا يحمل أيضاً شرط "لم يُضخَّم بعد" (نفس علم مسار الكتابة) — ليس لمنع كتابة
// (هذي القوائم لا تكتب شيئاً)، بل لأن "قبل" يجب أن يقيس فقط ما سيُضخَّم فعلياً بهذي العملية
// بالذات. بدونه، استئناف عملية تعطّلت بمنتصفها يُحسَب "قبل" على مزيج من مستندات ضُخِّمت فعلاً
// بمحاولة سابقة ومستندات لم تُضخَّم بعد، فيظهر allOk:false زائفاً رغم أن كل قيمة صحيحة ×10
// بالضبط فعلياً. بنود SystemSettings الخمسة تستخدم readEffective (لا aggregate عادي) — نفس
// علّة effective-value بالضبط تنطبق على "قبل" التقرير أيضاً، لا فقط على الكتابة الفعلية
const unscaled = (filter, markerField = 'redenominatedV1') => ({ ...filter, [markerField]: { $ne: true } });

const REPORT_FIELDS = [
    { label: 'Gift.price', Model: Gift, filter: unscaled({}), field: 'price' },
    { label: 'Gift.discountedPrice', Model: Gift, filter: unscaled({ discountedPrice: { $ne: null } }), field: 'discountedPrice' },
    { label: 'ProfileFrame.prices.day1', Model: ProfileFrame, filter: unscaled({}), field: 'prices.day1' },
    { label: 'ProfileFrame.prices.day3', Model: ProfileFrame, filter: unscaled({}), field: 'prices.day3' },
    { label: 'ProfileFrame.prices.day7', Model: ProfileFrame, filter: unscaled({}), field: 'prices.day7' },
    { label: 'ChatBubbleSkin.price', Model: ChatBubbleSkin, filter: unscaled({}), field: 'price' },
    { label: 'CustomGift.createCost', Model: CustomGift, filter: unscaled({}), field: 'createCost' },
    { label: 'CustomGift.sendPrice', Model: CustomGift, filter: unscaled({}), field: 'sendPrice' },
    { label: 'GiftLog.unitPrice', Model: GiftLog, filter: unscaled({}), field: 'unitPrice' },
    { label: 'GiftLog.totalPrice', Model: GiftLog, filter: unscaled({}), field: 'totalPrice' },
    { label: 'CoinPurchase.coinsAmount', Model: CoinPurchase, filter: unscaled({}), field: 'coinsAmount' },
    { label: 'GiftRedemption.originalCoinsValue', Model: GiftRedemption, filter: unscaled({}), field: 'originalCoinsValue' },
    { label: "GiftRedemption.finalAmount(redeemedTo='coins')", Model: GiftRedemption, filter: unscaled({ redeemedTo: 'coins' }), field: 'finalAmount' },
    { label: 'FanClubMembership.points', Model: FanClubMembership, filter: unscaled({}), field: 'points' },
    { label: 'VoiceRoom.supportPoints', Model: VoiceRoom, filter: unscaled({}), field: 'supportPoints' },
    { label: 'VoiceRoom.sessionSupportPoints', Model: VoiceRoom, filter: unscaled({}), field: 'sessionSupportPoints' },
    { label: 'PkStanding.supportCoins', Model: PkStanding, filter: unscaled({}), field: 'supportCoins' },
    // ✅ bonusXP يُضخَّم عبر walletRedenominatedV1 (معاملة المستخدم)، لا redenominatedV1 العام
    { label: 'User.supportMissions.bonusXP', Model: User, filter: unscaled({ 'supportMissions.bonusXP': { $ne: 0 } }, 'walletRedenominatedV1'), field: 'supportMissions.bonusXP' },
    // ✅ effective-value (راجع readEffectiveOldSettingsValue) — لا aggregate عادي، نفس العلّة
    // المُصلَحة بمسار الكتابة تنطبق على قياس "قبل" التقرير بالضبط (حقل مفتقَد = صفر خاطئ)
    { label: 'SystemSettings.coinExchangeRate', readEffective: () => readEffectiveOldSettingsValue('coinExchangeRate') },
    { label: 'SystemSettings.pkSupportLpDivisor', readEffective: () => readEffectiveOldSettingsValue('pkSupportLpDivisor') },
    { label: 'SystemSettings.pkMinSupportCoins', readEffective: () => readEffectiveOldSettingsValue('pkMinSupportCoins') },
    { label: 'SystemSettings.customGiftDesignFeeCoins', readEffective: () => readEffectiveOldSettingsValue('customGiftDesignFeeCoins') },
    { label: 'SystemSettings.customGiftSendPriceCoins', readEffective: () => readEffectiveOldSettingsValue('customGiftSendPriceCoins') }
];

// ✅ مسار الكتابة الفعلي — مُجمَّع حسب المجموعة (مستند واحد بكل حقوله المُضخَّمة بتحديث واحد)،
// كل تحديث مشروط بعلم redenominatedV1 الخاص بالمستند — إعادة التشغيل لا يمكن أن تُضخِّم
// مستنداً مرتين. الحقول الشرطية (قد تكون null، أو تُضخَّم فقط بحالة معيّنة) تستخدم صيغة
// تحديث aggregation-pipeline لتفادي $mul على null وللبقاء بتحديث واحد.
//
// 🛡️ مراجعة إنتاج (البند 1): تدقيق كل هدف $mul هنا لخطر "حقل مفتقَد يُصفَّر بالخطأ" —
// Gift/ProfileFrame/ChatBubbleSkin/CustomGift/GiftLog/CoinPurchase/GiftRedemption تستخدم
// حقولاً required:true بمخططاتها (price/prices.day1-7/createCost/sendPrice/unitPrice/
// totalPrice/coinsAmount/originalCoinsValue) — يستحيل حفظ مستند صالح دون هذي القيم، فلا خطر
// فجوة إطلاقاً. VoiceRoom.supportPoints/sessionSupportPoints وPkStanding.supportCoins
// وFanClubMembership.points افتراضيها 0 (لا required) — لو افتُقِد الحقل فعلاً بمستند قديم
// جداً، $mul يُنشئه بصفر، وهو تماماً effective الصحيحة هنا (الافتراضي المقصود هو صفر بالضبط)،
// فلا علّة فعلية. الاستثناء الوحيد الحقيقي كان SystemSettings (افتراضيات غير صفرية، ومستند
// singleton واحد قد يسبق إضافة حقل جديد للمخطط) — مُعالَج أدناه بقراءة خام + $set صريح بدل $mul
const COLLECTION_SCALERS = [
    {
        label: 'Gift',
        apply: () => Gift.updateMany(
            { redenominatedV1: { $ne: true } },
            [{ $set: {
                price: { $multiply: ['$price', SCALE] },
                discountedPrice: {
                    $cond: [{ $ne: ['$discountedPrice', null] }, { $multiply: ['$discountedPrice', SCALE] }, '$discountedPrice']
                },
                redenominatedV1: true
            } }]
        )
    },
    {
        label: 'ProfileFrame',
        apply: () => ProfileFrame.updateMany(
            { redenominatedV1: { $ne: true } },
            { $mul: { 'prices.day1': SCALE, 'prices.day3': SCALE, 'prices.day7': SCALE }, $set: { redenominatedV1: true } }
        )
    },
    {
        label: 'ChatBubbleSkin',
        apply: () => ChatBubbleSkin.updateMany(
            { redenominatedV1: { $ne: true } },
            { $mul: { price: SCALE }, $set: { redenominatedV1: true } }
        )
    },
    {
        label: 'CustomGift',
        apply: () => CustomGift.updateMany(
            { redenominatedV1: { $ne: true } },
            { $mul: { createCost: SCALE, sendPrice: SCALE }, $set: { redenominatedV1: true } }
        )
    },
    {
        label: 'GiftLog',
        apply: () => GiftLog.updateMany(
            { redenominatedV1: { $ne: true } },
            { $mul: { unitPrice: SCALE, totalPrice: SCALE }, $set: { redenominatedV1: true } }
        )
    },
    {
        label: 'CoinPurchase',
        apply: () => CoinPurchase.updateMany(
            { redenominatedV1: { $ne: true } },
            { $mul: { coinsAmount: SCALE }, $set: { redenominatedV1: true } }
        )
    },
    {
        label: 'GiftRedemption',
        apply: () => GiftRedemption.updateMany(
            { redenominatedV1: { $ne: true } },
            [{ $set: {
                originalCoinsValue: { $multiply: ['$originalCoinsValue', SCALE] },
                finalAmount: {
                    $cond: [{ $eq: ['$redeemedTo', 'coins'] }, { $multiply: ['$finalAmount', SCALE] }, '$finalAmount']
                },
                redenominatedV1: true
            } }]
        )
    },
    {
        label: 'FanClubMembership',
        apply: () => FanClubMembership.updateMany(
            { redenominatedV1: { $ne: true } },
            { $mul: { points: SCALE }, $set: { redenominatedV1: true } }
        )
    },
    {
        label: 'VoiceRoom',
        apply: () => VoiceRoom.updateMany(
            { redenominatedV1: { $ne: true } },
            { $mul: { supportPoints: SCALE, sessionSupportPoints: SCALE }, $set: { redenominatedV1: true } }
        )
    },
    {
        label: 'PkStanding',
        apply: () => PkStanding.updateMany(
            { redenominatedV1: { $ne: true } },
            { $mul: { supportCoins: SCALE }, $set: { redenominatedV1: true } }
        )
    },
    {
        // 🛡️ لا $mul إطلاقاً هنا (راجع الشرح الكامل أعلى المصفوفة) — قراءة خام (lean) + حساب
        // effective (المخزَّن ?? SETTINGS_OLD_DEFAULTS) + $set صريح لـeffective×SCALE فقط
        label: 'SystemSettings',
        apply: async () => {
            const raw = await SystemSettings.findOne({ singletonKey: 'main', redenominatedV1: { $ne: true } }).lean();
            if (!raw) return { matchedCount: 0, modifiedCount: 0 };
            const scaledSet = { redenominatedV1: true };
            for (const field of SETTINGS_SCALE_FIELDS) {
                const stored = raw[field];
                const effective = (stored !== null && stored !== undefined) ? stored : SETTINGS_OLD_DEFAULTS[field];
                scaledSet[field] = effective * SCALE;
            }
            return SystemSettings.updateMany(
                { singletonKey: 'main', redenominatedV1: { $ne: true } },
                { $set: scaledSet }
            );
        }
    }
];

async function sumField(target) {
    if (target.readEffective) return target.readEffective();
    const [agg] = await target.Model.aggregate([{ $match: target.filter }, { $group: { _id: null, total: { $sum: `$${target.field}` } } }]);
    return (agg && agg.total) || 0;
}

// ✅ تُقاس قبل أي كتابة (حتى بوضع !dryRun) — فلتر كل REPORT_FIELDS يتضمّن شرط "لم يُضخَّم بعد"،
// فهذي القيمة تُمثِّل بدقّة ما ستُضخِّمه هذي العملية بالذات. "بعد" لا تُقاس بإعادة استعلام لاحقة
// (ستُطابِق صفر مستند حتماً، فكل ما كان مشمولاً هنا صار معلَّماً true الآن) — هي ببساطة
// before×SCALE دوماً، بما أن التحديث الفعلي يضرب بالضبط هذي المستندات ذاتها لا غيرها
async function collectReportTotals() {
    const totals = {};
    for (const target of REPORT_FIELDS) {
        totals[target.label] = await sumField(target);
    }
    return totals;
}

// ✅ تُستدعى فقط حين !dryRun — كل سطر مشروط بعلمه الخاص فيستحيل أن يُضخَّم مستند مرتين حتى لو
// تعطّلت العملية بمنتصف هذي الحلقة بالضبط وأُعيد تشغيلها (المجموعات المكتملة تُطابَق صفر
// مستندات بإعادة التشغيل، والمجموعة التي تعطّلت بمنتصفها تُكمَل فقط مستنداتها غير المُعلَّمة)
async function applyCollectionScaling() {
    for (const scaler of COLLECTION_SCALERS) {
        await scaler.apply();
    }
}

// 🛡️ مراجعة إنتاج v2 (البند 1): تحقّق إيجابي صريح بعد تطبيق تضخيم SystemSettings — أي من
// هذي الحقول ≤ صفر يعني تضخيماً فاشلاً (أو إعداداً تالفاً سابقاً لم يُكتشَف). نُفجِّر خطأً هنا
// عمداً: JobRun تبقى 'running' (قابلة للاستئناف لاحقاً بعد تصحيح السبب)، ولا تُكمِل العملية
// لفتح الموقع بسعر/قاسم صفري خطير (هدايا مخصّصة مجانية، قسمة على صفر بدوري PK)
async function assertScaledSettingsPositive() {
    const settings = await SystemSettings.getSettings();
    const bad = SETTINGS_SCALE_FIELDS.filter(f => !((settings[f] || 0) > 0));
    if (bad.length > 0) {
        throw Object.assign(
            new Error(`فشل التحقّق بعد ترحيل الإعدادات — حقول ≤ صفر: ${bad.map(f => `${f}=${settings[f]}`).join(', ')}`),
            { code: 'SETTINGS_SANITY_FAILED', fields: bad }
        );
    }
}

// 🛡️ حارس إقلاع دائم (مراجعة إنتاج v2 — البند 1): يُستدعى من resolveMigrationStartup بصرف
// النظر عن اكتمال الترحيل من عدمه — إعداد قاسم مالي حقيقي ≤ صفر (حتى لو بتعديل يدوي خاطئ
// لاحق من لوحة الإدارة، لا الترحيل فقط) يعني قسمة-على-صفر حتمية بمنطق حيّ
async function assertMoneyDivisorsSane() {
    const settings = await SystemSettings.getSettings();
    const bad = MONEY_DIVISOR_FIELDS.filter(f => !((settings[f] || 0) > 0));
    return { ok: bad.length === 0, bad };
}

// ✅ تفتح محفظة كل مستخدم بدفتر الأستاذ من أرصدته القديمة — بداية نظيفة (قرار المالك): coins
// القديمة ×10 → coins_bonus (لا coins_paid)، قيمة الهدايا غير المستبدَلة → beans_p (لا
// beans_w)، لا افتتاح usd_cents إطلاقاً (oldBalanceUsd يُحفَظ بمعاملات القيود فقط للمرجعية)،
// زائداً تضخيم bonusXP وضبط علم walletRedenominatedV1 — كل ذلك بمعاملة Mongo واحدة لكل
// مستخدم، فإعادة تشغيل بعد تعطّل مستخدم ما لا تُكرِّر فتح محفظته أبداً
//
// 🛡️ ترتيب مطلوب صريحاً: applyCollectionScaling (بما فيها GiftLog.totalPrice) تُنفَّذ قبل
// استدعاء هذي الدالة بالكامل — فحين !dryRun، القيمة المقروءة هنا من GiftLog.totalPrice
// مُضخَّمة ×10 فعلاً، فلا نضربها مجدداً (كان هذا خطأ تضخيم مضاعف بنسخة سابقة قبل إعادة
// الترتيب). حين dryRun (لا تضخيم فعلي حدث بعد) نحسبها ×SCALE كمعاينة فقط
async function migrateOneUserWallet(user, { dryRun }) {
    const oldCoins = user.coins || 0;
    const oldBalanceUsd = user.balance || 0;

    const unredeemedAgg = await GiftLog.aggregate([
        { $match: { receiver: user._id, redeemed: false } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]);
    const unredeemedRead = (unredeemedAgg[0] && unredeemedAgg[0].total) || 0;
    // ✅ القيمة الأصلية قبل أي تضخيم (للتقرير فقط) — بوضع dryRun القيمة المقروءة هي الأصلية
    // بالفعل (لم يُضخَّم GiftLog بعد)، وبوضع التطبيق الحقيقي القيمة المقروءة ×10 فعلاً فنقسمها
    const unredeemedValueOriginal = dryRun ? unredeemedRead : unredeemedRead / SCALE;
    const beansPOpening = dryRun ? unredeemedRead * SCALE : unredeemedRead;

    const projected = {
        coinsBonusOpening: oldCoins * SCALE,
        beansPOpening
    };

    if (!dryRun) {
        const entries = [];
        if (projected.coinsBonusOpening !== 0) {
            entries.push({
                user: user._id, wallet: 'coins_bonus', delta: projected.coinsBonusOpening, type: 'opening_balance',
                refType: 'WalletRedenominationMigration', refId: user._id, idempotencyKey: `${JOB_NAME}:${user._id}:coins_bonus`,
                meta: { oldBalanceUsd }
            });
        }
        if (projected.beansPOpening !== 0) {
            entries.push({
                user: user._id, wallet: 'beans_p', delta: projected.beansPOpening, type: 'opening_balance',
                refType: 'WalletRedenominationMigration', refId: user._id, idempotencyKey: `${JOB_NAME}:${user._id}:beans_p`,
                meta: { oldBalanceUsd }
            });
        }

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                if (entries.length > 0) {
                    await walletService.post(entries, session);
                }
                if (unredeemedRead > 0) {
                    await GiftLog.updateMany(
                        { receiver: user._id, redeemed: false },
                        { $set: { redeemed: true } },
                        { session }
                    );
                }
                // ✅ نفس معاملة قيود الافتتاح بالضبط (طلب صريح) — علم الاستئناف وتضخيم bonusXP
                // يُضبَطان سويّاً مع فتح المحفظة، لا بخطوة لاحقة منفصلة يمكن أن تتعطّل بينهما
                await User.updateOne(
                    { _id: user._id },
                    { $mul: { 'supportMissions.bonusXP': SCALE }, $set: { walletRedenominatedV1: true } },
                    { session }
                );
            });
        } finally {
            await session.endSession();
        }
    }

    return { oldCoins, oldBalanceUsd, unredeemedValueOriginal, projected };
}

// ✅ dryRun: كل المستخدمين (معاينة شاملة). !dryRun: فقط من لم تُفتَح محفظته بعد — يمنع إعادة
// فتح محفظة مستخدم مكتملة فعلاً عند استئناف عملية تعطّلت بمنتصف قائمة المستخدمين. perUser
// يُجمَّع للتقرير فقط (أعلى 10 كوينز/رصيد قديم — راجع runMigration)
async function migrateAllUserWallets({ dryRun }) {
    const totals = { oldCoinsSum: 0, oldBalanceUsdSum: 0, unredeemedValueOriginalSum: 0, usersProcessed: 0, perUser: [] };
    const filter = dryRun ? {} : { walletRedenominatedV1: { $ne: true } };
    const cursor = User.find(filter).select('_id username coins balance walletRedenominatedV1').cursor();
    for (let user = await cursor.next(); user != null; user = await cursor.next()) {
        const result = await migrateOneUserWallet(user, { dryRun });
        totals.oldCoinsSum += result.oldCoins;
        totals.oldBalanceUsdSum += result.oldBalanceUsd;
        totals.unredeemedValueOriginalSum += result.unredeemedValueOriginal;
        totals.usersProcessed++;
        totals.perUser.push({ id: user._id, username: user.username, oldCoins: result.oldCoins, oldBalanceUsd: result.oldBalanceUsd });
    }
    return totals;
}

// ✅ إجماليات المحافظ الحيّة الحالية بكل الحسابات (تقرير فقط — بند "الإجماليات بعد الترحيل")
async function sumCurrentWalletTotals() {
    const [agg] = await User.aggregate([
        { $group: {
            _id: null,
            coins_paid: { $sum: '$walletCoinsPaid' },
            coins_bonus: { $sum: '$walletCoinsBonus' },
            beans_w: { $sum: '$walletBeansW' },
            beans_p: { $sum: '$walletBeansP' },
            usd_cents: { $sum: '$walletUsdCents' }
        } }
    ]);
    if (!agg) return { coins_paid: 0, coins_bonus: 0, beans_w: 0, beans_p: 0, usd_cents: 0 };
    const { _id, ...rest } = agg;
    return rest;
}

function buildReportRow(label, before, after, expectedRatio) {
    const expectedAfter = before * expectedRatio;
    return { label, before, after, expectedAfter, ok: after === expectedAfter };
}

function printReportTable(rows) {
    const lines = ['| القيمة | قبل | بعد | المتوقَّع | ✅/❌ |', '|---|---|---|---|---|'];
    for (const row of rows) {
        lines.push(`| ${row.label} | ${row.before} | ${row.after} | ${row.expectedAfter} | ${row.ok ? '✅' : '❌'} |`);
    }
    const table = lines.join('\n');
    console.log(table);
    return table;
}

function printWalletTotalsAfter(totals) {
    const lines = [
        'إجماليات المحافظ (بعد هذي العملية، أو المعاينة المُتوقَّعة):',
        `coins_paid=${totals.coins_paid} | coins_bonus=${totals.coins_bonus} | beans_w=${totals.beans_w} | beans_p=${totals.beans_p} | usd_cents=${totals.usd_cents}`
    ];
    const text = lines.join('\n');
    console.log(text);
    return text;
}

function printTopUsers(title, list, amountField) {
    const lines = [title, ...list.map((u, i) => `${i + 1}. ${u.username || '(بلا اسم)'} (${u.id}) — ${u[amountField]}`)];
    const text = lines.join('\n');
    console.log(text);
    return text;
}

// ✅ ادّعاء/استئناف JobRun — 'completed' فقط تعني تخطٍّ كامل. أي حالة أخرى (أو عدم وجود
// JobRun أصلاً) تعني استئناف: نواصل من حيث توقّفت العملية (كل تحديث لاحق مشروط بعلمه الخاص
// فلا يُعاد تضخيم ما سبق تضخيمه). الادّعاء الأولي نفسه يبقى ذرّياً عبر الفهرس الفريد
// (job, weekStart) — محاولتا ادّعاء متزامنتان تصطدمان بـE11000، والثانية تتحقق من حالة
// الأولى بدل افتراض شيء
async function claimOrResumeJobRun() {
    const existing = await JobRun.findOne({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START });
    if (existing) {
        return { alreadyCompleted: existing.status === 'completed' };
    }
    try {
        await JobRun.create({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START, status: 'running' });
        return { alreadyCompleted: false };
    } catch (err) {
        if (err.code === 11000) {
            const raced = await JobRun.findOne({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START });
            return { alreadyCompleted: !!(raced && raced.status === 'completed') };
        }
        throw err;
    }
}

// ✅ الدالة الوحيدة المُصدَّرة للاستدعاء الحقيقي — dryRun:true (الافتراضي) لا يكتب شيئاً إطلاقاً
// (لا ادّعاء JobRun حتى)، فيصحّ تشغيله عدة مرات للمعاينة بلا أي قلق. dryRun:false يُنفِّذ
// فعلياً، بعد الادّعاء/الاستئناف الناجح فقط، بترتيب: المجموعات (الأسعار/القيم) أولاً (ثم
// تحقّق إيجابي صريح على إعدادات النظام)، ثم محافظ المستخدمين، ثم تعليم JobRun 'completed'
// فقط بعد نجاح الكل
async function runMigration({ dryRun = true } = {}) {
    if (!dryRun) {
        const claim = await claimOrResumeJobRun();
        if (claim.alreadyCompleted) {
            console.log(`[WALLET REDENOMINATION] ${JOB_NAME} سبق تنفيذها واكتملت فعلاً — تخطٍّ كامل`);
            return { skipped: true, reason: 'already_applied' };
        }
    }

    const beforeReport = await collectReportTotals();

    if (!dryRun) {
        await applyCollectionScaling();
        await assertScaledSettingsPositive();
    }

    const walletTotals = await migrateAllUserWallets({ dryRun });

    // ✅ نفس الصيغة بوضعَي dryRun/apply معاً — before×SCALE دوماً، لا إعادة استعلام بعد الكتابة
    const reportRows = REPORT_FIELDS.map(t => buildReportRow(t.label, beforeReport[t.label], beforeReport[t.label] * SCALE, SCALE));

    const walletRows = [
        buildReportRow('User.coins (قبل) -> walletCoinsBonus افتتاحي', walletTotals.oldCoinsSum, walletTotals.oldCoinsSum * SCALE, SCALE),
        buildReportRow('هدايا غير مستبدَلة -> walletBeansP افتتاحي', walletTotals.unredeemedValueOriginalSum, walletTotals.unredeemedValueOriginalSum * SCALE, SCALE)
    ];
    // ℹ️ معلوماتي فقط (بداية نظيفة — طلب صريح): لا usd_cents يُفتَح إطلاقاً، فلا "بعد" حقيقي
    // لهذا السطر؛ يُعرَض فقط ليعرف المُشغِّل حجم الرصيد الدولاري القديم المحفوظ بالقيود مرجعاً
    const oldBalanceInfoRow = {
        label: 'User.balance (قديم — محفوظ بمعاملات القيود (meta.oldBalanceUsd) فقط، لا يُفتَح usd_cents)',
        before: walletTotals.oldBalanceUsdSum, after: 0, expectedAfter: 0, ok: true
    };

    const allRows = [...walletRows, oldBalanceInfoRow, ...reportRows];
    const table = printReportTable(allRows);

    // ✅ بند التقرير الإضافي (مراجعة إنتاج v2): إجماليات كل محفظة بعد العملية (أو معاينتها)،
    // وأعلى 10 مستخدمين بالكوينز القديمة وأعلى 10 بالرصيد الدولاري القديم — id+username+قيمة
    const currentWalletTotals = await sumCurrentWalletTotals();
    const walletTotalsAfter = dryRun
        ? {
            ...currentWalletTotals,
            coins_bonus: currentWalletTotals.coins_bonus + walletTotals.oldCoinsSum * SCALE,
            beans_p: currentWalletTotals.beans_p + walletTotals.unredeemedValueOriginalSum * SCALE
        }
        : currentWalletTotals;
    printWalletTotalsAfter(walletTotalsAfter);

    const topByOldCoins = [...walletTotals.perUser].sort((a, b) => b.oldCoins - a.oldCoins).slice(0, 10);
    const topByOldBalanceUsd = [...walletTotals.perUser].sort((a, b) => b.oldBalanceUsd - a.oldBalanceUsd).slice(0, 10);
    printTopUsers('أعلى 10 مستخدمين بالكوينز القديمة', topByOldCoins, 'oldCoins');
    printTopUsers('أعلى 10 مستخدمين بالرصيد الدولاري القديم', topByOldBalanceUsd, 'oldBalanceUsd');

    if (!dryRun) {
        await JobRun.updateOne({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START }, { $set: { status: 'completed' } });
    }

    return {
        skipped: false, dryRun, usersProcessed: walletTotals.usersProcessed,
        rows: allRows, allOk: allRows.every(r => r.ok), table,
        walletTotalsAfter, topByOldCoins, topByOldBalanceUsd
    };
}

// ✅ قراءة فقط (لا ادّعاء) — تُستخدَم بـresolveMigrationStartup للتحقّق أولاً من حالة الترحيل
// الحقيقية بصرف النظر عن WALLET_MIGRATION، كي "تُتجاهَل القيمة إن كان الترحيل مكتملاً فعلاً"
async function isMigrationCompleted() {
    const existing = await JobRun.findOne({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START });
    return !!(existing && existing.status === 'completed');
}

const WALLET_MIGRATION_OFF_MESSAGE = 'Wallet migration pending. Set WALLET_MIGRATION=dry to preview or =apply to run.';

// 🛡️ تحكّم المُشغِّل الصريح: الترحيل لا يُشغَّل تلقائياً عند أي إقلاع — فقط حين يطلب المُشغِّل
// ذلك عبر WALLET_MIGRATION=apply. تُستدعى هذي الدالة من server.js بدل استدعاء runMigration
// مباشرة؛ تُعيد {ready} التي يعتمد عليها server.js لتقرير ما إذا كانت بقية سلسلة الإقلاع
// (المهام الأخرى + migrationGate.markReady) تُكمِل أو يبقى الموقع بوضع الصيانة (503). القيمة
// تُتجاهَل تماماً إن كان الترحيل مكتملاً فعلاً — الفحص هنا أولاً وقبل أي قراءة لمتغيّر البيئة.
//
// 🛡️ مراجعة إنتاج v2 (البند 1): حارس دائم إضافي بعد كل ما سبق — assertMoneyDivisorsSane على
// الإعدادات الحيّة (coinsPerUsd/pkSupportLpDivisor)، بصرف النظر عن اكتمال الترحيل من عدمه.
// قاسم ≤ صفر (ترحيل فاشل لم يُكتشَف، أو تعديل يدوي خاطئ لاحق من لوحة الإدارة) يرفض فتح
// الموقع نهائياً حتى تُصحَّح الإعدادات يدوياً
async function resolveMigrationStartup({ env = process.env } = {}) {
    let mode;

    if (await isMigrationCompleted()) {
        mode = 'already_completed';
    } else {
        const requested = String(env.WALLET_MIGRATION || '').trim().toLowerCase();

        if (requested === 'apply') {
            await runMigration({ dryRun: false });
            mode = 'apply';
        } else if (requested === 'dry') {
            const result = await runMigration({ dryRun: true });
            console.log(`[WALLET REDENOMINATION] معاينة فقط (dry) — usersProcessed=${result.usersProcessed}, allOk=${result.allOk}. الموقع يبقى بوضع الصيانة حتى WALLET_MIGRATION=apply`);
            return { ready: false, mode: 'dry' };
        } else {
            console.log(`[WALLET REDENOMINATION] ${WALLET_MIGRATION_OFF_MESSAGE}`);
            return { ready: false, mode: 'off' };
        }
    }

    const divisorCheck = await assertMoneyDivisorsSane();
    if (!divisorCheck.ok) {
        console.log(`[WALLET REDENOMINATION] 🛑 رُفض فتح الموقع — قواسم مالية غير صالحة (≤0): ${divisorCheck.bad.join(', ')}`);
        return { ready: false, mode, divisorCheckFailed: true, bad: divisorCheck.bad };
    }

    return { ready: true, mode };
}

module.exports = {
    runMigration, resolveMigrationStartup, isMigrationCompleted, WALLET_MIGRATION_OFF_MESSAGE,
    assertScaledSettingsPositive, assertMoneyDivisorsSane,
    JOB_NAME, SENTINEL_WEEK_START, SCALE, REPORT_FIELDS, COLLECTION_SCALERS,
    SETTINGS_OLD_DEFAULTS, SETTINGS_SCALE_FIELDS, MONEY_DIVISOR_FIELDS
};
