// ملف: public/js/browser-gate.js
//
// 🛡️ room-ux-v2 (بند 5) — بوابة "متصفح غير مدعوم": يُحمَّل بوسم <script> خارجي عادي (لا inline
// إطلاقاً) قبل app.js مباشرة بـindex.html، فيحترم CSP الحالية (script-src 'self' موجودة فعلاً
// — لا حاجة لـnonce ولا لإضافة 'unsafe-inline' التي كانت ستُضعِف السياسة الحالية). لا يُستخدم
// أي بنية JS حديثة هنا عمداً (var لا let/const، بلا arrow functions، بلا optional chaining
// حرفياً، بلا template literals) — هذا الملف بالذات يجب أن يعمل حتى على أقدم المتصفحات التي
// يفحصها، وإلا فشل بخطأ صياغة قبل أن يصل لمنطق الفحص نفسه إطلاقاً فيكسر الصفحة للجميع.
//
// الفحص بالميزات لا برقم الإصدار (بعض المتصفحات تُبلّغ أرقاماً مضلِّلة بـUA) — نفس خمس الميزات
// الحرجة التي يعتمد عليها التطبيق فعلياً: container queries (تخطيط شبكة المقاعد)، :has()
// (تحديد حالة عناصر كثيرة بـCSS الحالي)، aspect-ratio (صناديق الصور/الإطارات)، WebSocket
// (Socket.IO — كل التفاعل الحي)، RTCPeerConnection (الصوت المباشر)، والربط الاختياري ?. (app.js
// نفسه يستخدمه بكثرة — فشل تحليله يعني توقّف التطبيق بالكامل بصمت).
(function () {
    'use strict';

    function supportsOptionalChaining() {
        try {
            // ✅ new Function تُحلِّل (parse) الصياغة فوراً عند الإنشاء — محرّك لا يفهم ?. يرمي
            // SyntaxError هنا مباشرة، بلا حتى حاجة لاستدعاء الدالة الناتجة لإثبات عدم الدعم
            // eslint-disable-next-line no-new-func
            var fn = new Function('var x = {y:1}; return x?.y;');
            return fn() === 1;
        } catch (e) {
            // 🛡️ مُتحقَّق فعلياً بهذا المشروع تحديداً: CSP الحالية (script-src بلا 'unsafe-eval'،
            // طلب صريح ألّا تُضعَف أبداً) تحظر new Function نفسها فترمي EvalError بهذي الرسالة
            // بالحرف — هذا الاستثناء تحديداً لا يعني "لا يدعم المتصفح ?." إطلاقاً، بل يعني فقط
            // أن أداة الفحص ذاتها محظورة (ستُحظَر لدى كل زائر بلا استثناء، لا حالة نادرة). افتراض
            // "غير مدعوم" هنا كان سيُظهر شاشة التحديث لكل زائر مهما كان متصفحه — نفترض الدعم
            // بدلاً من ذلك (الأغلبية الساحقة من المتصفحات الحقيقية اليوم تدعمها فعلاً) ونعتمد على
            // الفحوص الخمسة الأخرى وحدها لرصد المتصفحات القديمة فعلياً. SyntaxError حقيقي من
            // محرك قديم لا يفهم الصياغة أصلاً يبقى false كما هو متوقَّع (لا يحمل بصمة EvalError هذه)
            var msg = String((e && e.message) || '');
            var isCspEvalBlock = (e && e.name === 'EvalError') || msg.indexOf('unsafe-eval') !== -1 || msg.indexOf('Content Security Policy') !== -1;
            return !!isCspEvalBlock;
        }
    }

    function cssSupports(prop, value) {
        try {
            return !!(window.CSS && window.CSS.supports && window.CSS.supports(prop, value));
        } catch (e) {
            return false;
        }
    }

    function cssSupportsSelector(sel) {
        try {
            return !!(window.CSS && window.CSS.supports && window.CSS.supports('selector(' + sel + ')'));
        } catch (e) {
            return false;
        }
    }

    var CHECKS = {
        containerQueries: cssSupports('container-type', 'inline-size'),
        hasSelector: cssSupportsSelector(':has(*)'),
        aspectRatio: cssSupports('aspect-ratio', '1'),
        webSocket: typeof window.WebSocket !== 'undefined',
        webRTC: typeof window.RTCPeerConnection !== 'undefined',
        optionalChaining: supportsOptionalChaining()
    };

    var missing = [];
    for (var key in CHECKS) {
        if (Object.prototype.hasOwnProperty.call(CHECKS, key) && !CHECKS[key]) missing.push(key);
    }

    if (missing.length === 0) {
        // ✅ كل الميزات الحرجة مدعومة — نحمّل التطبيق الحقيقي الآن فقط، لا قبل هذا الفحص.
        // 🐛 document.write لا document.createElement+appendChild عمداً: app.js بالكامل مبني
        // على document.addEventListener('DOMContentLoaded', ...) — وسم <script> يُدرَج ديناميكياً
        // بـappendChild لا يُحمَّل بشكل متزامن (synchronous/blocking) إطلاقاً مهما ضُبطت خاصية
        // async، فيصل DOMContentLoaded ويمضي قبل أن ينتهي تحميل app.js أصلاً فيُسجَّل مستمعه
        // متأخراً جداً — الحدث لا يتكرر، فيبقى التطبيق معلّقاً بصمت بلا أي خطأ ظاهر (مُثبَت فعلياً
        // بفحص Playwright حقيقي هنا). document.write من سكربت متزامن (غير async/defer، كحال
        // هذا الملف) أثناء التحليل الأولي للمستند يُدرِج وسم <script> حقيقياً بنفس نقطة الاستدعاء
        // تماماً — يوقف التحليل حتى يكتمل تحميل/تنفيذ app.js، يطابق سلوك <script src="/js/app.js">
        // الثابت القديم بالحرف، فيبقى تسجيل مستمع DOMContentLoaded بداخله في وقته الصحيح دائماً
        document.write('<script src="/js/app.js"></script>');
        return;
    }

    // ❌ ميزة حرجة واحدة فأكثر ناقصة — شاشة التحديث بدل تحميل app.js إطلاقاً
    // 🛡️ مراجعة PR #116: 'in-app' (متصفح تطبيق مدمج — إنستغرام/واتساب/سناب شات/لاين...، أو
    // Facebook عبر FBAN/FBAV) أو WebRTC وحدها الناقصة (نفس العرض الفعلي لمتصفح تطبيق مدمج
    // غالباً حتى لو لم تُكتشَف هويته من UA — هذي المتصفحات عادة محرّك Chromium حديث كامل لكنها
    // تحجب WebRTC/getUserMedia تحديداً لأسباب أمنية خاصة بها) يحصل على شاشة مختلفة تماماً:
    // لا "حدّث متصفحك" (غير صحيح هنا — المتصفح حديث، فقط الحاوية تحجب الميزة) بل "افتحه بمتصفح
    // حقيقي" — رابط intent:// لأندرويد يفتح Chrome مباشرة، وعلى iOS زر نسخ الرابط فقط (لا توجد
    // آلية موازية لفتح متصفح محدد قسراً من رابط عادي على iOS)
    var inAppUA = isInAppBrowserUA(navigator.userAgent || '');
    var webRTCOnly = (missing.length === 1 && missing[0] === 'webRTC');
    var category = (inAppUA || webRTCOnly) ? 'in-app' : 'legacy';
    reportCompatIssue(missing, category);
    renderUnsupportedScreen(missing, category);

    function isInAppBrowserUA(ua) {
        return /FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat/.test(ua);
    }

    // ✅ يفتح الرابط الحالي داخل تطبيق Chrome مباشرة على أندرويد — صيغة intent:// موثَّقة رسمياً
    // من Google/Chromium لتجاوز متصفح التطبيق المدمج (لا بديل مكافئ على iOS، Safari/WebKit
    // هناك لا يسمح لرابط عادي بفرض فتح تطبيق متصفح محدد بالاسم)
    function androidChromeIntentUrl() {
        var withoutScheme = window.location.href.replace(/^https?:\/\//i, '');
        var scheme = (window.location.protocol || 'https:').replace(':', '');
        return 'intent://' + withoutScheme + '#Intent;scheme=' + scheme + ';package=com.android.chrome;end';
    }

    // ✅ تعرّف تقريبي لعرض "المتصفح: Chrome 96" فقط — لا يُستخدم أبداً لاتخاذ قرار الدعم نفسه
    // (ذاك بالميزات أعلاه حصراً)؛ تحليل بسيط كافٍ، لا حاجة لمكتبة كاملة لهذا الغرض التشخيصي
    function detectBrowser() {
        var ua = navigator.userAgent || '';
        var patterns = [
            { family: 'Edge', re: /Edg\/([\d.]+)/ },
            { family: 'Samsung Internet', re: /SamsungBrowser\/([\d.]+)/ },
            { family: 'Chrome', re: /Chrome\/([\d.]+)/ },
            { family: 'Firefox', re: /Firefox\/([\d.]+)/ },
            { family: 'Safari', re: /Version\/([\d.]+).*Safari/ }
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = ua.match(patterns[i].re);
            if (m) return { family: patterns[i].family, version: m[1].split('.')[0] };
        }
        return { family: 'unknown', version: '' };
    }

    function requiredVersionFor(family) {
        var reqs = { 'Chrome': '105', 'Edge': '105', 'Safari': '16', 'Firefox': '121', 'Samsung Internet': '20' };
        return reqs[family] || null;
    }

    function storeLink() {
        var ua = navigator.userAgent || '';
        if (/Android/i.test(ua)) return 'https://play.google.com/store/apps/details?id=com.android.chrome';
        if (/iPhone|iPad|iPod/i.test(ua)) return 'https://apps.apple.com/app/google-chrome/id535886823';
        return 'https://www.google.com/chrome/';
    }

    function reportCompatIssue(missingFeatures, category) {
        try {
            var b = detectBrowser();
            // ✅ XMLHttpRequest لا fetch — بعض المتصفحات القديمة جداً التي نفحص دعمها هنا بالذات
            // قد لا تدعم fetch هي الأخرى، بينما XHR مدعوم عملياً بكل متصفح موجود منذ عقود
            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/client-compat', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify({ uaFamily: b.family, uaVersion: b.version, missingFeatures: missingFeatures, category: category }));
        } catch (e) { /* فشل التقرير لا يجب أن يمنع عرض شاشة التحديث نفسها */ }
    }

    function el(tag, className, text) {
        var e = document.createElement(tag);
        if (className) e.className = className;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function makeCopyLinkBtn() {
        var btn2 = el('button', 'unsup-gate-btn2', 'انسخ الرابط وافتحه في متصفح آخر');
        btn2.type = 'button';
        btn2.addEventListener('click', function () {
            var url = window.location.href;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url);
                    btn2.textContent = 'تم نسخ الرابط ✓';
                    setTimeout(function () { btn2.textContent = 'انسخ الرابط وافتحه في متصفح آخر'; }, 2000);
                } else {
                    window.prompt('انسخ هذا الرابط:', url);
                }
            } catch (e) {
                window.prompt('انسخ هذا الرابط:', url);
            }
        });
        return btn2;
    }

    function detRow(label, value, cls) {
        var row = el('div', 'unsup-gate-det-row');
        row.appendChild(el('span', null, label));
        row.appendChild(el('b', cls === 'bad' ? 'unsup-gate-bad' : 'unsup-gate-good', value));
        return row;
    }

    function renderUnsupportedScreen(missingFeatures, category) {
        var loading = document.getElementById('loading-screen');
        if (loading) loading.style.display = 'none';
        var appContainer = document.getElementById('app-container');
        if (appContainer) appContainer.style.display = 'none';

        var isInApp = category === 'in-app';
        var b = detectBrowser();
        var required = requiredVersionFor(b.family);

        var wrap = el('div', 'unsup-gate');
        var ico = el('div', 'unsup-gate-ico', isInApp ? '🔗' : '🌐');
        var h3 = el('h3', null, isInApp ? 'افتح الرابط في متصفح حقيقي' : 'متصفحك يحتاج تحديثاً');
        var p = el('p', null, isInApp
            ? 'افتح الرابط في Chrome أو Safari لتعمل كل الميزات — متصفح التطبيق المدمج (مثل إنستغرام أو واتساب) لا يدعم الصوت المباشر وميزات أخرى.'
            : 'الموقع يستخدم ميزات حديثة لا يدعمها هذا المتصفح، لذلك قد تظهر الصفحة مكدّسة أو ناقصة. التحديث مجاني ويأخذ دقيقة.');

        var det = el('div', 'unsup-gate-det');
        det.appendChild(detRow('المتصفح', (b.family === 'unknown' ? 'غير معروف' : b.family) + (b.version ? ' ' + b.version : ''), null));
        // ✅ "المطلوب" (حد أدنى إصدار) لا معنى له بحالة in-app — المتصفح غالباً حديث فعلاً،
        // المشكلة حجب الحاوية لميزة بعينها لا قِدَم المحرّك نفسه
        if (!isInApp) {
            det.appendChild(detRow('المطلوب', required ? (b.family + ' ' + required + '+') : 'Chrome/Edge 105+, Safari 16+, Firefox 121+, Samsung Internet 20+', null));
        }
        var FEATURE_LABELS = {
            containerQueries: 'تخطيط المقاعد (container queries)',
            hasSelector: 'المحددات الحديثة (:has)',
            aspectRatio: 'نِسَب الصناديق (aspect-ratio)',
            webSocket: 'الاتصال الحي (WebSocket)',
            webRTC: 'الصوت المباشر (WebRTC)',
            optionalChaining: 'صياغة الربط الاختياري (?.)'
        };
        for (var i = 0; i < missingFeatures.length; i++) {
            det.appendChild(detRow(FEATURE_LABELS[missingFeatures[i]] || missingFeatures[i], 'غير مدعوم', 'bad'));
        }

        wrap.appendChild(ico);
        wrap.appendChild(h3);
        wrap.appendChild(p);
        wrap.appendChild(det);

        if (isInApp) {
            var isAndroid = /Android/i.test(navigator.userAgent || '');
            if (isAndroid) {
                var openBtn = el('button', 'unsup-gate-btn', 'فتح في المتصفح');
                openBtn.type = 'button';
                openBtn.addEventListener('click', function () { window.location.href = androidChromeIntentUrl(); });
                wrap.appendChild(openBtn);
            }
            // ✅ iOS: لا آلية فتح متصفح محدد قسراً من رابط عادي — زر نسخ الرابط فقط (طلب صريح
            // بمراجعة PR #116)، يبقى متاحاً أيضاً كاحتياط ثانٍ على أندرويد لو تعذّر intent://
            wrap.appendChild(makeCopyLinkBtn());
        } else {
            var btn = el('button', 'unsup-gate-btn', 'تحديث ' + (b.family === 'unknown' ? 'المتصفح' : b.family) + ' من المتجر');
            btn.type = 'button';
            btn.addEventListener('click', function () { window.location.href = storeLink(); });
            wrap.appendChild(btn);
            wrap.appendChild(makeCopyLinkBtn());
        }

        var small = el('small', null, isInApp
            ? 'بعد الفتح بمتصفح حقيقي لن تحتاج تسجيل الدخول من جديد.'
            : 'بعد التحديث افتح الموقع مجدداً. لن تحتاج تسجيل الدخول من جديد.');
        wrap.appendChild(small);
        document.body.appendChild(wrap);
    }
})();
