// ملف: server/utils/fanClubWeeklyFrameJob.js
//
// ✅ مهمة دورية تمنح "إطار المساهم" (إطار حصري غير مباع بالمتجر) تلقائياً لمن حلّ بالمركز
// الأول بمساهمات نادي معجبين خلال أسبوع كامل — بمجرد اكتمال ذلك الأسبوع فعلياً. نفس أسلوب
// باقي المهام الدورية البسيطة بالمشروع (frameExpiryJob.js): setInterval داخل العملية.
//
// 🐛 إصلاح جذري (مراجعة PR): كانت حالة "آخر أسبوع تمت معالجته" محفوظة بمتغيّر JS محلي
// (lastProcessedWeekStartMs) فقط — أي نشر أو إعادة تشغيل للسيرفر يُصفّره، فتُعاد معالجة
// الأسبوع الذي عولج قبل قليل بالضبط من جديد. "idempotent بالكامل" كان افتراضاً خاطئاً: المنح
// نفسه كان يُعيد ضبط صلاحية الإطار المملوك لأسبوع كامل جديد مجاناً، والأخطر: كان يفرض إعادة
// تفعيل الإطار (user.activeFrame = frame._id) دون شرط، حتى لو بدّله المستخدم فعلياً لإطار آخر
// بين لحظة الفوز الأصلية وإعادة التشغيل — إطار المساهم كان "يُعيد تجهيز نفسه" تلقائياً.
// الحل: حجز ذرّي حقيقي بقاعدة البيانات (JobRun، فهرس unique على job+weekStart) — النسخة
// الوحيدة التي ينجح إدراجها هي التي تعالج هذا الأسبوع؛ أي محاولة لاحقة (نفس العملية بعد
// إعادة تشغيل، أو فحص دوري آخر خلال نفس الأسبوع) تصطدم بتضارب المفتاح فوراً وتخرج بأمان بلا
// أي أثر جانبي. + لا فرض تفعيل بعد الآن: يُضاف/يُمدَّد الإطار بـownedFrames دوماً (يضمن الفوز
// الفعلي)، ويُفعَّل فقط لو لا يملك المستخدم أي إطار نشط حالياً، أو لو هذا الإطار نفسه هو
// النشط حالياً فعلاً (تحديث تاريخ انتهائه المعروض ليطابق التمديد الجديد لا أكثر) — تبديل
// المستخدم اليدوي لإطار آخر يبقى محترماً تماماً، بلا أي استثناء زمني
const FanClubMembership = require('../models/FanClubMembership');
const GiftLog = require('../models/GiftLog');
const User = require('../models/User');
const ProfileFrame = require('../models/ProfileFrame');
const JobRun = require('../models/JobRun');

const CONTRIBUTOR_FRAME_NAME = 'إطار المساهم';
const CONTRIBUTOR_FRAME_DURATION_DAYS = 7;
const JOB_NAME = 'fanclub-contributor';

async function grantWeeklyContributorFrames(io) {
    try {
        const { currentWeekStartUTC, getLastWeekRange } = require('../controllers/fanClubController');
        const weekStart = currentWeekStartUTC();

        // 🛡️ حجز ذرّي لهذا الأسبوع — يفشل بصمت (E11000) لو عولج هذا الأسبوع بالفعل من قبل
        // (نفس العملية بعد إعادة تشغيل، أو فحص دوري آخر خلال الأسبوع الحالي نفسه)
        try {
            await JobRun.create({ job: JOB_NAME, weekStart });
        } catch (claimError) {
            if (claimError && claimError.code === 11000) return; // ✅ عُولج هذا الأسبوع بالفعل — لا شيء جديد لمعالجته
            throw claimError;
        }

        const frame = await ProfileFrame.findOne({ name: CONTRIBUTOR_FRAME_NAME });
        if (!frame) {
            console.warn('[FAN CLUB FRAME] لم يُعثر على إطار المساهم بعد — تأكد من تشغيل autoSeed أولاً');
            return;
        }

        const ownerIds = await FanClubMembership.distinct('owner');
        if (ownerIds.length === 0) return;

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
        if (winnerIds.length === 0) return;

        let grantedCount = 0;
        for (const winnerId of winnerIds) {
            // ✅ لحظة فوز هذا المستخدم بالضبط — أسبوع كامل جديد من الآن، بصرف النظر عمّا تبقّى
            // سابقاً (لو امتلكه أصلاً وانتهت صلاحيته جزئياً أو كلياً) أو حتى لو انتهى بالفعل
            const expiresAt = new Date(Date.now() + CONTRIBUTOR_FRAME_DURATION_DAYS * 24 * 60 * 60 * 1000);
            const user = await User.findById(winnerId).select('ownedFrames activeFrame activeFrameClass activeFrameExpiresAt socketId');
            if (!user) continue;
            const existingOwned = user.ownedFrames.find(o => o.frame.toString() === frame._id.toString());
            if (existingOwned) {
                // 🐛 التجديد لا التكديس: نُعيد ضبط مدة النسخة المملوكة بالكامل لأسبوع جديد،
                // بدل إضافة المدة الجديدة لما تبقّى من القديمة (أو تجاهل الفوز الجديد لو لم
                // تنتهِ القديمة بعد) — يطابق الفوز بنادٍ آخر وهو لا يزال يملك مدة من نادٍ سابق
                existingOwned.durationDays = CONTRIBUTOR_FRAME_DURATION_DAYS;
                existingOwned.activatedAt = new Date();
                existingOwned.expiresAt = expiresAt;
            } else {
                user.ownedFrames.push({
                    frame: frame._id,
                    purchasedAt: new Date(),
                    durationDays: CONTRIBUTOR_FRAME_DURATION_DAYS,
                    activatedAt: new Date(),
                    expiresAt
                });
            }

            // 🛡️ لا فرض تفعيل أبداً: فقط لو لا يملك المستخدم أي إطار نشط حالياً (equip حقيقي)،
            // أو لو هذا الإطار نفسه هو النشط فعلاً حالياً (تحديث تاريخ الانتهاء المعروض ليطابق
            // التمديد أعلاه فقط — ليس "إعادة تفعيل"، هو مُفعَّل أصلاً). أي إطار آخر يرتديه
            // المستخدم حالياً بالاختيار يبقى كما هو بلا أي استثناء — يشمل من بدّله يدوياً بين
            // الفوز السابق وهذا الفوز، أو من ألغى تفعيل أي إطار أصلاً (activeFrame:null)
            const alreadyEquipped = user.activeFrame && user.activeFrame.toString() === frame._id.toString();
            if (!user.activeFrame || alreadyEquipped) {
                user.activeFrame = frame._id;
                user.activeFrameClass = frame.cssClass;
                user.activeFrameExpiresAt = expiresAt;
            }

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
