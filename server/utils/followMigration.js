// ملف: server/utils/followMigration.js
// 🛡️ feat/follow-v2: ينسخ User.followers/following (أحادية الاتجاه) وUser.friends (ثنائية —
// نظام طلب/قبول صداقة قديم) إلى مجموعة Follow الجديدة (مصدر الحقيقة الوحيد من الآن). كل صداقة
// قديمة تصبح متابعة متبادلة (حافتان). يُتحكَّم به عبر FOLLOW_MIGRATION=off|dry|apply (نفس فكرة
// WALLET_MIGRATION — راجع walletRedenominationMigration.js)، قابل للاستئناف (علم
// followMigratedV1 لكل مستخدم + JobRun لادّعاء/تخطّي العملية كاملة لو اكتملت فعلاً من قبل).
//
// 🛡️ بخلاف ترحيل إعادة تسمية العملة، لا حاجة لحجب كل ترافيك HTTP (migrationGate) حتى اكتماله:
// الكتابة هنا إضافية بطبيعتها فقط (upsert على فهرس Follow الفريد) ولا تتعارض مع مسار المتابعة
// الجديد العامل بالتوازي (أي محاولة حجز حافة موجودة فعلاً تُتجاهَل بأمان ذرّياً). التأثير الوحيد
// لتعطيل الترحيل (off/dry) هو عدّادا followersCount/followingCount يبقيان صفراً للحسابات
// القديمة التي لم تُرحَّل بعد — recomputeAllCounters نفسها صحيحة دوماً أياً كان وقت استدعائها.
const mongoose = require('mongoose');
const User = require('../models/User');
const Follow = require('../models/Follow');
const JobRun = require('../models/JobRun');

const JOB_NAME = 'follow_migration_v1';
// ✅ نافذة رمزية ثابتة واحدة فقط (راجع نفس الفكرة بـwalletRedenominationMigration.js) — تستخدم
// الفهرس الفريد الموجود أصلاً على (job, weekStart) لضمان ادّعاء مرّة واحدة للأبد
const SENTINEL_WEEK_START = new Date(0);

function pairKey(a, b) {
    return `${a}:${b}`;
}

// ✅ يُنشئ حافة Follow واحدة (أو يتخطّاها بأمان إن كانت موجودة فعلاً) — upsert بشرط الفهرس
// الفريد، لا إدراج مباشر: استئناف العملية بعد تعطّل، أو تداخلها مع إنشاء حافة مطابقة عبر مسار
// المتابعة الحيّ بالتوازي، لا يمكن أن يُفجِّر خطأً غير متوقَّع — كل الحالات (جديدة/موجودة) تُعالَج
// بنفس الاستدعاء الذرّي. `seen` يمنع عدّ الحافة مرتين لنفس المستخدم بوضع المعاينة (dry) فقط
async function upsertFollowEdge(follower, followee, dryRun, seen) {
    if (String(follower) === String(followee)) return false; // 🛡️ تجاهل أي حافة ذاتية فاسدة بالبيانات القديمة
    const key = pairKey(follower, followee);
    if (seen.has(key)) return false;
    seen.add(key);
    if (dryRun) return true;
    const result = await Follow.updateOne(
        { follower, followee },
        { $setOnInsert: { follower, followee, createdAt: new Date() } },
        { upsert: true }
    );
    return !!result.upsertedCount;
}

async function migrateOneUser(user, { dryRun, seen }) {
    let created = 0;
    for (const targetId of (user.following || [])) {
        if (await upsertFollowEdge(user._id, targetId, dryRun, seen)) created++;
    }
    for (const followerId of (user.followers || [])) {
        if (await upsertFollowEdge(followerId, user._id, dryRun, seen)) created++;
    }
    // ✅ "كل صداقة قديمة -> متابعة متبادلة" (مطلوب صريحاً) — حافتان، بصرف النظر عمّا كانت
    // مصفوفتا followers/following تحتويانه فعلاً لهذا الزوج (قد تكون ناقصة ببيانات قديمة فاسدة)
    for (const friendId of (user.friends || [])) {
        if (await upsertFollowEdge(user._id, friendId, dryRun, seen)) created++;
        if (await upsertFollowEdge(friendId, user._id, dryRun, seen)) created++;
    }
    if (!dryRun) {
        await User.updateOne({ _id: user._id }, { $set: { followMigratedV1: true } });
    }
    return created;
}

