#!/usr/bin/env node
// 🛡️ طلب صريح بمراجعة PR (جولة 2 — إصلاح جوهري): الجولة الأولى كانت تفرض فتحة 62.5% دوماً
// بصرف النظر عما يحدث لحافة الفنّ الخارجي — لأصول حقيقية فنّها يمتدّ قريباً من حافة لوحة
// المصدر (admin بتوأم الأسود، fire-dragons، amethyst-royal، black-gold-crown،
// pegasus-warrior، lion-bee-sapphire)، معامل التحجيم اللازم لفتحة 62.5% كان يدفع الفنّ
// الخارجي (تيجان/أجنحة/زخارف) خارج لوحة اللوحة النهائية فيُقصّ فعلياً بالحواف — تأكَّد هذا
// بفحص بكسلي صارم (alpha>16 ضمن 2px من الحافة) على كل الإطارات الـ11 بعد الجولة الأولى: كلها
// إلا الثابت (contributor) كان بها انتهاك حقيقي.
//
// الخوارزمية (لكل أصل مصدر):
//   1) تحميل الصورة (الإطار الأول لتحديد مركز الفتحة — ثابت بكل أصل حقيقي، لا يتغيّر بين
//      اللقطات؛ نصف قطرها يُعاد فحصه بالخطوة 3 أدناه عبر كل اللقطات لو بلا تصحيح يدوي).
//   2) مسح شعاعي (8 اتجاهات + وسيط) لإيجاد نصف قطر الفتحة الشفافة المركزية بالإطار الأول —
//      ما لم يوجد تصحيح يدوي بـscripts/frames-manifest.json (عندها يُستخدَم مباشرة).
//   3) مسحان بكسليان كاملان عبر كل اللقطات المُشمولة فعلياً بالناتج: (أ) أبعد بكسل غير شفاف
//      عن مركز الفتحة — "نصف قطر الفنّ الخارجي" (أقصى قيمة عبر كل اللقطات)؛ (ب) لو بلا
//      تصحيح يدوي، نصف قطر الفتحة نفسه يُعاد قياسه بكل لقطة أيضاً ويُؤخَذ أضيقها.
//   4) معاملا تحجيم مرشَّحان: أحدهما يحقق فتحة 50% بالضبط، والآخر يُبقي نصف قطر الفنّ
//      الخارجي ضمن اللوحة بهامش شفاف ≥8px. يُختار الأصغر بينهما (الأكثر تحفّظاً). النسبة
//      الفعلية الناتجة تُسجَّل بـscripts/frames-manifest.json (`effectiveOpeningRatio`).
//   5) حفظ WebP (متحرك إن كان المصدر متحركاً فعلياً؛ ثابت غير ذلك) + نسخة ثابتة لقطة واحدة
//      (راجع فقرة جولة 3 أدناه).
//
// 🛡️ تحديث جولة 3 — إصلاحان حاسمان كشفتهما مراجعة لاحقة (تعليقات مفصَّلة عند كل تغيير أدناه):
//   1) الحركة كانت أسرع من مصدرها الحقيقي بكثير: ANIMATED_FRAME_DELAY_MS=90 كانت قيمة ثابتة
//      مكتوبة يدوياً بصرف النظر عن توقيت المصدر الفعلي (مصادر Cloudinary الحقيقية: 40-50ms
//      للقطة الواحدة فعلياً بميتاداتا GIF/WebP — مدة حلقة حقيقية 2-4 ثوانٍ)، بينما 10 لقطات
//      × 90ms = 900ms فقط لكل حلقة ناتج — أسرع من الحقيقة بـ2.2-4.4× حسب الإطار. الحل: تُقرَأ
//      تأخيرات المصدر الحقيقية (sharp metadata.delay، مصفوفة مللي ثانية لكل لقطة مصدر فعلية)
//      وتُوزَّع على اللقطات المحفوظة فعلياً (حتى 24 بدل 10 — عيّنة بمسافة ثابتة كالسابق) بحيث
//      تأخير كل لقطة محفوظة = مجموع تأخيرات لقطات المصدر التي تمثّلها بالضبط — مجموع كل
//      اللقطات المحفوظة يطابق مدة حلقة المصدر الكاملة تماماً (0% انحراف رياضياً، لا فقط ±5%
//      المطلوبة) لأن التجميع يقسّم نطاق المصدر كاملاً بلا فجوة/تداخل. مصدر بلا بيانات تأخير
//      حقيقية (نادر) يُفترَض له 80ms/لقطة مصدر (FALLBACK_FRAME_DELAY_MS) بدل الفشل الصامت.
//   2) رفع حدّ اللقطات من 10 إلى 24 (هامش حركة أنعم) يزيد البيانات الخام لكل ملف — للبقاء ضمن
//      ميزانية 400KB/ملف خُفِّضت اللوحة من 512×512 إلى 384×384 (CANVAS_SIZE) — كافية بصرياً
//      لأكبر عرض فعلي لمقعد/صورة بالتطبيق حتى بكثافة بكسل 3x (--av/--hostAv لا تتجاوز 84px
//      حتى بأقصى سياقاتها، و--frame-box لا يتجاوز 170% من ذلك). SAFE_CORE_MASK_RADIUS تقلَّص
//      بنفس النسبة (56px/512 → 42px/384) للحفاظ على نفس هامش الأمان النسبي تماماً.
//   3) نسخة ثابتة (`${key}-static.webp`، لقطة واحدة فقط من اللقطة الأولى بعد التركيب نفسه —
//      لا إعادة معالجة مستقلة) تُولَّد لكل إطار بلا استثناء (حتى الثابتة أصلاً كـcontributor —
//      بلا أي فرع خاص بالكود، بساطة أهم من توفير ملف صغير مكرَّر) — تُستخدَم بـ@media
//      (prefers-reduced-motion:reduce) بـinput.css (راجع .avatar__frame--static) لمستخدمي
//      تفضيل تقليل الحركة، بدل حركة مستمرة قسراً.
//
// 🛡️ تحديث جولة 3 — نموذج "بصمة ثابتة" (Fixed Footprint، أسلوب Bigo/Likee): راجع .avatar__frame/
// .avatar__photo بـinput.css وavatarHTML/applyFrameToAvatarWrap بـapp.js — effectiveOpeningRatio
// المُسجَّلة هنا الآن تُستخدَم لتصغير الصورة الشخصية نفسها (لا لتكبير إطار الزخرفة كما كانت
// الجولة الثانية)، فحجم إطار الزخرفة الظاهر يبقى موحَّداً بكل الإطارات بصرف النظر عن نسبة
// فتحتها الفعلية — لا تغيير هنا بهذا السكربت لذلك (effectiveOpeningRatio نفس الحساب بالضبط).
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

