#!/usr/bin/env node
'use strict';

// 🛡️ تحقّق أداء حقيقي (مراجعة PR gifts-visibility-frames-perf — البند 3): متصفح Chromium حقيقي
// (Playwright) يُشغِّل الواجهة الفعلية (public/js/app.js)، يدخل الغرفة الرسمية، يفتح شيت
// الهدايا الحقيقي، يرسل أول هدية (تبدأ جلسة الكومبو الحيّة startGiftComboSession)، ثم يُمسك
// زر الكومبو العائم (#gfx-cbtn) بإصبع/مؤشر حقيقي (page.mouse) — نفس آلية التسارع الداخلية
// الحقيقية بالملف (holdLoop: من 5 إلى 20 ضغطة/ث خلال ثانيتين، راجع startHold بـapp.js) تتولى
// بقية الضغطات تلقائياً، لا محاكاة/stub لأي طبقة. يُطبَّق إبطاء CPU×4 حقيقي عبر CDP
// (Emulation.setCPUThrottlingRate) طوال الإمساك، وPerformanceObserver(type:'longtask') حقيقي
// يُسجِّل أي مهمة بالخيط الرئيسي ≥50ms فعلياً حدثت (الهدف الصريح بمراجعة PR: صفر منها).
//
// سيرفر حقيقي (server/server.js، عملية Node منفصلة) + Mongo replica-set حقيقي
// (mongodb-memory-server، مطلوب للمعاملات) — نفس أسلوب bootstrap بالضبط كـload-gift-combo.js
// المجاور، بمستخدم مُرسِل واحد فقط (المتصفح) ومستلم واحد يُجلَس مباشرة بمقعد الغرفة الرسمية
// عبر Mongoose مباشرة (لا حاجة لمتصفح/عميل Socket.IO ثانٍ — الهدف هنا أداء المُرسِل فقط).

const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const ROOT = path.join(__dirname, '..');
const JWT_SECRET = 'perf-test-secret-do-not-use-in-prod';
const PORT = 5960;
const CPU_THROTTLE_RATE = 4;
const HOLD_MS = 8000; // ✅ >2ث لتجاوز نافذة التسارع الداخلية (5→20 ضغطة/ث) + عدّة ثوانٍ فعلية تحت الإبطاء
const INITIAL_COINS = 5_000_000;

async function waitForServerReady(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try { await fetch(url); return true; } catch { await new Promise(r => setTimeout(r, 200)); }
    }
    throw new Error('السيرفر لم يستجب بالوقت المحدد');
}

async function makeTestUser(User, usernameBase, coins) {
    const suffix = Math.random().toString(36).slice(2, 8);
    return User.create({
        customId: `PF${suffix}`,
        username: `${usernameBase}_${suffix}`,
        email: `${usernameBase}_${suffix}@perftest.local`,
        password: 'PerfTest123!',
        gender: 'male',
        birthDate: new Date('2000-01-01'),
        coins
    });
}

function percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
}

