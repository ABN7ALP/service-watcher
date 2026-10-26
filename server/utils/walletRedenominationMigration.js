// ملف: server/utils/walletRedenominationMigration.js
// =====================================================
// 🛡️ إعادة تسمية العملة ×10 (feat/wallet-ledger-v1): $1 = 1000 كوينز بدل 100 (coinsPerUsd
// الجديدة بـSystemSettings) — نفس القيمة الحقيقية بالدولار بالضبط، أرقام أكبر فقط. تُنفَّذ
// مرة واحدة فقط عند إقلاع السيرفر (server.js)، قبل فتح المنفذ للترافيك العادي بالكامل
// (راجع migrationGate.js/server.js — 503 صيانة لأي طلب حتى تكتمل).
//
// 🛡️ آمنة للتعطّل والاستئناف (مراجعة ما قبل الدمج — 6 عوائق): JobRun تنتقل status
// 'running' -> 'completed'؛ فقط 'completed' تعني تخطٍّ كامل، أي حالة أخرى (أو عدم وجود JobRun
// أصلاً) تُستأنَف. كل قيمة/سعر مخزَّن يحمل علم redenominatedV1 خاصاً به (وكل مستخدم يحمل
// walletRedenominatedV1)، فكل تحديث هو $mul+$set مشروط بـ{redenominatedV1:{$ne:true}} —
// إعادة التشغيل (كاملة أو بعد تعطّل جزئي بمنتصف أي مجموعة/مستخدم) لا يمكن أن تُضخِّم قيمة
// مرتين إطلاقاً، بصرف النظر عن أين تعطّلت العملية بالضبط. الترتيب: المجموعات (الأسعار/القيم
// المخزَّنة) أولاً، ثم محافظ المستخدمين — الترافيك مقطوع بالكامل خلال العملية فلا تضارب تسعير.
//
// الجرد الكامل لكل قيمة/صيغة مقوَّمة بالكوينز (مطلوب صريحاً بوصف المهمة):
//   - أرصدة المستخدمين: User.coins → تُصبح افتتاح محفظة coins_paid (×10) عبر دفتر الأستاذ.
//     User.balance (دولار — لا يُضخَّم) → يُصبح افتتاح محفظة usd_cents (تحويل سنتات فقط).
//     قيمة الهدايا غير المستبدلة (GiftLog.redeemed:false) → افتتاح محفظة beans_w (×10)،
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
//     pkMinSupportCoins، customGiftDesignFeeCoins، customGiftSendPriceCoins.
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

// ✅ للعرض فقط (جدول dry-run/apply قبل/بعد) — إجماليات حقل بحقل، مستقلة تماماً عن شكل كتابة
// التحديث الفعلي أدناه. لا تُستخدَم لأي قرار كتابة إطلاقاً.
//
// 🛡️ كل فلتر هنا يحمل أيضاً شرط "لم يُضخَّم بعد" (نفس علم مسار الكتابة) — ليس لمنع كتابة
// (هذي القوائم لا تكتب شيئاً)، بل لأن "قبل" يجب أن يقيس فقط ما سيُضخَّم فعلياً بهذي العملية
// بالذات. بدونه، استئناف عملية تعطّلت بمنتصفها يُحسَب "قبل" على مزيج من مستندات ضُخِّمت فعلاً
// بمحاولة سابقة ومستندات لم تُضخَّم بعد، فيظهر allOk:false زائفاً رغم أن كل قيمة صحيحة ×10
// بالضبط فعلياً (راجع التحقّق الحقيقي بسكربت المحاكاة — القيم نفسها سليمة، الجدول فقط كان مضلِّلاً)
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
    { label: 'SystemSettings.coinExchangeRate', Model: SystemSettings, filter: unscaled({ singletonKey: 'main' }), field: 'coinExchangeRate' },
    { label: 'SystemSettings.pkSupportLpDivisor', Model: SystemSettings, filter: unscaled({ singletonKey: 'main' }), field: 'pkSupportLpDivisor' },
    { label: 'SystemSettings.pkMinSupportCoins', Model: SystemSettings, filter: unscaled({ singletonKey: 'main' }), field: 'pkMinSupportCoins' },
    { label: 'SystemSettings.customGiftDesignFeeCoins', Model: SystemSettings, filter: unscaled({ singletonKey: 'main' }), field: 'customGiftDesignFeeCoins' },
    { label: 'SystemSettings.customGiftSendPriceCoins', Model: SystemSettings, filter: unscaled({ singletonKey: 'main' }), field: 'customGiftSendPriceCoins' }
];