// ✅ dryRun: كل المستخدمين (معاينة شاملة، حتى من سبق ترحيله — لتقرير متّسق). !dryRun: فقط من
// لم يُرحَّل بعد — يمنع إعادة معالجة مستخدم مكتمل فعلاً عند استئناف عملية تعطّلت بمنتصف القائمة
//
// 🛡️ `seen` مشترك لعملية الترحيل بأكملها (لا جديد بكل مستخدم) — ضروري لدقّة معاينة dry: كل
// علاقة متابعة قديمة سليمة (متماثلة الطرفين فعلاً) تظهر مرتين بالمصفوفات (following لدى طرف،
// followers لدى الطرف الآخر)، فبدون `seen` مشترك عبر كل المستخدمين سيُحتسَب نفس الزوج مرتين
// بتقرير المعاينة (edgesCreated) بينما apply الحقيقي (upsert ذرّي) يُنشئه مرة واحدة فقط بالضبط
async function migrateAllUsers({ dryRun }) {
    const filter = dryRun ? {} : { followMigratedV1: { $ne: true } };
    const cursor = User.find(filter).select('_id following followers friends').cursor();
    const seen = new Set();
    let usersProcessed = 0;
    let edgesCreated = 0;
    for (let user = await cursor.next(); user != null; user = await cursor.next()) {
        edgesCreated += await migrateOneUser(user, { dryRun, seen });
        usersProcessed++;
    }
    return { usersProcessed, edgesCreated };
}

// ✅ يُعاد حسابهما من مجموعة Follow الحقيقية فقط (مصدر الحقيقة) — عملية صحيحة ومستقرّة (idempotent)
// بصرف النظر عن وقت استدعائها، فيصحّ تكرارها بأمان حتى بعد اكتمال الترحيل (لا تعتمد على أي علم)
async function recomputeAllCounters() {
    const [followerAgg, followingAgg] = await Promise.all([
        Follow.aggregate([{ $group: { _id: '$followee', count: { $sum: 1 } } }]),
        Follow.aggregate([{ $group: { _id: '$follower', count: { $sum: 1 } } }])
    ]);
    const bulk = [
        ...followerAgg.map(row => ({ updateOne: { filter: { _id: row._id }, update: { $set: { followersCount: row.count } } } })),
        ...followingAgg.map(row => ({ updateOne: { filter: { _id: row._id }, update: { $set: { followingCount: row.count } } } }))
    ];
    if (bulk.length > 0) await User.bulkWrite(bulk);
    return { followersRows: followerAgg.length, followingRows: followingAgg.length };
}

// ✅ نفس نمط claimOrResumeJobRun بـwalletRedenominationMigration.js بالضبط — الادّعاء الأولي
// ذرّي عبر الفهرس الفريد (job, weekStart)؛ محاولتا ادّعاء متزامنتان تصطدمان بـE11000
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
            console.log(`[FOLLOW MIGRATION] ${JOB_NAME} سبق تنفيذها واكتملت فعلاً — تخطٍّ كامل`);
            return { skipped: true, reason: 'already_applied' };
        }
    }

    const { usersProcessed, edgesCreated } = await migrateAllUsers({ dryRun });

    let counters = null;
    if (!dryRun) {
        counters = await recomputeAllCounters();
        await JobRun.updateOne({ job: JOB_NAME, weekStart: SENTINEL_WEEK_START }, { $set: { status: 'completed' } });
    }

    console.log(`[FOLLOW MIGRATION] dryRun=${dryRun} usersProcessed=${usersProcessed} edges${dryRun ? 'Projected' : 'Created'}=${edgesCreated}`);
    return { skipped: false, dryRun, usersProcessed, edgesCreated, counters };
}

const FOLLOW_MIGRATION_OFF_MESSAGE = 'Follow migration pending. Set FOLLOW_MIGRATION=dry to preview or =apply to run.';

// ✅ تُستدعى من server.js بترتيب مستقل عن ترحيل المحفظة — لا تتحكّم بـmigrationGate إطلاقاً
// (راجع الشرح أعلى الملف)؛ قيمة {ready} هنا معلوماتية فقط للَّوغ، لا تحجب أي ترافيك
async function resolveMigrationStartup({ env = process.env } = {}) {
    if (await isMigrationCompleted()) return { ready: true, mode: 'already_completed' };

    const requested = String(env.FOLLOW_MIGRATION || '').trim().toLowerCase();
    if (requested === 'apply') {
        await runMigration({ dryRun: false });
        return { ready: true, mode: 'apply' };
    }
    if (requested === 'dry') {
        const result = await runMigration({ dryRun: true });
        console.log(`[FOLLOW MIGRATION] معاينة فقط (dry) — usersProcessed=${result.usersProcessed}, edgesProjected=${result.edgesCreated}`);
        return { ready: false, mode: 'dry' };
    }
    console.log(`[FOLLOW MIGRATION] ${FOLLOW_MIGRATION_OFF_MESSAGE}`);
    return { ready: false, mode: 'off' };
}

module.exports = {
    runMigration, resolveMigrationStartup, isMigrationCompleted, recomputeAllCounters,
    FOLLOW_MIGRATION_OFF_MESSAGE, JOB_NAME, SENTINEL_WEEK_START
};
