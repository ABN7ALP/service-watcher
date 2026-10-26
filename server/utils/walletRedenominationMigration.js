// ملف: server/utils/walletRedenominationMigration.js
// =====================================================
// 🛡️ إعادة تسمية العملة ×10 (feat/wallet-ledger-v1): $1 = 1000 كوينز بدل 100 (coinsPerUsd
// الجديدة بـSystemSettings) — نفس القيمة الحقيقية بالدولار بالضبط، أرقام أكبر فقط. تُنفَّذ
// مرة واحدة فقط عند إقلاع السيرفر (server.js)، بادّعاء ذرّي عبر JobRun (نفس آلية
// fanClubWeeklyFrameJob، بـweekStart رمزي ثابت بدل أسبوعي حقيقي — هذي مهمة "مرّة واحدة للأبد"
// لا دورية). مضمونة التكرار بأمان (idempotent) على مستويين مستقلّين:
//   1) JobRun نفسها — محاولة ادّعاء ثانية تصطدم بفهرسها الفريد (E11000) فتتوقف فوراً بلا أي عمل.
//   2) حتى لو تجوهر الادّعاء بطريقة ما: entries المحافظ تمر عبر walletService.post بمفاتيح
//      idempotencyKey ثابتة لكل (مستخدم، محفظة) — إعادة تطبيقها مرتين لا تُكرِّر الإيداع.
//      الحقول الأخرى ($mul المباشر) محمية فقط بادّعاء JobRun (البند 1) — لا تشغيل مزدوج آمن
//      لها بذاتها، فالادّعاء الذرّي هو خط الدفاع الحقيقي الوحيد لها.
//
// الجرد الكامل لكل قيمة/صيغة مقوَّمة بالكوينز (مطلوب صريحاً بوصف المهمة):
//   - أرصدة المستخدمين: User.coins → تُصبح افتتاح محفظة coins_paid (×10) عبر دفتر الأستاذ.
//     User.balance (دولار — لا يُضخَّم) → يُصبح افتتاح محفظة usd_cents (تحويل سنتات فقط).
//     قيمة الهدايا غير المستبدلة (GiftLog.redeemed:false) → افتتاح محفظة beans_w (×10)،
//     ثم تُعلَّم تلك السجلات redeemed:true (قيمتها انتقلت فعلاً لدفتر الأستاذ).
//   - أسعار الكتالوج المخزَّنة: Gift.price/discountedPrice، ProfileFrame.prices.day1/3/7،
//     ChatBubbleSkin.price، CustomGift.createCost/sendPrice.
//   - سجلّات تاريخية: GiftLog.unitPrice/totalPrice، CoinPurchase.coinsAmount،
//     GiftRedemption.originalCoinsValue (دوماً)، GiftRedemption.finalAmount (فقط
//     redeemedTo:'coins' — حالة 'balance' دولار، لا تُضخَّم)، FanClubMembership.points.
//   - تراكمات الغرف/الدوري: VoiceRoom.supportPoints/sessionSupportPoints،
//     PkStanding.supportCoins.
//   - مهام الدعم اليومية المتراكمة: User.supportMissions.bonusXP.
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