const CANVAS_SIZE = 384; // 🛡️ جولة 3: كان 512 — راجع فقرة "جولة 3" أعلى الملف
const TARGET_OPENING_RATIO = 0.5; // ✅ فتحة 50% من اللوحة — هامش واسع للفنّ الخارجي
const TARGET_RADIUS = (CANVAS_SIZE * TARGET_OPENING_RATIO) / 2;
const MIN_EDGE_MARGIN_PX = 8; // ✅ طلب صريح: هامش شفاف ≥8px بين أبعد بكسل فنّ وحافة اللوحة
const MAX_ART_RADIUS = CANVAS_SIZE / 2 - MIN_EDGE_MARGIN_PX; // أقصى نصف قطر فنّ مسموح بعد التحجيم
const ALPHA_THRESHOLD = 24; // ✅ أي بكسل alpha أقل من هذا يُعدّ "شفافاً" (فتحة)

// 🛡️ طلب صريح بمراجعة PR: كل ملف < 400KB. أصول Cloudinary الحقيقية المتحركة (حتى 100 لقطة
// لكل أصل) كانت تُعيد تصديرها بجودة 88 بكل لقطاتها فتنتج 3-10MB/ملف. الحل: أخذ عيّنة من
// اللقطات (حد أقصى MAX_ANIMATED_FRAMES — جولة 3: رُفع من 10 إلى 24 لنعومة حركة أفضل، مع
// تعويض ميزانية الحجم بتقليص CANVAS_SIZE) + جودة أخفض للمتحرك تحديداً
const MAX_ANIMATED_FRAMES = 24;
const ANIMATED_WEBP_QUALITY = 28;
const ANIMATED_ALPHA_QUALITY = 32;
// 🛡️ جولة 3: كانت ANIMATED_FRAME_DELAY_MS=90 ثابتة لكل لقطة بصرف النظر عن توقيت المصدر
// الحقيقي (راجع فقرة "جولة 3" أعلى الملف) — استُبدلت بقراءة تأخيرات المصدر الفعلية
// (sharp metadata.delay) وتوزيعها على اللقطات المحفوظة. FALLBACK_FRAME_DELAY_MS يُستخدَم
// فقط لو المصدر بلا بيانات تأخير حقيقية إطلاقاً (نادر جداً لصيغ GIF/WebP متحركة حقيقية)
const FALLBACK_FRAME_DELAY_MS = 80;
const STATIC_WEBP_QUALITY = 88;
const WEBP_ENCODE_EFFORT = 6;
const MAX_OUTPUT_BYTES = 400 * 1024;

const OUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'frames');
const MANIFEST_PATH = path.join(__dirname, 'frames-manifest.json');
// ✅ نسخة مخدومة للعميل — نفس محتوى MANIFEST_PATH بالضبط، فقط بمسار static يقدر app.js
// يجلبها منه (scripts/ غير مخدوم). تُكتَب معاً دوماً بـwriteManifestEntry أدناه، لا تُحرَّر يدوياً
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
// يُستدعى فقط من normalizeOne بوضع persistManifest:true
function writeManifestEntry(key, fields) {
    let manifest = {};
    if (fs.existsSync(MANIFEST_PATH)) {
        manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    }
    // 🐛 إصلاح جولة 3: _description/_fields كانا يُكتبان فقط لو الملف غائباً كلياً — أي تحديث
    // لاحق لنصّهما بهذا السكربت (كتحديث جولة 3 نفسه) كان يبقى بلا أثر أبداً على ملف موجود
    // مسبقاً (حالة كل تشغيل حقيقي فعلياً بعد الجولة الأولى) فيتجمّد التوثيق على نسخة قديمة
    // بصمت. يُعاد كتابتهما دوماً الآن — رخيصان (نص توثيق لا بيانات مستخدم) ويجب أن يطابقا
    // سلوك السكربت الحالي دوماً لا نسخته وقت أول إنشاء للملف فقط
    manifest._description = 'تصحيح يدوي اختياري لفتحة إطار بعينه + بيانات محسوبة آلياً بعد كل تشغيل — راجع رأس scripts/normalize-frames.js.';
    manifest._fields = 'radiusRatio/cxRatio/cyRatio/reason: تصحيح يدوي اختياري وقت الاكتشاف. effectiveOpeningRatio: نسبة فتحة الإطار الفعلية بعد قيد الاحتواء — app.js يستخدمها لتصغير الصورة الشخصية داخل --frame-box الثابت (لا لتكبير الإطار نفسه، منذ جولة 3). sourcePageCount/sourceLoopDurationMs: عدد لقطات المصدر الحقيقي ومدة حلقته الكاملة (ms) كما قُرئت من ميتاداتا المصدر — يستخدمها scripts/check-frames.js كمرجع "حقيقة أرضية" لمطابقة سرعة الحركة (جولة 3). outputPageCount/outputLoopDurationMs: نفس القياسين على الناتج النهائي المحفوظ فعلياً.';
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
// يعمل بغضّ النظر عن حجم/دقة المصدر الخام (لا نفترض أي مقاس بعينه)
function detectOpeningRadius(raw, width, height, channels) {
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) / 2;
    const alphaAt = (x, y) => {
        const xi = Math.round(x), yi = Math.round(y);
        if (xi < 0 || yi < 0 || xi >= width || yi >= height) return 255;
        if (channels < 4) return 255;
        return raw[(yi * width + xi) * channels + 3];
    };
    const directions = [0, 45, 90, 135, 180, 225, 270, 315].map(deg => deg * Math.PI / 180);
    const radii = directions.map(angle => {
        const dx = Math.cos(angle), dy = Math.sin(angle);
        let r = 0;
        const step = Math.max(1, maxR / 400);
        while (r < maxR && alphaAt(cx + dx * r, cy + dy * r) < ALPHA_THRESHOLD) r += step;
        return r;
    });
    radii.sort((a, b) => a - b);
    const mid = Math.floor(radii.length / 2);
    const median = radii.length % 2 ? radii[mid] : (radii[mid - 1] + radii[mid]) / 2;
    return { radius: median, cx, cy, samples: radii };
}

