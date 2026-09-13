// =====================================================
// ✅ فلترة كلمات مسيئة بدردشة الغرف الصوتية
// -----------------------------------------------------
// المطابقة تتم على نسخة "مطبّعة" من النص (بدون تشكيل/مسافات/تطويل حروف) حتى لا يتحايل
// المستخدم بمسافات بين الحروف أو تكرارها أو تشكيل عشوائي. القائمة مقصودة أن تبقى بالكلمات
// الفجّة/الجنسية الصريحة والشتائم غير المُلتبسة فقط — تجنّباً لحظر كلمات عادية لها استخدام بريء.
// =====================================================

// ✅ يوحّد أشكال الحروف العربية المتقاربة (لأن كثير من التحايل يعتمد استبدال حرف بآخر قريب الشكل)
function normalizeArabicLetters(text) {
    return text
        .replace(/[أإآا]/g, 'ا')
        .replace(/[ىي]/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي');
}

// ✅ يزيل التشكيل والتطويل (الحركات + ـ) ثم يوحّد الحروف، دون لمس الفراغات (تُزال بدالة منفصلة أدناه)
function stripDiacritics(text) {
    return text.replace(/[ً-ٰٟـ]/g, '');
}

// ✅ نسخة "مضغوطة" بلا فراغات/رموز — تكشف التحايل بمسافات بين الحروف (ك س م ← كسم)
function toCompactForm(text) {
    const cleaned = normalizeArabicLetters(stripDiacritics(text.toLowerCase()));
    return cleaned.replace(/[^a-zء-ي0-9]/g, '');
}

// ✅ يطوي أي حرف لاتيني متكرر 3 مرات فأكثر لحرف واحد (fuuuuck ← fuck) لمنع تحايل الإطالة
function collapseRepeats(text) {
    return text.replace(/([a-z])\1{2,}/g, '$1');
}

// 🛡️ قائمة الكلمات الممنوعة — عربي (بالشكل المطبّع أعلاه) + إنجليزي.
// مقصودة لتبقى شتائم/ألفاظ جنسية صريحة غير مُلتبسة فقط (لا كلمات عادية لها استخدام بريء).
const ARABIC_BANNED = [
    'كسم', 'كسمك', 'كسختك', 'يلعن', 'منيك', 'منيوك', 'شرموط', 'شرموطه', 'قحبه', 'قحبة',
    'زبي', 'زبك', 'طيزك', 'طيزي', 'عرص', 'خول', 'خرا', 'كسختكم', 'ابن الشرموطه', 'ابن القحبه',
    'نيك', 'نياك', 'ينيك', 'تنيك', 'وسخه'
];

const ENGLISH_BANNED = [
    'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'whore', 'slut', 'dick', 'pussy', 'faggot', 'motherfucker'
];

const ARABIC_BANNED_COMPACT = ARABIC_BANNED.map(w => toCompactForm(w));

/**
 * ✅ يتحقق هل يحتوي النص على لفظ ممنوع (عربي أو إنجليزي) — بعد تطبيع كامل يمنع التحايل الشائع
 * (مسافات بين الحروف، تشكيل، تكرار حروف، اختلاف شكل الألف/الياء/التاء المربوطة).
 */
function containsProfanity(rawText) {
    if (!rawText || typeof rawText !== 'string') return false;

    const compact = toCompactForm(rawText);
    if (ARABIC_BANNED_COMPACT.some(w => w && compact.includes(w))) return true;

    const englishNormalized = collapseRepeats(rawText.toLowerCase().replace(/[^a-z]/g, ' '));
    const englishWords = englishNormalized.split(/\s+/).filter(Boolean);
    if (ENGLISH_BANNED.some(bad => englishWords.includes(bad))) return true;

    // ✅ يمسك أيضاً الإنجليزي المكتوب ملتصقاً بدون مسافات كوسيلة تحايل شائعة
    const englishCompact = collapseRepeats(rawText.toLowerCase()).replace(/[^a-z]/g, '');
    if (ENGLISH_BANNED.some(bad => englishCompact.includes(bad))) return true;

    return false;
}

module.exports = { containsProfanity };
