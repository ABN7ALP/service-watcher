#!/usr/bin/env node
// 🛡️ طلب صريح بمراجعة PR (جولة 2): فحص آلي صارم يمنع تكرار علّة "قصّ الفنّ بحافة اللوحة"
// بصمت مستقبلاً — يفحص كل ملف بـpublic/assets/frames (كل لقطة متحركة، لا الأولى فقط) بكسلياً:
//   1) لا بكسل alpha>16 ضمن 2px من حافة لوحة 512×512 — أي قصّ حقيقي للفنّ الخارجي.
//   2) الفتحة المركزية شفافة فعلاً (ليست مربّعاً صلباً خطأً أو فتحة ضاعت بخلل بالترميز).
// مستقلّ تماماً عن scripts/normalize-frames.js (لا يستورد منه شيئاً) — أداة تحقّق يجب أن
// تعمل بصحة حتى لو كان خلل بمنطق التوليد نفسه، لا تشارك كوده المحتمل أن يحمل نفس الخلل.
//
// الاستخدام:
//   node scripts/check-frames.js                → يفحص كل public/assets/frames/*.webp، تقرير لكل ملف
//   node scripts/check-frames.js path/to/one.webp → ملف واحد مخصَّص
// مُستخدَم أيضاً كوحدة (checkFrameFile) من scripts/__tests__/check-frames.test.js (npm test)
// ومن normalize-frames.js --selftest (يتحقق أن أصولاً اصطناعية جديدة لا تنتهك الهامش فوراً)

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const FRAMES_DIR = path.join(__dirname, '..', 'public', 'assets', 'frames');
const BORDER_PX = 2; // ✅ طلب صريح: ضمن 2px من الحافة
const BORDER_ALPHA_THRESHOLD = 16; // ✅ طلب صريح: alpha>16
const MIN_PLAUSIBLE_OPENING_RATIO = 0.30; // ✅ أقل نسبة فتحة معقولة فعلياً — أي إطار حقيقي
// (حتى أشدّها احتواءً) لن تنزل فتحته عملياً عن هذي النسبة؛ انخفاض أكبر يعني فتحة مفقودة/تالفة
// لا احتواءً شرعياً فقط (قيد الاحتواء بـnormalize-frames.js له حد أدنى منطقي طبيعي أعلى بكثير)

// ✅ يفحص لقطة واحدة (raw RGBA مُسطَّح) بكسلياً بالكامل — حدود اللوحة فقط (بنية ثنائية
// الأبعاد x/y مباشرة، لا مسح شعاعي تقريبي)
function scanBorder(data, w, h, c) {
    let maxAlpha = 0;
    let count = 0;
    let firstXY = null;
    for (let y = 0; y < h; y++) {
        const onBorderY = y < BORDER_PX || y >= h - BORDER_PX;
        for (let x = 0; x < w; x++) {
            if (!onBorderY && x >= BORDER_PX && x < w - BORDER_PX) continue;
            const a = data[(y * w + x) * c + 3];
            if (a > BORDER_ALPHA_THRESHOLD) {
                count++;
                if (a > maxAlpha) maxAlpha = a;
                if (!firstXY) firstXY = [x, y, a];
            }
        }
    }
    return { count, maxAlpha, firstXY };
}

// ✅ يتحقق أن الفتحة المركزية شفافة فعلاً — مركز اللوحة بالضبط + حلقة عيّنات بنصف قطر متحفّظ
// (48px من لوحة 512px = 18.75%، أقل بكثير من أي فتحة إطار حقيقي حتى بأشدّ حالات الاحتواء)
// بثماني اتجاهات. كشف فتحة كامل (كنصف قطرها الدقيق) غير لازم هنا — فقط إثبات وجود شفافية
// حقيقية قرب المركز، لا تحديد حجمها
function scanCenterOpening(data, w, h, c) {
    const cx = w / 2, cy = h / 2;
    const probeR = Math.min(w, h) * 0.09375; // 48/512
    const points = [[cx, cy]];
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * 2 * Math.PI;
        points.push([cx + Math.cos(angle) * probeR, cy + Math.sin(angle) * probeR]);
    }
    let maxAlpha = 0;
    for (const [px, py] of points) {
        const xi = Math.round(px), yi = Math.round(py);
        const a = data[(yi * w + xi) * c + 3];
        if (a > maxAlpha) maxAlpha = a;
    }
    return { maxAlpha, transparent: maxAlpha <= BORDER_ALPHA_THRESHOLD };
}

