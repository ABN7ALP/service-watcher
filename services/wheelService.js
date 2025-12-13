// هذا هو "العقل المدبر" للنظام

// 1. تعريف شرائح العجلة وقيمها النفسية (كما في الخريطة الذهنية)
const wheelPrizes = [
    { value: 0.00, label: '0.00$', probability: 0.45, type: 'loss' },       // 45% خسارة
    { value: 0.10, label: '0.10$', probability: 0.25, type: 'near_win' },   // 25% قريب من الربح
    { value: 0.25, label: '0.25$', probability: 0.15, type: 'small_win' },  // 15% ربح صغير
    { value: 0.50, label: '0.50$', probability: 0.10, type: 'medium_win' }, // 10% ربح متوسط
    { value: 1.00, label: '1.00$', probability: 0.04, type: 'big_win' },    // 4% ربح كبير
    { value: 5.00, label: '5.00$', probability: 0.01, type: 'jackpot' }     // 1% الجائزة الكبرى
];

// 2. حساب متوسط الربح المتوقع (للتأكد من أن النظام مربح)
// (0.45*0) + (0.25*0.10) + (0.15*0.25) + (0.10*0.50) + (0.04*1.00) + (0.01*5.00) = 0.2025
// إذا كانت تكلفة اللفة 0.25$، فإن ربحنا الصافي لكل لفة هو 0.25 - 0.2025 = 0.0475$
const EXPECTED_RETURN = wheelPrizes.reduce((acc, p) => acc + (p.value * p.probability), 0);
console.log(`💡 Expected return per spin: $${EXPECTED_RETURN.toFixed(4)}`);

/**
 * الدالة الرئيسية لتحديد نتيجة اللفة
 * @param {object} user - كائن المستخدم من قاعدة البيانات
 * @returns {object} - الكائن الذي يمثل الجائزة التي تم الفوز بها
 */
function determineSpinResult(user) {
    // --- هنا يبدأ المنطق التكيفي (Adaptive Logic) ---
    // في المستقبل، يمكننا جعل هذا المنطق أكثر تعقيداً

    let currentProbabilities = [...wheelPrizes]; // نسخة من الاحتمالات الأساسية

    // مثال على قاعدة بسيطة: إذا كان هذا أول لفة للمستخدم، نزيد فرصة فوزه بربح صغير
    if (user.stats.totalSpins === 0) {
        console.log(`✨ First spin for user ${user.username}. Applying beginner's luck.`);
        // يمكننا هنا تعديل مصفوفة currentProbabilities لزيادة فرصة الربح الصغير
        // (سنتركها بسيطة الآن للتركيز على الأساسيات)
    }

    // --- منطق الاختيار العشوائي المبني على الاحتمالات ---
    const rand = Math.random(); // رقم عشوائي بين 0 و 1
    let cumulativeProbability = 0;

    for (const prize of currentProbabilities) {
        cumulativeProbability += prize.probability;
        if (rand < cumulativeProbability) {
            return prize; // تم اختيار هذه الجائزة
        }
    }

    // كاحتياط، إذا لم يتم اختيار أي شيء (لا يجب أن يحدث)
    return wheelPrizes.find(p => p.type === 'loss');
}

module.exports = {
    determineSpinResult,
    wheelPrizes,
    COST_PER_SPIN: 0.25, // تعريف تكلفة اللفة هنا
    SPIN_COOLDOWN_SECONDS: 5 // 5 ثوانٍ بين كل لفة
};
