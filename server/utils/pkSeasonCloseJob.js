// ملف: server/utils/pkSeasonCloseJob.js
// =====================================================
// ✅ إغلاق موسم دوري PK الأسبوعي — مهمة دورية تُجمِّد الترتيب النهائي لكل موسم انتهى زمنه
// فعلياً (endsAt تجاوز الآن)، تمنح مكافآت المراكز 1/2/3 + أفضل 10 + أفضل 100 لمضيف كل غرفة
// فائزة، تُشعر الفائزين المتصلين الآن، ثم تضمن وجود موسم نشط للأسبوع الحالي فوراً.
//
// 🛡️ "يجب ألا تُنفَّذ مرتين لو تعدّدت نسخ الخادم" (طلب صريح) — بخلاف fanClubWeeklyFrameJob.js
// (حارس بالذاكرة يكفيه لأن أسوأ أثر جانبي هناك هو إعادة تفعيل إطار مملوك أصلاً)، هذا يمنح
// كوينز حقيقية فلا يجوز الاعتماد على متغيّر بالذاكرة أبداً — كل خطوة ذرّية بقاعدة البيانات:
//  1) ادّعاء الموسم نفسه: findOneAndUpdate بشرط status:'active' يُحوّله لـ'closing' — نسخة
//     خادم واحدة فقط تنجح بهذا الشرط لو تزامنت عدة نسخ بنفس اللحظة تماماً.
//  2) ادّعاء منح كل صفّ (غرفة+موسم) على حدة عبر PkStanding.rewardGranted (نفس فلسفة
//     RoomBattle.lpSettled) — فلو تعطّلت المهمة بمنتصف منح 100 مركز، إعادة المحاولة تتخطّى
//     من مُنح فعلاً ولا تُكرِّر كوينزه، وتُكمل فقط من تبقّى.
// =====================================================

const mongoose = require('mongoose');
const PkSeason = require('../models/PkSeason');
const PkStanding = require('../models/PkStanding');
const User = require('../models/User');
const walletService = require('../utils/walletService');

// ✅ مكافآت نهاية الموسم — كوينز حقيقية تُمنح وتعمل بالكامل فوراً (قرار مصمَّم: لا صورة إطار/
// شارة جاهزة بعد خصيصاً لمراكز هذا الدوري، ومنح مرجع "قادم قريباً" ممنوع صراحة بـCLAUDE.md؛
// الكوينز آلية حقيقية 100% بلا انتظار أي أصل تصميم مستقبلي) — تُمنح لمضيف كل غرفة فائزة
// (الغرف الرسمية بلا مضيف (host:null) تُستثنى بلا خطأ، ليس لها محفظة تُمنح)
const SEASON_REWARD_TIERS = [
    { minRank: 1, maxRank: 1, coins: 50000, label: 'المركز الأول بالدوري الأسبوعي' },
    { minRank: 2, maxRank: 2, coins: 30000, label: 'المركز الثاني بالدوري الأسبوعي' },
    { minRank: 3, maxRank: 3, coins: 20000, label: 'المركز الثالث بالدوري الأسبوعي' },
    { minRank: 4, maxRank: 10, coins: 8000, label: 'ضمن أفضل 10 بالدوري الأسبوعي' },
    { minRank: 11, maxRank: 100, coins: 2000, label: 'ضمن أفضل 100 بالدوري الأسبوعي' }
];

function tierForRank(rank) {
    return SEASON_REWARD_TIERS.find(t => rank >= t.minRank && rank <= t.maxRank) || null;
}

