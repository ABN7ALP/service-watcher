// ملف: normalize-frames.test.js
// 🛡️ طلب صريح بمراجعة PR (جولة 2 — إصلاح جوهري): يُحوِّل منطق --selftest اليدوي بـnormalize-
// frames.js إلى اختبار Jest دائم — يضمن أن أي تعديل مستقبلي على خوارزمية كشف الفتحة/الاحتواء/
// التحجيم/التركيب لا يكسر الضمانين الأساسيين بصمت: (1) فتحة 50% مركّزة حين يسمح الهامش،
// (2) احتواء الفنّ الخارجي بهامش ≥8px من حافة لوحة 512×512 حين لا يسمح — بلا أي قصّ حافة
// بأي حالة. بلا الحاجة لتشغيل السكربت يدوياً كل مرة.
//
// لا وصول شبكي لازماً هنا — صور مصدر اصطناعية مبنية محلياً بـsharp، تماماً كمحاكاة Mongoose
// ببقية اختبارات المشروع بدل قاعدة بيانات حقيقية
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const {
    normalizeOne, detectOpeningRadius, distributeDelays, loadFramesManifest,
    CANVAS_SIZE, TARGET_RADIUS, TARGET_OPENING_RATIO, MAX_ART_RADIUS, MAX_ANIMATED_FRAMES
} = require('../normalize-frames');
const { checkFrameFile } = require('../check-frames');

// ✅ artRadius (نصف قطر القرص الملوّن الخارجي — "الفنّ"): افتراضياً 1.4×radius (هامش واضح
// تحت الحدّ الفاصل MAX_ART_RADIUS/TARGET_RADIUS≈1.9375 — قيد الفتحة هو الفعّال، الحالة
// الشائعة باختبارات هذا الملف لأنها تختبر تنوّع نسب/دقة الفتحة نفسها لا الاحتواء). تمرير
// artRadius:null صراحة = فنّ يملأ اللوحة كاملة (الحالة edge-to-edge — قيد الاحتواء يتفعّل)
async function buildSource({ size, radius, artRadius = radius * 1.4, color = { r: 212, g: 175, b: 55 } }) {
    const outerR = artRadius === null ? size / 2 : artRadius;
    const baseSvg = `<svg width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${outerR}" fill="rgba(${color.r},${color.g},${color.b},1)"/>
    </svg>`;
    const holeSvg = `<svg width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="black"/>
    </svg>`;
    const base = await sharp(Buffer.from(baseSvg)).png().toBuffer();
    const holeMask = await sharp(Buffer.from(holeSvg)).png().toBuffer();
    return sharp(base).composite([{ input: holeMask, blend: 'dest-out' }]).png().toBuffer();
}

