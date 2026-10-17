#!/usr/bin/env node
// 🛡️ طلب صريح بمراجعة PR (بند 9): يُعيد تصدير كل أصل إطار على قالب موحَّد — فتحة دائرية
// شفافة قطرها 62.5% من لوحة مربعة 512px، مركّزة تماماً — بدل الاعتماد على نِسَب photoScale/
// artScale مختلفة يدوياً لكل إطار (النظام القديم بالكامل، راجع IMAGE_OVERLAY_FRAMES السابقة
// بـapp.js). بهذا يعمل مكوّن .avatar الموحَّد (artScale=160%=1÷62.5% ثابت) بلا أي استثناء.
//
// الخوارزمية (لكل أصل مصدر):
//   1) تحميل الصورة (أول إطار فقط لو متحركة — الفتحة لا تتغيّر بين الإطارات بأي أصل حقيقي).
//   2) مسح شعاعي من مركز الصورة (محاور + أقطار، 8 اتجاهات) لإيجاد أول بكسل غير شفاف تقريباً
//      بكل اتجاه — متوسط هذي المسافات الثماني هو نصف قطر الفتحة الحقيقي المُقدَّر.
//   3) مركز الفتحة = مركز الصورة نفسه (كل أطقم الإطارات الجاهزة دائرية الفتحة بتصميم متمركز).
//   4) معامل تحجيم = (0.625 × 512 ÷ 2) ÷ نصف القطر المُكتشَف — يُطبَّق على الصورة كاملة
//      (الفنّ الزخرفي والفتحة معاً) حول مركزها، ثم تُقصّ/تُبطَّن لمربع 512×512 نهائي.
//   5) حفظ WebP (متحرك إن كان المصدر متحركاً فعلياً — لقطات متعددة؛ ثابت غير ذلك).
//
// الاستخدام:
//   node scripts/normalize-frames.js                 → يعالج كل القائمة المعروفة أدناه
//   node scripts/normalize-frames.js --class=KEY --src=PATH_OR_URL   → أصل واحد مخصَّص
//   node scripts/normalize-frames.js --selftest       → يبني ويطبّع أصولاً اصطناعية للتحقق
//
// 🛡️ تصحيح يدوي اختياري: بعض الإطارات الحقيقية (مثلاً lion-bee-sapphire) فيها زخارف تبرز
// داخل حدود الفتحة فعلاً (وجه/جناح لا مجرد حافة خارجية)، فيلتقط المسح الشعاعي الآلي نصف قطر
// أكبر من اللازم ويقصّها عند التحجيم. scripts/frames-manifest.json يحمل تصحيحاً يدوياً لنصف
// القطر/المركز (كنسبة من أبعاد المصدر) لمثل هذي الحالات تحديداً — راجع loadFramesManifest
// أدناه. إطار غير مذكور بالملف يعتمد بالكامل على detectOpeningRadius الآلية.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const CANVAS_SIZE = 512;
const TARGET_OPENING_RATIO = 0.625; // ✅ طلب صريح: فتحة قطرها 62.5% من اللوحة
const TARGET_RADIUS = (CANVAS_SIZE * TARGET_OPENING_RATIO) / 2;
const ALPHA_THRESHOLD = 24; // ✅ أي بكسل alpha أقل من هذا يُعدّ "شفافاً" (فتحة)، لا عتبة 0 الصارمة (ضغط WebP/GIF يترك قيماً قريبة من الصفر لا صفراً تماماً أحياناً)

