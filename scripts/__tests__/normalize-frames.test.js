// ملف: normalize-frames.test.js
// 🛡️ طلب صريح بمراجعة PR (البند 8-10، توحيد الإطارات): يُحوِّل منطق --selftest اليدوي
// بـnormalize-frames.js إلى اختبار Jest دائم — يضمن أن أي تعديل مستقبلي على خوارزمية كشف
// الفتحة/التحجيم/التركيب لا يكسر الضمان الأساسي بصمت (فتحة 62.5% مركّزة بلوحة 512×512،
// بغضّ النظر عن دقة/نسبة فتحة المصدر الأصلية) بلا الحاجة لتشغيل السكربت يدوياً كل مرة.
//
// لا وصول شبكي لازماً هنا — صور مصدر اصطناعية مبنية محلياً بـsharp (نفس أسلوب buildSyntheticFrame
// الداخلية بالسكربت)، تماماً كمحاكاة Mongoose ببقية اختبارات المشروع بدل قاعدة بيانات حقيقية
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const { normalizeOne, detectOpeningRadius, CANVAS_SIZE, TARGET_RADIUS } = require('../normalize-frames');

async function buildSource({ size, radius, color = { r: 212, g: 175, b: 55 } }) {
    const baseSvg = `<svg width="${size}" height="${size}">
        <rect width="${size}" height="${size}" rx="${size / 2}" fill="rgba(${color.r},${color.g},${color.b},1)"/>
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
    const result = await normalizeOne(name, srcPath, { outDir: path.join(tmpDir, 'out'), verbose: false });
    const { data, info } = await sharp(result.outPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const measured = detectOpeningRadius(data, info.width, info.height, info.channels);
    return { result, info, measured };
}

describe('normalizeOne — يُعيد أي فتحة مصدر (نصف قطر/دقة عشوائيين) إلى القالب الموحَّد', () => {
    test.each([
        ['small-radius-ratio', { size: 400, radius: 60 }],
        ['large-radius-ratio', { size: 300, radius: 130 }],
        ['tiny-source', { size: 128, radius: 30 }],
        ['huge-source', { size: 900, radius: 300 }]
    ])('%s: لوحة نهائية 512×512 بفتحة 62.5%% مركّزة', async (name, spec) => {
        const { info, measured } = await normalizeAndMeasure(name, spec);

        expect(info.width).toBe(CANVAS_SIZE);
        expect(info.height).toBe(CANVAS_SIZE);
        // ✅ تسامح نسبي (2.5%) — تمويه طبيعي من نواة إعادة التحجيم عند تكبير مصادر منخفضة
        // الدقة بمعامل كبير، لا خلل بالخوارزمية (راجع تعليق مطابق بـselfTest بالسكربت نفسه)
        const tolerance = Math.max(1.5, TARGET_RADIUS * 0.025);
        expect(Math.abs(measured.radius - TARGET_RADIUS)).toBeLessThanOrEqual(tolerance);
        expect(Math.abs(measured.cx - CANVAS_SIZE / 2)).toBeLessThanOrEqual(1.5);
        expect(Math.abs(measured.cy - CANVAS_SIZE / 2)).toBeLessThanOrEqual(1.5);
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

        const result = await normalizeOne('animated-source', srcPath, { outDir: path.join(tmpDir, 'out'), verbose: false });

        expect(result.isAnimated).toBe(true);
        const outMeta = await sharp(result.outPath, { animated: true }).metadata();
        expect(outMeta.pages).toBe(frames);
        expect(outMeta.width).toBe(CANVAS_SIZE);
    });

    test('فتحة غير قابلة للاكتشاف (مصدر صلب بلا شفافية) يرمي خطأً واضحاً بدل ناتج فاسد صامت', async () => {
        const solid = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } }).png().toBuffer();
        const srcPath = path.join(tmpDir, 'solid.png');
        fs.writeFileSync(srcPath, solid);

        await expect(normalizeOne('solid-no-opening', srcPath, { outDir: path.join(tmpDir, 'out'), verbose: false }))
            .rejects.toThrow(/تعذّر اكتشاف فتحة/);
    });
});
