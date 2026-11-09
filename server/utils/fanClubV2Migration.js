// ملف: server/utils/fanClubV2Migration.js
// 🛡️ fanclub-v2: يُعيد حساب User.fanClub.memberCount لكل مالك نادٍ له عضو واحد فعلي على الأقل،
// من FanClubMembership الحقيقية مباشرة، ويُصحِّح lastPointAt الفارغ لعضويات قديمة سابقة لهذي
// المراجعة (راجع backfillMissingLastPointAt أدناه). لا شيء آخر يُرحَّل (لا نقاط، لا سجلات
// GiftLog قديمة، لا FanClubWeekly/FanClubDailyProgress تاريخية).
// 🛡️ مراجعة #156: activeCount لم يَعُد يُخزَّن أو يُرحَّل هنا إطلاقاً — "نشط" مفهوم زمني (آخر
// نقطة خلال 7 أيام) يُحسَب حياً دوماً من FanClubMembership.lastPointAt (راجع fanClubController.js
// activeCutoff/computeFullLeaderboard)، لا عدّاد يُلمَس فقط عند الانضمام/المغادرة — عدّاد كهذا
// لمفهوم زمني محض كان يصبح خاطئاً بصمت بمجرد مرور 7 أيام بلا أي انضمام/مغادرة جديدة.
//
// FANCLUB_V2_MIGRATION=off|dry|apply (نفس فكرة FOLLOW_MIGRATION/WALLET_MIGRATION بالضبط)،
// idempotent بالكامل (يُعيد دوماً نفس الإجابة من حالة FanClubMembership الحالية بصرف النظر عن
// وقت استدعائها) — هذا ما يجعله "قابلاً للاستئناف": إعادة تشغيله بعد تعطّل، أو تكراره دورياً
// كتصحيح لانحراف memberCount، كلاهما آمن دوماً. لا يحجب server.listen() أو migrationGate —
// إضافي بطبيعته بالكامل، المسارات الجديدة تحسب كل ما يهم حياً حيث يلزم.
const FanClubMembership = require('../models/FanClubMembership');
const User = require('../models/User');
const JobRun = require('../models/JobRun');

const JOB_NAME = 'fanclub_v2_migration_v1';
// ✅ نافذة رمزية ثابتة واحدة فقط (نفس فكرة SENTINEL_WEEK_START بـfollowMigration.js) — تستخدم
// الفهرس الفريد الموجود أصلاً على (job, weekStart) لضمان ادّعاء مرّة واحدة للأبد
const SENTINEL_WEEK_START = new Date(0);

// ✅ عضويات أُنشئت قبل إضافة lastPointAt (أو قبل هذي المراجعة كاملة) تحمل lastPointAt:null —
// تظهر "غير نشطة" فوراً بعد النشر رغم نشاطها الحقيقي السابق. updatedAt (آخر تعديل فعلي على
// المستند — قد يكون نقطة لاحقة لو مُنحت) أولى من createdAt (وقت الانضمام فقط)، createdAt احتياطي
// فقط لو updatedAt غائب لأي سبب. تحديث بخط أنابيب تجميع (مصفوفة $set) لقراءة حقل آخر بالمستند نفسه
async function backfillMissingLastPointAt({ dryRun }) {
    if (dryRun) {
        const missing = await FanClubMembership.countDocuments({ lastPointAt: null });
        return { backfilled: missing };
    }
    const result = await FanClubMembership.updateMany(
        { lastPointAt: null },
        [{ $set: { lastPointAt: { $ifNull: ['$updatedAt', '$createdAt'] } } }]
    );
    return { backfilled: result.modifiedCount || 0 };
}