async function checkFrameFile(filePath) {
    const meta = await sharp(filePath, { animated: true }).metadata();
    const pages = meta.pages || 1;
    const violations = [];
    let maxBorderAlpha = 0;
    let totalBorderViolations = 0;
    let worstBorderPage = -1;
    let worstCenterAlpha = 0;
    let worstCenterPage = -1;

    for (let p = 0; p < pages; p++) {
        const { data, info } = await sharp(filePath, { page: p }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { width: w, height: h, channels: c } = info;

        const border = scanBorder(data, w, h, c);
        if (border.count > 0) {
            totalBorderViolations += border.count;
            if (border.maxAlpha > maxBorderAlpha) { maxBorderAlpha = border.maxAlpha; worstBorderPage = p; }
        }

        const center = scanCenterOpening(data, w, h, c);
        if (center.maxAlpha > worstCenterAlpha) { worstCenterAlpha = center.maxAlpha; worstCenterPage = p; }
    }

    if (totalBorderViolations > 0) {
        violations.push(`قصّ حافة: ${totalBorderViolations} بكسل بـalpha>${BORDER_ALPHA_THRESHOLD} ضمن ${BORDER_PX}px من الحافة (أقصى alpha=${maxBorderAlpha} بلقطة ${worstBorderPage})`);
    }
    if (worstCenterAlpha > BORDER_ALPHA_THRESHOLD) {
        violations.push(`الفتحة المركزية غير شفافة: alpha=${worstCenterAlpha} عند/قرب المركز بلقطة ${worstCenterPage} (المتوقَّع ≤${BORDER_ALPHA_THRESHOLD})`);
    }

    return {
        ok: violations.length === 0,
        violations,
        pages,
        width: meta.width,
        height: meta.height,
        maxBorderAlpha,
        totalBorderViolations,
        worstCenterAlpha
    };
}

async function main() {
    const argPath = process.argv[2];
    const files = argPath
        ? [path.resolve(argPath)]
        : fs.readdirSync(FRAMES_DIR).filter(f => f.endsWith('.webp')).map(f => path.join(FRAMES_DIR, f)).sort();

    if (files.length === 0) {
        console.error(`[check-frames] لا ملفات .webp بـ${FRAMES_DIR}`);
        process.exit(1);
    }

    console.log(`[check-frames] فحص ${files.length} ملفاً (حدّ ${BORDER_PX}px من الحافة، alpha>${BORDER_ALPHA_THRESHOLD} = انتهاك)...\n`);
    let anyFailed = false;
    for (const filePath of files) {
        const name = path.basename(filePath);
        try {
            const r = await checkFrameFile(filePath);
            if (r.ok) {
                console.log(`✅ ${name.padEnd(42)} ${r.pages} لقطة، ${r.width}×${r.height}، أقصى alpha حافة=${r.maxBorderAlpha}، أقصى alpha مركز=${r.worstCenterAlpha}`);
            } else {
                anyFailed = true;
                console.log(`❌ ${name.padEnd(42)} ${r.pages} لقطة`);
                for (const v of r.violations) console.log(`   - ${v}`);
            }
        } catch (e) {
            anyFailed = true;
            console.log(`❌ ${name.padEnd(42)} خطأ أثناء الفحص: ${e.message}`);
        }
    }
    console.log('');
    if (anyFailed) {
        console.error('[check-frames] فشل — إطار واحد أو أكثر ينتهك هامش الحافة أو فقد فتحته الشفافة. راجع التفاصيل أعلاه.');
        process.exit(1);
    }
    console.log('[check-frames] كل الملفات نظيفة — لا قصّ حافة، كل الفتحات شفافة فعلاً.');
}

if (require.main === module) {
    main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { checkFrameFile, BORDER_PX, BORDER_ALPHA_THRESHOLD, MIN_PLAUSIBLE_OPENING_RATIO, FRAMES_DIR };
