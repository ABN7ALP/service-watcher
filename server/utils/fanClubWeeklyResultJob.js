// ملف: server/utils/fanClubWeeklyResultJob.js
//
// ✅ مهمة دورية تُجمِّد ترتيب نوادي المعجبين لأسبوع دمشقي مكتمل فور انتهائه — صف واحد لكل نادٍ
// بـFanClubWeeklyResult، ليقرأه تبويب "الأسبوع الماضي" بلوحة الصدارة دون أي إعادة حساب لاحقة.
// نفس أسلوب fanClubWeeklyFrameJob.js المجاور بالضبط: حجز ذرّي حقيقي (JobRun، فهرس unique على
// job+weekStart) يمنع إعادة المعالجة بعد أي إعادة تشغيل، وsetInterval فحص كل 30 دقيقة.
//
// 🛡️ "نشط" هنا مُجمَّد من بيانات ذلك الأسبوع نفسها (FanClubWeekly.points > 0 لذلك weekStart
// تحديداً) — لا من lastPointAt/الآن (تلك حيّة تتغيّر باستمرار، لا تصلح لسجل تاريخي ثابت). هذا
// أدق فعلياً من التعريف الحيّ لسجل مُجمَّد: "من ساهم بنقاط حقيقية ذلك الأسبوع بالضبط"، لا "من
// آخر نقطة له كانت قبل ≤7 أيام من لحظة التجميد العشوائية"
const User = require('../models/User');
const FanClubWeekly = require('../models/FanClubWeekly');
const FanClubWeeklyResult = require('../models/FanClubWeeklyResult');
const JobRun = require('../models/JobRun');
const { getCurrentWeekBounds, getWeekBoundsForDate } = require('../utils/poolWeek');

const JOB_NAME = 'fanclub-weekly-result';

async function finalizeLastWeekClubResults() {
    try {
        const { weekStart: currentWeekStart } = getCurrentWeekBounds();
        const { weekStart } = getWeekBoundsForDate(new Date(currentWeekStart.getTime() - 86400000)); // الأسبوع الماضي المكتمل

        try {
            await JobRun.create({ job: JOB_NAME, weekStart });
        } catch (claimError) {
            if (claimError && claimError.code === 11000) return; // ✅ عُولج هذا الأسبوع بالفعل
            throw claimError;
        }

        const weeklyAgg = await FanClubWeekly.aggregate([
            { $match: { weekStart, points: { $gt: 0 } } },
            { $group: { _id: '$owner', weeklyPoints: { $sum: '$points' }, activeCount: { $sum: 1 } } }
        ]);
        if (weeklyAgg.length === 0) return;

        const owners = await User.find({ _id: { $in: weeklyAgg.map(r => r._id) } }).select('username profileImage fanClub.memberCount fanClub.emblemColorId');
        const ownerMap = new Map(owners.map(o => [o._id.toString(), o]));

        const ranked = weeklyAgg
            .map(r => ({ ...r, owner: ownerMap.get(r._id.toString()) }))
            .filter(r => r.owner)
            .sort((a, b) => (b.activeCount - a.activeCount) || (b.weeklyPoints - a.weeklyPoints));

        const docs = ranked.map((r, i) => ({
            weekStart, owner: r._id, rank: i + 1,
            username: r.owner.username, profileImage: r.owner.profileImage,
            emblemColorId: r.owner.fanClub?.emblemColorId || 'pink',
            memberCount: r.owner.fanClub?.memberCount || 0,
            activeCount: r.activeCount, weeklyPoints: r.weeklyPoints
        }));
        await FanClubWeeklyResult.insertMany(docs, { ordered: false }).catch(err => {
            // ✅ E11000 محتمل لو تصادمت محاولتا تجميد (نادر جداً — الحجز أعلاه يمنعه عادة)؛
            // ordered:false يضمن إدراج كل الوثائق غير المتضاربة بصرف النظر عن أي تصادم فردي
            if (err.code !== 11000) throw err;
        });
        console.log(`[FAN CLUB WEEKLY RESULT] جُمِّد ترتيب ${docs.length} نادٍ للأسبوع الماضي`);
    } catch (error) {
        // لا نُسقط السيرفر بسبب فشل مهمة دورية
        console.error('[FAN CLUB WEEKLY RESULT ERROR]:', error);
    }
}

const startFanClubWeeklyResultJob = () => {
    finalizeLastWeekClubResults();
    setInterval(() => finalizeLastWeekClubResults(), 30 * 60 * 1000);
    console.log('[FAN CLUB WEEKLY RESULT] Weekly club-result finalize job started (checks every 30 minutes)');
};

module.exports = { startFanClubWeeklyResultJob, finalizeLastWeekClubResults };