// ✅ مسار الكتابة الفعلي — مُجمَّع حسب المجموعة (مستند واحد بكل حقوله المُضخَّمة بتحديث واحد)،
// كل تحديث مشروط بعلم redenominatedV1 الخاص بالمستند («{...filter, redenominatedV1:{$ne:true}}
// -> {$mul:{...}, $set:{redenominatedV1:true}}» — إعادة التشغيل لا يمكن أن تُضخِّم مستنداً
// مرتين). الحقول الشرطية (قد تكون null، أو تُضخَّم فقط بحالة معيّنة) تستخدم صيغة تحديث
// aggregation-pipeline (مصفوفة $set بدل كائن $mul) لتفادي $mul على null وللبقاء بتحديث واحد
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
        label: 'SystemSettings',
        apply: () => SystemSettings.updateMany(
            { singletonKey: 'main', redenominatedV1: { $ne: true } },
            {
                $mul: {
                    coinExchangeRate: SCALE, pkSupportLpDivisor: SCALE, pkMinSupportCoins: SCALE,
                    customGiftDesignFeeCoins: SCALE, customGiftSendPriceCoins: SCALE
                },
                $set: { redenominatedV1: true }
            }
        )
    }
];

async function sumField(Model, filter, field) {
    const [agg] = await Model.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: `$${field}` } } }]);
    return (agg && agg.total) || 0;
}

