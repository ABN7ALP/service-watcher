const DeviceSession = require('../models/DeviceSession');
const Withdrawal = require('../models/Withdrawal');

const LINK_WINDOW_MS = 24 * 60 * 60 * 1000;

/** يُسجَّل عند كل دخول ناجح (HTTP أو socket) — لا يُفشل أبداً تسجيل الدخول نفسه عند أي خطأ */
async function recordDeviceSession(userId, { deviceId, ip } = {}) {
    if (!userId || (!deviceId && !ip)) return;
    try {
        await DeviceSession.create({ user: userId, deviceId: deviceId || null, ip: ip || null });
    } catch (error) {
        console.error('[LINKAGE] فشل تسجيل DeviceSession:', error);
    }
}

/**
 * هل الحسابان مرتبطان؟ (نفس معرّف الجهاز، أو نفس IP خلال 24 ساعة من بعضهما، أو نفس محفظة
 * شام كاش المُستخدَمة بسحب سابق لكليهما) — يُستخدَم لإجبار هدايا هذين الحسابين على beans_p
 * دوماً (لا قيمة سحب حقيقية) بصرف النظر عن مصدر تمويل الهدية
 */
async function areLinked(userIdA, userIdB) {
    if (!userIdA || !userIdB || String(userIdA) === String(userIdB)) return false;

    const [sessionsA, sessionsB] = await Promise.all([
        DeviceSession.find({ user: userIdA }).select('deviceId ip createdAt').lean(),
        DeviceSession.find({ user: userIdB }).select('deviceId ip createdAt').lean()
    ]);

    const devicesA = new Set(sessionsA.filter(s => s.deviceId).map(s => s.deviceId));
    if (sessionsB.some(s => s.deviceId && devicesA.has(s.deviceId))) return true;

    const ipTimesA = new Map(); // ip -> [timestamps]
    for (const s of sessionsA) {
        if (!s.ip) continue;
        if (!ipTimesA.has(s.ip)) ipTimesA.set(s.ip, []);
        ipTimesA.get(s.ip).push(s.createdAt.getTime());
    }
    for (const s of sessionsB) {
        if (!s.ip || !ipTimesA.has(s.ip)) continue;
        const tB = s.createdAt.getTime();
        if (ipTimesA.get(s.ip).some(tA => Math.abs(tA - tB) <= LINK_WINDOW_MS)) return true;
    }

    const [walletsA, walletsB] = await Promise.all([
        Withdrawal.find({ user: userIdA, method: 'sham_cash' }).select('walletNumber').lean(),
        Withdrawal.find({ user: userIdB, method: 'sham_cash' }).select('walletNumber').lean()
    ]);
    const walletSetA = new Set(walletsA.map(w => w.walletNumber).filter(Boolean));
    if (walletsB.some(w => w.walletNumber && walletSetA.has(w.walletNumber))) return true;

    return false;
}

module.exports = { recordDeviceSession, areLinked };