// ✅ كل قيمة مخزَّنة مقوَّمة بالكوينز (غير أرصدة المستخدمين، التي لها معالجتها الخاصة أدناه
// بسبب حاجتها لقيود دفتر أستاذ لا $mul مباشر) — تُستخدَم القائمة نفسها لحساب الإجماليات
// قبل/بعد (dry-run) وللتطبيق الفعلي (apply)، فيستحيل أن ينحرف أحدهما عن الآخر
const SIMPLE_SCALE_TARGETS = [
    { label: 'Gift.price', Model: Gift, filter: {}, field: 'price' },
    { label: 'Gift.discountedPrice', Model: Gift, filter: { discountedPrice: { $ne: null } }, field: 'discountedPrice' },
    { label: 'ProfileFrame.prices.day1', Model: ProfileFrame, filter: {}, field: 'prices.day1' },
    { label: 'ProfileFrame.prices.day3', Model: ProfileFrame, filter: {}, field: 'prices.day3' },
    { label: 'ProfileFrame.prices.day7', Model: ProfileFrame, filter: {}, field: 'prices.day7' },
    { label: 'ChatBubbleSkin.price', Model: ChatBubbleSkin, filter: {}, field: 'price' },
    { label: 'CustomGift.createCost', Model: CustomGift, filter: {}, field: 'createCost' },
    { label: 'CustomGift.sendPrice', Model: CustomGift, filter: {}, field: 'sendPrice' },
    { label: 'GiftLog.unitPrice', Model: GiftLog, filter: {}, field: 'unitPrice' },
    { label: 'GiftLog.totalPrice', Model: GiftLog, filter: {}, field: 'totalPrice' },
    { label: 'CoinPurchase.coinsAmount', Model: CoinPurchase, filter: {}, field: 'coinsAmount' },
    { label: 'GiftRedemption.originalCoinsValue', Model: GiftRedemption, filter: {}, field: 'originalCoinsValue' },
    { label: "GiftRedemption.finalAmount(redeemedTo='coins')", Model: GiftRedemption, filter: { redeemedTo: 'coins' }, field: 'finalAmount' },
    { label: 'FanClubMembership.points', Model: FanClubMembership, filter: {}, field: 'points' },
    { label: 'VoiceRoom.supportPoints', Model: VoiceRoom, filter: {}, field: 'supportPoints' },
    { label: 'VoiceRoom.sessionSupportPoints', Model: VoiceRoom, filter: {}, field: 'sessionSupportPoints' },
    { label: 'PkStanding.supportCoins', Model: PkStanding, filter: {}, field: 'supportCoins' },
    { label: 'User.supportMissions.bonusXP', Model: User, filter: { 'supportMissions.bonusXP': { $ne: 0 } }, field: 'supportMissions.bonusXP' },
    { label: 'SystemSettings.coinExchangeRate', Model: SystemSettings, filter: { singletonKey: 'main' }, field: 'coinExchangeRate' },
    { label: 'SystemSettings.pkSupportLpDivisor', Model: SystemSettings, filter: { singletonKey: 'main' }, field: 'pkSupportLpDivisor' },
    { label: 'SystemSettings.pkMinSupportCoins', Model: SystemSettings, filter: { singletonKey: 'main' }, field: 'pkMinSupportCoins' },
    { label: 'SystemSettings.customGiftDesignFeeCoins', Model: SystemSettings, filter: { singletonKey: 'main' }, field: 'customGiftDesignFeeCoins' },
    { label: 'SystemSettings.customGiftSendPriceCoins', Model: SystemSettings, filter: { singletonKey: 'main' }, field: 'customGiftSendPriceCoins' }
];

async function sumField(Model, filter, field) {
    const [agg] = await Model.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: `$${field}` } } }]);
    return (agg && agg.total) || 0;
}

async function collectSimpleTotals() {
    const totals = {};
    for (const target of SIMPLE_SCALE_TARGETS) {
        totals[target.label] = await sumField(target.Model, target.filter, target.field);
    }
    return totals;
}

async function applySimpleScaling() {
    for (const target of SIMPLE_SCALE_TARGETS) {
        await target.Model.updateMany(target.filter, { $mul: { [target.field]: SCALE } });
    }
}

// ✅ تفتح محفظة كل مستخدم بدفتر الأستاذ من أرصدته القديمة — ثلاث قيود افتتاحية محتملة لكل
// مستخدم (coins_paid من coins القديمة ×10، usd_cents من balance الدولارية الحقيقية بلا أي
// تضخيم، beans_w من قيمة هداياه غير المستبدَلة بعد ×10)، كل مستخدم بمعاملة Mongo مستقلة خاصة
// به (لا معاملة واحدة ضخمة لكل المستخدمين معاً — غير عملية وغير ضرورية لذرّية المستخدم الواحد)
async function migrateOneUserWallet(user, { dryRun }) {
    const oldCoins = user.coins || 0;
    const oldBalanceCents = Math.round((user.balance || 0) * 100);

    const unredeemedAgg = await GiftLog.aggregate([
        { $match: { receiver: user._id, redeemed: false } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]);
    const unredeemedValue = (unredeemedAgg[0] && unredeemedAgg[0].total) || 0;

    const projected = {
        coinsPaidOpening: oldCoins * SCALE,
        usdCentsOpening: oldBalanceCents,
        beansWOpening: unredeemedValue * SCALE
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

        if (entries.length > 0) {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    await walletService.post(entries, session);
                    if (unredeemedValue > 0) {
                        await GiftLog.updateMany(
                            { receiver: user._id, redeemed: false },
                            { $set: { redeemed: true } },
                            { session }
                        );
                    }
                });
            } finally {
                await session.endSession();
            }
        }
    }

    return { oldCoins, oldBalanceCents, unredeemedValue, projected };
}