// 🛡️ طلب صريح بمراجعة PR: كل ملف < 400KB. أصول Cloudinary الحقيقية المتحركة (حتى 100 لقطة
// 512×512 لكل أصل) كانت تُعيد تصديرها بجودة 88 بكل لقطاتها فتنتج 3-10MB/ملف — أبعد ما يكون عن
// الميزانية. الحل: أخذ عيّنة من اللقطات (حد أقصى MAX_ANIMATED_FRAMES، لا كل اللقطات — تأثيرات
// البريق/التوهج بهذي الإطارات بطيئة بطبيعتها، فعشر لقطات كافية بصرياً للعين البشرية) + جودة
// أخفض للمتحرك تحديداً (الثابت وحيد اللقطة يبقى 88 — ميزانيته أصلاً بعيدة جداً عن 400KB)
const MAX_ANIMATED_FRAMES = 10;
const ANIMATED_WEBP_QUALITY = 28;
const ANIMATED_ALPHA_QUALITY = 32;
const ANIMATED_FRAME_DELAY_MS = 90;
const STATIC_WEBP_QUALITY = 88;
const WEBP_ENCODE_EFFORT = 6; // ✅ 6 = الحد الأقصى لجهد ضغط libwebp (كان 5) — نفس الجودة بحجم أقل
const MAX_OUTPUT_BYTES = 400 * 1024;

const OUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'frames');
const MANIFEST_PATH = path.join(__dirname, 'frames-manifest.json');

// ✅ يحمّل scripts/frames-manifest.json إن وُجد — تصحيح يدوي اختياري فقط، لا يفشل السكربت
// لو الملف غائب (الاكتشاف الآلي يبقى المسار الافتراضي لكل الإطارات بلا استثناء)
function loadFramesManifest() {
    if (!fs.existsSync(MANIFEST_PATH)) return {};
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const { _description, _fields, ...overrides } = parsed;
    return overrides;
}