async function main() {
    let replSet = null, serverProcess = null, browser = null;
    // ✅ تُستخدَم من كل مسار خروج (نجاح/فشل/شبكة الأمان) — لا تترك خادماً/mongod يتيماً يحجز
    // المنفذ الثابت لأي تشغيل تالٍ لهذا السكربت، بصرف النظر عن كيفية انتهاء العملية
    async function cleanup() {
        try { if (browser) await browser.close(); } catch (_) {}
        try { if (mongoose.connection.readyState !== 0) await mongoose.disconnect(); } catch (_) {}
        try { if (serverProcess) serverProcess.kill('SIGKILL'); } catch (_) {}
        try { if (replSet) await replSet.stop(); } catch (_) {}
    }

    // 🛡️ شبكة أمان: أي تعليق غير متوقّع (مثلاً انتظار عنصر DOM لن يظهر أبداً بسبب تعارض منفذ
    // مع عملية سابقة لم تُنظَّف) يُسقِط العملية بكود خطأ صريح بدل تعليقها للأبد بالخلفية —
    // process.exit() يقطع أي finally لاحق بالدالة الحالية فوراً، فالتنظيف هنا مطلوب صراحة
    // قبل الخروج، لا الاعتماد على finally الذي لن يُنفَّذ بعد process.exit()
    const watchdog = setTimeout(async () => {
        console.error('💥 انتهت مهلة الأمان العامة (120s) — تعليق غير متوقّع، إسقاط العملية');
        await cleanup();
        process.exit(1);
    }, 120000);

    try {
    console.log('🚀 إقلاع Mongo replica-set حقيقي (مطلوب للمعاملات)...');
    const { MongoMemoryReplSet } = require('mongodb-memory-server');
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const mongoUri = replSet.getUri();
    console.log(`✅ Mongo جاهز: ${mongoUri}`);

    console.log('🚀 إقلاع السيرفر الحقيقي (server/server.js) بعملية Node منفصلة...');
    serverProcess = spawn(process.execPath, [path.join(ROOT, 'server/server.js')], {
        cwd: ROOT,
        env: {
            ...process.env,
            MONGODB_URI: mongoUri,
            JWT_SECRET,
            PORT: String(PORT),
            NODE_ENV: 'test',
            ALLOWED_ORIGINS: ''
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    serverProcess.stderr.on('data', (chunk) => process.stderr.write(`[server:err] ${chunk}`));
    serverProcess.on('exit', (code) => {
        if (code !== null && code !== 0) console.error(`[server] خرجت العملية بكود ${code}`);
    });

    await waitForServerReady(`http://127.0.0.1:${PORT}/api/gifts/shop`, 30000);
    console.log('✅ السيرفر يستجب فعلياً');

    console.log('🌱 تهيئة مستخدم الاختبار + مستلم مقعد + انتظار بذر كتالوج الهدايا التلقائي...');
    await mongoose.connect(mongoUri);
    const User = require(path.join(ROOT, 'server/models/User'));
    const Gift = require(path.join(ROOT, 'server/models/Gift'));
    const VoiceRoom = require(path.join(ROOT, 'server/models/VoiceRoom'));

    let gift = null;
    for (let i = 0; i < 100 && !gift; i++) {
        gift = await Gift.findOne({ name: 'وردة' });
        if (!gift) await new Promise(r => setTimeout(r, 100));
    }
    if (!gift) throw new Error('تعذّر العثور على هدية البذر الأساسية (autoSeed) — راجع server/utils/autoSeed.js');

    const sender = await makeTestUser(User, 'perftest_sender', INITIAL_COINS);
    const recipient = await makeTestUser(User, 'perftest_recipient', 0);

    await VoiceRoom.getMainRoom(); // ✅ تُنشئ الغرفة الرسمية ب80 مقعد فارغ لو لم تكن موجودة أصلاً
    await VoiceRoom.findOneAndUpdate(
        { slug: 'main', 'seats.seatNumber': 2 },
        { $set: { 'seats.$.user': recipient._id, 'seats.$.joinedAt': new Date() } }
    );

    const token = jwt.sign({ id: sender._id.toString() }, JWT_SECRET);

    console.log('🌐 إقلاع Chromium حقيقي (Playwright)...');
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') console.log(`[page:console:error] ${msg.text()}`); });
    page.on('pageerror', (err) => console.log(`[page:error] ${err.message}\n${err.stack}`));
    page.on('requestfailed', (req) => console.log(`[page:requestfailed] ${req.url()} — ${req.failure()?.errorText}`));

    // 🛡️ بيئة الاختبار المعزولة بلا وصول شبكة خارجي حقيقي — عميل Socket.IO (من cdn.socket.io
    // بـindex.html) يُخدَّم من النسخة المحلية المطابقة (node_modules/socket.io، تبعية موجودة
    // أصلاً) بدل طلب شبكي خارجي حقيقي؛ أي أصل Cloudinary/خط خارجي آخر يُفشَل بصمت (ضروري
    // لتشغيل الواجهة لا لعرضها بصرياً هنا — راجع التقاط لقطتي الشاشة الحقيقيتين على خادم حقيقي
    // بتقرير PR لذلك، لا هذا السكربت). هذا لا يُغيّر أي كود إنتاجي — اعتراض على مستوى المتصفح فقط
    const socketIoClientPath = path.join(ROOT, 'node_modules/socket.io/client-dist/socket.io.min.js');
    await page.route('https://cdn.socket.io/**', (route) => route.fulfill({ path: socketIoClientPath, contentType: 'application/javascript' }));
    await page.route(/^https:\/\/(res\.cloudinary\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)\//, (route) => route.abort());

    // ✅ FORCE_WEAK_DEVICE=1 (علامة مقارنة فقط — ليست جزءاً من الإصلاح): إبطاء CPU×4 الحقيقي
    // أعلاه لا يُغيِّر navigator.hardwareConcurrency/deviceMemory الفعليتين لهذي الآلة (تبقيان
    // قيمتي الجهاز الحقيقي)، فـisWeakDevice() بـapp.js قد لا تُفعَّل إطلاقاً حتى تحت الإبطاء —
    // يُستخدَم هذا العلم لتثبيتها true قسراً هنا فقط، كي يُقاس الأثر الحقيقي لمسار "الجهاز
    // الضعيف" (250 جزيء/dpr=1/حدّ 2 طيران متزامن) بمقارنة مباشرة مع المسار الكامل بلا هذا العلم
    if (process.env.FORCE_WEAK_DEVICE === '1') {
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true });
        });
    }

    await page.addInitScript(([tok, u]) => {
        localStorage.setItem('token', tok);
        localStorage.setItem('user', JSON.stringify(u));
    }, [token, {
        _id: sender._id.toString(), username: sender.username, coins: INITIAL_COINS, balance: 0,
        level: 1, experience: 0, isAgent: false, activeFrameClass: null, status: '',
        friends: [], friendRequestsReceived: []
    }]);

    console.log('📄 تحميل الصفحة (الهبوط الافتراضي: قائمة تصفح الغرف — showRoomBrowserView)...');
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });

    console.log('🚪 الضغط على بطاقة الغرفة الرسمية (الشارة arena-card-tag-official) لدخولها...');
    await page.locator('.arena-room-card:has(.arena-card-tag-official)').click({ timeout: 20000 });

    console.log('🎁 فتح شيت الهدايا الحقيقي وإرسال أول هدية (تبدأ جلسة الكومبو الحيّة)...');
    // ✅ .click() عبر DOM مباشرة لا click() بإحداثيات Playwright — دردشة الغرفة الحيّة (سطور
    // تصل staggered، راجع appendRoomChatMessage) تُحرِّك الصفحة باستمرار، فقد يسقط نقر بالإحداثي
    // الحقيقي على عنصر آخر غطّى الزر لحظياً. استدعاء .click() على العنصر نفسه مباشرة يضرب
    // المعالج الحقيقي المرتبط به بالضبط، بصرف النظر عن أي تراكب بصري عابر فوقه تلك اللحظة
    await page.locator('#room-gift-icon-btn').waitFor({ state: 'attached', timeout: 20000 });
    await page.evaluate(() => document.getElementById('room-gift-icon-btn').click());
    // ✅ Playwright ينتظر تلقائياً اكتمال التفعيل (disabled=false) قبل الضغط — نفس لحظة اكتمال
    // جلب المقاعد واختيار هدية/مستلم افتراضيين فعلياً (sel/getRecipients بـshowRoomGiftModal).
    // force عمداً غير مُمرَّر هنا (بخلاف الزر أعلاه) — فحص enabled/disabled الحقيقي مطلوب فعلاً
    await page.locator('#gsheet-send').click({ timeout: 20000 });
    await page.locator('#gfx-cbtn').waitFor({ state: 'visible', timeout: 15000 });
    console.log('✅ جلسة الكومبو الحيّة بدأت — زر #gfx-cbtn ظاهر');

    console.log(`🐌 تطبيق إبطاء CPU×${CPU_THROTTLE_RATE} حقيقي عبر CDP...`);
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE });

    await page.evaluate(() => {
        window.__perf = { longTasks: [], frameDeltas: [] };
        const obs = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                window.__perf.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
            }
        });
        obs.observe({ type: 'longtask', buffered: true });
        window.__perfObs = obs;
        let last = performance.now();
        function raf(now) {
            window.__perf.frameDeltas.push(now - last);
            last = now;
            window.__rafId = requestAnimationFrame(raf);
        }
        window.__rafId = requestAnimationFrame(raf);
    });

    const box = await page.locator('#gfx-cbtn').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    console.log(`👆 إمساك #gfx-cbtn بمؤشر حقيقي لـ${HOLD_MS}ms (تسارع داخلي تلقائي حتى 20 ضغطة/ث)...`);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(HOLD_MS);
    await page.mouse.up();
    await page.waitForTimeout(500); // ✅ تفريغ أي رسم/حركة معلّقة أخيراً قبل القياس

    const comboCount = await page.locator('#gfx-cn').textContent().catch(() => null);
    const perf = await page.evaluate(() => {
        cancelAnimationFrame(window.__rafId);
        window.__perfObs.disconnect();
        return window.__perf;
    });

    await browser.close();
    browser = null;

    const freshSender = await User.findById(sender._id);
    const receiverLogsCount = await require(path.join(ROOT, 'server/models/GiftLog')).countDocuments({ receiver: recipient._id });

    const frameDeltas = perf.frameDeltas.slice(1); // ✅ أول دلتا (من بدء rAF للوحدة الأولى) ليست دلتا إطار حقيقية
    const maxFrameDelta = frameDeltas.length ? Math.max(...frameDeltas) : 0;
    const p95FrameDelta = percentile(frameDeltas, 95);
    const framesOver50 = frameDeltas.filter(d => d > 50).length;

    console.log('\n================ نتائج قياس الأداء (بند 3) ================');
    console.log(`الكومبو المعروض بالزر (×العدّاد): ${comboCount}`);
    console.log(`ضغطات نجحت فعلياً (رصيد خُصم): ${(INITIAL_COINS - (freshSender?.coins ?? INITIAL_COINS)) / (gift.discountedPrice || gift.price)}`);
    console.log(`سجلّات GiftLog للمستلِم: ${receiverLogsCount}`);
    console.log(`مهام طويلة بالخيط الرئيسي (longtask ≥50ms) — العدد: ${perf.longTasks.length} (الهدف: 0)`);
    if (perf.longTasks.length) {
        console.log('  تفاصيل كل مهمة طويلة (startTime/duration بالمِلّي ثانية):');
        perf.longTasks.forEach(t => console.log(`    - start=${t.startTime.toFixed(1)}ms duration=${t.duration.toFixed(1)}ms`));
    }
    console.log(`إطارات rAF المُسجَّلة: ${frameDeltas.length} — أقصى دلتا: ${maxFrameDelta.toFixed(1)}ms, p95: ${p95FrameDelta.toFixed(1)}ms, إطارات >50ms: ${framesOver50}`);
    console.log('==============================================================\n');

    const pass = perf.longTasks.length === 0;
    console.log(pass ? '✅ PASS — صفر مهام طويلة (>50ms) بالخيط الرئيسي تحت إبطاء CPU×4 أثناء كومبو 20 ضغطة/ث' : '❌ FAIL — راجع تفاصيل المهام الطويلة أعلاه');

    process.exitCode = pass ? 0 : 1;
    } catch (err) {
        console.error('💥 فشل قياس الأداء:', err);
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