let tmpDir;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'normalize-frames-jest-'));
});
afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function normalizeAndMeasure(name, srcSpec) {
    const buf = await buildSource(srcSpec);
    const srcPath = path.join(tmpDir, `${name}.png`);
    fs.writeFileSync(srcPath, buf);
    const result = await normalizeOne(name, srcPath, { outDir: path.join(tmpDir, 'out'), verbose: false, manifestOverrides: {} });
    const { data, info } = await sharp(result.outPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const measured = detectOpeningRadius(data, info.width, info.height, info.channels);
    return { result, info, measured };
}

describe('normalizeOne — هامش كافٍ حول الفنّ: فتحة 50% مركّزة (القالب الموحَّد)', () => {
    test.each([
        ['small-radius-ratio', { size: 400, radius: 60 }],
        ['large-radius-ratio', { size: 300, radius: 90 }],
        ['tiny-source', { size: 128, radius: 24 }],
        ['huge-source', { size: 900, radius: 220 }]
    ])('%s: لوحة نهائية مربّعة (CANVAS_SIZE) بفتحة 50%% مركّزة، بلا أي قصّ حافة', async (name, spec) => {
        const { result, info, measured } = await normalizeAndMeasure(name, spec);

        expect(info.width).toBe(CANVAS_SIZE);
        expect(info.height).toBe(CANVAS_SIZE);
        expect(result.containmentBound).toBe(false); // ✅ هامش هذي الحالات كافٍ — قيد الفتحة هو الفعّال دوماً
        // ✅ تسامح نسبي (2.5%) — تمويه طبيعي من نواة إعادة التحجيم عند تكبير مصادر منخفضة
        // الدقة بمعامل كبير، لا خلل بالخوارزمية
        const tolerance = Math.max(1.5, TARGET_RADIUS * 0.025);
        expect(Math.abs(measured.radius - TARGET_RADIUS)).toBeLessThanOrEqual(tolerance);
        expect(Math.abs(measured.cx - CANVAS_SIZE / 2)).toBeLessThanOrEqual(1.5);
        expect(Math.abs(measured.cy - CANVAS_SIZE / 2)).toBeLessThanOrEqual(1.5);

        // ✅ الضمان الجوهري بمراجعة الجولة الثانية: فحص check-frames.js الحقيقي نفسه يمرّ
        const check = await checkFrameFile(result.outPath);
        expect(check.ok).toBe(true);
    });

    test('مصدر متحرك (عدة لقطات) يُعيد ناتجاً متحركاً بنفس عدد اللقطات، لا يفقد الحركة بالتركيب', async () => {
        const frames = 3;
        const pages = [];
        for (let i = 0; i < frames; i++) {
            const color = i % 2 === 0 ? { r: 212, g: 175, b: 55 } : { r: 90, g: 60, b: 200 };
            const frameBuf = await buildSource({ size: 400, radius: 100, color });
            pages.push(await sharp(frameBuf).ensureAlpha().raw().toBuffer());
        }
        const animatedSrc = await sharp(Buffer.concat(pages), {
            raw: { width: 400, height: 400 * frames, channels: 4, pageHeight: 400 }
        }).webp({ loop: 0 }).toBuffer();
        const srcPath = path.join(tmpDir, 'animated.webp');
        fs.writeFileSync(srcPath, animatedSrc);

        const result = await normalizeOne('animated-source', srcPath, { outDir: path.join(tmpDir, 'out'), verbose: false, manifestOverrides: {} });

        expect(result.isAnimated).toBe(true);
        const outMeta = await sharp(result.outPath, { animated: true }).metadata();
        expect(outMeta.pages).toBe(frames);
        expect(outMeta.width).toBe(CANVAS_SIZE);
        const check = await checkFrameFile(result.outPath);
        expect(check.ok).toBe(true);

        // 🛡️ طلب صريح جولة 3: نسخة ثابتة (لقطة واحدة) تُولَّد دوماً، حتى لمصدر متحرك
        const staticMeta = await sharp(result.staticOutPath, { animated: true }).metadata();
        expect(staticMeta.pages || 1).toBe(1);
        expect(staticMeta.width).toBe(CANVAS_SIZE);
        const staticCheck = await checkFrameFile(result.staticOutPath);
        expect(staticCheck.ok).toBe(true);
    });

    test('فتحة غير قابلة للاكتشاف (مصدر صلب بلا شفافية) يرمي خطأً واضحاً بدل ناتج فاسد صامت', async () => {
        const solid = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } }).png().toBuffer();
        const srcPath = path.join(tmpDir, 'solid.png');
        fs.writeFileSync(srcPath, solid);

        await expect(normalizeOne('solid-no-opening', srcPath, { outDir: path.join(tmpDir, 'out'), verbose: false, manifestOverrides: {} }))
            .rejects.toThrow(/تعذّر اكتشاف فتحة/);
    });
});

