// ملف: server/utils/walletReconciliationJob.js
// =====================================================
// 🛡️ صحة المحفظة (feat/wallet-ledger-v1): مهمة دورية تتحقق — لكل مستخدم ولكل محفظة (coins_paid/
// coins_bonus/beans_w/beans_p/usd_cents) — أن مجموع قيود دفتر الأستاذ (LedgerEntry.delta) يطابق
// الرصيد المخزَّن على User بالضبط. أي تعارض يعني أن رصيداً تغيّر بطريقة لا تمر عبر walletService
// (أو خللاً حقيقياً) — تنبيه حرج فوري، لا انتظار شكوى مستخدم.
// أيضاً تحسب "الالتزام" (liability): قيمة كل beans_w الحالية بسعر الصرف الحالي بالدولار (أقصى
// ما قد يُطلَب سحبه نقداً اليوم) مقابل إجمالي النقد الحقيقي المُستلَم فعلياً (ودائع) — مؤشر
// سيولة: لو تجاوز الالتزام النقد المُستلَم بكثير، المنصّة قد لا تملك غطاءً كافياً لكل طلبات
// السحب لو طلبها الجميع دفعة واحدة
// =====================================================

const mongoose = require('mongoose');
const User = require('../models/User');
const LedgerEntry = require('../models/LedgerEntry');
const SystemSettings = require('../models/SystemSettings');
const AdminLog = require('../models/AdminLog');
const WalletReconciliation = require('../models/WalletReconciliation');
const { WALLET_TO_USER_FIELD } = require('./walletService');
const { getBotUser } = require('./botMessenger');

const WALLETS = Object.keys(WALLET_TO_USER_FIELD);

async function runWalletReconciliation() {
    const checkRunId = new mongoose.Types.ObjectId();

    const [ledgerSums, users, settings] = await Promise.all([
        LedgerEntry.aggregate([
            { $group: { _id: { user: '$user', wallet: '$wallet' }, total: { $sum: '$delta' } } }
        ]),
        User.find({}).select(Object.values(WALLET_TO_USER_FIELD).join(' ')).lean(),
        SystemSettings.getSettings()
    ]);

    const ledgerMap = new Map();
    for (const row of ledgerSums) {
        ledgerMap.set(`${row._id.user}:${row._id.wallet}`, row.total);
    }

    const mismatches = [];
    let totalBeansW = 0;
    for (const user of users) {
        totalBeansW += user.walletBeansW || 0;
        for (const wallet of WALLETS) {
            const ledgerSum = ledgerMap.get(`${user._id}:${wallet}`) || 0;
            const cachedBalance = user[WALLET_TO_USER_FIELD[wallet]] || 0;
            if (ledgerSum !== cachedBalance) {
                mismatches.push({
                    checkRunId, type: 'mismatch', user: user._id, wallet,
                    ledgerSum, cachedBalance, diff: cachedBalance - ledgerSum
                });
            }
        }
    }

    // ✅ نسبة الدفع الحالية (نفس منطق giftRedemptionController.currentPayoutRatePercent، لكن
    // عامة على كل المنصّة لا لكل مستخدم — مستوى الاستضافة الفردي غير مهم هنا، نحسب أقصى التزام
    // محتمل بافتراض النسبة الأساسية الأدنى لا الأعلى، كي لا يُقلِّل الالتزام عن حقيقته)
    const now = new Date();
    const ratePercent = (settings.payoutLaunchEndsAt && now < settings.payoutLaunchEndsAt)
        ? settings.payoutLaunchPct
        : settings.payoutBasePct;
    const liabilityUsd = (totalBeansW * ratePercent) / 100 / settings.coinsPerUsd;

    const [cashReceivedAgg] = await LedgerEntry.aggregate([
        { $match: { wallet: 'usd_cents', type: 'deposit' } },
        { $group: { _id: null, total: { $sum: '$delta' } } }
    ]);
    const cashReceivedUsd = ((cashReceivedAgg && cashReceivedAgg.total) || 0) / 100;

    const summaryDoc = {
        checkRunId, type: 'summary', usersChecked: users.length, mismatchCount: mismatches.length,
        liabilityUsd: parseFloat(liabilityUsd.toFixed(2)), cashReceivedUsd: parseFloat(cashReceivedUsd.toFixed(2))
    };

    await WalletReconciliation.deleteMany({});
    await WalletReconciliation.insertMany([summaryDoc, ...mismatches]);

    if (mismatches.length > 0) {
        console.error(`🚨 [WALLET RECONCILIATION] ${mismatches.length} تعارض رصيد مكتشَف بين ${users.length} مستخدم!`);
        const botId = await getBotUser();
        if (botId) {
            await AdminLog.logAction({
                admin: botId,
                action: 'system_maintenance',
                targetEntity: 'system',
                details: {
                    action: 'wallet_reconciliation_mismatch',
                    mismatchCount: mismatches.length,
                    sample: mismatches.slice(0, 20).map(m => ({
                        user: m.user, wallet: m.wallet, ledgerSum: m.ledgerSum, cachedBalance: m.cachedBalance, diff: m.diff
                    }))
                },
                severity: 'critical',
                isAutomated: true
            });
        }
    } else {
        console.log(`✅ [WALLET RECONCILIATION] فحص مكتمل: ${users.length} مستخدم، لا تعارضات. الالتزام: ${summaryDoc.liabilityUsd}$`);
    }

    return summaryDoc;
}

function startWalletReconciliationJob() {
    // ✅ مؤجَّلة 3 دقائق (بعد فحص الاعتماديات المؤجَّل دقيقتين) كي لا تتزاحم كل الفحوصات
    // الثقيلة لحظة الإقلاع معاً، ثم فحص يومي
    setTimeout(() => {
        runWalletReconciliation().catch(err => console.error('[WALLET RECONCILIATION JOB] فحص الإقلاع فشل:', err));
    }, 3 * 60 * 1000);

    setInterval(() => {
        runWalletReconciliation().catch(err => console.error('[WALLET RECONCILIATION JOB] الفحص اليومي فشل:', err));
    }, 24 * 60 * 60 * 1000);
}

module.exports = { startWalletReconciliationJob, runWalletReconciliation };