// ✅ يمنح مكافآت أفضل 100 صفّ بموسم مُدَّعى (status:'closing' فعلاً) — كل صفّ على حدة بادّعاء
// ذرّي مستقل، فيصحّ استدعاؤها عدة مرات بأمان حتى لو فشلت بمنتصف المرة السابقة
async function grantSeasonRewards(season, io) {
    const standings = await PkStanding.find({ season: season._id, rewardGranted: false })
        .sort({ lp: -1, wins: -1, lastLpAt: 1 })
        .limit(100)
        .populate('room', 'name host')
        .lean();

    let grantedCount = 0;
    for (let i = 0; i < standings.length; i++) {
        const standing = standings[i];
        // ✅ الرتبة الحقيقية داخل كامل الترتيب (لا فقط بين من لم يُمنح بعد) — نفس معيار كسر
        // التعادل المستخدم بكل مكان آخر بهذا الدوري
        const rank = await PkStanding.getRank(season._id, standing);
        const tier = rank ? tierForRank(rank) : null;
        if (!tier || !standing.room || !standing.room.host) continue;

        // 🛡️ دفتر الأستاذ (feat/wallet-ledger-v1): الادّعاء الذرّي للصفّ + الإيداع عبر
        // walletService معاً بمعاملة Mongo واحدة — يمنع أيضاً ثغرة كانت موجودة: تعطّل العملية
        // بين الادّعاء (rewardGranted:true) والإيداع كان يُفقِد المكافأة نهائياً (الادّعاء نفسه
        // يمنع إعادة محاولة الإيداع لاحقاً رغم عدم تنفيذه فعلياً)
        const session = await mongoose.startSession();
        let claimed = null;
        let updatedHost = null;
        try {
            await session.withTransaction(async () => {
                claimed = await PkStanding.findOneAndUpdate(
                    { _id: standing._id, rewardGranted: false },
                    { $set: { rewardGranted: true } },
                    { session }
                );
                if (!claimed) return; // ✅ مُنح بالفعل بمحاولة سابقة أو من نسخة خادم أخرى بالتوازي
                try {
                    await walletService.post([{
                        user: standing.room.host, wallet: 'coins_paid', delta: tier.coins, type: 'pk_reward',
                        refType: 'PkStanding', refId: standing._id, idempotencyKey: `${standing._id}:pk_reward`
                    }], session);
                } catch (err) {
                    if (err.code === 'INSUFFICIENT_FUNDS') return; // ✅ المضيف لم يعد موجوداً — تخطٍّ آمن
                    throw err;
                }
                updatedHost = await User.findById(standing.room.host).select('socketId').session(session);
            });
        } finally {
            await session.endSession();
        }
        if (!claimed || !updatedHost) continue;
        grantedCount++;

        if (io && updatedHost.socketId) {
            io.to(updatedHost.socketId).emit('pk-season-reward-granted', {
                seasonWeekKey: season.weekKey,
                rank,
                coins: tier.coins,
                label: tier.label,
                roomName: standing.room.name
            });
            io.to(updatedHost.socketId).emit('forceRefreshUserData', { reason: 'pk_season_reward' });
        }
    }
    if (grantedCount > 0) {
        console.log(`[PK SEASON CLOSE] مُنحت مكافآت موسم ${season.weekKey} لـ${grantedCount} مضيف(ين)`);
    }
}

// ✅ يُدَّعى (claim) أي موسم انتهى زمنه ولا يزال status:'active' — ذرّياً، نسخة خادم واحدة
// فقط تنجح لو تزامنت عدة نسخ بنفس اللحظة تماماً (راجع التعليق أعلى الملف)
async function claimEndedSeason() {
    return PkSeason.findOneAndUpdate(
        { endsAt: { $lt: new Date() }, status: 'active' },
        { $set: { status: 'closing' } },
        { new: true }
    );
}

async function closeEndedSeasons(io) {
    try {
        // ✅ حلقة لا عدد مواسم ثابت — نادراً ما يتراكم أكثر من موسم واحد منتهٍ، لكن لو توقف
        // الخادم أسابيع، هذا يُغلقها كلها بأمان واحداً تلو الآخر بدل تجاهل القديم منها
        while (true) {
            const season = await claimEndedSeason();
            if (!season) break;

            try {
                await grantSeasonRewards(season, io);
                await PkSeason.updateOne(
                    { _id: season._id },
                    { $set: { status: 'closed', closedAt: new Date(), rewardsGrantedAt: new Date() } }
                );
                console.log(`[PK SEASON CLOSE] أُغلق موسم ${season.weekKey} نهائياً`);
            } catch (closeError) {
                // 🛡️ فشل بمنتصف منح المكافآت — لا نُثبّت status:'closed'، بل نُعيدها 'active' كي
                // تُدَّعى وتُعاد محاولتها بالدورة القادمة (rewardGranted بكل صفّ يمنع إعادة منح
                // ما نجح فعلاً، فالاستكمال آمن تماماً من حيث توقف)
                console.error(`[PK SEASON CLOSE] فشل إغلاق موسم ${season.weekKey}، ستُعاد المحاولة:`, closeError);
                await PkSeason.updateOne({ _id: season._id }, { $set: { status: 'active' } });
                break;
            }
        }

        // ✅ يضمن وجود موسم نشط للأسبوع الحالي فوراً (ensureActiveSeason يفتحه تلقائياً أصلاً
        // بأول معركة تُسوّى، لكن نستدعيه هنا أيضاً كي يكون الترتيب الحي جاهزاً بلا انتظار)
        await PkSeason.ensureActiveSeason();
    } catch (error) {
        // لا نُسقط السيرفر بسبب فشل مهمة دورية
        console.error('[PK SEASON CLOSE ERROR]:', error);
    }
}

const startPkSeasonCloseJob = (io) => {
    // تشغيل فوري عند الإقلاع (يُغلق ما تأخّر أثناء توقف السيرفر)
    closeEndedSeasons(io);
    // ✅ كل 15 دقيقة — الإغلاق أسبوعي فعلياً فلا حاجة لدقة أعلى؛ الادّعاء الذرّي يمنع التكرار
    // حتى لو تزامنت عدة نسخ خادم بنفس اللحظة تماماً
    setInterval(() => closeEndedSeasons(io), 15 * 60 * 1000);
    console.log('[PK SEASON CLOSE] Job started (checks every 15 minutes)');
};

module.exports = {
    startPkSeasonCloseJob, closeEndedSeasons, grantSeasonRewards,
    // ✅ مُصدَّرة أيضاً للاختبار المباشر (منطق صِرف بلا قاعدة بيانات) — راجع server/utils/__tests__
    tierForRank, claimEndedSeason, SEASON_REWARD_TIERS
};
