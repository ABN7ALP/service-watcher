// ملف: check-frames.test.js
// 🛡️ طلب صريح بمراجعة PR (جولة 2): "wire it into npm test" — يُشغِّل checkFrameFile الحقيقية
// (../check-frames) ضد كل ملف فعلي حالياً بـpublic/assets/frames (لا أصول اصطناعية) فيفشل
// `npm test` فوراً لو أي إطار مستقبلي (تعديل يدوي، تشغيل سكربت بإعدادات مختلفة...) يُعيد
// إدخال قصّ الحافة أو فتحة غير شفافة بصمت — لا ينتظر مراجعة بشرية لاحقة لاكتشافه
const fs = require('fs');
const path = require('path');
const { checkFrameFile, FRAMES_DIR } = require('../check-frames');

const files = fs.existsSync(FRAMES_DIR)
    ? fs.readdirSync(FRAMES_DIR).filter(f => f.endsWith('.webp')).sort()
    : [];

describe('check-frames — كل أصل إطار حقيقي بـpublic/assets/frames بلا قصّ حافة وبفتحة شفافة', () => {
    test('public/assets/frames يحوي ملفات .webp فعلاً (لا يفشل الاختبار صامتاً بمجلد فارغ)', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    test.each(files)('%s: لا قصّ حافة (alpha>16 ضمن 2px) وفتحة مركزية شفافة فعلاً', async (file) => {
        const result = await checkFrameFile(path.join(FRAMES_DIR, file));
        if (!result.ok) {
            throw new Error(`${file} ينتهك: ${result.violations.join(' | ')}`);
        }
        expect(result.ok).toBe(true);
    }, 20000);
});