// ✅ أبعد نصف قطر لأي بكسل غير شفاف عن (cx,cy) — مسح بكسلي كامل (لا عيّنة شعاعية)
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

// 🛡️ جولة 3: يوزّع تأخيرات لقطات المصدر الحقيقية (sourceDelays، مصفوفة ms بطول sourcePageCount)
// على مجموعات اللقطات المحفوظة فعلياً (pageIndices) — تأخير كل لقطة محفوظة = مجموع تأخيرات
// كل لقطات المصدر التي تقع بين فهرسها وفهرس اللقطة المحفوظة التالية (أو نهاية المصدر لآخرها).
// المجموعات تقسّم نطاق [0, sourcePageCount) كاملاً بلا فجوة/تداخل، فمجموع تأخيرات الناتج يطابق
// مجموع تأخيرات المصدر الكاملة بالضبط (0% انحراف رياضياً، لا فقط ±5% المطلوبة بمراجعة PR)
function distributeDelays(sourceDelays, pageIndices, sourcePageCount) {
    return pageIndices.map((p, i) => {
        const nextP = i + 1 < pageIndices.length ? pageIndices[i + 1] : sourcePageCount;
        let sum = 0;
        for (let s = p; s < nextP; s++) sum += sourceDelays[s];
        return Math.max(1, Math.round(sum)); // ✅ WebP يرفض تأخير 0 — حد أدنى 1ms نظري بلا أثر عملي
    });
}

