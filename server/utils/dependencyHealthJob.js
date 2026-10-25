const { execFile } = require('child_process');
const path = require('path');
const mongoose = require('mongoose');
const SystemHealth = require('../models/SystemHealth');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const COMMAND_TIMEOUT_MS = 60 * 1000;
const MAX_BUFFER = 10 * 1024 * 1024;

// ✅ صحة النظام: npm outdated/audit بـ--json يخرجان بكود غير صفري (exit 1) كل مرة يجدان فيها
// أي نتيجة لرصدها (حزمة قديمة أو ثغرة) — هذا لـnpm ليس فشلاً، فقط "وُجد شيء لعرضه"، وstdout
// يبقى JSON صالح بكل الحالات. لذا نحلّل stdout أولاً بصرف النظر عن كود الخروج، ولا نعتبر الأمر
// فاشلاً إلا إذا كان stdout فارغاً/غير قابل للتحليل (عطل npm نفسه أو الشبكة فعلاً معطوبة)
function runNpmJsonCommand(args) {
    return new Promise((resolve) => {
        execFile('npm', args, {
            cwd: PROJECT_ROOT,
            timeout: COMMAND_TIMEOUT_MS,
            maxBuffer: MAX_BUFFER
        }, (error, stdout) => {
            if (stdout && stdout.trim()) {
                try {
                    resolve({ ok: true, data: JSON.parse(stdout) });
                    return;
                } catch (parseError) {
                    resolve({ ok: false, error: `فشل تحليل مخرجات npm: ${parseError.message}` });
                    return;
                }
            }
            if (error && error.killed) {
                resolve({ ok: false, error: `انتهت مهلة الأمر (${COMMAND_TIMEOUT_MS / 1000} ثانية) — npm أو الشبكة غير متاحة` });
                return;
            }
            resolve({ ok: false, error: error ? error.message : 'لا مخرجات من npm' });
        });
    });
}

function isMajorBump(current, latest) {
    const currentMajor = parseInt(String(current).split('.')[0], 10);
    const latestMajor = parseInt(String(latest).split('.')[0], 10);
    if (Number.isNaN(currentMajor) || Number.isNaN(latestMajor)) return false;
    return latestMajor > currentMajor;
}

function buildOutdatedDocs(outdatedResult, checkRunId) {
    if (!outdatedResult.ok) {
        return [{
            checkRunId,
            type: 'error',
            source: 'outdated',
            errorMessage: outdatedResult.error
        }];
    }
    return Object.entries(outdatedResult.data).map(([pkg, info]) => ({
        checkRunId,
        type: 'outdated',
        package: pkg,
        current: info.current || '',
        wanted: info.wanted || '',
        latest: info.latest || '',
        isMajorUpdate: isMajorBump(info.current, info.latest)
    }));
}

function buildVulnerabilityDocs(auditResult, checkRunId) {
    if (!auditResult.ok) {
        return [{
            checkRunId,
            type: 'error',
            source: 'audit',
            errorMessage: auditResult.error
        }];
    }
    const vulnerabilities = auditResult.data.vulnerabilities || {};
    return Object.entries(vulnerabilities).map(([pkg, info]) => {
        const advisories = (info.via || []).filter(v => typeof v === 'object');
        const primaryAdvisory = advisories[0] || {};
        return {
            checkRunId,
            type: 'vulnerability',
            package: pkg,
            severity: info.severity || 'info',
            advisoryTitle: primaryAdvisory.title || '',
            advisoryUrl: primaryAdvisory.url || ''
        };
    });
}

const SEVERITY_RANK = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };

async function runDependencyHealthCheck() {
    const checkRunId = new mongoose.Types.ObjectId();

    const [outdatedResult, auditResult] = await Promise.all([
        runNpmJsonCommand(['outdated', '--json']),
        runNpmJsonCommand(['audit', '--json', '--omit=dev'])
    ]);

    const docs = [
        ...buildOutdatedDocs(outdatedResult, checkRunId),
        ...buildVulnerabilityDocs(auditResult, checkRunId)
    ].sort((a, b) => {
        if (a.type !== 'vulnerability' || b.type !== 'vulnerability') return 0;
        return (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    });

    try {
        await SystemHealth.deleteMany({});
        if (docs.length > 0) {
            await SystemHealth.insertMany(docs);
        }
    } catch (dbError) {
        console.error('[DEPENDENCY HEALTH JOB] فشل حفظ نتائج الفحص:', dbError);
        throw dbError;
    }

    const vulnerabilityCount = docs.filter(d => d.type === 'vulnerability').length;
    const outdatedCount = docs.filter(d => d.type === 'outdated').length;
    const errorCount = docs.filter(d => d.type === 'error').length;
    console.log(`🩺 [DEPENDENCY HEALTH] فحص مكتمل: ${vulnerabilityCount} ثغرة، ${outdatedCount} حزمة قديمة، ${errorCount} خطأ تنفيذ`);

    return { checkRunId, vulnerabilityCount, outdatedCount, errorCount };
}

function startDependencyHealthJob() {
    // فحص أول مؤجَّل دقيقتين كي لا يُبطئ إقلاع السيرفر، ثم فحص يومي
    setTimeout(() => {
        runDependencyHealthCheck().catch(err => console.error('[DEPENDENCY HEALTH JOB] فحص الإقلاع فشل:', err));
    }, 2 * 60 * 1000);

    setInterval(() => {
        runDependencyHealthCheck().catch(err => console.error('[DEPENDENCY HEALTH JOB] الفحص اليومي فشل:', err));
    }, 24 * 60 * 60 * 1000);
}

module.exports = { startDependencyHealthJob, runDependencyHealthCheck, isMajorBump };
