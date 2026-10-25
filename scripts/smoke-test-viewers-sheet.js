#!/usr/bin/env node
'use strict';

// 🛡️ دليل بصري حقيقي للنافذة الجديدة "المشاهدون والمساهمون" (room-ux-v2، بند 2) قبل الانتقال
// للبنود التالية — سيرفر+Mongo حقيقيين (نفس bootstrap scripts/screenshot-gift-visibility.js
// المجاور)، عميل Chromium حقيقي واحد يكفي هنا (لا حاجة لعميل ثانٍ: المضيف نفسه، بدخوله الغرفة،
// يُسجَّل تلقائياً ضمن قناة room-chat فيظهر بتبويب "الحاضرون"؛ تبويب "المساهمون" يُغذّى من
// GiftLog.room مزروعة مباشرة بقاعدة البيانات هنا بلا حاجة لإرسال هدية حقيقية فعلياً).
// يتحقّق: فتح النافذة بلا أخطاء console، تبويب المساهمون (منصّة + صف "أنا" المثبّت)، التبديل
// لتبويب الحاضرين (قسم "على المقاعد" يحوي المضيف بشارة "المضيف")، البحث، ثم 2 لقطتي شاشة.

const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const ROOT = path.join(__dirname, '..');
const JWT_SECRET = 'smoke-test-secret-do-not-use-in-prod';
const PORT = 5962;
const OUT_DIR = process.env.SCREENSHOT_OUT_DIR || path.join(ROOT, 'docs/verification/room-ux-v2');

async function waitForServerReady(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try { await fetch(url); return true; } catch { await new Promise(r => setTimeout(r, 200)); }
    }
    throw new Error('السيرفر لم يستجب بالوقت المحدد');
}

