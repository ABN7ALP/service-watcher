const mongoose = require('mongoose');
const LedgerEntry = require('../models/LedgerEntry');
const GiftRedemption = require('../models/GiftRedemption');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');
const walletService = require('../utils/walletService');

// ✅ دفتر الأستاذ (feat/wallet-ledger-v1): الهدايا تُضيف قيمتها فوراً كـbeans عند الاستلام
// (راجع buildGiftWalletEntries بـgiftController.js) — لا "هدايا غير مستبدلة" مُجمَّعة بانتظار
// هذي الشاشة بعد الآن. الاستبدال هنا يحوّل أرصدة البينز الحالية: كاملها (beans_w+beans_p) إلى
// كوينز 1:1 بلا أي حسم ولا فترة انتظار، أو الجزء المؤهَّل فقط من beans_w (الأقدم من
// beanHoldHours) إلى دولار حسب نسبة الدفع الحالية — beans_p الترويجية لا تصل للدولار أبداً.
// العقد الخارجي (المسارات/الحقول) يبقى كما كان بالضبط (summary + redeem بـredeemTo:'balance'|
// 'coins') كي يستمر عمل الواجهة الحالية بلا أي تعديل بها — "بلا واجهة محفظة جديدة بهذي المرحلة"

// ✅ يُعيد بناء "طابور" أرصدة beans_w بترتيب الاستلام (FIFO محاسبي صِرف) من سجلّ قيود دفتر
// الأستاذ نفسه — خصم سابق (استبدال أو غيره) يستهلك الأقدم أولاً، تماماً كمحاسبة نقدية حقيقية.
// المتبقي بالطابور بعد هذا الاستهلاك هو ما يُعرَّف عمره الحقيقي؛ الجزء الأقدم من beanHoldHours
// منه فقط هو المؤهَّل للتحويل لدولار — راجع التعليق أعلى الملف لسبب عدم وجود عدّاد/مؤشر مبسَّط
// TODO(scale): تُحمَّل كل قيود beans_w لهذا المستخدم من البداية بكل استدعاء — عند نمو حجم
// القاعدة ضع لقطات (snapshots) دورية للطابور المُستهلَك بدل إعادة بنائه من الصفر كل مرة
async function getEligibleBeansWForUsd(userId, holdHours, session) {
    const entries = await LedgerEntry.find({ user: userId, wallet: 'beans_w' })
        .sort({ createdAt: 1, _id: 1 })
        .session(session)
        .lean();

    const queue = [];
    for (const entry of entries) {
        if (entry.delta > 0) {
            queue.push({ amount: entry.delta, createdAt: entry.createdAt });
        } else if (entry.delta < 0) {
            let remaining = -entry.delta;
            while (remaining > 0 && queue.length > 0) {
                const head = queue[0];
                if (head.amount <= remaining) {
                    remaining -= head.amount;
                    queue.shift();
                } else {
                    head.amount -= remaining;
                    remaining = 0;
                }
            }
        }
    }

    const cutoff = Date.now() - holdHours * 60 * 60 * 1000;
    let eligible = 0;
    for (const entry of queue) {
        if (entry.createdAt.getTime() <= cutoff) eligible += entry.amount;
    }
    return eligible;
}

// ✅ مراجعة ما قبل الدمج v2 (البند 3): عرض الإطلاق (payoutLaunchPct) يُطبَّق فقط بين
// payoutLaunchStartsAt وpayoutLaunchEndsAt معاً — قبل بدء العرض (أو إن لم يبدأ أصلاً،
// payoutLaunchStartsAt=null بالافتراضي) تُطبَّق basePct/highPct العادية، بصرف النظر عن أن
// endsAt قد تكون بالمستقبل. سابقاً كانت endsAt وحدها كافية فتُفعِّل العرض تلقائياً حتى قبل
// أي قرار إداري صريح ببدئه
function currentPayoutRatePercent(settings, hostLevel) {
    const now = new Date();
    const launchStarted = settings.payoutLaunchStartsAt && now >= settings.payoutLaunchStartsAt;
    const launchStillOpen = settings.payoutLaunchEndsAt && now < settings.payoutLaunchEndsAt;
    if (launchStarted && launchStillOpen) {
        return settings.payoutLaunchPct;
    }
    return (hostLevel || 0) >= settings.highHostLevel ? settings.payoutHighPct : settings.payoutBasePct;
}