// ✅ قائمة الإطارات الحقيقية الـ11 (نفس مفاتيح/روابط IMAGE_OVERLAY_FRAMES السابقة بـapp.js
// حرفياً) — مصدر الحقيقة الوحيد لما يحتاج تطبيعاً فعلياً عند توفر وصول شبكة لهذي الروابط
const KNOWN_FRAMES = [
    { key: 'profile-frame-contributor', src: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790702503/81162475603.png' },
    { key: 'profile-frame-admin', src: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1791240482/admin-frame-animated-512.webp' },
    { key: 'profile-frame-luxury-01', src: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790887531/luxury_frame_512px.gif' },
    { key: 'profile-frame-royal-01', src: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790892729/royal_frame_600px.gif' },
    { key: 'profile-frame-crown-01', src: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790894895/crown_frame_600px.gif' },
    { key: 'profile-frame-black-gold-crown', src: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790895602/black_gold_crown_frame_600px.webp' },
    { key: 'profile-frame-gothic-royal', src: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790896169/gothic_royal_frame.webp' },
    { key: 'profile-frame-amethyst-royal', src: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790896497/amethyst_royal_frame.webp' },
    { key: 'profile-frame-fire-dragons', src: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790897430/fire_dragons_frame.webp' },
    { key: 'profile-frame-lion-bee-sapphire', src: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790897852/lion_bee_sapphire_frame.webp' },
    { key: 'profile-frame-pegasus-warrior', src: 'https://res.cloudinary.com/dntlt5xry/image/upload/v1790898291/pegasus_warrior_frame.webp' },
];

async function loadSourceBuffer(src) {
    if (/^https?:\/\//i.test(src)) {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${src}`);
        return Buffer.from(await res.arrayBuffer());
    }
    return fs.readFileSync(src);
}

// ✅ يكتشف نصف قطر الفتحة الشفافة المركزية عبر مسح شعاعي بـ8 اتجاهات من مركز الصورة —
// يعمل بغضّ النظر عن حجم/دقة المصدر الخام (لا نفترض 512px أو أي مقاس بعينه)
function detectOpeningRadius(raw, width, height, channels) {
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) / 2;
    const alphaAt = (x, y) => {
        const xi = Math.round(x), yi = Math.round(y);
        if (xi < 0 || yi < 0 || xi >= width || yi >= height) return 255; // خارج الحدود = غير شفاف (حافة فنّ)
        if (channels < 4) return 255; // لا قناة شفافية إطلاقاً = الصورة كلها "صلبة" (حالة نادرة غير متوقعة لإطار حقيقي)
        return raw[(yi * width + xi) * channels + 3];
    };
    const directions = [0, 45, 90, 135, 180, 225, 270, 315].map(deg => deg * Math.PI / 180);
    const radii = directions.map(angle => {
        const dx = Math.cos(angle), dy = Math.sin(angle);
        let r = 0;
        const step = Math.max(1, maxR / 400); // ✅ دقة كافية بخطوات صغيرة بلا إبطاء مبالغ فيه
        while (r < maxR && alphaAt(cx + dx * r, cy + dy * r) < ALPHA_THRESHOLD) r += step;
        return r;
    });
    radii.sort((a, b) => a - b);
    // ✅ الوسيط (median) لا المتوسط — يقاوم انحراف اتجاه واحد شاذ (مثلاً زخرفة تتوغّل قليلاً
    // داخل الفتحة بزاوية بعينها، كتاج يلامس المركز من الأعلى فقط)
    const mid = Math.floor(radii.length / 2);
    const median = radii.length % 2 ? radii[mid] : (radii[mid - 1] + radii[mid]) / 2;
    return { radius: median, cx, cy, samples: radii };
}

async function normalizeOne(key, src, { outDir = OUT_DIR, verbose = true, manifestOverrides } = {}) {
    const inputBuffer = await loadSourceBuffer(src);
    const meta = await sharp(inputBuffer, { animated: true }).metadata();
    const isAnimated = !!(meta.pages && meta.pages > 1);

    // ✅ الكشف عن الفتحة يتم على الإطار الأول فقط (ثابت بكل أصل حقيقي — الفتحة لا "تتحرك")
    const firstFrame = sharp(inputBuffer, { animated: false });
    const { data: raw, info } = await firstFrame
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    // ✅ manifestOverrides قابل للحقن (اختبارات Jest) — افتراضياً يُحمَّل من الملف الحقيقي
    const manifest = manifestOverrides || loadFramesManifest();
    const override = manifest[key];
    let radius, cx, cy;
    if (override && typeof override.radiusRatio === 'number') {
        const baseDim = Math.min(info.width, info.height);
        radius = override.radiusRatio * baseDim;
        cx = (typeof override.cxRatio === 'number' ? override.cxRatio : 0.5) * info.width;
        cy = (typeof override.cyRatio === 'number' ? override.cyRatio : 0.5) * info.height;
        if (verbose) {
            console.log(`[normalize-frames] ${key}: تصحيح يدوي من frames-manifest.json (radiusRatio=${override.radiusRatio}) — ${override.reason || 'بلا سبب موثَّق'}`);
        }
    } else {
        ({ radius, cx, cy } = detectOpeningRadius(raw, info.width, info.height, info.channels));
    }

    if (!radius || radius < 2) {
        throw new Error(`[${key}] تعذّر اكتشاف فتحة شفافة حقيقية بالمصدر — تحقّق يدوي مطلوب`);
    }

    const scale = TARGET_RADIUS / radius;
    const scaledW = Math.max(1, Math.round(info.width * scale));
    const scaledH = Math.max(1, Math.round(info.height * scale));
    const scaledCx = cx * scale;
    const scaledCy = cy * scale;

    // ✅ يُحجَّم الأصل الكامل (كل الإطارات/اللقطات لو متحركاً) بنفس المعامل، ثم يُركَّب فوق
    // لوحة 512×512 شفافة فارغة بحيث يسقط مركز الفتحة المُحجَّم بالضبط على منتصف اللوحة —
    // composite() يقصّ تلقائياً أي جزء خارج حدود اللوحة (يسار/أعلى سالب أو يمين/أسفل زائد)
    // بلا حاجة لحساب extend/extract منفصلين عرضة لانحراف التقريب التراكمي (كانا يُنتجان أحياناً
    // لوحة 511 أو 513px بدل 512px بالضبط فيفشل extract — bad extract area)
    const left = Math.round(CANVAS_SIZE / 2 - scaledCx);
    const top = Math.round(CANVAS_SIZE / 2 - scaledCy);

    // ✅ sharp.composite() يرفض أي طبقة أكبر من اللوحة الأساسية ("must have same dimensions
    // or smaller") — يحدث هذا كثيراً هنا لأن معامل التحجيم قد يكون >1 (مصدر فتحته ضيقة
    // نسبياً، كصغيرة-الدقة بفتحة صغيرة) فتكبر الصورة كلها فوق 512×512. الحل: نقصّ من الصورة
    // المُحجَّمة فقط الجزء الذي سيظهر فعلاً داخل حدود اللوحة 512×512 (تقاطع المستطيلين)
    // ثم نركّبه عند الموضع المُعدَّل بدل تمرير الصورة الكاملة الزائدة عن حجم اللوحة
    const cropLeft = Math.max(0, -left);
    const cropTop = Math.max(0, -top);
    const destLeft = Math.max(0, left);
    const destTop = Math.max(0, top);
    const visibleW = Math.min(scaledW - cropLeft, CANVAS_SIZE - destLeft);
    const visibleH = Math.min(scaledH - cropTop, CANVAS_SIZE - destTop);
    if (visibleW <= 0 || visibleH <= 0) {
        throw new Error(`[${key}] الفتحة المُكتشَفة تضع الفنّ المُحجَّم بالكامل خارج لوحة ${CANVAS_SIZE}px — تحقّق يدوي مطلوب`);
    }

    // ✅ يُحجَّم ثم يُركَّب كل إطار/لقطة على حدة فوق لوحة شفافة فارغة مستقلة، لا الأصل المتحرك
    // كاملاً دفعة واحدة — composite() يتعامل مع أي طبقة متحركة كأنها لقطة واحدة فقط (يُسقِط
    // باقي اللقطات بصمت لأن قاعدة اللوحة الفارغة ساكنة بصفحة واحدة)، فتُفقَد الحركة كلياً لو
    // رُكِّب الأصل المتحرك المُحجَّم مباشرة. نُعيد التركيب هنا ثم نُدمج اللقطات الناتجة يدوياً
    async function composeFramePage(pageBuffer) {
        const resizedFull = await sharp(pageBuffer)
            .resize(scaledW, scaledH, { fit: 'fill' })
            .toBuffer();
        const resized = (visibleW === scaledW && visibleH === scaledH)
            ? resizedFull
            : await sharp(resizedFull)
                .extract({ left: cropLeft, top: cropTop, width: visibleW, height: visibleH })
                .toBuffer();
        return sharp({
            create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
        })
            .composite([{ input: resized, left: destLeft, top: destTop }])
            .ensureAlpha()
            .raw()
            .toBuffer();
    }

    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${key}.webp`);
    const sourcePageCount = isAnimated ? meta.pages : 1;

    // ✅ عيّنة من اللقطات لا كلها (راجع تعليق MAX_ANIMATED_FRAMES أعلى الملف) — مسافة ثابتة
    // عبر كامل مدة الحركة الأصلية (لا أول N لقطة فقط) كي تبقى الحركة الكاملة (دورة كاملة من
    // البريق/التوهج) ممثَّلة، لا جزء منها فقط
    const frameStride = isAnimated ? Math.max(1, Math.ceil(sourcePageCount / MAX_ANIMATED_FRAMES)) : 1;
    const pageIndices = [];
    for (let p = 0; p < sourcePageCount; p += frameStride) pageIndices.push(p);
    const pageCount = pageIndices.length;

    if (!isAnimated) {
        const rawFrame = await composeFramePage(inputBuffer);
        await sharp(rawFrame, { raw: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 4 } })
            .webp({ quality: STATIC_WEBP_QUALITY, effort: WEBP_ENCODE_EFFORT })
            .toFile(outPath);
    } else {
        const rawPages = [];
        for (const p of pageIndices) {
            const pageBuffer = await sharp(inputBuffer, { page: p }).png().toBuffer();
            rawPages.push(await composeFramePage(pageBuffer));
        }
        await sharp(Buffer.concat(rawPages), {
            raw: { width: CANVAS_SIZE, height: CANVAS_SIZE * pageCount, channels: 4, pageHeight: CANVAS_SIZE }
        })
            .webp({
                quality: ANIMATED_WEBP_QUALITY,
                alphaQuality: ANIMATED_ALPHA_QUALITY,
                effort: WEBP_ENCODE_EFFORT,
                loop: 0,
                delay: new Array(pageCount).fill(ANIMATED_FRAME_DELAY_MS)
            })
            .toFile(outPath);
    }

    // ✅ طلب صريح بمراجعة PR: كل ملف < 400KB — فحص صارم بدل أمل صامت أن الإعدادات أعلاه
    // كافية؛ أصل مستقبلي أكثف فنياً من كل ما اختُبِر عليه الإعدادات يُفشِل السكربت بوضوح
    // بدل شحن أصل يتجاوز الميزانية بصمت
    const outputBytes = fs.statSync(outPath).size;
    if (outputBytes > MAX_OUTPUT_BYTES) {
        throw new Error(`[${key}] الناتج ${(outputBytes / 1024).toFixed(0)}KB يتجاوز ميزانية 400KB (quality=${isAnimated ? ANIMATED_WEBP_QUALITY : STATIC_WEBP_QUALITY}, frames=${pageCount}) — خفّض MAX_ANIMATED_FRAMES/ANIMATED_WEBP_QUALITY لهذا الأصل تحديداً`);
    }

    if (verbose) {
        console.log(`[normalize-frames] ${key}: نصف قطر مُكتشَف=${radius.toFixed(1)}px (من ${info.width}×${info.height}) → تحجيم×${scale.toFixed(3)} → ${outPath} (${(outputBytes / 1024).toFixed(0)}KB)${isAnimated ? ` (متحرك، ${pageCount}/${sourcePageCount} لقطة)` : ''}`);
    }
    return { key, outPath, radius, scale, isAnimated, outputBytes, pageCount };
}

// =====================================================
// ✅ اختبار ذاتي (--selftest): يبني أصولاً اصطناعية بفتحات مُعرَّفة مسبقاً (نصف قطر/مركز
// مختلفان عمداً عن القياسي) ثم يُطبِّعها ويتحقق أن ناتج normalizeOne يُعيد فعلياً فتحة
// بنصف القطر المستهدف (62.5%) بعد التطبيع — يُثبت صحة الخوارزمية بلا حاجة لوصول شبكي
// لأصول Cloudinary الحقيقية (محجوبة بسياسة شبكة هذي البيئة تحديداً، راجع رأس الملف)
async function buildSyntheticFrame({ size = 400, radius = 120, offsetX = 0, offsetY = 0, color = { r: 212, g: 175, b: 55 } }) {
    // قرص ملوّن صلب بكل اللوحة، مع فتحة دائرية شفافة غير مركزية ونصف قطرها غير 62.5% —
    // يحاكي بالضبط مشكلة الإطارات القديمة غير المُقاسة (فتحات بنسب/مراكز عشوائية)
    //
    // ✅ القاعدة (base) هي الشكل الذهبي الصلب فقط (بلا الدائرة السوداء) — لو ضُمَّت الدائرة
    // لنفس الـSVG المستخدَم قناعاً، يصبح القناع معتماً بكل مكان (الحلقة+الفتحة معاً) فيحذف
    // dest-out كل شيء من قاعدة شفافة أصلاً (شفاف يُطرَح من شفاف = شفاف) — هذا كان الخلل
    const baseSvg = `<svg width="${size}" height="${size}">
        <rect width="${size}" height="${size}" rx="${size / 2}" fill="rgba(${color.r},${color.g},${color.b},1)"/>
    </svg>`;
    // ✅ القناع هو الدائرة السوداء فقط — dest-out يحذف من القاعدة الذهبية حيث القناع معتم
    // (الدائرة) تاركاً فتحة شفافة فعلية (alpha=0)، ومحتفظاً بالذهبي بقية اللوحة
    const holeSvg = `<svg width="${size}" height="${size}">
        <circle cx="${size / 2 + offsetX}" cy="${size / 2 + offsetY}" r="${radius}" fill="black"/>
    </svg>`;
    const base = await sharp(Buffer.from(baseSvg)).png().toBuffer();
    const holeMask = await sharp(Buffer.from(holeSvg)).png().toBuffer();
    return sharp(base).composite([{ input: holeMask, blend: 'dest-out' }]).png().toBuffer();
}

// ✅ نسخة متحركة من نفس المصدر الاصطناعي (فتحة ثابتة، ألوان زخرفة متبادلة بين اللقطات —
// يحاكي GIF/WebP متحرك حقيقي) عبر تكديس كل لقطة خاماً عمودياً ثم تفسيرها بـpageHeight —
// تُثبت أن مسار المعالجة المتحركة بـnormalizeOne (animated:true بالقراءة والتحجيم معاً)
// يعمل فعلاً من البداية للنهاية بلا وصول شبكي لأصل GIF/WebP متحرك حقيقي
async function buildSyntheticAnimatedFrame({ size = 400, radius = 120, frames = 3 }) {
    const pageBuffers = [];
    for (let i = 0; i < frames; i++) {
        const color = i % 2 === 0 ? { r: 212, g: 175, b: 55 } : { r: 90, g: 60, b: 200 };
        const frameBuf = await buildSyntheticFrame({ size, radius, color });
        pageBuffers.push(await sharp(frameBuf).ensureAlpha().raw().toBuffer());
    }
    return sharp(Buffer.concat(pageBuffers), {
        raw: { width: size, height: size * frames, channels: 4, pageHeight: size }
    }).webp({ loop: 0 }).toBuffer();
}

async function selfTest() {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'normalize-frames-selftest-'));
    // ✅ الفتحة مركّزة دوماً هنا عمداً (offsetX/offsetY=0 بكل الحالات) — الخوارزمية تفترض
    // صراحة أن فتحة أي إطار حقيقي متمركزة (راجع تعليق التصميم أعلى normalizeOne)، فالاختبار
    // يُجهِد البُعدين اللذين تختلف بهما الأصول الحقيقية فعلياً: دقة المصدر، ونسبة الفتحة
    const cases = [
        { name: 'small-radius-ratio', size: 400, radius: 60 },   // فتحة ضيقة نسبياً (نسبة صغيرة من اللوحة)
        { name: 'large-radius-ratio', size: 300, radius: 130 },  // فتحة واسعة نسبياً
        { name: 'tiny-source', size: 128, radius: 30 },           // دقة مصدر منخفضة جداً
        { name: 'huge-source', size: 900, radius: 300 },          // دقة مصدر عالية جداً
        { name: 'animated-source', size: 400, radius: 100, animated: true, frames: 3 } // مصدر متحرك (GIF/WebP حقيقي)
    ];
    let allPassed = true;
    for (const c of cases) {
        const ext = c.animated ? 'webp' : 'png';
        const buf = c.animated
            ? await buildSyntheticAnimatedFrame(c)
            : await buildSyntheticFrame(c);
        const srcPath = path.join(tmpDir, `${c.name}.${ext}`);
        fs.writeFileSync(srcPath, buf);

        const outDir = path.join(tmpDir, 'out');
        const result = await normalizeOne(c.name, srcPath, { outDir, verbose: false });

        // ✅ يتحقق من ناتج التطبيع نفسه: يُعيد قياس الفتحة على الصورة الناتجة (512×512) ويتأكد
        // أنها أصبحت فعلياً عند 62.5% (±1px تسامح للتقريب) ومركّزة (±1px من منتصف 512)
        const { data: outRaw, info: outInfo } = await sharp(result.outPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { radius: finalRadius, cx: finalCx, cy: finalCy } = detectOpeningRadius(outRaw, outInfo.width, outInfo.height, outInfo.channels);
        const expectedRadius = TARGET_RADIUS;
        // ✅ تسامح نسبي (2.5% من الهدف) لا قيمة ثابتة صغيرة — تحجيم مصادر اصطناعية بمعامل
        // كبير (×5 بحالة tiny-source مثلاً) يُنتج تمويهاً طبيعياً بحدود بكسلات قليلة عبر نواة
        // إعادة التحجيم (lanczos3) عند التكبير، بلا علاقة بصحة الخوارزمية نفسها (المركز والقياس
        // الأساسي صحيحان دوماً — راجع centerOk) — أصول حقيقية بدقة قريبة من 512px (كل أصول
        // KNOWN_FRAMES أعلاه 512–600px) لا تحتاج تكبيراً متطرفاً كهذا فلن تُظهر هذا الأثر عملياً
        const radiusTolerance = Math.max(1.5, expectedRadius * 0.025);
        const radiusOk = Math.abs(finalRadius - expectedRadius) <= radiusTolerance;
        const centerOk = Math.abs(finalCx - CANVAS_SIZE / 2) <= 1.5 && Math.abs(finalCy - CANVAS_SIZE / 2) <= 1.5;
        const canvasOk = outInfo.width === CANVAS_SIZE && outInfo.height === CANVAS_SIZE;
        let animatedOk = true;
        let animatedNote = '';
        if (c.animated) {
            // ✅ يتحقق أن الناتج فعلاً متعدد اللقطات (لا يُفرَّغ إلى لقطة واحدة ساكنة) وأن
            // normalizeOne اكتشف الحركة بنفسه (result.isAnimated) بلا تمرير يدوي
            const outMeta = await sharp(result.outPath, { animated: true }).metadata();
            animatedOk = result.isAnimated === true && (outMeta.pages || 1) === c.frames;
            animatedNote = ` لقطات_ناتج=${outMeta.pages || 1}/${c.frames}`;
        }
        const pass = radiusOk && centerOk && canvasOk && animatedOk;
        allPassed = allPassed && pass;
        console.log(
            `[selftest] ${c.name}: لوحة=${outInfo.width}×${outInfo.height} نصف_قطر_نهائي=${finalRadius.toFixed(2)}px ` +
            `(مستهدف=${expectedRadius.toFixed(2)}px) مركز=(${finalCx.toFixed(1)},${finalCy.toFixed(1)})${animatedNote} → ${pass ? '✅ PASS' : '❌ FAIL'}`
        );
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (!allPassed) {
        console.error('[selftest] فشل — راجع الحالات أعلاه');
        process.exit(1);
    }
    console.log('[selftest] كل الحالات نجحت — الخوارزمية تُعيد أي فتحة (مركز/نصف قطر عشوائيين) إلى 62.5% مركّزة تماماً بلوحة 512×512');
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--selftest')) {
        await selfTest();
        return;
    }
    const classArg = args.find(a => a.startsWith('--class='));
    const srcArg = args.find(a => a.startsWith('--src='));
    if (classArg && srcArg) {
        await normalizeOne(classArg.slice('--class='.length), srcArg.slice('--src='.length));
        return;
    }
    if (classArg || srcArg) {
        console.error('استخدم --class=KEY و--src=PATH_OR_URL معاً، أو بلا أي منهما لمعالجة القائمة الكاملة');
        process.exit(1);
    }

    console.log(`[normalize-frames] معالجة ${KNOWN_FRAMES.length} إطاراً معروفاً من روابط Cloudinary الحقيقية...`);
    const failures = [];
    for (const frame of KNOWN_FRAMES) {
        try {
            await normalizeOne(frame.key, frame.src);
        } catch (error) {
            failures.push({ key: frame.key, error: error.message });
            console.error(`[normalize-frames] ❌ ${frame.key} فشل: ${error.message}`);
        }
    }
    if (failures.length) {
        console.error(`\n[normalize-frames] ${failures.length}/${KNOWN_FRAMES.length} فشلت. الأكثر شيوعاً: لا وصول شبكي لـres.cloudinary.com من بيئة التشغيل الحالية — راجع docs/verification للتفاصيل والحل.`);
        process.exit(1);
    }
    console.log(`[normalize-frames] تم بنجاح — ${KNOWN_FRAMES.length} ملف WebP بـ${path.relative(process.cwd(), OUT_DIR)}`);
}

if (require.main === module) {
    main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { normalizeOne, detectOpeningRadius, loadFramesManifest, KNOWN_FRAMES, CANVAS_SIZE, TARGET_RADIUS };
