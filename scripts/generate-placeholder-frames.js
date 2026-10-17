#!/usr/bin/env node
// 🛡️ أداة مؤقتة فقط — ليست جزءاً من خط أصول الإطارات الحقيقي. سياسة شبكة بيئة التطوير
// الحالية تحجب res.cloudinary.com (راجع رأس scripts/normalize-frames.js)، فلا يمكن تنزيل
// الـ11 صورة الحقيقية لتطبيعها فعلياً هنا. هذا السكربت يبني صور مصدر اصطناعية (قرص بفتحة
// دائرية + زخرفة تمييزية بسيطة لكل صنف) بدقة/نسبة فتحة غير قياسية عمداً — ثم يُمرِّرها عبر
// normalizeOne() الحقيقية (نفس مسار الإنتاج بالضبط، لا تقصير) لتوليد ملفات public/assets/
// frames/*.webp نهائية قابلة للعرض فعلاً بالتطبيق الآن. حالما يتوفر وصول شبكي/رفع ملفات
// للأصول الحقيقية من Cloudinary: شغّل `node scripts/normalize-frames.js` (بلا أي تعديل كود)
// لاستبدال هذي البدائل بالفن الحقيقي بنفس الأسماء بالضبط — صفر تغييرات بـapp.js/CSS.
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const { normalizeOne } = require('./normalize-frames');

// ✅ مواصفة زخرفية مميّزة بصرياً لكل صنف (ألوان مختلفة + تفاصيل مختلفة) لتمييزها بسهولة
// بلقطات الشاشة (بند 11) — الحجم/نسبة الفتحة هنا غير قياسية عمداً (ليست 512px أو 62.5%)
// لإجهاد نفس خوارزمية الكشف التي ستُطبَّق على الأصول الحقيقية فعلياً، لا صوراً جاهزة سلفاً
const SPECS = [
    { key: 'profile-frame-contributor', base: { r: 45, g: 180, b: 170 }, accent: { r: 220, g: 255, b: 250 }, studs: 6, crown: false },
    { key: 'profile-frame-admin', base: { r: 200, g: 30, b: 40 }, accent: { r: 255, g: 215, b: 0 }, studs: 0, crown: true, animated: true },
    { key: 'profile-frame-luxury-01', base: { r: 212, g: 175, b: 55 }, accent: { r: 255, g: 250, b: 220 }, studs: 8, crown: false, animated: true },
    { key: 'profile-frame-royal-01', base: { r: 90, g: 40, b: 160 }, accent: { r: 230, g: 190, b: 70 }, studs: 0, crown: false, animated: true },
    { key: 'profile-frame-crown-01', base: { r: 230, g: 180, b: 40 }, accent: { r: 255, g: 255, b: 255 }, studs: 0, crown: true, animated: true },
    { key: 'profile-frame-black-gold-crown', base: { r: 20, g: 20, b: 20 }, accent: { r: 212, g: 175, b: 55 }, studs: 0, crown: true },
    { key: 'profile-frame-gothic-royal', base: { r: 40, g: 15, b: 55 }, accent: { r: 180, g: 150, b: 60 }, studs: 8, crown: false },
    { key: 'profile-frame-amethyst-royal', base: { r: 150, g: 60, b: 180 }, accent: { r: 230, g: 170, b: 230 }, studs: 6, crown: false },
    { key: 'profile-frame-fire-dragons', base: { r: 210, g: 60, b: 10 }, accent: { r: 255, g: 190, b: 40 }, studs: 10, crown: false },
    { key: 'profile-frame-lion-bee-sapphire', base: { r: 20, g: 60, b: 170 }, accent: { r: 230, g: 190, b: 50 }, studs: 8, crown: false },
    { key: 'profile-frame-pegasus-warrior', base: { r: 140, g: 150, b: 170 }, accent: { r: 220, g: 235, b: 245 }, studs: 0, crown: false }
];

const SRC_SIZE = 450;          // ✅ دقة مصدر غير قياسية عمداً (ليست 512)
const SRC_OPENING_RATIO = 0.42; // ✅ نسبة فتحة غير 62.5% عمداً — تُثبت أن الاكتشاف/التحجيم فعلي لا توافقي
const SRC_RADIUS = Math.round((SRC_SIZE * SRC_OPENING_RATIO) / 2);

function studsSvg({ size, radius, accent, count }) {
    if (!count) return '';
    const ringMid = (radius + size / 2) / 2;
    const studR = Math.max(4, Math.round(size * 0.018));
    let out = '';
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * 2 * Math.PI;
        const cx = size / 2 + Math.cos(angle) * ringMid;
        const cy = size / 2 + Math.sin(angle) * ringMid;
        out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${studR}" fill="rgba(${accent.r},${accent.g},${accent.b},1)"/>`;
    }
    return out;
}

