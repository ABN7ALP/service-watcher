// ملف: check-frames.test.js
// 🛡️ طلب صريح بمراجعة PR (جولة 2): "wire it into npm test" — يُشغِّل checkFrameFile الحقيقية
// (../check-frames) ضد كل ملف فعلي حالياً بـpublic/assets/frames (لا أصول اصطناعية) فيفشل
// `npm test` فوراً لو أي إطار مستقبلي (تعديل يدوي، تشغيل سكربت بإعدادات مختلفة...) يُعيد
// إدخال قصّ الحافة أو فتحة غير شفافة بصمت — لا ينتظر مراجعة بشرية لاحقة لاكتشافه
// 🛡️ تحديث جولة 3: يضيف checkFrameTiming (سرعة حلقة الحركة ±5% من المصدر الحقيقي + حدّ أدنى
// لعدد اللقطات) على كل ملف رئيسي (غير -static)، وتأكيد أن كل نسخة -static لقطة واحدة فقط
const fs = require('fs');
const path = require('path');
const { checkFrameFile, checkFrameTiming, loadFramesManifestData, STATIC_VARIANT_SUFFIX, FRAMES_DIR } = require('../check-frames');

const allFiles = fs.existsSync(FRAMES_DIR)
    ? fs.readdirSync(FRAMES_DIR).filter(f => f.endsWith('.webp')).sort()
    : [];
const staticFiles = allFiles.filter(f => f.endsWith(STATIC_VARIANT_SUFFIX));
const mainFiles = allFiles.filter(f => !f.endsWith(STATIC_VARIANT_SUFFIX));
const manifestData = loadFramesManifestData();

describe('check-frames — كل أصل إطار حقيقي بـpublic/assets/frames بلا قصّ حافة وبفتحة شفافة', () => {
    test('public/assets/frames يحوي ملفات .webp فعلاً (لا يفشل الاختبار صامتاً بمجلد فارغ)', () => {
        expect(allFiles.length).toBeGreaterThan(0);
    });

    test.each(allFiles)('%s: لا قصّ حافة (alpha>16 ضمن 2px) وفتحة مركزية شفافة فعلاً', async (file) => {
        const result = await checkFrameFile(path.join(FRAMES_DIR, file));
        if (!result.ok) {
            throw new Error(`${file} ينتهك: ${result.violations.join(' | ')}`);
        }
        expect(result.ok).toBe(true);
    }, 20000);

    // 🛡️ طلب صريح جولة 3: "الاختبار الآلي يجب أن يتحقق أيضاً من: عدد اللقطات ≥ min(لقطات
    // المصدر, 16)، ومدة حلقة الحركة تطابق المصدر ±5%" — على الملفات الرئيسية (المتحركة
    // فعلياً، لا contributor الثابت أصلاً ولا النسخ -static) حصراً
    test.each(mainFiles.filter(f => manifestData[path.basename(f, '.webp')]?.sourcePageCount > 1))(
        '%s: مدة حلقة الحركة ومعدّل لقطاتها يطابقان المصدر الحقيقي (لا أسرع/أبطأ بصمت)',
        async (file) => {
            const result = await checkFrameTiming(path.join(FRAMES_DIR, file), manifestData);
            if (!result.ok) {
                throw new Error(`${file} ينتهك: ${result.violations.join(' | ')}`);
            }
            expect(result.ok).toBe(true);
            expect(result.skipped).toBe(false);
        },
        20000
    );

    test.each(staticFiles)('%s: نسخة ثابتة — لقطة واحدة بالضبط (لا حركة، تُستخدَم بـprefers-reduced-motion)', async (file) => {
        const meta = await require('sharp')(path.join(FRAMES_DIR, file), { animated: true }).metadata();
        expect(meta.pages || 1).toBe(1);
    }, 20000);
});