exports.getRedeemableGifts = async (req, res) => {
    try {
        const userId = req.user.id;
        const settings = await SystemSettings.getSettings();

        const user = await User.findById(userId).select('walletBeansW walletBeansP level');
        const coinsIfRedeemed = user.walletBeansW + user.walletBeansP;

        const eligibleForUsd = await getEligibleBeansWForUsd(userId, settings.beanHoldHours, null);
        const ratePercent = currentPayoutRatePercent(settings, user.level);
        const usdIfRedeemed = (eligibleForUsd * ratePercent) / 100 / settings.coinsPerUsd;

        const history = await GiftRedemption.find({ user: userId }).sort('-createdAt').limit(20);

        res.status(200).json({
            status: 'success',
            data: {
                // ✅ "عدد الهدايا" لا معنى حقيقي له بعد الآن (البينز أرصدة مجمَّعة، لا عناصر منفصلة) —
                // يبقى هنا فقط كمؤشر "يوجد/لا يوجد" كي تستمر واجهة العرض الحالية (التي تتحقق من
                // totalGiftsCount > 0) بالعمل بلا أي تعديل بها
                totalGiftsCount: coinsIfRedeemed > 0 ? 1 : 0,
                totalCoinsValue: coinsIfRedeemed,
                usdIfRedeemed: parseFloat(usdIfRedeemed.toFixed(2)),
                coinsIfRedeemed,
                redemptionRatePercent: ratePercent,
                history
            }
        });
    } catch (error) {
        console.error('[ERROR] in getRedeemableGifts:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.redeemGifts = async (req, res) => {
    try {
        const userId = req.user.id;
        const { redeemTo } = req.body;
        if (!['balance', 'coins'].includes(redeemTo)) {
            return res.status(400).json({ status: 'fail', message: 'وجهة استبدال غير صالحة' });
        }

        const settings = await SystemSettings.getSettings();
        const idemBase = new mongoose.Types.ObjectId();
        const session = await mongoose.startSession();
        let finalAmount = null;
        let originalBeans = null;
        let user = null;
        let ratePercent = null;
        let txError = null;
        try {
            await session.withTransaction(async () => {
                if (redeemTo === 'coins') {
                    // ✅ بونص+خاص معاً، 1:1 بلا حسم ولا انتظار — تحويل داخلي صِرف، لا نقد حقيقي يغادر
                    const fresh = await User.findById(userId).select('walletBeansW walletBeansP').session(session);
                    finalAmount = fresh.walletBeansW + fresh.walletBeansP;
                    originalBeans = finalAmount;
                    if (finalAmount <= 0) {
                        throw Object.assign(new Error('لا توجد بينز قابلة للاستبدال حالياً'), { code: 'NOTHING_TO_REDEEM' });
                    }
                    const entries = [];
                    if (fresh.walletBeansW > 0) entries.push({ user: userId, wallet: 'beans_w', delta: -fresh.walletBeansW, type: 'redeem', refType: 'GiftRedemption', refId: idemBase, idempotencyKey: `${idemBase}:w` });
                    if (fresh.walletBeansP > 0) entries.push({ user: userId, wallet: 'beans_p', delta: -fresh.walletBeansP, type: 'redeem', refType: 'GiftRedemption', refId: idemBase, idempotencyKey: `${idemBase}:p` });
                    entries.push({ user: userId, wallet: 'coins_bonus', delta: finalAmount, type: 'redeem', refType: 'GiftRedemption', refId: idemBase, idempotencyKey: `${idemBase}:credit` });
                    await walletService.post(entries, session);
                } else {
                    // ✅ beans_w المؤهَّلة فقط (أقدم من beanHoldHours) → دولار حسب نسبة الدفع الحالية
                    const hostLevel = (await User.findById(userId).select('level').session(session)).level;
                    ratePercent = currentPayoutRatePercent(settings, hostLevel);
                    const eligible = await getEligibleBeansWForUsd(userId, settings.beanHoldHours, session);
                    if (eligible <= 0) {
                        throw Object.assign(new Error(`لا يوجد رصيد بينز مؤهَّل للسحب النقدي بعد — يجب أن يمضي ${settings.beanHoldHours} ساعة على استلامه أولاً`), { code: 'NOTHING_ELIGIBLE' });
                    }
                    const usdCents = Math.floor((eligible * ratePercent) / 100 / settings.coinsPerUsd * 100);
                    finalAmount = Math.round(usdCents) / 100;
                    originalBeans = eligible;
                    const entries = [
                        { user: userId, wallet: 'beans_w', delta: -eligible, type: 'redeem', refType: 'GiftRedemption', refId: idemBase, idempotencyKey: `${idemBase}:debit`, meta: { ratePercent } },
                        { user: userId, wallet: 'usd_cents', delta: usdCents, type: 'redeem', refType: 'GiftRedemption', refId: idemBase, idempotencyKey: `${idemBase}:credit`, meta: { ratePercent } }
                    ];
                    await walletService.post(entries, session);
                }

                user = await User.findById(userId).select('coins balance socketId').session(session);
                await GiftRedemption.create([{
                    user: userId, sourceGiftLogIds: [], originalCoinsValue: originalBeans,
                    redeemedTo: redeemTo, redemptionRate: (ratePercent || 100) / 100, finalAmount
                }], { session });
            });
        } catch (e) {
            txError = e;
        } finally {
            await session.endSession();
        }

        if (txError) {
            if (txError.code === 'NOTHING_TO_REDEEM' || txError.code === 'NOTHING_ELIGIBLE') {
                return res.status(400).json({ status: 'fail', message: txError.message });
            }
            throw txError;
        }

        const io = req.app.get('socketio');
        if (io && user.socketId) {
            io.to(user.socketId).emit('balanceUpdate', { newBalance: user.balance });
            io.to(user.socketId).emit('coinsUpdated', { newCoins: user.coins });
        }
        const { sendBotMessage } = require('../utils/botMessenger');
        await sendBotMessage(io, userId, `تم استبدال بينزك بنجاح مقابل ${redeemTo === 'balance' ? finalAmount + '$' : finalAmount + ' كوينز'} ✅`);

        res.status(200).json({
            status: 'success',
            message: `تم استبدال بينزك بنجاح مقابل ${redeemTo === 'balance' ? finalAmount + '$' : finalAmount + ' كوينز'}`,
            data: { finalAmount, redeemTo, newBalance: user.balance, newCoins: user.coins }
        });
    } catch (error) {
        console.error('[ERROR] in redeemGifts:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء الاستبدال' });
    }
};

// ✅ مُصدَّرة للاختبار المباشر (منطق صِرف — راجع server/utils/__tests__)
exports.getEligibleBeansWForUsd = getEligibleBeansWForUsd;
exports.currentPayoutRatePercent = currentPayoutRatePercent;
