// ملف: server/utils/fanClubV2Migration.js
// 🛡️ fanclub-v2: يُعيد حساب User.fanClub.memberCount/activeCount لكل مالك نادٍ له عضو واحد
// فعلي على الأقل، من FanClubMembership الحقيقية مباشرة. لا شيء آخر يُرحَّل (لا نقاط، لا سجلات
// GiftLog قديمة، لا FanClubWeekly/FanClubDailyProgress تاريخية) — هذان العدّادان فقط يُحدَّثان
// الآن ضمن معاملة الانضمام/المغادرة لا بكل قراءة (راجع docs/specs/fanclub-v2.md)، فقد ينحرفان
// تقريبياً بمرور وقت طويل بلا مغادرة فعلية (activeCount لا يُنقَص تلقائياً لمن يصمت 7 أيام بلا
// مغادرة) — هذا الترحيل هو التصحيح الدوري لذاك الانحراف، لا أكثر.
//
// FANCLUB_V2_MIGRATION=off|dry|apply (نفس فكرة FOLLOW_MIGRATION/WALLET_MIGRATION بالضبط)،
// idempotent بالكامل (يُعيد دوماً نفس الإجابة من حالة FanClubMembership الحالية بصرف النظر عن
// وقت استدعائها) — هذا ما يجعله "قابلاً للاستئناف": إعادة تشغيله بعد تعطّل، أو تكراره دورياً
// كتصحيح، كلاهما آمن دوماً. لا يحجب server.listen() أو migrationGate — إضافي بطبيعته بالكامل،
// المسارات الجديدة تحسب كل ما يهم حياً حيث يلزم.
const User = require('../models/User');
const FanClubMembership = require('../models/FanClubMembership');
const JobRun = require('../models/JobRun');

const JOB_NAME = 'fanclub_v2_migration_v1';
// ✅ نافذة رمزية ثابتة واحدة فقط (نفس فكرة SENTINEL_WEEK_START بـfollowMigration.js) — تستخدم
// الفهرس الفريد الموجود أصلاً على (job, weekStart) لضمان ادّعاء مرّة واحدة للأبد
const SENTINEL_WEEK_START = new Date(0);
const INACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// ✅ لكل مالك نادٍ له عضو واحد فعلي على الأقل: memberCount = عدد الأعضاء الحقيقي،
// activeCount = عدد من نقطة آخرهم (lastPointAt) ضمن آخر 7 أيام فقط — نفس تعريف isInactive
// بـfanClubController.js بالضبط، بلا أي تقويم بديل
async function recomputeAllFanClubCounters() {
    const cutoff = new Date(Date.now() - INACTIVITY_WINDOW_MS);
    const rows = await FanClubMembership.aggregate([
        {
            $group: {
                _id: '$owner',
                memberCount: { $sum: 1 },
                activeCount: { $sum: { $cond: [{ $gte: ['$lastPointAt', cutoff] }, 1, 0] } }
            }
        }
    ]);
    const bulk = rows.map(row => ({
        updateOne: {
            filter: { _id: row._id },
            update: { $set: { 'fanClub.memberCount': row.memberCount, 'fanClub.activeCount': row.activeCount } }
        }
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

    if (dryRun) {
        const cutoff = new Date(Date.now() - INACTIVITY_WINDOW_MS);
        const rows = await FanClubMembership.aggregate([
            { $group: { _id: '$owner', memberCount: { $sum: 1 }, activeCount: { $sum: { $cond: [{ $gte: ['$lastPointAt', cutoff] }, 1, 0] } } } }
        ]);
        console.log(`[FANCLUB V2 MIGRATION] dryRun=true ownersProjected=${rows.length}`);
        return { skipped: false, dryRun: true, ownersProcessed: rows.length };
    }

    const { ownersProcessed } = await recomputeAllFanClubCounters();
    await JobRun.updateOne({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START }, { $set: { status: 'completed' } });
    console.log(`[FANCLUB V2 MIGRATION] dryRun=false ownersProcessed=${ownersProcessed}`);
    return { skipped: false, dryRun: false, ownersProcessed };
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
        console.log(`[FANCLUB V2 MIGRATION] معاينة فقط (dry) — ownersProjected=${result.ownersProcessed}`);
        return { ready: false, mode: 'dry' };
    }
    console.log(`[FANCLUB V2 MIGRATION] ${FANCLUB_V2_MIGRATION_OFF_MESSAGE}`);
    return { ready: false, mode: 'off' };
}

module.exports = {
    runMigration, resolveMigrationStartup, isMigrationCompleted, recomputeAllFanClubCounters,
    FANCLUB_V2_MIGRATION_OFF_MESSAGE, JOB_NAME, SENTINEL_WEEK_START
};