async function migrateAllUserWallets({ dryRun }) {
    const totals = { oldCoinsSum: 0, oldBalanceCentsSum: 0, unredeemedValueSum: 0, usersProcessed: 0 };
    const cursor = User.find({}).select('_id coins balance').cursor();
    for (let user = await cursor.next(); user != null; user = await cursor.next()) {
        const result = await migrateOneUserWallet(user, { dryRun });
        totals.oldCoinsSum += result.oldCoins;
        totals.oldBalanceCentsSum += result.oldBalanceCents;
        totals.unredeemedValueSum += result.unredeemedValue;
        totals.usersProcessed++;
    }
    return totals;
}

function buildReportRow(label, before, after, expectedRatio) {
    const expectedAfter = before * expectedRatio;
    return { label, before, after, expectedAfter, ok: after === expectedAfter };
}

async function buildSimpleScalingReport(before) {
    const after = {};
    for (const target of SIMPLE_SCALE_TARGETS) {
        after[target.label] = await sumField(target.Model, target.filter, target.field);
    }
    return SIMPLE_SCALE_TARGETS.map(t => buildReportRow(t.label, before[t.label], after[t.label], SCALE));
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

// ✅ الدالة الوحيدة المُصدَّرة للاستدعاء الحقيقي — dryRun:true (الافتراضي) لا يكتب شيئاً إطلاقاً
// (لا ادّعاء JobRun حتى)، فيصحّ تشغيله عدة مرات للمعاينة بلا أي قلق. dryRun:false يُنفِّذ
// فعلياً، بعد الادّعاء الذرّي الناجح فقط
async function runMigration({ dryRun = true } = {}) {
    if (!dryRun) {
        try {
            await JobRun.create({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START });
        } catch (err) {
            if (err.code === 11000) {
                console.log(`[WALLET REDENOMINATION] ${JOB_NAME} سبق تنفيذها فعلاً — تخطٍّ كامل`);
                return { skipped: true, reason: 'already_applied' };
            }
            throw err;
        }
    }

    const beforeSimple = await collectSimpleTotals();
    const walletTotals = await migrateAllUserWallets({ dryRun });

    let simpleRows;
    if (dryRun) {
        simpleRows = SIMPLE_SCALE_TARGETS.map(t => buildReportRow(t.label, beforeSimple[t.label], beforeSimple[t.label] * SCALE, SCALE));
    } else {
        await applySimpleScaling();
        simpleRows = await buildSimpleScalingReport(beforeSimple);
    }

    const walletRows = [
        buildReportRow('User.coins (قبل) -> walletCoinsPaid افتتاحي', walletTotals.oldCoinsSum, walletTotals.oldCoinsSum * SCALE, SCALE),
        buildReportRow('User.balance (سنتات، بلا تضخيم) -> walletUsdCents افتتاحي', walletTotals.oldBalanceCentsSum, walletTotals.oldBalanceCentsSum, 1),
        buildReportRow('هدايا غير مستبدَلة -> walletBeansW افتتاحي', walletTotals.unredeemedValueSum, walletTotals.unredeemedValueSum * SCALE, SCALE)
    ];

    const allRows = [...walletRows, ...simpleRows];
    const table = printReportTable(allRows);

    return {
        skipped: false, dryRun, usersProcessed: walletTotals.usersProcessed,
        rows: allRows, allOk: allRows.every(r => r.ok), table
    };
}

module.exports = { runMigration, JOB_NAME, SENTINEL_WEEK_START, SCALE, SIMPLE_SCALE_TARGETS };