function crownSvg({ size, accent, phase = 0 }) {
    // ✅ 3 أشواك تاج صغيرة أعلى الحلقة — تمييز بصري لأصناف "التاج" (admin/crown/black-gold-crown)
    const cx = size / 2;
    const topY = size * 0.06;
    const baseY = size * 0.17 + phase;
    const spikes = [-0.12, 0, 0.12].map(dx => {
        const sx = cx + dx * size;
        return `<polygon points="${(sx - size * 0.035).toFixed(1)},${baseY} ${sx.toFixed(1)},${topY} ${(sx + size * 0.035).toFixed(1)},${baseY}" fill="rgba(${accent.r},${accent.g},${accent.b},1)"/>`;
    });
    return spikes.join('');
}

async function buildSourceFrame(spec, frameIndex = 0, totalFrames = 1) {
    const { base, accent, studs, crown } = spec;
    // ✅ شيمر بسيط للأصناف المتحركة: السطوع/الإزاحة يتذبذبان بين اللقطات — يحاكي GIF/WebP حقيقي
    const shimmer = totalFrames > 1 ? Math.sin((frameIndex / totalFrames) * 2 * Math.PI) : 0;
    const liveAccent = {
        r: Math.min(255, Math.max(0, Math.round(accent.r + shimmer * 25))),
        g: Math.min(255, Math.max(0, Math.round(accent.g + shimmer * 25))),
        b: Math.min(255, Math.max(0, Math.round(accent.b + shimmer * 25)))
    };
    // ✅ لمعان خفيف على لون القاعدة نفسها أيضاً (لا الزخرفة فقط) — بدونه، صنف بلا أشواك/تاج
    // (كـroyal-01) تتطابق لقطاته الأربع بكسلاً بكسل فيُسقِطها مُرمِّز WebP لصفحة واحدة ساكنة
    // صامتاً (لا خطأ، لكنه يُفقِد الحركة المقصودة لمحاكاة مصدر GIF متحرك حقيقي)
    const liveBase = totalFrames > 1 ? {
        r: Math.min(255, Math.max(0, Math.round(base.r + shimmer * 15))),
        g: Math.min(255, Math.max(0, Math.round(base.g + shimmer * 15))),
        b: Math.min(255, Math.max(0, Math.round(base.b + shimmer * 15)))
    } : base;
    const crownPhase = totalFrames > 1 ? shimmer * SRC_SIZE * 0.01 : 0;

    const ringSvg = `<svg width="${SRC_SIZE}" height="${SRC_SIZE}">
        <rect width="${SRC_SIZE}" height="${SRC_SIZE}" rx="${SRC_SIZE / 2}" fill="rgba(${liveBase.r},${liveBase.g},${liveBase.b},1)"/>
        ${studsSvg({ size: SRC_SIZE, radius: SRC_RADIUS, accent: liveAccent, count: studs })}
        ${crown ? crownSvg({ size: SRC_SIZE, accent: liveAccent, phase: crownPhase }) : ''}
    </svg>`;
    const holeSvg = `<svg width="${SRC_SIZE}" height="${SRC_SIZE}">
        <circle cx="${SRC_SIZE / 2}" cy="${SRC_SIZE / 2}" r="${SRC_RADIUS}" fill="black"/>
    </svg>`;

    const ring = await sharp(Buffer.from(ringSvg)).png().toBuffer();
    const holeMask = await sharp(Buffer.from(holeSvg)).png().toBuffer();
    return sharp(ring).composite([{ input: holeMask, blend: 'dest-out' }]).png().toBuffer();
}

async function buildSourceBuffer(spec) {
    if (!spec.animated) {
        return { buffer: await buildSourceFrame(spec), ext: 'png' };
    }
    const FRAMES = 4;
    const pages = [];
    for (let f = 0; f < FRAMES; f++) {
        const frameBuf = await buildSourceFrame(spec, f, FRAMES);
        pages.push(await sharp(frameBuf).ensureAlpha().raw().toBuffer());
    }
    const buffer = await sharp(Buffer.concat(pages), {
        raw: { width: SRC_SIZE, height: SRC_SIZE * FRAMES, channels: 4, pageHeight: SRC_SIZE }
    }).webp({ loop: 0, quality: 90 }).toBuffer();
    return { buffer, ext: 'webp' };
}

async function main() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'placeholder-frames-'));
    console.log(`[generate-placeholder-frames] بناء ${SPECS.length} أصلاً اصطناعياً مميّزاً بصرياً (مصدر مؤقت بديل لحين توفر وصول Cloudinary)...`);
    for (const spec of SPECS) {
        const { buffer, ext } = await buildSourceBuffer(spec);
        const srcPath = path.join(tmpDir, `${spec.key}.${ext}`);
        fs.writeFileSync(srcPath, buffer);
        const result = await normalizeOne(spec.key, srcPath, { verbose: true });
        console.log(`  ✅ ${spec.key} → ${path.relative(process.cwd(), result.outPath)}${spec.animated ? ' (متحرك)' : ''}`);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('[generate-placeholder-frames] تم. هذي أصول بديلة مؤقتة — استبدلها بتشغيل normalize-frames.js على الروابط الحقيقية حالما تتوفر.');
}

main().catch(err => { console.error(err); process.exit(1); });
