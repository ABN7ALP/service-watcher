// ملف: server/utils/fanClubLevels.js
//
// ✅ سلّم "مستوى المعجب" — منفصل تماماً عن سلّم "مستوى الدعم" العام (supportLevels.js).
// هذا السلّم مُقاس لكل علاقة (معجب واحد ↔ صاحب نادٍ واحد) وليس إجمالي المستخدم عبر المنصّة
// كلها — بنفس فلسفة أندية المعجبين بتطبيقات البث المشهورة (Bigo Fan Group وTikTok LIVE Fan
// Club): كل كوينز يُنفَق كهدية لصاحب النادي = نقطة معجب واحدة، تتراكم للأبد بلا أي تصفير،
// مقسّمة لـ20 مستوى ضمن 5 فئات (5 برونزي، 5 فضي، 5 ذهبي، 5 بلاتيني، 5 أسطوري) — كل فئة
// شارتها وتدرّجها اللوني مختلف، تُحسب تلقائياً من المستوى (لا اختيار حر للمستخدم)
// 🛡️ مراجعة fanclub-v2: العتبات القديمة لم تُضخَّم أبداً مع تضخيم أسعار الكوينز ×10 (كانت
// Lv.20=6,000,000 بينما سعر الانضمام نفسه ظل 10 كوينز — غير متّسق تماماً مع معدّل 1:1 الحقيقي
// الحالي). عتبات جديدة بالكامل، مُجمَّعة بالتساوي 4 مستويات/فئة (بدل 4/5/5/4/2 غير المتّسقة
// سابقاً). نقاط الأعضاء الحاليين تبقى كما هي بالضبط (points لا تُمسّ بأي ترحيل) — فقط موضعهم
// على السلّم الجديد يُعاد حسابه حياً من نفس الرقم المخزَّن، كبقية مستويات هذا المشروع
const FAN_LEVEL_THRESHOLDS = [
    0, 200, 600, 1500,                          // Lv.1  - Lv.4  (برونزي)
    3000, 6000, 10000, 16000,                   // Lv.5  - Lv.8  (فضي)
    25000, 40000, 60000, 90000,                 // Lv.9  - Lv.12 (ذهبي)
    130000, 180000, 250000, 350000,             // Lv.13 - Lv.16 (بلاتيني)
    500000, 700000, 1000000, 1500000            // Lv.17 - Lv.20 (أسطوري، الحد الأقصى الحالي)
];

const FAN_TIERS = [
    { name: 'برونزي', from: 1, to: 4, gradient: ['#b45309', '#78350f'], icon: 'fa-shield-halved' },
    { name: 'فضي', from: 5, to: 8, gradient: ['#cbd5e1', '#64748b'], icon: 'fa-medal' },
    { name: 'ذهبي', from: 9, to: 12, gradient: ['#fbbf24', '#b45309'], icon: 'fa-crown' },
    { name: 'بلاتيني', from: 13, to: 16, gradient: ['#67e8f9', '#0e7490'], icon: 'fa-gem' },
    { name: 'أسطوري', from: 17, to: 20, gradient: ['#f0abfc', '#a855f7'], icon: 'fa-meteor' }
];

const MAX_FAN_LEVEL = FAN_LEVEL_THRESHOLDS.length;

function computeFanLevelInfo(points) {
    const pts = Math.max(0, Number(points) || 0);
    let level = 1;
    for (let i = 0; i < FAN_LEVEL_THRESHOLDS.length; i++) {
        if (pts >= FAN_LEVEL_THRESHOLDS[i]) level = i + 1;
    }
    const isMax = level >= MAX_FAN_LEVEL;
    const currentThreshold = FAN_LEVEL_THRESHOLDS[level - 1];
    const nextThreshold = isMax ? null : FAN_LEVEL_THRESHOLDS[level];
    const pointsToNext = isMax ? 0 : Math.max(0, nextThreshold - pts);
    const progressPercent = isMax
        ? 100
        : Math.max(0, Math.min(100, Math.round(((pts - currentThreshold) / (nextThreshold - currentThreshold)) * 100)));
    const tier = FAN_TIERS.find(t => level >= t.from && level <= t.to) || FAN_TIERS[FAN_TIERS.length - 1];
    const tierIndex = FAN_TIERS.indexOf(tier) + 1;

    return {
        level,
        points: pts,
        tierName: tier.name,
        tierIndex,
        tierIcon: tier.icon,
        tierGradient: tier.gradient,
        currentThreshold,
        nextThreshold,
        pointsToNext,
        progressPercent,
        isMax
    };
}

module.exports = { FAN_LEVEL_THRESHOLDS, FAN_TIERS, MAX_FAN_LEVEL, computeFanLevelInfo };
