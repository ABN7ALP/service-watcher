#!/usr/bin/env node
// 🛡️ طلب صريح بمراجعة PR (جولة 2 — إصلاح جوهري): الجولة الأولى كانت تفرض فتحة 62.5% دوماً
// بصرف النظر عما يحدث لحافة الفنّ الخارجية — لأصول حقيقية فنّها يمتدّ قريباً من حافة لوحة
// المصدر (admin بتوأم الأسود، fire-dragons، amethyst-royal، black-gold-crown،
// pegasus-warrior، lion-bee-sapphire)، معامل التحجيم اللازم لفتحة 62.5% كان يدفع الفنّ
// الخارجي (تيجان/أجنحة/زخارف) خارج لوحة 512×512 النهائية فيُقصّ فعلياً بالحواف — تأكَّد هذا
// بفحص بكسلي صارم (alpha>16 ضمن 2px من الحافة) على كل الإطارات الـ11 بعد الجولة الأولى: كلها
// إلا الثابت (contributor) كان بها انتهاك حقيقي.
//
// الخوارزمية الجديدة (لكل أصل مصدر):
//   1) تحميل الصورة (الإطار الأول لتحديد مركز الفتحة — ثابت بكل أصل حقيقي، لا يتغيّر بين
//      اللقطات؛ نصف قطرها يُعاد فحصه بالخطوة 3 أدناه عبر كل اللقطات لو بلا تصحيح يدوي).
//   2) مسح شعاعي (8 اتجاهات + وسيط) لإيجاد نصف قطر الفتحة الشفافة المركزية بالإطار الأول —
//      كالسابق تماماً، ما لم يوجد تصحيح يدوي بـscripts/frames-manifest.json (عندها يُستخدَم
//      مباشرة، قيمة ثابتة مقصودة بالتصميم، لا نقطة بيانات تُعاد فحصها عبر اللقطات).
//   3) مسحان بكسليان كاملان (لا عيّنة شعاعية) عبر كل اللقطات التي ستُشمَل فعلياً بالناتج
//      النهائي (العيّنة المُجدوَلة، لا كل لقطات المصدر): (أ) أبعد بكسل غير شفاف عن مركز
//      الفتحة — "نصف قطر الفنّ الخارجي" (أقصى قيمة عبر كل اللقطات)؛ (ب) لو بلا تصحيح يدوي،
//      نصف قطر الفتحة نفسه يُعاد قياسه (نفس مسح الخطوة 2) بكل لقطة أيضاً ويُؤخَذ أضيقها (أقل
//      قيمة). كلاهما يضمن عدم قصّ/فقدان شفافية أي لقطة متحركة قد يمتدّ فيها تأثير بصري (بريق/
//      شرارة/نفَس نار) أبعد عن المركز (يحتاج احتواءً أوسع) أو أقرب له (يُضيِّق الفتحة الآمنة
//      فعلياً تلك اللحظة) مقارنة باللقطة الأولى وحدها.
//   4) معاملا تحجيم مرشَّحان: أحدهما يحقق فتحة 50% بالضبط (الهدف الافتراضي، من نصف القطر
//      الأضيق بالخطوة 3ب)، والآخر يُبقي
//      نصف قطر الفنّ الخارجي ضمن لوحة 512px بهامش شفاف ≥8px. يُختار الأصغر بينهما (الأكثر
//      تحفّظاً) — فلا يُقصّ الفنّ الخارجي أبداً، حتى لو كان هذا يعني فتحة أصغر من 50% فعلياً
//      لإطار بعينه (فنّه يمتدّ بعيداً عن الفتحة). النسبة الفعلية الناتجة (قد تختلف عن 50%)
//      تُسجَّل بـscripts/frames-manifest.json (`effectiveOpeningRatio`) لكل إطار — العميل
//      يستخدمها لتصحيح --frame-scale لهذا الإطار تحديداً وقت العرض (راجع .avatar__frame
//      بـinput.css وavatarHTML/applyFrameToAvatarWrap بـapp.js)، فتبقى الصورة الشخصية مطابقة
//      لحجم الفتحة الحقيقية رغم اختلاف نسبتها الفعلية عن 50% القياسية.
//   5) حفظ WebP (متحرك إن كان المصدر متحركاً فعلياً — لقطات متعددة؛ ثابت غير ذلك).
//
// الاستخدام:
//   node scripts/normalize-frames.js                 → يعالج كل القائمة المعروفة أدناه
//   node scripts/normalize-frames.js --class=KEY --src=PATH_OR_URL   → أصل واحد مخصَّص
//   node scripts/normalize-frames.js --selftest       → يبني ويطبّع أصولاً اصطناعية للتحقق
//
// 🛡️ تصحيح يدوي اختياري (منفصل عن effectiveOpeningRatio أعلاه): بعض الإطارات الحقيقية فيها
// زخارف تبرز داخل حدود الفتحة فعلاً (وجه/جناح لا مجرد حافة خارجية)، فيلتقط المسح الشعاعي
// الآلي للفتحة نصف قطر أكبر من اللازم. scripts/frames-manifest.json يحمل تصحيحاً يدوياً
// لنصف القطر/المركز (كنسبة من أبعاد المصدر) لمثل هذي الحالات تحديداً — راجع loadFramesManifest
// أدناه. إطار غير مذكور بالملف يعتمد بالكامل على detectOpeningRadius الآلية لاكتشاف الفتحة.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const CANVAS_SIZE = 512;
const TARGET_OPENING_RATIO = 0.5; // ✅ طلب صريح (جولة 2): فتحة 50% من اللوحة (كانت 62.5%) — تمنح
// هامشاً للفنّ الخارجي أوسع من البداية، يقلّل حالات تفعيل قيد الاحتواء (scaleForContainment)
const TARGET_RADIUS = (CANVAS_SIZE * TARGET_OPENING_RATIO) / 2; // 128px
const MIN_EDGE_MARGIN_PX = 8; // ✅ طلب صريح: هامش شفاف ≥8px بين أبعد بكسل فنّ وحافة اللوحة
const MAX_ART_RADIUS = CANVAS_SIZE / 2 - MIN_EDGE_MARGIN_PX; // 248px — أقصى نصف قطر فنّ مسموح بعد التحجيم
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
// ✅ نسخة مخدومة للعميل — نفس محتوى MANIFEST_PATH بالضبط، فقط بمسار static يقدر app.js
// يجلبها منه (scripts/ غير مخدوم). تُكتَب معاً دوماً بـwriteManifest أدناه، لا تُحرَّر يدوياً
const PUBLIC_MANIFEST_PATH = path.join(OUT_DIR, 'frames-manifest.json');