async function normalizeOne(key, src, { outDir = OUT_DIR, verbose = true, manifestOverrides, persistManifest = false } = {}) {
    const inputBuffer = await loadSourceBuffer(src);
    const meta = await sharp(inputBuffer, { animated: true }).metadata();
    const isAnimated = !!(meta.pages && meta.pages > 1);
    const sourcePageCount = isAnimated ? meta.pages : 1;

    // 🛡️ جولة 3: تأخيرات المصدر الحقيقية (ms/لقطة) — راجع فقرة "جولة 3" أعلى الملف. مصدر بلا
    // بيانات تأخير صالحة (نادر) يُفترَض له FALLBACK_FRAME_DELAY_MS/لقطة بدل فشل صامت
    const hasRealDelays = Array.isArray(meta.delay) && meta.delay.length === sourcePageCount;
    const sourceDelays = hasRealDelays ? meta.delay : new Array(sourcePageCount).fill(FALLBACK_FRAME_DELAY_MS);
    const sourceLoopDurationMs = sourceDelays.reduce((a, b) => a + b, 0);

    // ✅ عيّنة من اللقطات لا كلها (راجع MAX_ANIMATED_FRAMES) — مسافة ثابتة عبر كل لقطات المصدر
    const frameStride = isAnimated ? Math.max(1, Math.ceil(sourcePageCount / MAX_ANIMATED_FRAMES)) : 1;
    const pageIndices = [];
    for (let p = 0; p < sourcePageCount; p += frameStride) pageIndices.push(p);
    const pageCount = pageIndices.length;
    const pageDelaysMs = isAnimated ? distributeDelays(sourceDelays, pageIndices, sourcePageCount) : [];
    const outputLoopDurationMs = pageDelaysMs.reduce((a, b) => a + b, 0);

    // ✅ الكشف عن الفتحة يتم على الإطار الأول فقط (ثابت بكل أصل حقيقي — الفتحة لا "تتحرك")
    const firstFrame = sharp(inputBuffer, { animated: false });
    const { data: raw, info } = await firstFrame
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

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

    let outerArtRadius = detectOuterArtRadius(raw, info.width, info.height, info.channels, cx, cy);
    if (!isManualOverride) {
        const firstOpening = detectOpeningRadius(raw, info.width, info.height, info.channels);
        if (firstOpening.radius < radius) radius = firstOpening.radius;
    }
    if (isAnimated) {
        for (const p of pageIndices) {
            if (p === 0) continue;
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

    const left = Math.round(CANVAS_SIZE / 2 - scaledCx);
    const top = Math.round(CANVAS_SIZE / 2 - scaledCy);

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
    // يقترب أحياناً جداً من المركز بلقطة بعينها — فتحة شفافة مضمونة "صلبة" (dest-out) بنصف
    // قطر SAFE_CORE_MASK_RADIUS تُقَصّ من كل لقطة بعد التركيب مباشرة. 🛡️ جولة 3: نصف القطر
    // تقلَّص بنفس نسبة تقلُّص CANVAS_SIZE (56/512 → 42/384) — نفس هامش الأمان النسبي تماماً
    const SAFE_CORE_MASK_RADIUS = Math.round(CANVAS_SIZE * 56 / 512);
    const safeCoreMaskSvg = Buffer.from(
        `<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}"><circle cx="${CANVAS_SIZE / 2}" cy="${CANVAS_SIZE / 2}" r="${SAFE_CORE_MASK_RADIUS}" fill="black"/></svg>`
    );

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
    // 🛡️ جولة 3: نسخة ثابتة (لقطة أولى فقط) لكل إطار بلا استثناء — راجع فقرة "جولة 3" أعلى
    // الملف. تُستخدَم بـ@media(prefers-reduced-motion:reduce) — لا فرع خاص هنا للإطارات
    // الثابتة أصلاً (contributor): تُنتج نسخة "ثابتة" مطابقة لناتجها الوحيد، بلا تعقيد زائد
    const staticOutPath = path.join(outDir, `${key}-static.webp`);

    let rawFirstPage;
    if (!isAnimated) {
        rawFirstPage = await composeFramePage(inputBuffer);
        await sharp(rawFirstPage, { raw: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 4 } })
            .webp({ quality: STATIC_WEBP_QUALITY, effort: WEBP_ENCODE_EFFORT })
            .toFile(outPath);
    } else {
        const rawPages = [];
        for (const p of pageIndices) {
            const pageBuffer = await sharp(inputBuffer, { page: p }).png().toBuffer();
            rawPages.push(await composeFramePage(pageBuffer));
        }
        rawFirstPage = rawPages[0];
        await sharp(Buffer.concat(rawPages), {
            raw: { width: CANVAS_SIZE, height: CANVAS_SIZE * pageCount, channels: 4, pageHeight: CANVAS_SIZE }
        })
            .webp({
                quality: ANIMATED_WEBP_QUALITY,
                alphaQuality: ANIMATED_ALPHA_QUALITY,
                effort: WEBP_ENCODE_EFFORT,
                loop: 0,
                delay: pageDelaysMs
            })
            .toFile(outPath);
    }

    await sharp(rawFirstPage, { raw: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 4 } })
        .webp({ quality: STATIC_WEBP_QUALITY, effort: WEBP_ENCODE_EFFORT })
        .toFile(staticOutPath);

    // 🛡️ طلب صريح بمراجعة PR: كل ملف < 400KB
    const outputBytes = fs.statSync(outPath).size;
    if (outputBytes > MAX_OUTPUT_BYTES) {
        throw new Error(`[${key}] الناتج ${(outputBytes / 1024).toFixed(0)}KB يتجاوز ميزانية 400KB (quality=${isAnimated ? ANIMATED_WEBP_QUALITY : STATIC_WEBP_QUALITY}, frames=${pageCount}) — خفّض MAX_ANIMATED_FRAMES/ANIMATED_WEBP_QUALITY لهذا الأصل تحديداً`);
    }
    const staticOutputBytes = fs.statSync(staticOutPath).size;
    if (staticOutputBytes > MAX_OUTPUT_BYTES) {
        throw new Error(`[${key}] النسخة الثابتة ${(staticOutputBytes / 1024).toFixed(0)}KB تتجاوز ميزانية 400KB — غير متوقَّع لملف لقطة واحدة`);
    }

    if (persistManifest) {
        writeManifestEntry(key, {
            effectiveOpeningRatio: Math.round(effectiveOpeningRatio * 10000) / 10000,
            sourcePageCount,
            sourceLoopDurationMs: isAnimated ? sourceLoopDurationMs : null,
            outputPageCount: pageCount,
            outputLoopDurationMs: isAnimated ? outputLoopDurationMs : null
        });
    }

    if (verbose) {
        const boundNote = containmentBound
            ? ` 🛡️ قيد الاحتواء فعّال (فتحة فعلية=${(effectiveOpeningRatio * 100).toFixed(1)}% لا 50%)`
            : '';
        const timingNote = isAnimated
            ? ` (متحرك، ${pageCount}/${sourcePageCount} لقطة، حلقة=${outputLoopDurationMs}ms/مصدر=${sourceLoopDurationMs}ms${hasRealDelays ? '' : ' [تأخير افتراضي — لا بيانات مصدر حقيقية]'})`
            : '';
        console.log(`[normalize-frames] ${key}: نصف قطر مُكتشَف=${radius.toFixed(1)}px، فنّ خارجي أقصى=${outerArtRadius.toFixed(1)}px (من ${info.width}×${info.height}) → تحجيم×${scale.toFixed(3)} → ${outPath} (${(outputBytes / 1024).toFixed(0)}KB)${timingNote}${boundNote}`);
    }
    return {
        key, outPath, staticOutPath, radius, scale, isAnimated, outputBytes, pageCount, sourcePageCount,
        outerArtRadius, effectiveOpeningRatio, containmentBound, sourceLoopDurationMs, outputLoopDurationMs
    };
}