// ✅ تُقاس قبل أي كتابة (حتى بوضع !dryRun) — فلتر كل REPORT_FIELDS يتضمّن شرط "لم يُضخَّم بعد"،
// فهذي القيمة تُمثِّل بدقّة ما ستُضخِّمه هذي العملية بالذات. "بعد" لا تُقاس بإعادة استعلام لاحقة
// (ستُطابِق صفر مستند حتماً، فكل ما كان مشمولاً هنا صار معلَّماً true الآن) — هي ببساطة
// before×SCALE دوماً، بما أن التحديث الفعلي يضرب بالضبط هذي المستندات ذاتها لا غيرها
async function collectReportTotals() {
    const totals = {};
    for (const target of REPORT_FIELDS) {
        totals[target.label] = await sumField(target.Model, target.filter, target.field);
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

// ✅ تفتح محفظة كل مستخدم بدفتر الأستاذ من أرصدته القديمة — ثلاث قيود افتتاحية محتملة لكل
// مستخدم (coins_paid من coins القديمة ×10، usd_cents من balance الدولارية الحقيقية بلا أي
// تضخيم، beans_w من قيمة هداياه غير المستبدَلة)، زائداً تضخيم bonusXP وضبط علم
// walletRedenominatedV1 — كل ذلك بمعاملة Mongo واحدة لكل مستخدم (لا معاملة ضخمة لكل
// المستخدمين معاً)، فإعادة تشغيل بعد تعطّل مستخدم ما لا تُكرِّر فتح محفظته أبداً
//
// 🛡️ ترتيب مطلوب صريحاً: applyCollectionScaling (بما فيها GiftLog.totalPrice) تُنفَّذ قبل
// استدعاء هذي الدالة بالكامل — فحين !dryRun، القيمة المقروءة هنا من GiftLog.totalPrice
// مُضخَّمة ×10 فعلاً، فلا نضربها مجدداً (كان هذا خطأ تضخيم مضاعف بالنسخة السابقة قبل
// إعادة الترتيب). حين dryRun (لا تضخيم فعلي حدث بعد) نحسبها ×SCALE كمعاينة فقط
async function migrateOneUserWallet(user, { dryRun }) {
    const oldCoins = user.coins || 0;
    const oldBalanceCents = Math.round((user.balance || 0) * 100);

    const unredeemedAgg = await GiftLog.aggregate([
        { $match: { receiver: user._id, redeemed: false } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]);
    const unredeemedRead = (unredeemedAgg[0] && unredeemedAgg[0].total) || 0;
    // ✅ القيمة الأصلية قبل أي تضخيم (للتقرير فقط) — بوضع dryRun القيمة المقروءة هي الأصلية
    // بالفعل (لم يُضخَّم GiftLog بعد)، وبوضع التطبيق الحقيقي القيمة المقروءة ×10 فعلاً فنقسمها
    const unredeemedValueOriginal = dryRun ? unredeemedRead : unredeemedRead / SCALE;
    const beansWOpening = dryRun ? unredeemedRead * SCALE : unredeemedRead;

    const projected = {
        coinsPaidOpening: oldCoins * SCALE,
        usdCentsOpening: oldBalanceCents,
        beansWOpening
    };

    if (!dryRun) {
        const entries = [];
        if (projected.coinsPaidOpening !== 0) {
            entries.push({
                user: user._id, wallet: 'coins_paid', delta: projected.coinsPaidOpening, type: 'opening_balance',
                refType: 'WalletRedenominationMigration', refId: user._id, idempotencyKey: `${JOB_NAME}:${user._id}:coins_paid`
            });
        }
        if (projected.usdCentsOpening !== 0) {
            entries.push({
                user: user._id, wallet: 'usd_cents', delta: projected.usdCentsOpening, type: 'opening_balance',
                refType: 'WalletRedenominationMigration', refId: user._id, idempotencyKey: `${JOB_NAME}:${user._id}:usd_cents`
            });
        }
        if (projected.beansWOpening !== 0) {
            entries.push({
                user: user._id, wallet: 'beans_w', delta: projected.beansWOpening, type: 'opening_balance',
                refType: 'WalletRedenominationMigration', refId: user._id, idempotencyKey: `${JOB_NAME}:${user._id}:beans_w`
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

    return { oldCoins, oldBalanceCents, unredeemedValueOriginal, projected };
}

// ✅ dryRun: كل المستخدمين (معاينة شاملة). !dryRun: فقط من لم تُفتَح محفظته بعد — يمنع إعادة
// فتح محفظة مستخدم مكتملة فعلاً عند استئناف عملية تعطّلت بمنتصف قائمة المستخدمين
async function migrateAllUserWallets({ dryRun }) {
    const totals = { oldCoinsSum: 0, oldBalanceCentsSum: 0, unredeemedValueOriginalSum: 0, usersProcessed: 0 };
    const filter = dryRun ? {} : { walletRedenominatedV1: { $ne: true } };
    const cursor = User.find(filter).select('_id coins balance walletRedenominatedV1').cursor();
    for (let user = await cursor.next(); user != null; user = await cursor.next()) {
        const result = await migrateOneUserWallet(user, { dryRun });
        totals.oldCoinsSum += result.oldCoins;
        totals.oldBalanceCentsSum += result.oldBalanceCents;
        totals.unredeemedValueOriginalSum += result.unredeemedValueOriginal;
        totals.usersProcessed++;
    }
    return totals;
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
// فعلياً، بعد الادّعاء/الاستئناف الناجح فقط، بترتيب: المجموعات (الأسعار/القيم) أولاً، ثم
// محافظ المستخدمين، ثم تعليم JobRun 'completed' فقط بعد نجاح الكل
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
    }

    const walletTotals = await migrateAllUserWallets({ dryRun });

    // ✅ نفس الصيغة بوضعَي dryRun/apply معاً (راجع تعليق collectReportTotals) — before×SCALE
    // دوماً، لا إعادة استعلام بعد الكتابة (ستُطابِق صفر مستند حتماً بسبب علم "مكتمل" الجديد)
    const reportRows = REPORT_FIELDS.map(t => buildReportRow(t.label, beforeReport[t.label], beforeReport[t.label] * SCALE, SCALE));

    const walletRows = [
        buildReportRow('User.coins (قبل) -> walletCoinsPaid افتتاحي', walletTotals.oldCoinsSum, walletTotals.oldCoinsSum * SCALE, SCALE),
        buildReportRow('User.balance (سنتات، بلا تضخيم) -> walletUsdCents افتتاحي', walletTotals.oldBalanceCentsSum, walletTotals.oldBalanceCentsSum, 1),
        buildReportRow('هدايا غير مستبدَلة -> walletBeansW افتتاحي', walletTotals.unredeemedValueOriginalSum, walletTotals.unredeemedValueOriginalSum * SCALE, SCALE)
    ];

    const allRows = [...walletRows, ...reportRows];
    const table = printReportTable(allRows);

    if (!dryRun) {
        await JobRun.updateOne({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START }, { $set: { status: 'completed' } });
    }

    return {
        skipped: false, dryRun, usersProcessed: walletTotals.usersProcessed,
        rows: allRows, allOk: allRows.every(r => r.ok), table
    };
}

module.exports = { runMigration, JOB_NAME, SENTINEL_WEEK_START, SCALE, REPORT_FIELDS, COLLECTION_SCALERS };
