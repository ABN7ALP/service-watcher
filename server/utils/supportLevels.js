// ملف: server/utils/supportLevels.js
//
// ✅ سلّم "مستوى الدعم" المشترك — نفس السلّم يُستنسخ لمسارين منفصلين تماماً بالواجهة:
//   - "دعم" (giving): مجموع الكوينز التي أرسلها المستخدم كهدايا لآخرين (سخاؤه)
//   - "تلقي" (receiving): مجموع الكوينز التي استلمها المستخدم فعلياً كهدايا (شعبيته/ثراؤه)
// منحنى تصاعدي غير خطي (كل مستوى يحتاج دعماً أكبر من سابقه بفارق متزايد، يتباطأ تدريجياً كلما
// ارتفع المستوى) — نفس النمط المعتمد بتطبيقات البث المباشر المشهورة (مستويات رخيصة بالبداية،
// باهظة عند القمة)، مُوسَّع الآن إلى 80 مستوى (كان محدوداً بـ16)، مقسّم لأربع فئات مسمّاة
// (مبتدئ/محترف/خبير/مخضرم)، 20 مستوى لكل فئة. المستويات 1-16 الأصلية لم تتغيّر إطلاقاً
// (حفاظاً على مستويات المستخدمين الحاليين كما هي)؛ 17-80 امتداد جديد لنفس المنحنى
const SUPPORT_LEVEL_THRESHOLDS = [
    // --- الفئة الأولى: مبتدئ (Lv.1 - Lv.20) ---
    0, 100, 800, 2500, 6000,               // Lv.1  - Lv.5
    12000, 22000, 38000, 60000, 100000,    // Lv.6  - Lv.10
    160000, 250000, 400000, 650000, 1000000, // Lv.11 - Lv.15
    1600000, 1800000, 2100000, 2400000, 2800000, // Lv.16 - Lv.20

    // --- الفئة الثانية: محترف (Lv.21 - Lv.40) ---
    3200000, 3600000, 4100000, 4600000, 5300000,     // Lv.21 - Lv.25
    6000000, 6700000, 7600000, 8500000, 9600000,     // Lv.26 - Lv.30
    11000000, 12000000, 13000000, 15000000, 17000000, // Lv.31 - Lv.35
    18000000, 20000000, 22000000, 25000000, 27000000, // Lv.36 - Lv.40

    // --- الفئة الثالثة: خبير (Lv.41 - Lv.60) ---
    30000000, 33000000, 36000000, 39000000, 43000000, // Lv.41 - Lv.45
    47000000, 51000000, 55000000, 59000000, 64000000, // Lv.46 - Lv.50
    69000000, 74000000, 80000000, 85000000, 91000000, // Lv.51 - Lv.55
    98000000, 100000000, 110000000, 120000000, 130000000, // Lv.56 - Lv.60

    // --- الفئة الرابعة: مخضرم (Lv.61 - Lv.80) ---
    140000000, 150000000, 160000000, 170000000, 180000000, // Lv.61 - Lv.65
    190000000, 200000000, 210000000, 220000000, 230000000, // Lv.66 - Lv.70
    240000000, 250000000, 260000000, 270000000, 280000000, // Lv.71 - Lv.75
    290000000, 300000000, 310000000, 320000000, 330000000  // Lv.76 - Lv.80 (الحد الأقصى الحالي)
];

const SUPPORT_TIERS = [
    { name: 'مبتدئ', from: 1, to: 20 },
    { name: 'محترف', from: 21, to: 40 },
    { name: 'خبير', from: 41, to: 60 },
    { name: 'مخضرم', from: 61, to: 80 }
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