// ✅ لكل مالك نادٍ له عضو واحد فعلي على الأقل: memberCount = عدد الأعضاء الحقيقي
async function recomputeMemberCounts() {
    const rows = await FanClubMembership.aggregate([
        { $group: { _id: '$owner', memberCount: { $sum: 1 } } }
    ]);
    const bulk = rows.map(row => ({
        updateOne: { filter: { _id: row._id }, update: { $set: { 'fanClub.memberCount': row.memberCount } } }
    }));
    if (bulk.length > 0) await User.bulkWrite(bulk);
    return { ownersProcessed: rows.length };
}

// ✅ نفس نمط claimOrResumeJobRun بـfollowMigration.js بالضبط — الادّعاء الأولي ذرّي عبر الفهرس
// الفريد (job, weekStart)؛ محاولتا ادّعاء متزامنتان تصطدمان بـE11000
async function claimOrResumeJobRun() {
    const existing = await JobRun.findOne({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START });
    if (existing) return { alreadyCompleted: existing.status === 'completed' };
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

async function isMigrationCompleted() {
    const existing = await JobRun.findOne({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START });
    return !!(existing && existing.status === 'completed');
}

async function runMigration({ dryRun = true } = {}) {
    if (!dryRun) {
        const claim = await claimOrResumeJobRun();
        if (claim.alreadyCompleted) {
            console.log(`[FANCLUB V2 MIGRATION] ${JOB_NAME} سبق تنفيذها واكتملت فعلاً — تخطٍّ كامل`);
            return { skipped: true, reason: 'already_applied' };
        }
    }

    const { backfilled } = await backfillMissingLastPointAt({ dryRun });

    if (dryRun) {
        const rows = await FanClubMembership.aggregate([{ $group: { _id: '$owner', memberCount: { $sum: 1 } } }]);
        console.log(`[FANCLUB V2 MIGRATION] dryRun=true ownersProjected=${rows.length} lastPointAtBackfillProjected=${backfilled}`);
        return { skipped: false, dryRun: true, ownersProcessed: rows.length, backfilled };
    }

    const { ownersProcessed } = await recomputeMemberCounts();
    await JobRun.updateOne({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START }, { $set: { status: 'completed' } });
    console.log(`[FANCLUB V2 MIGRATION] dryRun=false ownersProcessed=${ownersProcessed} lastPointAtBackfilled=${backfilled}`);
    return { skipped: false, dryRun: false, ownersProcessed, backfilled };
}

const FANCLUB_V2_MIGRATION_OFF_MESSAGE = 'Fan club v2 counter migration pending. Set FANCLUB_V2_MIGRATION=dry to preview or =apply to run.';

// ✅ تُستدعى من server.js بترتيب مستقل عن باقي الترحيلات — لا تتحكّم بـmigrationGate إطلاقاً
// (إضافية بطبيعتها بالكامل، راجع الشرح أعلى الملف)؛ قيمة {ready} هنا معلوماتية فقط للَّوغ
async function resolveMigrationStartup({ env = process.env } = {}) {
    if (await isMigrationCompleted()) return { ready: true, mode: 'already_completed' };

    const requested = String(env.FANCLUB_V2_MIGRATION || '').trim().toLowerCase();
    if (requested === 'apply') {
        await runMigration({ dryRun: false });
        return { ready: true, mode: 'apply' };
    }
    if (requested === 'dry') {
        const result = await runMigration({ dryRun: true });
        console.log(`[FANCLUB V2 MIGRATION] معاينة فقط (dry) — ownersProjected=${result.ownersProcessed}, lastPointAtBackfillProjected=${result.backfilled}`);
        return { ready: false, mode: 'dry' };
    }
    console.log(`[FANCLUB V2 MIGRATION] ${FANCLUB_V2_MIGRATION_OFF_MESSAGE}`);
    return { ready: false, mode: 'off' };
}

module.exports = {
    runMigration, resolveMigrationStartup, isMigrationCompleted, recomputeMemberCounts, backfillMissingLastPointAt,
    FANCLUB_V2_MIGRATION_OFF_MESSAGE, JOB_NAME, SENTINEL_WEEK_START
};
