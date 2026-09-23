// ملف: server/utils/supportLevels.js
//
// ✅ سلّم "مستوى الدعم" المشترك — نفس السلّم يُستنسخ لمسارين منفصلين تماماً بالواجهة:
//   - "دعم" (giving): مجموع الكوينز التي أرسلها المستخدم كهدايا لآخرين (سخاؤه)
//   - "تلقي" (receiving): مجموع الكوينز التي استلمها المستخدم فعلياً كهدايا (شعبيته/ثراؤه)
// منحنى تصاعدي غير خطي (كل مستوى يحتاج دعماً أكبر من سابقه بفارق متزايد) — نفس النمط
// المعتمد بتطبيقات البث المباشر المشهورة (مستويات رخيصة بالبداية، باهظة عند القمة)، مقسّم
// لأربع فئات مسمّاة (مبتدئ/محترف/خبير/مخضرم)، أربعة مستويات لكل فئة
const SUPPORT_LEVEL_THRESHOLDS = [
    0,       // Lv.1
    100,     // Lv.2
    800,     // Lv.3
    2500,    // Lv.4
    6000,    // Lv.5
    12000,   // Lv.6
    22000,   // Lv.7
    38000,   // Lv.8
    60000,   // Lv.9
    100000,  // Lv.10
    160000,  // Lv.11
    250000,  // Lv.12
    400000,  // Lv.13
    650000,  // Lv.14
    1000000, // Lv.15
    1600000  // Lv.16 (الحد الأقصى الحالي)
];

const SUPPORT_TIERS = [
    { name: 'مبتدئ', from: 1, to: 4 },
    { name: 'محترف', from: 5, to: 8 },
    { name: 'خبير', from: 9, to: 12 },
    { name: 'مخضرم', from: 13, to: 16 }
];

const MAX_LEVEL = SUPPORT_LEVEL_THRESHOLDS.length;

function computeSupportLevelInfo(totalCoins) {
    const coins = Math.max(0, Number(totalCoins) || 0);
    let level = 1;
    for (let i = 0; i < SUPPORT_LEVEL_THRESHOLDS.length; i++) {
        if (coins >= SUPPORT_LEVEL_THRESHOLDS[i]) level = i + 1;
    }
    const isMax = level >= MAX_LEVEL;
    const currentThreshold = SUPPORT_LEVEL_THRESHOLDS[level - 1];
    const nextThreshold = isMax ? null : SUPPORT_LEVEL_THRESHOLDS[level];
    const pointsToNext = isMax ? 0 : Math.max(0, nextThreshold - coins);
    const progressPercent = isMax
        ? 100
        : Math.max(0, Math.min(100, Math.round(((coins - currentThreshold) / (nextThreshold - currentThreshold)) * 100)));
    const tier = SUPPORT_TIERS.find(t => level >= t.from && level <= t.to) || SUPPORT_TIERS[SUPPORT_TIERS.length - 1];
    const tierIndex = SUPPORT_TIERS.indexOf(tier) + 1;

    return {
        level,
        points: coins,
        tierName: tier.name,
        tierIndex,
        currentThreshold,
        nextThreshold,
        pointsToNext,
        progressPercent,
        isMax
    };
}

module.exports = { SUPPORT_LEVEL_THRESHOLDS, SUPPORT_TIERS, MAX_LEVEL, computeSupportLevelInfo };