// =====================================================
// ✅ اختبار ذاتي (--selftest): يبني أصولاً اصطناعية ويتحقق من سلوك الخوارزمية بحالتين
// مميَّزتين (بلا وصول شبكي لأصول Cloudinary الحقيقية):
//   • "padded-*": فتحة + فنّ محدود كلاهما بعيدان عن حافة لوحة المصدر — قيد الفتحة (50%) فعّال.
//   • "edge-to-edge-*": فنّ يمتدّ لحافة لوحة المصدر تماماً — قيد الاحتواء فعّال، فتحة أصغر من 50%.
async function buildSyntheticFrame({ size = 400, openingRadius = 120, artRadius = null, offsetX = 0, offsetY = 0, color = { r: 212, g: 175, b: 55 } }) {
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

// ✅ نسخة متحركة من نفس المصدر الاصطناعي — frameDelaysMs (مصفوفة ms/لقطة، قد تكون غير
// منتظمة عمداً — جولة 3: يثبت أن توزيع distributeDelays يصلح لتأخيرات متفاوتة لا فقط منتظمة
// كمصادر Cloudinary الحقيقية) يُضبط صريحاً على الناتج الاصطناعي عبر خيار webp({delay})
async function buildSyntheticAnimatedFrame({ size = 400, openingRadius = 120, artRadius = null, frames = 3, frameDelaysMs = null }) {
    const pageBuffers = [];
    for (let i = 0; i < frames; i++) {
        const color = i % 2 === 0 ? { r: 212, g: 175, b: 55 } : { r: 90, g: 60, b: 200 };
        const frameBuf = await buildSyntheticFrame({ size, openingRadius, artRadius, color });
        pageBuffers.push(await sharp(frameBuf).ensureAlpha().raw().toBuffer());
    }
    const delay = frameDelaysMs || new Array(frames).fill(100);
    return sharp(Buffer.concat(pageBuffers), {
        raw: { width: size, height: size * frames, channels: 4, pageHeight: size }
    }).webp({ loop: 0, delay }).toBuffer();
}

// ✅ يتحقق أن كل بكسل غير شفاف بكل لقطات ناتج ملف بعينه يقع ضمن هامش ≥MIN_EDGE_MARGIN_PX
// الحقيقي من حافة اللوحة — نفس فحص scripts/check-frames.js بالضبط (مُستورَد من هناك)
async function assertNoEdgeCropping(outPath) {
    const { checkFrameFile } = require('./check-frames');
    const result = await checkFrameFile(outPath);
    if (!result.ok) {
        throw new Error(`[selftest] ${path.basename(outPath)} ينتهك هامش الحافة: ${result.violations.join('; ')}`);
    }
}

async function selfTest() {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'normalize-frames-selftest-'));
    const cases = [
        { name: 'padded-small-opening', size: 400, openingRadius: 60, artRadius: 80, expectConstraint: 'opening' },
        { name: 'padded-large-opening', size: 300, openingRadius: 90, artRadius: 130, expectConstraint: 'opening' },
        { name: 'padded-tiny-source', size: 128, openingRadius: 24, artRadius: 32, expectConstraint: 'opening' },
        { name: 'padded-huge-source', size: 900, openingRadius: 220, artRadius: 320, expectConstraint: 'opening' },
        { name: 'edge-to-edge-source', size: 400, openingRadius: 70, artRadius: null, expectConstraint: 'containment' },
        { name: 'edge-to-edge-animated', size: 400, openingRadius: 70, artRadius: null, animated: true, frames: 3, frameDelaysMs: [120, 80, 200], expectConstraint: 'containment' }
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
            await assertNoEdgeCropping(result.staticOutPath);
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
            let timingOk = true;
            if (c.animated) {
                const outMeta = await sharp(result.outPath, { animated: true }).metadata();
                animatedOk = result.isAnimated === true && (outMeta.pages || 1) === c.frames;
                const expectedTotal = (c.frameDelaysMs || new Array(c.frames).fill(100)).reduce((a, b) => a + b, 0);
                timingOk = result.outputLoopDurationMs === expectedTotal; // ✅ مطابقة تامة (0% انحراف) — راجع distributeDelays
                const staticMeta = await sharp(result.staticOutPath, { animated: true }).metadata();
                timingOk = timingOk && (staticMeta.pages || 1) === 1; // ✅ النسخة الثابتة لقطة واحدة دوماً
            }
            pass = canvasOk && centerOk && constraintOk && animatedOk && timingOk;
            note = `فتحة_فعلية=${(result.effectiveOpeningRatio * 100).toFixed(1)}% قيد=${result.containmentBound ? 'احتواء' : 'فتحة'} (متوقَّع=${c.expectConstraint})${c.animated ? ` حلقة=${result.outputLoopDurationMs}ms` : ''}`;
        }
        allPassed = allPassed && pass;
        console.log(`[selftest] ${c.name}: ${note} → ${pass ? '✅ PASS' : '❌ FAIL'}`);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (!allPassed) {
        console.error('[selftest] فشل — راجع الحالات أعلاه');
        process.exit(1);
    }
    console.log('[selftest] كل الحالات نجحت — فتحة 50% حين يسمح الهامش، احتواء الفنّ الخارجي حين لا يسمح، ومدة حلقة الحركة مطابقة للمصدر بالضبط، بلا أي قصّ حافة بأي حالة');
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
    normalizeOne, detectOpeningRadius, detectOuterArtRadius, distributeDelays, loadFramesManifest, writeManifestEntry,
    KNOWN_FRAMES, CANVAS_SIZE, TARGET_RADIUS, TARGET_OPENING_RATIO, MIN_EDGE_MARGIN_PX, MAX_ART_RADIUS,
    MAX_ANIMATED_FRAMES, FALLBACK_FRAME_DELAY_MS
};
