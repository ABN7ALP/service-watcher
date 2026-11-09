const DeviceSession = require('../models/DeviceSession');
const Withdrawal = require('../models/Withdrawal');

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
 * هل الحسابان مرتبطان؟ (نفس معرّف الجهاز، أو نفس محفظة شام كاش المُستخدَمة بسحب سابق لكليهما)
 * — يُستخدَم لإجبار هدايا هذين الحسابين على beans_p دوماً (لا قيمة سحب حقيقية) بصرف النظر عن
 * مصدر تمويل الهدية، ولمنع ازدواج بونص "أول شحنة".
 *
 * 🛡️ مراجعة PR (بند 1): أُزيلت إشارة "نفس IP خلال 24 ساعة" نهائياً من هذا الفحص — شبكات الجوال
 * بسوريا تستخدم CGNAT (Carrier-Grade NAT) على نطاق واسع، فآلاف المستخدمين الحقيقيين المختلفين
 * تماماً يشتركون بنفس IP العام في نفس اللحظة تقريباً. استخدام IP هنا كان يُنتج ربطاً كاذباً
 * جماعياً (ينتزع قيمة سحب حقيقية من هدايا أشخاص حقيقيين غير مرتبطين، ويحظر عرض أول شحنة عن
 * أبرياء). IP يبقى إشارة خطر إدارية بحتة لعرضها فقط — راجع findSameIpAccountCount
 * بـdepositIntentController.js — لا تُستخدم أبداً هنا لتحديد الربط الفعلي
 */
async function areLinked(userIdA, userIdB) {
    if (!userIdA || !userIdB || String(userIdA) === String(userIdB)) return false;

    const [sessionsA, sessionsB] = await Promise.all([
        DeviceSession.find({ user: userIdA }).select('deviceId').lean(),
        DeviceSession.find({ user: userIdB }).select('deviceId').lean()
    ]);

    const devicesA = new Set(sessionsA.filter(s => s.deviceId).map(s => s.deviceId));
    if (sessionsB.some(s => s.deviceId && devicesA.has(s.deviceId))) return true;

    const [walletsA, walletsB] = await Promise.all([
        Withdrawal.find({ user: userIdA, method: 'sham_cash' }).select('walletNumber').lean(),
        Withdrawal.find({ user: userIdB, method: 'sham_cash' }).select('walletNumber').lean()
    ]);
    const walletSetA = new Set(walletsA.map(w => w.walletNumber).filter(Boolean));
    if (walletsB.some(w => w.walletNumber && walletSetA.has(w.walletNumber))) return true;

    return false;
}

// ✅ feat/live-hours-host-center: نسخة بالجملة من areLinked أعلاه — نفس معياري الربط تماماً
// (معرّف جهاز مشترك، أو محفظة شام كاش سُحب منها سابقاً لكليهما)، لكن بنداءين فقط لقاعدة
// البيانات إجمالاً بصرف النظر عن عدد المستخدمين (لا O(n²) من استدعاء areLinked لكل زوج) —
// يُستخدَم بتِك البث الدوري لتجميع مستمعي الغرفة بمجموعات مرتبطة (راجع countQualifyingListeners
// بـsocketService.js). يُعيد Map: userId(نص) → مفتاح تمثيلي لمجموعته (نفس المفتاح لكل مرتبطين
// ببعضهم، عبر Union-Find بسيط بالذاكرة)
async function groupLinkedAccounts(userIds) {
    const ids = [...new Set(userIds.map(String))];
    const parent = new Map(ids.map(id => [id, id]));
    function find(x) { while (parent.get(x) !== x) x = parent.get(x); return x; }
    function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); }

    const [sessions, withdrawals] = await Promise.all([
        DeviceSession.find({ user: { $in: ids } }).select('user deviceId').lean(),
        Withdrawal.find({ user: { $in: ids }, method: 'sham_cash' }).select('user walletNumber').lean()
    ]);

    const byDevice = new Map();
    for (const s of sessions) {
        if (!s.deviceId) continue;
        const uid = s.user.toString();
        if (byDevice.has(s.deviceId)) union(uid, byDevice.get(s.deviceId));
        else byDevice.set(s.deviceId, uid);
    }
    const byWallet = new Map();
    for (const w of withdrawals) {
        if (!w.walletNumber) continue;
        const uid = w.user.toString();
        if (byWallet.has(w.walletNumber)) union(uid, byWallet.get(w.walletNumber));
        else byWallet.set(w.walletNumber, uid);
    }

    const groupKey = new Map();
    for (const id of ids) groupKey.set(id, find(id));
    return groupKey;
}

module.exports = { recordDeviceSession, areLinked, groupLinkedAccounts };