async function main() {
    let replSet = null, serverProcess = null, browser = null;
    const consoleErrors = [];
    async function cleanup() {
        try { if (browser) await browser.close(); } catch (_) {}
        try { if (mongoose.connection.readyState !== 0) await mongoose.disconnect(); } catch (_) {}
        try { if (serverProcess) serverProcess.kill('SIGKILL'); } catch (_) {}
        try { if (replSet) await replSet.stop(); } catch (_) {}
    }
    const watchdog = setTimeout(async () => {
        console.error('💥 انتهت مهلة الأمان العامة (90s)');
        await cleanup();
        process.exit(1);
    }, 90000);

    try {
        console.log('🚀 إقلاع Mongo + السيرفر الحقيقيين...');
        const { MongoMemoryReplSet } = require('mongodb-memory-server');
        replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const mongoUri = replSet.getUri();

        serverProcess = spawn(process.execPath, [path.join(ROOT, 'server/server.js')], {
            cwd: ROOT,
            env: { ...process.env, MONGODB_URI: mongoUri, JWT_SECRET, PORT: String(PORT), NODE_ENV: 'test', ALLOWED_ORIGINS: '' },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        serverProcess.stderr.on('data', (chunk) => process.stderr.write(`[server:err] ${chunk}`));

        await waitForServerReady(`http://127.0.0.1:${PORT}/api/gifts/shop`, 30000);
        console.log('✅ السيرفر يستجب فعلياً');

        await mongoose.connect(mongoUri);
        const User = require(path.join(ROOT, 'server/models/User'));
        const VoiceRoom = require(path.join(ROOT, 'server/models/VoiceRoom'));
        const Gift = require(path.join(ROOT, 'server/models/Gift'));
        const GiftLog = require(path.join(ROOT, 'server/models/GiftLog'));
        const FanClubMembership = require(path.join(ROOT, 'server/models/FanClubMembership'));
        const ClientCompatLog = require(path.join(ROOT, 'server/models/ClientCompatLog'));

        let gift = null;
        for (let i = 0; i < 100 && !gift; i++) {
            gift = await Gift.findOne({});
            if (!gift) await new Promise(r => setTimeout(r, 100));
        }
        if (!gift) throw new Error('تعذّر العثور على أي هدية بالكتالوج المزروع');

        const suffix = Math.random().toString(36).slice(2, 8);
        const host = await User.create({
            customId: `SM${suffix}H`, username: `smoke_host_${suffix}`, email: `smoke_host_${suffix}@smoketest.local`,
            password: 'SmokeTest123!', gender: 'male', birthDate: new Date('1998-01-01'), coins: 1000, level: 5
        });
        const contributor = await User.create({
            customId: `SM${suffix}C`, username: `smoke_contrib_${suffix}`, email: `smoke_contrib_${suffix}@smoketest.local`,
            password: 'SmokeTest123!', gender: 'female', birthDate: new Date('1999-01-01'), coins: 0, level: 9
        });

        const room = await VoiceRoom.createRoom({
            hostId: host._id, name: 'غرفة فحص المشاهدين', description: '', coverImage: null,
            category: 'chat', seatCount: 9, isPrivate: false
        });

        // ✅ بيانات مساهمين حقيقية مباشرة بقاعدة البيانات — يكفي لاختبار التجميع/المنصّة/الكاش
        // بلا حاجة لإرسال هدية فعلية عبر الواجهة (ذاك مغطّى فعلاً بـscreenshot-gift-visibility.js)
        await GiftLog.create([
            { sender: contributor._id, receiver: host._id, gift: gift._id, giftName: gift.name, giftImage: gift.imageUrl, quantity: 10, unitPrice: gift.price, totalPrice: gift.price * 10, room: room._id },
            { sender: host._id, receiver: contributor._id, gift: gift._id, giftName: gift.name, giftImage: gift.imageUrl, quantity: 3, unitPrice: gift.price, totalPrice: gift.price * 3, room: room._id }
        ]);
        await FanClubMembership.create({ owner: host._id, member: contributor._id, points: 500 });
        // ✅ يُجلِس المساهم على المقعد 2 أيضاً — بلا هذا، صف المستلمين بشيت الهدايا (بند 3) يبقى
        // فاضياً بهذا الفحص (المضيف نفسه، الناظر هنا، يُستبعَد من قائمة "من أهدي؟" دوماً)
        await VoiceRoom.updateOne({ _id: room._id, 'seats.seatNumber': 2 }, { $set: { 'seats.$.user': contributor._id } });

        const tokenHost = jwt.sign({ id: host._id.toString() }, JWT_SECRET);

        console.log('🌐 إقلاع Chromium حقيقي...');
        const { chromium } = require('playwright');
        browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

        console.log('🚫 بوابة "متصفح غير مدعوم" (بند 5) — محاكاة فشل الفحص (CSS.supports مُزيَّفة + RTCPeerConnection محذوفة) قبل أي سكربت...');
        const gatePage = await browser.newPage({ viewport: { width: 375, height: 812 } });
        const gateReqUrls = [];
        gatePage.on('request', (req) => gateReqUrls.push(req.url()));
        await gatePage.addInitScript(() => {
            window.CSS.supports = function () { return false; };
            delete window.RTCPeerConnection;
        });
        await gatePage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
        await gatePage.waitForTimeout(300);
        const unsupGateVisible = await gatePage.locator('.unsup-gate').isVisible().catch(() => false);
        const appJsRequested = gateReqUrls.some(u => u.endsWith('/js/app.js'));
        const compatReported = await ClientCompatLog.countDocuments();
        console.log(`   شاشة "متصفح غير مدعوم" ظهرت: ${unsupGateVisible ? '✅' : '❌'} | app.js لم يُطلَب إطلاقاً: ${appJsRequested ? '❌ (طُلِب رغم الفشل!)' : '✅'} | عدّاد /api/client-compat سُجِّل: ${compatReported > 0 ? '✅' : '❌'}`);
        await require('fs').promises.mkdir(OUT_DIR, { recursive: true });
        await gatePage.screenshot({ path: path.join(OUT_DIR, '5-unsupported-browser-gate.png') });
        console.log(`📸 حُفِظت: ${path.join(OUT_DIR, '5-unsupported-browser-gate.png')}`);
        await gatePage.close();

        console.log('🚫 بوابة "متصفح غير مدعوم" — مراجعة PR #116: UA متصفح تطبيق مدمج (إنستغرام أندرويد)...');
        const inAppAndroidPage = await browser.newPage({
            viewport: { width: 375, height: 812 },
            userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 302.0.0.23.114 Android'
        });
        await inAppAndroidPage.addInitScript(() => { delete window.RTCPeerConnection; });
        await inAppAndroidPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
        await inAppAndroidPage.waitForTimeout(300);
        const inAppGateVisible = await inAppAndroidPage.locator('.unsup-gate').isVisible().catch(() => false);
        const inAppOpenBtnVisible = await inAppAndroidPage.locator('.unsup-gate-btn').filter({ hasText: 'فتح في المتصفح' }).isVisible().catch(() => false);
        const inAppNoUpdateWording = !(await inAppAndroidPage.locator('.unsup-gate-btn').filter({ hasText: 'تحديث' }).count());
        console.log(`   شاشة بديلة ظهرت: ${inAppGateVisible ? '✅' : '❌'} | زر "فتح في المتصفح" (أندرويد): ${inAppOpenBtnVisible ? '✅' : '❌'} | لا نص "تحديث": ${inAppNoUpdateWording ? '✅' : '❌'}`);
        await inAppAndroidPage.close();

        console.log('🚫 بوابة "متصفح غير مدعوم" — مراجعة PR #116: WebRTC وحدها الناقصة (لا UA تطبيق مدمج)...');
        const webrtcOnlyPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
        await webrtcOnlyPage.addInitScript(() => { delete window.RTCPeerConnection; });
        await webrtcOnlyPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
        await webrtcOnlyPage.waitForTimeout(300);
        const webrtcOnlyAltScreen = !(await webrtcOnlyPage.locator('.unsup-gate-btn').filter({ hasText: 'تحديث' }).count());
        console.log(`   WebRTC فقط ناقصة ⇒ نفس الشاشة البديلة (لا "تحديث"): ${webrtcOnlyAltScreen ? '✅' : '❌'}`);
        await webrtcOnlyPage.close();

        console.log('🚫 بوابة "متصفح غير مدعوم" — مراجعة PR #116: UA متصفح تطبيق مدمج على iOS (زر نسخ الرابط فقط)...');
        const inAppIosPage = await browser.newPage({
            viewport: { width: 375, height: 812 },
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Instagram 302.0.0.23.114 (iPhone14,5; iOS 17_0; en_US; en-US; scale=3.00; 1170x2532; 471727663)'
        });
        await inAppIosPage.addInitScript(() => { delete window.RTCPeerConnection; });
        await inAppIosPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
        await inAppIosPage.waitForTimeout(300);
        const iosNoOpenBtn = !(await inAppIosPage.locator('.unsup-gate-btn').filter({ hasText: 'فتح في المتصفح' }).count());
        const iosHasCopyBtn = await inAppIosPage.locator('.unsup-gate-btn2').isVisible().catch(() => false);
        console.log(`   iOS: لا زر "فتح في المتصفح": ${iosNoOpenBtn ? '✅' : '❌'} | زر نسخ الرابط ظاهر: ${iosHasCopyBtn ? '✅' : '❌'}`);
        await inAppIosPage.close();

        const compatCategoryCount = await ClientCompatLog.countDocuments({ category: 'in-app' });
        console.log(`   سجلّات ClientCompatLog بفئة "in-app": ${compatCategoryCount} — ${compatCategoryCount >= 3 ? '✅' : '❌'}`);

        const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
        page.on('pageerror', (err) => { consoleErrors.push(`[pageerror] ${err.message}`); });
        page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[console:error] ${msg.text()}`); });
        page.on('requestfailed', (req) => { consoleErrors.push(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText}`); });
        // ✅ res.cloudinary.com فعلياً (f_auto/q_auto الحقيقية) — بلا proxy على Chromium نفسه
        // (نفس علّة bypass:127.0.0.1 بالوثيقة المجاورة)، fetch بـNode يحترم HTTPS_PROXY صحيحاً
        await page.route(/^https:\/\/res\.cloudinary\.com\//, async (route) => {
            try {
                const resp = await fetch(route.request().url());
                const buf = Buffer.from(await resp.arrayBuffer());
                await route.fulfill({ status: resp.status, contentType: resp.headers.get('content-type') || 'image/png', body: buf });
            } catch (_) { await route.abort(); }
        });
        await page.route(/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) => route.abort());
        const socketIoClientPath = path.join(ROOT, 'node_modules/socket.io/client-dist/socket.io.min.js');
        await page.route('https://cdn.socket.io/**', (route) => route.fulfill({ path: socketIoClientPath, contentType: 'application/javascript' }));

        await page.addInitScript(([tok, u]) => {
            localStorage.setItem('token', tok);
            localStorage.setItem('user', JSON.stringify(u));
        }, [tokenHost, { _id: host._id.toString(), username: host.username, coins: 1000, balance: 0, level: 5, experience: 0, isAgent: false, activeFrameClass: null, status: '', friends: [], friendRequestsReceived: [] }]);
        // 🛡️ مراجعة PR #116 (بند 3) — getUserMedia مُزيَّفة لا تُحسَم تلقائياً أبداً (وعد مُعلَّق
        // يُضاف resolver الرفض الخاص به لمصفوفة window.__micRejectResolvers)؛ الاختبار يستدعي
        // الرفض يدوياً باللحظة المطلوبة تحديداً (أثناء الجولة لاختبار الطابور، ثم أثناء نافذة
        // مفتوحة لاختبار إعادة التموضع) — تحكّم كامل بالتوقيت بدل مهلة مؤقَّتة هشّة
        await page.addInitScript(() => {
            window.__micRejectResolvers = [];
            if (navigator.mediaDevices) {
                navigator.mediaDevices.getUserMedia = function () {
                    return new Promise(function (resolve, reject) {
                        window.__micRejectResolvers.push(reject);
                    });
                };
            }
        });

        await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
        await page.locator('#still-live-return-btn').click({ timeout: 20000 });
        await page.waitForTimeout(800);
        console.log('✅ المضيف دخل غرفته فعلياً');

        console.log('👋 الجولة التعريفية الأولى (بند 4) — يجب أن تظهر تلقائياً (حساب جديد بلا onboarding.roomTourSeenAt)...');
        await page.locator('#room-tour-welcome').waitFor({ state: 'visible', timeout: 5000 });
        await page.locator('#rtour-start-btn').click({ timeout: 5000 });
        await page.locator('#room-tour-overlay .rtour-tip').waitFor({ state: 'visible', timeout: 5000 });
        const tourStepVisible = await page.locator('.rtour-hole').isVisible().catch(() => false);
        console.log(`   بطاقة الترحيب ظهرت تلقائياً ثم الخطوة الأولى: ${tourStepVisible ? '✅' : '❌'}`);

        // ✅ مراجعة PR #116 (بند 2): الفتحة يجب أن تطابق .voice-seat-av-wrap (الصورة الدائرية
        // فقط) بالضبط لا .voice-seat الحاوي الواسع (يشمل الاسم/عداد الدعم أسفلها أيضاً)
        const holeBox = await page.locator('.rtour-hole').boundingBox();
        const avatarBox = await page.locator('.voice-seat.host-seat .voice-seat-av-wrap').boundingBox();
        const seatBox = await page.locator('.voice-seat.host-seat').boundingBox();
        const holeMatchesAvatarNotSeat = holeBox && avatarBox && seatBox
            && Math.abs(holeBox.width - avatarBox.width) <= 20
            && (holeBox.width < seatBox.width - 10);
        console.log(`   فتحة الجولة = صورة المضيف (${holeBox ? Math.round(holeBox.width) : '?'}px) لا خلية المقعد كاملة (${seatBox ? Math.round(seatBox.width) : '?'}px): ${holeMatchesAvatarNotSeat ? '✅' : '❌'}`);

        // ✅ مراجعة PR #116 (بند 3): توست المايكروفون يُطابَر أثناء الجولة — لا يظهر فوقها إطلاقاً
        await page.evaluate(() => { const r = window.__micRejectResolvers.pop(); if (r) r(new DOMException('Permission denied', 'NotAllowedError')); });
        await page.waitForTimeout(300);
        const toastHiddenDuringTour = (await page.locator('.bottom-toast').count()) === 0;
        console.log(`   توست "تعذّر الوصول للمايكروفون" مُطابَر أثناء الجولة (لا يظهر فوقها): ${toastHiddenDuringTour ? '✅' : '❌'}`);

        await require('fs').promises.mkdir(OUT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(OUT_DIR, '4-room-tour-step.png') });
        console.log(`📸 حُفِظت: ${path.join(OUT_DIR, '4-room-tour-step.png')}`);
        // ✅ يُنهي الجولة بتخطّيها (لا حاجة لاستعراض كل الخطوات الخمس هنا) — يُثبِّتها كمشاهَدة
        // محلياً وبالسيرفر معاً، فلا تتداخل مع فحوص الشيتات التالية (z-index 400 فوق أي نافذة أخرى)
        await page.locator('#rtour-skip-btn').click({ timeout: 5000 });
        await page.locator('#room-tour-overlay').waitFor({ state: 'detached', timeout: 5000 });
        const dockLabelsVisible = await page.locator('.room-dock-label').first().isVisible().catch(() => false);
        console.log(`   تسميات الشريط السفلي بعد انتهاء الجولة: ${dockLabelsVisible ? '✅ ظاهرة' : '❌ غير ظاهرة'}`);

        // ✅ الآن يُفترض أن يظهر فوراً (الطابور فُرِّغ عند إغلاق الجولة)
        const toastShownAfterTour = await page.locator('.bottom-toast').first().isVisible().catch(() => false);
        console.log(`   توست المايكروفون ظهر فوراً بعد إغلاق الجولة (الطابور فُرِّغ): ${toastShownAfterTour ? '✅' : '❌'}`);
        await page.waitForTimeout(4200); // ✅ انتظار اختفاء التوست تلقائياً (3.6s + حركة الإخفاء) قبل المتابعة

        console.log('🔍 فتح نافذة المشاهدين (الضغط على شريط العدّاد أعلى الغرفة)...');
        await page.locator('#room-viewer-count-btn').click({ timeout: 20000 });
        await page.locator('#room-viewers-sheet').waitFor({ state: 'visible', timeout: 10000 });
        await page.waitForTimeout(600); // ✅ انتظار نداء REST الأول (contributors) يكتمل فعلياً

        const podiumVisible = await page.locator('.rv-podium').isVisible().catch(() => false);
        const mineRowVisible = await page.locator('.rv-mine .rv-item').isVisible().catch(() => false);
        console.log(`   منصّة أول 3: ${podiumVisible ? '✅ ظاهرة' : '❌ غير ظاهرة'} | صف "أنا" المثبّت: ${mineRowVisible ? '✅ ظاهر' : '❌ غير ظاهر'}`);

        // ✅ مراجعة PR #116 (بند 1): لا بطاقتَي "كوينز الجلسة"/"ترتيب الغرفة" داخل النافذة الجديدة
        const statCardsGone = (await page.locator('#room-viewers-sheet .room-info-stat-box').count()) === 0;
        console.log(`   بطاقتا الإحصاء القديمتان أُزيلتا من نافذة المشاهدين: ${statCardsGone ? '✅' : '❌'}`);

        // ✅ مراجعة PR #116 (بند 3): إثبات أن منطق كشف "نافذة مفتوحة" (topMostOpenSheetEl —
        // نفس نمط اكتشاف Escape) يطابق فعلياً #room-viewers-sheet الحقيقية بالـDOM الآن
        const sheetDetectedAsOpen = await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('[id$="-modal"], [id$="-sheet"]'));
            return els.some((el) => el.id === 'room-viewers-sheet' && el.getClientRects().length > 0);
        });
        console.log(`   نافذة المشاهدين تُكتشَف كـ"نافذة مفتوحة" (أساس إعادة تموضع التوست): ${sheetDetectedAsOpen ? '✅' : '❌'}`);

        await require('fs').promises.mkdir(OUT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(OUT_DIR, '1-viewers-sheet-contributors.png') });
        console.log(`📸 حُفِظت: ${path.join(OUT_DIR, '1-viewers-sheet-contributors.png')}`);

        console.log('🔁 التبديل لتبويب "الحاضرون"...');
        await page.locator('[data-rv-tab="attendees"]').click({ timeout: 10000 });
        await page.waitForTimeout(600);
        const seatedSectionVisible = await page.locator('.rv-sec').first().isVisible().catch(() => false);
        const hostTagVisible = await page.locator('.rv-tag-host').first().isVisible().catch(() => false);
        console.log(`   قسم "على المقاعد": ${seatedSectionVisible ? '✅ ظاهر' : '❌ غير ظاهر'} | شارة "المضيف": ${hostTagVisible ? '✅ ظاهرة' : '❌ غير ظاهرة'}`);
        await page.screenshot({ path: path.join(OUT_DIR, '2-viewers-sheet-attendees.png') });
        console.log(`📸 حُفِظت: ${path.join(OUT_DIR, '2-viewers-sheet-attendees.png')}`);

        console.log('🔍 اختبار حقل البحث...');
        await page.locator('#rv-search-input').fill('smoke_host');
        await page.waitForTimeout(500);
        const filteredVisible = await page.locator('.rv-item').first().isVisible().catch(() => false);
        console.log(`   نتيجة بحث مطابقة ظاهرة: ${filteredVisible ? '✅' : '❌'}`);

        console.log('🎁 فتح شيت الهدايا (بند 3 — صف المستلمين المُعاد تصميمه)...');
        await page.locator('#room-viewers-sheet').evaluate(el => el.remove()).catch(() => {});
        await page.locator('#room-gift-icon-btn').waitFor({ state: 'attached', timeout: 20000 });
        await page.evaluate(() => document.getElementById('room-gift-icon-btn').click());
        await page.locator('.gsheet-rc').first().waitFor({ state: 'visible', timeout: 10000 });
        await page.waitForTimeout(400);
        // ⚠️ المضيف (الناظر هنا) لا يمكنه إهداء نفسه، فلن يظهر أبداً ضمن قائمة مستلمي غرفته
        // الخاصة — شارة 👑 (نفس شرط hostId === u.id تماماً، مُتحقَّق بالكود) معلوماتية فقط هنا،
        // لا تدخل بمعيار النجاح/الفشل؛ شارة رقم المقعد (المساهم الجالس بالمقعد 2) تثبت المسار فعلياً
        const recipCrownVisible = await page.locator('.gsheet-rc-crown').first().isVisible().catch(() => false);
        const recipSeatBadgeVisible = await page.locator('.gsheet-rc-sn:not(.gsheet-rc-crown)').first().isVisible().catch(() => false);
        const recipNameVisible = await page.locator('.gsheet-rc-name').first().isVisible().catch(() => false);
        console.log(`   شارة 👑 المضيف (معلوماتية فقط — غير متوقَّعة هنا): ${recipCrownVisible ? '✅' : '➖'} | شارة رقم مقعد: ${recipSeatBadgeVisible ? '✅' : '❌'} | اسم تحت الصورة: ${recipNameVisible ? '✅' : '❌'}`);
        await page.screenshot({ path: path.join(OUT_DIR, '3-gift-sheet-recipients-row.png') });
        console.log(`📸 حُفِظت: ${path.join(OUT_DIR, '3-gift-sheet-recipients-row.png')}`);

        console.log('🛠️ لوحة التحكم — إجماليات توافق المتصفحات (بند 5)...');
        const adminUser = await User.create({
            customId: `SM${suffix}A`, username: `smoke_admin_${suffix}`, email: `smoke_admin_${suffix}@smoketest.local`,
            password: 'SmokeTest123!', gender: 'male', birthDate: new Date('1990-01-01'), coins: 0, isAdmin: true
        });
        const adminToken = jwt.sign({ id: adminUser._id.toString() }, JWT_SECRET);
        const compatStatsRes = await fetch(`http://127.0.0.1:${PORT}/api/admin/client-compat`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
        const compatStatsBody = await compatStatsRes.json();
        const adminStatsOk = compatStatsRes.ok && compatStatsBody.success && compatStatsBody.total > 0
            && Array.isArray(compatStatsBody.byBrowser) && compatStatsBody.byBrowser.length > 0
            && Array.isArray(compatStatsBody.byFeature) && compatStatsBody.byFeature.length > 0;
        console.log(`   GET /api/admin/client-compat: total=${compatStatsBody.total}, byBrowser[0]=${JSON.stringify(compatStatsBody.byBrowser && compatStatsBody.byBrowser[0])} — ${adminStatsOk ? '✅' : '❌'}`);

        clearTimeout(watchdog);
        if (consoleErrors.length) {
            console.error('\n💥 أخطاء console/pageerror ظهرت خلال الفحص:');
            consoleErrors.forEach(e => console.error('   ' + e));
            process.exitCode = 1;
        } else if (!podiumVisible || !mineRowVisible || !seatedSectionVisible || !hostTagVisible || !filteredVisible || !recipSeatBadgeVisible || !recipNameVisible || !tourStepVisible || !dockLabelsVisible || !unsupGateVisible || appJsRequested || !compatReported || !adminStatsOk
            || !holeMatchesAvatarNotSeat || !toastHiddenDuringTour || !toastShownAfterTour || !statCardsGone || !sheetDetectedAsOpen
            || !inAppGateVisible || !inAppOpenBtnVisible || !inAppNoUpdateWording || !webrtcOnlyAltScreen || !iosNoOpenBtn || !iosHasCopyBtn || compatCategoryCount < 3) {
            console.error('\n💥 فحص بصري فشل (عنصر متوقَّع غير ظاهر) — راجع السطور أعلاه');
            process.exitCode = 1;
        } else {
            console.log('\n✅ كل الفحوص نجحت بلا أي خطأ console — نافذة المشاهدين الجديدة تعمل فعلياً');
        }
    } catch (err) {
        console.error('💥 فشل الفحص:', err);
        if (consoleErrors.length) {
            console.error('--- consoleErrors جُمعت قبل الفشل ---');
            consoleErrors.forEach(e => console.error('   ' + e));
        }
        process.exitCode = 1;
    } finally {
        clearTimeout(watchdog);
        await cleanup();
    }
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((err) => {
    console.error('💥 خطأ غير متوقَّع خارج main():', err);
    process.exit(1);
});