// ✅ يحمّل scripts/frames-manifest.json إن وُجد — تصحيح يدوي اختياري فقط، لا يفشل السكربت
// لو الملف غائب (الاكتشاف الآلي يبقى المسار الافتراضي لكل الإطارات بلا استثناء)
function loadFramesManifest() {
    if (!fs.existsSync(MANIFEST_PATH)) return {};
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const { _description, _fields, ...overrides } = parsed;
    return overrides;
}

// ✅ يكتب scripts/frames-manifest.json (يحافظ على _description/_fields + أي حقول يدوية
// موجودة لكل مفتاح كـradiusRatio/reason) ثم ينسخه حرفياً لنسخة public/ المخدومة للعميل —
// يُستدعى فقط من normalizeOne بوضع persistManifest:true (معالجة KNOWN_FRAMES الحقيقية فعلياً،
// لا الاختبارات/selftest التي تستخدم مفاتيح اصطناعية لا يصح تسريبها لملف المشروع الحقيقي)
function writeManifestEntry(key, fields) {
    let manifest = {};
    if (fs.existsSync(MANIFEST_PATH)) {
        manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    } else {
        manifest._description = 'تصحيح يدوي اختياري لفتحة إطار بعينه + effectiveOpeningRatio محسوبة آلياً — راجع رأس scripts/normalize-frames.js.';
        manifest._fields = 'radiusRatio/cxRatio/cyRatio/reason: تصحيح يدوي اختياري وقت الاكتشاف. effectiveOpeningRatio: محسوبة آلياً بعد كل تشغيل — نسبة فتحة الإطار الفعلية بعد تطبيق قيد احتواء الفنّ الخارجي (قد تقل عن الهدف 50% لو فنّ الإطار يمتدّ قريباً من حافة لوحة المصدر). العميل (app.js) يستخدمها لتصحيح --frame-scale لهذا الإطار تحديداً.';
    }
    manifest[key] = { ...(manifest[key] || {}), ...fields };
    const text = JSON.stringify(manifest, null, 2) + '\n';
    fs.writeFileSync(MANIFEST_PATH, text);
    fs.mkdirSync(path.dirname(PUBLIC_MANIFEST_PATH), { recursive: true });
    fs.writeFileSync(PUBLIC_MANIFEST_PATH, text);
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

// ✅ أبعد نصف قطر لأي بكسل غير شفاف عن (cx,cy) — مسح بكسلي كامل (لا عيّنة شعاعية، كي لا تفوت
// زخرفة نحيلة ببكسلات قليلة فقط تبرز بزاوية ضيّقة لم تُعايَن بأي من الاتجاهات الثمانية
// المُستخدَمة لاكتشاف الفتحة، كتاج بتاج واحد مثلاً). O(width×height) — مقبول تماماً لسكربت
// بناء لمرة واحدة (مصادر KNOWN_FRAMES كلها ≤750px بأي بُعد)
function detectOuterArtRadius(raw, width, height, channels, cx, cy) {
    let maxRSq = 0;
    for (let y = 0; y < height; y++) {
        const rowBase = y * width;
        for (let x = 0; x < width; x++) {
            const a = channels < 4 ? 255 : raw[(rowBase + x) * channels + 3];
            if (a > ALPHA_THRESHOLD) {
                const dx = x - cx, dy = y - cy;
                const rSq = dx * dx + dy * dy;
                if (rSq > maxRSq) maxRSq = rSq;
            }
        }
    }
    return Math.sqrt(maxRSq);
}

async function normalizeOne(key, src, { outDir = OUT_DIR, verbose = true, manifestOverrides, persistManifest = false } = {}) {
    const inputBuffer = await loadSourceBuffer(src);
    const meta = await sharp(inputBuffer, { animated: true }).metadata();
    const isAnimated = !!(meta.pages && meta.pages > 1);
    const sourcePageCount = isAnimated ? meta.pages : 1;

    // ✅ عيّنة من اللقطات لا كلها (راجع تعليق MAX_ANIMATED_FRAMES أعلى الملف) — تُحسَب هنا
    // مبكراً (لا تعتمد على معامل التحجيم) لأن فحص الاحتواء أدناه يفحص هذي اللقطات بالذات (لا
    // كل لقطات المصدر الأصلية) — هي ما سيُشحَن فعلياً بالناتج النهائي
    const frameStride = isAnimated ? Math.max(1, Math.ceil(sourcePageCount / MAX_ANIMATED_FRAMES)) : 1;
    const pageIndices = [];
    for (let p = 0; p < sourcePageCount; p += frameStride) pageIndices.push(p);
    const pageCount = pageIndices.length;

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
    const isManualOverride = !!(override && typeof override.radiusRatio === 'number');
    if (isManualOverride) {
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

    // ✅ نصف قطر الفنّ الخارجي الأقصى + (لو بلا تصحيح يدوي) أضيق فتحة مُكتشَفة — كلاهما عبر
    // كل اللقطات المُجدوَلة فعلياً للناتج (لا الإطار الأول فقط): تأثير بصري متحرّك (بريق/شرارة/
    // نفَس نار) قد يمتدّ أبعد عن المركز بلقطة لاحقة (يحتاج قيد احتواء أوسع)، أو يقترب أكثر من
    // المركز بلقطة لاحقة (يُضيِّق الفتحة الآمنة فعلياً تلك اللحظة) — فحص الإطار الأول وحده لا
    // يكفي لضمان هامش حقيقي ≥8px ولا فتحة شفافة فعلاً بكل لقطات الناتج (راجع scripts/check-
    // frames.js، نفس الضمانين يفحصهما على الناتج النهائي). لا يُطبَّق على نصف قطر الفتحة لو
    // مصحَّح يدوياً (قيمة ثابتة مقصودة بالتصميم، لا نقطة بيانات تُجمَع إحصائياً عبر اللقطات)
    let outerArtRadius = detectOuterArtRadius(raw, info.width, info.height, info.channels, cx, cy);
    if (!isManualOverride) {
        const firstOpening = detectOpeningRadius(raw, info.width, info.height, info.channels);
        if (firstOpening.radius < radius) radius = firstOpening.radius;
    }
    if (isAnimated) {
        for (const p of pageIndices) {
            if (p === 0) continue; // ✅ الإطار الأول محسوب أعلاه بالفعل (raw/info نفسهما)
            const { data: pRaw, info: pInfo } = await sharp(inputBuffer, { page: p })
                .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            const r = detectOuterArtRadius(pRaw, pInfo.width, pInfo.height, pInfo.channels, cx, cy);
            if (r > outerArtRadius) outerArtRadius = r;
            if (!isManualOverride) {
                const pOpening = detectOpeningRadius(pRaw, pInfo.width, pInfo.height, pInfo.channels);
                if (pOpening.radius < radius) radius = pOpening.radius;
            }
        }
    }

    // ✅ معاملا تحجيم مرشَّحان — يُختار الأصغر (الأكثر تحفّظاً) كي لا يُقصّ الفنّ الخارجي أبداً
    // (راجع تعليق الخوارزمية أعلى الملف لتفاصيل كاملة)
    const scaleForOpening = TARGET_RADIUS / radius;
    const scaleForContainment = MAX_ART_RADIUS / outerArtRadius;
    const scale = Math.min(scaleForOpening, scaleForContainment);
    const containmentBound = scaleForContainment < scaleForOpening;
    const effectiveOpeningRadius = scale * radius;
    const effectiveOpeningRatio = effectiveOpeningRadius / (CANVAS_SIZE / 2);

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

    // 🛡️ طلب صريح بمراجعة PR (جولة 2): بعض الأصول المتحركة فيها تأثير بصري (نفَس نار/بريق)
    // يقترب أحياناً جداً من المركز بلقطة بعينها (مثلاً fire-dragons: شعلة من فم التنين
    // الأوسط تمتدّ للأسفل بزاوية التقاط صلبة alpha=255 بلقطات معيّنة) — لا علاقة لهذا بقيد
    // الاحتواء (ذاك يحمي الحافة الخارجية فقط، والتحجيم الموحَّد لا يستطيع تقريب نقطة داخلية
    // من المركز وإبعاد نقطة خارجية عنه بمعامل واحد نفسه في آنٍ). الحل: فتحة شفافة مضمونة
    // "صلبة" (dest-out) بنصف قطر SAFE_CORE_MASK_RADIUS تُقَصّ من كل لقطة بعد التركيب مباشرة،
    // بصرف النظر عمّا تحته — أصغر مِن أصغر نصف قطر فتحة فعلية حقيقية بكل الإطارات الـ11 (أضيقها
    // حالياً lion-bee-sapphire ~72px) بهامش واضح، فلا تقصّ أي فنّ زخرفي مقصود يظهر طبيعياً
    // داخل الفتحة بأي إطار؛ تحذف فقط تسرّب تأثير متحرّك شاذ يقترب من المركز أكثر من اللازم
    const SAFE_CORE_MASK_RADIUS = 56;
    const safeCoreMaskSvg = Buffer.from(
        `<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}"><circle cx="${CANVAS_SIZE / 2}" cy="${CANVAS_SIZE / 2}" r="${SAFE_CORE_MASK_RADIUS}" fill="black"/></svg>`
    );

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
            .composite([
                { input: resized, left: destLeft, top: destTop },
                { input: safeCoreMaskSvg, blend: 'dest-out' }
            ])
            .ensureAlpha()
            .raw()
            .toBuffer();
    }

    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${key}.webp`);

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

    if (persistManifest) {
        writeManifestEntry(key, { effectiveOpeningRatio: Math.round(effectiveOpeningRatio * 10000) / 10000 });
    }

    if (verbose) {
        const boundNote = containmentBound
            ? ` 🛡️ قيد الاحتواء فعّال (فتحة فعلية=${(effectiveOpeningRatio * 100).toFixed(1)}% لا 50% — فنّ الإطار يمتدّ قريباً من حافة المصدر)`
            : '';
        console.log(`[normalize-frames] ${key}: نصف قطر مُكتشَف=${radius.toFixed(1)}px، فنّ خارجي أقصى=${outerArtRadius.toFixed(1)}px (من ${info.width}×${info.height}) → تحجيم×${scale.toFixed(3)} → ${outPath} (${(outputBytes / 1024).toFixed(0)}KB)${isAnimated ? ` (متحرك، ${pageCount}/${sourcePageCount} لقطة)` : ''}${boundNote}`);
    }
    return { key, outPath, radius, scale, isAnimated, outputBytes, pageCount, outerArtRadius, effectiveOpeningRatio, containmentBound };
}

// =====================================================
// ✅ اختبار ذاتي (--selftest): يبني أصولاً اصطناعية ويتحقق من سلوك الخوارزمية الجديدة
// بحالتين مميَّزتين (بلا وصول شبكي لأصول Cloudinary الحقيقية):
//   • "padded-*": فتحة + فنّ محدود كلاهما بعيدان عن حافة لوحة المصدر (هامش فعلي سخي) —
//     قيد الفتحة (50%) هو الفعّال، والنتيجة فتحة 50% بالضبط كالمتوقَّع افتراضياً.
//   • "edge-to-edge-*": فنّ يمتدّ لحافة لوحة المصدر تماماً (بلا أي هامش بالأصل) — قيد
//     الاحتواء هو الفعّال هنا، فالفتحة الناتجة تكون أصغر من 50% عمداً لحماية هامش ≥8px
async function buildSyntheticFrame({ size = 400, openingRadius = 120, artRadius = null, offsetX = 0, offsetY = 0, color = { r: 212, g: 175, b: 55 } }) {
    // ✅ artRadius: نصف قطر القرص الملوّن الخارجي نفسه (الفنّ) — null يعني يملأ اللوحة كاملة
    // (محاكاة "فنّ يصل لحافة المصدر" — الحالة edge-to-edge)؛ قيمة محدَّدة تترك هامشاً حقيقياً
    // حول الفنّ نفسه قبل حافة اللوحة (محاكاة "فنّ محدود" — الحالة padded)
    const outerR = artRadius != null ? artRadius : size / 2;
    const baseSvg = artRadius != null
        ? `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${outerR}" fill="rgba(${color.r},${color.g},${color.b},1)"/></svg>`
        : `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size / 2}" fill="rgba(${color.r},${color.g},${color.b},1)"/></svg>`;
    const holeSvg = `<svg width="${size}" height="${size}">
        <circle cx="${size / 2 + offsetX}" cy="${size / 2 + offsetY}" r="${openingRadius}" fill="black"/>
    </svg>`;
    const base = await sharp(Buffer.from(baseSvg)).png().toBuffer();
    const holeMask = await sharp(Buffer.from(holeSvg)).png().toBuffer();
    return sharp(base).composite([{ input: holeMask, blend: 'dest-out' }]).png().toBuffer();
}

// ✅ نسخة متحركة من نفس المصدر الاصطناعي (فتحة/فنّ ثابتان، ألوان زخرفة متبادلة بين اللقطات —
// يحاكي GIF/WebP متحرك حقيقي) عبر تكديس كل لقطة خاماً عمودياً ثم تفسيرها بـpageHeight —
// تُثبت أن مسار المعالجة المتحركة بـnormalizeOne (animated:true بالقراءة والتحجيم معاً)
// يعمل فعلاً من البداية للنهاية بلا وصول شبكي لأصل GIF/WebP متحرك حقيقي
async function buildSyntheticAnimatedFrame({ size = 400, openingRadius = 120, artRadius = null, frames = 3 }) {
    const pageBuffers = [];
    for (let i = 0; i < frames; i++) {
        const color = i % 2 === 0 ? { r: 212, g: 175, b: 55 } : { r: 90, g: 60, b: 200 };
        const frameBuf = await buildSyntheticFrame({ size, openingRadius, artRadius, color });
        pageBuffers.push(await sharp(frameBuf).ensureAlpha().raw().toBuffer());
    }
    return sharp(Buffer.concat(pageBuffers), {
        raw: { width: size, height: size * frames, channels: 4, pageHeight: size }
    }).webp({ loop: 0 }).toBuffer();
}

// ✅ يتحقق أن كل بكسل غير شفاف بكل لقطات ناتج ملف بعينه يقع ضمن هامش ≥MIN_EDGE_MARGIN_PX
// الحقيقي من حافة لوحة 512×512 — نفس فحص scripts/check-frames.js بالضبط (مُستورَد من هناك
// وقت التشغيل لتفادي ازدواج منطق الفحص بين الملفين)
async function assertNoEdgeCropping(outPath) {
    const { checkFrameFile } = require('./check-frames');
    const result = await checkFrameFile(outPath);
    if (!result.ok) {
        throw new Error(`[selftest] ${path.basename(outPath)} ينتهك هامش الحافة: ${result.violations.join('; ')}`);
    }
}

async function selfTest() {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'normalize-frames-selftest-'));
    // ✅ النسبة الفاصلة بين القيدين: artRadius/openingRadius = MAX_ART_RADIUS/TARGET_RADIUS
    // (248/128 ≈ 1.9375) — حالات "opening" هنا نسبتها ~1.33-1.46 (هامش واضح تحت الفاصل)،
    // وحالات "containment" نسبتها ~2.86 (هامش واضح فوقه)، كي لا يعتمد المرور/الفشل على
    // تقريب حسابي قريب من الحدّ الفاصل
    const cases = [
        // ✅ قيد الفتحة (50%) فعّال — هامش سخي حول الفنّ نفسه قبل حافة لوحة المصدر
        { name: 'padded-small-opening', size: 400, openingRadius: 60, artRadius: 80, expectConstraint: 'opening' },
        { name: 'padded-large-opening', size: 300, openingRadius: 90, artRadius: 130, expectConstraint: 'opening' },
        { name: 'padded-tiny-source', size: 128, openingRadius: 24, artRadius: 32, expectConstraint: 'opening' },
        { name: 'padded-huge-source', size: 900, openingRadius: 220, artRadius: 320, expectConstraint: 'opening' },
        // ✅ قيد الاحتواء فعّال — الفنّ يصل لحافة لوحة المصدر تماماً (بلا أي هامش أصلي)
        { name: 'edge-to-edge-source', size: 400, openingRadius: 70, artRadius: null, expectConstraint: 'containment' },
        { name: 'edge-to-edge-animated', size: 400, openingRadius: 70, artRadius: null, animated: true, frames: 3, expectConstraint: 'containment' }
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
        let result, edgeError = null;
        try {
            result = await normalizeOne(c.name, srcPath, { outDir, verbose: false, manifestOverrides: {}, persistManifest: false });
            await assertNoEdgeCropping(result.outPath);
        } catch (e) {
            edgeError = e.message;
        }

        let pass = !edgeError;
        let note = edgeError || '';
        if (!edgeError) {
            const { data: outRaw, info: outInfo } = await sharp(result.outPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            const { radius: finalRadius, cx: finalCx, cy: finalCy } = detectOpeningRadius(outRaw, outInfo.width, outInfo.height, outInfo.channels);
            const canvasOk = outInfo.width === CANVAS_SIZE && outInfo.height === CANVAS_SIZE;
            const centerOk = Math.abs(finalCx - CANVAS_SIZE / 2) <= 1.5 && Math.abs(finalCy - CANVAS_SIZE / 2) <= 1.5;
            const constraintOk = c.expectConstraint === 'opening'
                ? Math.abs(result.effectiveOpeningRatio - TARGET_OPENING_RATIO) <= 0.01
                : result.effectiveOpeningRatio < TARGET_OPENING_RATIO - 0.005 && result.containmentBound;
            let animatedOk = true;
            if (c.animated) {
                const outMeta = await sharp(result.outPath, { animated: true }).metadata();
                animatedOk = result.isAnimated === true && (outMeta.pages || 1) === c.frames;
            }
            pass = canvasOk && centerOk && constraintOk && animatedOk;
            note = `فتحة_فعلية=${(result.effectiveOpeningRatio * 100).toFixed(1)}% قيد=${result.containmentBound ? 'احتواء' : 'فتحة'} (متوقَّع=${c.expectConstraint})`;
        }
        allPassed = allPassed && pass;
        console.log(`[selftest] ${c.name}: ${note} → ${pass ? '✅ PASS' : '❌ FAIL'}`);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (!allPassed) {
        console.error('[selftest] فشل — راجع الحالات أعلاه');
        process.exit(1);
    }
    console.log('[selftest] كل الحالات نجحت — فتحة 50% حين يسمح الهامش، واحتواء الفنّ الخارجي (هامش ≥8px) حين لا يسمح، بلا أي قصّ حافة بأي حالة');
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
        await normalizeOne(classArg.slice('--class='.length), srcArg.slice('--src='.length), { persistManifest: true });
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
            await normalizeOne(frame.key, frame.src, { persistManifest: true });
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

module.exports = {
    normalizeOne, detectOpeningRadius, detectOuterArtRadius, loadFramesManifest, writeManifestEntry,
    KNOWN_FRAMES, CANVAS_SIZE, TARGET_RADIUS, TARGET_OPENING_RATIO, MIN_EDGE_MARGIN_PX, MAX_ART_RADIUS
};
