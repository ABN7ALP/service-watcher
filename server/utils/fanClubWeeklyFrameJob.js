// ملف: server/utils/fanClubWeeklyFrameJob.js
//
// ✅ مهمة دورية تمنح "إطار المساهم" (إطار دائم حصري غير مباع بالمتجر) تلقائياً لمن حلّ
// بالمركز الأول بمساهمات نادي معجبين خلال أسبوع كامل — بمجرد اكتمال ذلك الأسبوع فعلياً.
// نفس أسلوب باقي المهام الدورية البسيطة بالمشروع (frameExpiryJob.js): setInterval داخل
// العملية، حالة "آخر أسبوع تمت معالجته" محفوظة بمتغيّر بالذاكرة فقط — إعادة تشغيل السيرفر
// قد تُعيد معالجة نفس الأسبوع مرة إضافية، وهذا آمن تماماً (العملية idempotent بالكامل: لا
// تُكرَّر ملكية الإطار، وأسوأ أثر جانبي محتمل هو إعادة تفعيله كإطار نشط لو كان المستخدم بدّله)
const FanClubMembership = require('../models/FanClubMembership');
const GiftLog = require('../models/GiftLog');
const User = require('../models/User');
const ProfileFrame = require('../models/ProfileFrame');

const CONTRIBUTOR_FRAME_NAME = 'إطار المساهم';
const PERMANENT_DURATION_DAYS = 36500; // ✅ "دائم" عملياً (100 سنة) — يطابق نمط الحقل required بالسكيمة بلا حاجة لحالة null خاصة

let lastProcessedWeekStartMs = null;

async function grantWeeklyContributorFrames(io) {
    try {
        const { currentWeekStartUTC, getLastWeekRange } = require('../controllers/fanClubController');
        const weekStartMs = currentWeekStartUTC().getTime();
        if (lastProcessedWeekStartMs === weekStartMs) return; // ✅ عُولج هذا الأسبوع بالفعل — لا شيء جديد لمعالجته

        const frame = await ProfileFrame.findOne({ name: CONTRIBUTOR_FRAME_NAME });
        if (!frame) {
            console.warn('[FAN CLUB FRAME] لم يُعثر على إطار المساهم بعد — تأكد من تشغيل autoSeed أولاً');
            lastProcessedWeekStartMs = weekStartMs;
            return;
        }

        const ownerIds = await FanClubMembership.distinct('owner');
        if (ownerIds.length === 0) { lastProcessedWeekStartMs = weekStartMs; return; }

        const { start, end } = getLastWeekRange();
        // ✅ لكل مالك نادٍ: أعلى مساهم بالأسبوع الماضي فقط (نفس منطق getWeeklyWins، لكن دفعة
        // واحدة لكل النوادي معاً بدل مالك واحد كل مرة)
        const rows = await GiftLog.aggregate([
            { $match: { receiver: { $in: ownerIds }, createdAt: { $gte: start, $lt: end } } },
            { $group: { _id: { owner: '$receiver', sender: '$sender' }, total: { $sum: '$totalPrice' } } },
            { $sort: { total: -1, '_id.sender': 1 } },
            { $group: { _id: '$_id.owner', topSender: { $first: '$_id.sender' } } }
        ]);
        const winnerIds = [...new Set(rows.map(r => r.topSender.toString()))];
        if (winnerIds.length === 0) { lastProcessedWeekStartMs = weekStartMs; return; }

        const expiresAt = new Date(Date.now() + PERMANENT_DURATION_DAYS * 24 * 60 * 60 * 1000);
        let grantedCount = 0;
        for (const winnerId of winnerIds) {
            const user = await User.findById(winnerId).select('ownedFrames socketId');
            if (!user) continue;
            const alreadyOwned = user.ownedFrames.some(o => o.frame.toString() === frame._id.toString());
            if (!alreadyOwned) {
                user.ownedFrames.push({
                    frame: frame._id,
                    purchasedAt: new Date(),
                    durationDays: PERMANENT_DURATION_DAYS,
                    activatedAt: new Date(),
                    expiresAt
                });
            }
            user.activeFrame = frame._id;
            user.activeFrameClass = frame.cssClass;
            user.activeFrameExpiresAt = expiresAt;
            await user.save();
            grantedCount++;
            if (io && user.socketId) {
                io.to(user.socketId).emit('forceRefreshUserData', { reason: 'weekly_contributor_frame' });
                io.to(user.socketId).emit('fanclub-contributor-frame-earned', {
                    frameName: frame.name,
                    cssClass: frame.cssClass,
                    previewImage: frame.previewImage
                });
            }
        }
        console.log(`[FAN CLUB FRAME] مُنح إطار المساهم لـ${grantedCount} فائز(ين) بالأسبوع الماضي`);
        lastProcessedWeekStartMs = weekStartMs;
    } catch (error) {
        // لا نُسقط السيرفر بسبب فشل مهمة دورية
        console.error('[FAN CLUB FRAME ERROR]:', error);
    }
}

const startFanClubWeeklyFrameJob = (io) => {
    // تشغيل فوري عند الإقلاع (يمنح ما تأخّر أثناء توقف السيرفر لو تجاوزنا حدود أسبوع)
    grantWeeklyContributorFrames(io);
    // فحص كل 30 دقيقة — دقة كافية بما أن الحدث أسبوعي أصلاً، بلا عبء يُذكر
    setInterval(() => grantWeeklyContributorFrames(io), 30 * 60 * 1000);
    console.log('[FAN CLUB FRAME] Weekly contributor-frame job started (checks every 30 minutes)');
};

module.exports = { startFanClubWeeklyFrameJob, grantWeeklyContributorFrames };