describe('normalizeOne — قيد الاحتواء: فنّ يصل حافة لوحة المصدر (بلا هامش أصلي)', () => {
    test('فنّ يملأ لوحة المصدر كاملة → فتحة أصغر من 50% عمداً، بلا أي قصّ حافة (هامش ≥8px فعلي)', async () => {
        const result = await normalizeAndMeasure('edge-to-edge', { size: 400, radius: 70, artRadius: null }).then(r => r.result);

        expect(result.containmentBound).toBe(true);
        expect(result.effectiveOpeningRatio).toBeLessThan(TARGET_OPENING_RATIO - 0.005);
        expect(result.effectiveOpeningRatio).toBeGreaterThan(0.15); // ✅ ليست صفراً/شبه معدومة — احتواء معقول لا انهيار كامل

        const check = await checkFrameFile(result.outPath);
        expect(check.ok).toBe(true); // ✅ الضمان الجوهري: لا قصّ حافة رغم أن الفنّ وصل حافة المصدر أصلاً

        // ✅ نصف قطر الفنّ النهائي (بعد التحجيم) لا يتجاوز MAX_ART_RADIUS فعلياً — مقيس مباشرة
        // على الناتج (لا افتراضاً من قيمة scale المحسوبة فقط)
        const { data, info } = await sharp(result.outPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const cx = info.width / 2, cy = info.height / 2;
        let maxRSq = 0;
        for (let y = 0; y < info.height; y++) {
            for (let x = 0; x < info.width; x++) {
                const a = data[(y * info.width + x) * info.channels + 3];
                if (a > 16) {
                    const dx = x - cx, dy = y - cy;
                    const rSq = dx * dx + dy * dy;
                    if (rSq > maxRSq) maxRSq = rSq;
                }
            }
        }
        expect(Math.sqrt(maxRSq)).toBeLessThanOrEqual(MAX_ART_RADIUS + 1); // ±1px تسامح تقريب
    });

    test('مصدر متحرك يصل حافة المصدر بكل لقطاته → احتواء يحمي كل اللقطات، لا الأولى فقط', async () => {
        const frames = 3;
        const pages = [];
        for (let i = 0; i < frames; i++) {
            const color = i % 2 === 0 ? { r: 212, g: 175, b: 55 } : { r: 90, g: 60, b: 200 };
            const frameBuf = await buildSource({ size: 400, radius: 70, artRadius: null, color });
            pages.push(await sharp(frameBuf).ensureAlpha().raw().toBuffer());
        }
        const animatedSrc = await sharp(Buffer.concat(pages), {
            raw: { width: 400, height: 400 * frames, channels: 4, pageHeight: 400 }
        }).webp({ loop: 0 }).toBuffer();
        const srcPath = path.join(tmpDir, 'animated-edge.webp');
        fs.writeFileSync(srcPath, animatedSrc);

        const result = await normalizeOne('animated-edge-to-edge', srcPath, { outDir: path.join(tmpDir, 'out'), verbose: false, manifestOverrides: {} });
        expect(result.containmentBound).toBe(true);

        const check = await checkFrameFile(result.outPath);
        expect(check.ok).toBe(true); // ✅ كل اللقطات الثلاث فُحصت، لا الأولى فقط
    });
});

// 🛡️ طلب صريح بمراجعة PR (جولة 3): الحركة كانت أسرع من مصدرها الحقيقي بـ2-4.4× (تأخير ثابت
// 90ms/لقطة بصرف النظر عن توقيت المصدر) — راجع رأس normalize-frames.js لتفاصيل كاملة. هذي
// المجموعة تثبت: (1) distributeDelays (دالة التوزيع المصدرة) تطابق مجموع المصدر بالضبط لأي
// تأخيرات (منتظمة أو غير منتظمة)، (2) normalizeOne الحقيقية تحافظ على هذي المطابقة من البداية
// للنهاية حتى لمصدر بعدد لقطات أكبر بكثير من MAX_ANIMATED_FRAMES (يفرض تجميع حقيقي متعدد
// اللقطات لكل لقطة محفوظة، لا مجرد لقطة-لواحد)
describe('distributeDelays — توزيع تأخيرات المصدر على اللقطات المحفوظة (جولة 3)', () => {
    test('مجموع تأخيرات الناتج يطابق مجموع تأخيرات المصدر بالضبط — تأخيرات منتظمة', () => {
        const sourceDelays = new Array(10).fill(40); // ✅ يحاكي مصادر Cloudinary الحقيقية (40ms/لقطة)
        const pageIndices = [0, 3, 6]; // ✅ مجموعات: [0-2]=3 لقطات، [3-5]=3 لقطات، [6-9]=4 لقطات
        const delays = distributeDelays(sourceDelays, pageIndices, 10);
        expect(delays).toEqual([120, 120, 160]);
        expect(delays.reduce((a, b) => a + b, 0)).toBe(sourceDelays.reduce((a, b) => a + b, 0));
    });

    test('مجموع تأخيرات الناتج يطابق مجموع تأخيرات المصدر بالضبط — تأخيرات غير منتظمة عمداً', () => {
        const sourceDelays = [50, 30, 70, 20, 90, 10, 40, 60];
        const pageIndices = [0, 2, 5]; // مجموعات: [0-1], [2-4], [5-7]
        const delays = distributeDelays(sourceDelays, pageIndices, 8);
        expect(delays).toEqual([80, 180, 110]);
        expect(delays.reduce((a, b) => a + b, 0)).toBe(sourceDelays.reduce((a, b) => a + b, 0));
    });

    test('لقطة محفوظة واحدة لكل لقطة مصدر (بلا تجميع) تُعيد نفس التأخيرات بلا تغيير', () => {
        const sourceDelays = [40, 40, 40];
        const delays = distributeDelays(sourceDelays, [0, 1, 2], 3);
        expect(delays).toEqual([40, 40, 40]);
    });

    async function buildAnimatedSourceWithDelays({ frames, delaysMs, size = 300, radius = 70 }) {
        const pages = [];
        for (let i = 0; i < frames; i++) {
            const color = { r: (i * 37) % 255, g: (i * 61) % 255, b: (i * 89) % 255 };
            const baseSvg = `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${radius * 1.4}" fill="rgba(${color.r},${color.g},${color.b},1)"/></svg>`;
            const holeSvg = `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="black"/></svg>`;
            const base = await sharp(Buffer.from(baseSvg)).png().toBuffer();
            const hole = await sharp(Buffer.from(holeSvg)).png().toBuffer();
            const frameBuf = await sharp(base).composite([{ input: hole, blend: 'dest-out' }]).png().toBuffer();
            pages.push(await sharp(frameBuf).ensureAlpha().raw().toBuffer());
        }
        return sharp(Buffer.concat(pages), {
            raw: { width: size, height: size * frames, channels: 4, pageHeight: size }
        }).webp({ loop: 0, delay: delaysMs }).toBuffer();
    }

    test('مصدر بعدد لقطات أكبر بكثير من MAX_ANIMATED_FRAMES: الناتج محدود بالحدّ الأقصى، ومدة حلقته تطابق مدة حلقة المصدر الكاملة بالضبط', async () => {
        const frames = MAX_ANIMATED_FRAMES * 2 + 3; // ✅ يفرض تجميعاً حقيقياً (أكثر من لقطة مصدر لكل لقطة محفوظة)
        const delaysMs = Array.from({ length: frames }, (_, i) => 30 + (i % 5) * 10); // غير منتظمة عمداً
        const srcBuf = await buildAnimatedSourceWithDelays({ frames, delaysMs });
        const srcPath = path.join(tmpDir, 'many-frames.webp');
        fs.writeFileSync(srcPath, srcBuf);

        const result = await normalizeOne('many-frames-source', srcPath, { outDir: path.join(tmpDir, 'out'), verbose: false, manifestOverrides: {} });

        expect(result.sourcePageCount).toBe(frames);
        expect(result.pageCount).toBeLessThanOrEqual(MAX_ANIMATED_FRAMES);
        expect(result.pageCount).toBeGreaterThanOrEqual(Math.min(frames, 16)); // ✅ نفس حدّ check-frames.js الأدنى
        expect(result.outputLoopDurationMs).toBe(delaysMs.reduce((a, b) => a + b, 0)); // ✅ 0% انحراف، لا فقط ±5%

        const outMeta = await sharp(result.outPath, { animated: true }).metadata();
        expect(outMeta.pages).toBe(result.pageCount);
        expect(outMeta.delay.reduce((a, b) => a + b, 0)).toBe(result.outputLoopDurationMs);

        const check = await checkFrameFile(result.outPath);
        expect(check.ok).toBe(true);
    }, 30000);
});

describe('frames-manifest.json — تصحيح يدوي اختياري يتجاوز الاكتشاف الآلي + effectiveOpeningRatio محسوبة', () => {
    test('scripts/frames-manifest.json الحقيقي صالح للقراءة ومفاتيحه بصيغة صحيحة', () => {
        const manifest = loadFramesManifest();
        expect(typeof manifest).toBe('object');
        // ✅ لا تسرّب حقول التوثيق (_description/_fields) كمفاتيح إطارات
        expect(manifest._description).toBeUndefined();
        expect(manifest._fields).toBeUndefined();
        for (const [key, entry] of Object.entries(manifest)) {
            if ('radiusRatio' in entry) {
                expect(typeof entry.radiusRatio).toBe('number');
                expect(entry.radiusRatio).toBeGreaterThan(0);
                expect(entry.radiusRatio).toBeLessThan(0.5);
                expect(typeof entry.reason).toBe('string');
                expect(entry.reason.length).toBeGreaterThan(0);
            }
            if ('effectiveOpeningRatio' in entry) {
                expect(typeof entry.effectiveOpeningRatio).toBe('number');
                expect(entry.effectiveOpeningRatio).toBeGreaterThan(0.15);
                expect(entry.effectiveOpeningRatio).toBeLessThanOrEqual(TARGET_OPENING_RATIO + 0.001);
            }
        }
    });

    test('مصدر بلا فتحة شفافة قابلة للاكتشاف آلياً (يرمي خطأً افتراضياً) ينجح عبر تصحيح يدوي محقون', async () => {
        // ✅ نفس مصدر حالة "تعذّر اكتشاف فتحة" أعلاه بالضبط — يثبت أن منطق التصحيح اليدوي
        // يتجاوز detectOpeningRadius كلياً، لا يُستخدَم كتلميح إضافي لها فقط
        const solid = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } }).png().toBuffer();
        const srcPath = path.join(tmpDir, 'solid-with-override.png');
        fs.writeFileSync(srcPath, solid);

        const result = await normalizeOne('solid-with-override', srcPath, {
            outDir: path.join(tmpDir, 'out'),
            verbose: false,
            manifestOverrides: { 'solid-with-override': { radiusRatio: 0.2, reason: 'اختبار' } }
        });

        const { data, info } = await sharp(result.outPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        // ✅ الناتج يُعاد تحجيمه دوماً (50% أو أقل لو الاحتواء فعّال) بغضّ النظر عن نصف القطر
        // الأصلي (مُكتشَفاً أو مُصحَّحاً يدوياً) — لذا الإثبات الحقيقي هنا هو النجاح نفسه (لا
        // رمي الخطأ المتوقَّع بلا تصحيح) زائد لوحة 512×512 صحيحة
        expect(info.width).toBe(CANVAS_SIZE);
        expect(info.height).toBe(CANVAS_SIZE);
    });

    test('تصحيح يدوي محقون يُستخدَم بدل الاكتشاف الآلي حتى لو الاكتشاف الآلي كان سينجح أيضاً', async () => {
        // ✅ مصدر بفتحة حقيقية قابلة للاكتشاف عند نصف قطر 60px من لوحة 400px (نسبة 0.15)،
        // لكن التصحيح اليدوي المحقون يفرض نسبة مختلفة تماماً (0.22) — الناتج يجب أن يعكس
        // استخدام الحجم الأصلي قبل إعادة التحجيم بما يطابق نسبة التصحيح لا نصف القطر المُكتشَف
        const buf = await buildSource({ size: 400, radius: 60 });
        const srcPath = path.join(tmpDir, 'detectable-but-overridden.png');
        fs.writeFileSync(srcPath, buf);

        const autoResult = await normalizeOne('detectable-but-overridden-auto', srcPath, { outDir: path.join(tmpDir, 'out'), verbose: false, manifestOverrides: {} });
        const overriddenResult = await normalizeOne('detectable-but-overridden', srcPath, {
            outDir: path.join(tmpDir, 'out'),
            verbose: false,
            manifestOverrides: { 'detectable-but-overridden': { radiusRatio: 0.22, reason: 'اختبار' } }
        });

        expect(overriddenResult.radius).toBeCloseTo(0.22 * 400, 5);
        expect(Math.abs(autoResult.radius - 60)).toBeLessThanOrEqual(1.5); // تسامح خطوة المسح الشعاعي
        expect(overriddenResult.scale).not.toBeCloseTo(autoResult.scale, 2);
    });

    test('persistManifest:true يكتب effectiveOpeningRatio بملف المانيفست الحقيقي، ونسخته العامة بـpublic/', async () => {
        const realManifestBefore = fs.existsSync(path.join(__dirname, '..', 'frames-manifest.json'))
            ? fs.readFileSync(path.join(__dirname, '..', 'frames-manifest.json'), 'utf8')
            : null;
        try {
            const buf = await buildSource({ size: 400, radius: 60 });
            const srcPath = path.join(tmpDir, 'persist-test.png');
            fs.writeFileSync(srcPath, buf);

            // ✅ يكتب لمجلد outDir مؤقّت (لا public/assets/frames الحقيقي) لكن persistManifest
            // يكتب دوماً لـscripts/frames-manifest.json الحقيقي بصرف النظر عن outDir — نظّف فوراً
            await normalizeOne('__jest_persist_test__', srcPath, { outDir: path.join(tmpDir, 'out'), verbose: false, manifestOverrides: {}, persistManifest: true });

            const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'frames-manifest.json'), 'utf8'));
            expect(manifest.__jest_persist_test__).toBeDefined();
            expect(typeof manifest.__jest_persist_test__.effectiveOpeningRatio).toBe('number');
            // 🛡️ طلب صريح جولة 3: sourcePageCount/sourceLoopDurationMs/outputPageCount/
            // outputLoopDurationMs تُكتَب أيضاً — مصدر هذا الاختبار PNG ثابت (لقطة واحدة)
            // فمدة الحلقة null بلا معنى (لا حركة أصلاً)، لا 0 مُضلِّلة
            expect(manifest.__jest_persist_test__.sourcePageCount).toBe(1);
            expect(manifest.__jest_persist_test__.outputPageCount).toBe(1);
            expect(manifest.__jest_persist_test__.sourceLoopDurationMs).toBeNull();
            expect(manifest.__jest_persist_test__.outputLoopDurationMs).toBeNull();

            const publicManifestPath = path.join(__dirname, '..', '..', 'public', 'assets', 'frames', 'frames-manifest.json');
            expect(fs.existsSync(publicManifestPath)).toBe(true);
            const publicManifest = JSON.parse(fs.readFileSync(publicManifestPath, 'utf8'));
            expect(publicManifest.__jest_persist_test__).toEqual(manifest.__jest_persist_test__);
        } finally {
            // ✅ تنظيف: يعيد الملف الحقيقي لحالته قبل هذا الاختبار بالضبط (لا يترك مفتاحاً اختبارياً دائماً)
            if (realManifestBefore !== null) {
                fs.writeFileSync(path.join(__dirname, '..', 'frames-manifest.json'), realManifestBefore);
                const publicManifestPath = path.join(__dirname, '..', '..', 'public', 'assets', 'frames', 'frames-manifest.json');
                fs.mkdirSync(path.dirname(publicManifestPath), { recursive: true });
                fs.writeFileSync(publicManifestPath, realManifestBefore);
            }
        }
    });
});
