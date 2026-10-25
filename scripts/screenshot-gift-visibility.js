#!/usr/bin/env node
'use strict';

// 🛡️ دليل بصري حقيقي (مراجعة PR gifts-visibility-frames-perf — البند 2ب، "تحقّق LIGHT: ...
// وشاشتا تحقّق (عميل ثانٍ يُشاهِد)"): عميلا Chromium حقيقيان (Playwright) بجلستين مستقلتين —
// "أ" المُرسِل (يفتح شيت الهدايا الحقيقي ويضغط زر الكومبو ضغطة واحدة فعلية) و"ب" المستلِم
// الجالس على مقعد (شخص آخر حقيقي بالغرفة، لا المُرسِل نفسه) — تُلتقَط لقطتا شاشة من منظور "ب"
// فقط: الأولى لحظة طيران الهدية الحقيقي (gfxFlyRemoteGiftToSeat) + شريط الإعلان معاً، والثانية
// بعدها بلحظات (الشريط لا يزال ظاهراً + سطر الدردشة). لا محاكاة — نفس bootstrap سيرفر+Mongo
// حقيقيين كـperf-gift-combo-playwright.js المجاور.

const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const ROOT = path.join(__dirname, '..');
const JWT_SECRET = 'screenshot-test-secret-do-not-use-in-prod';
const PORT = 5961;
const OUT_DIR = process.env.SCREENSHOT_OUT_DIR || path.join(ROOT, 'docs/verification/gifts-visibility-frames-perf');

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
        customId: `SS${suffix}`,
        username: `${usernameBase}_${suffix}`,
        email: `${usernameBase}_${suffix}@screenshottest.local`,
        password: 'ScreenshotTest123!',
        gender: 'male',
        birthDate: new Date('2000-01-01'),
        coins
    });
}

function userLocalStorage(id, username, coins) {
    return {
        _id: id, username, coins, balance: 0, level: 1, experience: 0,
        isAgent: false, activeFrameClass: null, status: '', friends: [], friendRequestsReceived: []
    };
}

async function setupPage(browser, token, userObj, label, roomMongoId, isHost) {
    const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
    page.on('pageerror', (err) => console.log(`[${label}:error] ${err.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') console.log(`[${label}:console:error] ${msg.text()}`); });
    // 🛡️ طلب صريح بمراجعة PR (صور الهدايا مكسورة باللقطات): Chromium لا يقرأ HTTPS_PROXY من
    // بيئة العملية تلقائياً (بخلاف fetch/curl بـNode — راجع /root/.ccr/README.md)، وخيار
    // launch({proxy}) الخاص به اصطدم بعلّة حقيقية هنا: bypass لـ127.0.0.1 لم يُحتَرم إطلاقاً
    // (كل صيغة جُرِّبت)، فطلبات الخادم المحلي نفسه كانت تمرّ بالوكيل أيضاً وتفشل بـ405 (الوكيل
    // يخدم فقط أنفاق CONNECT لمضيفين خارجيين حقيقيين). الحل: Chromium بلا أي proxy إطلاقاً
    // (اتصالاته بخادمنا المحلي تبقى مباشرة كالسابق)، وaccess res.cloudinary.com فقط (صور
    // الهدايا الفعلية — بيت الموضوع هنا) يُعاد توجيهه يدوياً هنا عبر fetch بـNode (يحترم
    // HTTPS_PROXY تلقائياً وصحيح — مُتحقَّق مباشرة: 200 OK لكل الروابط المُحوَّلة). i.ibb.co
    // (صورة أفاتار افتراضية لمستخدم اختبار بلا صورة فعلية) محجوبة بسياسة الوكيل نفسها (403
    // مؤكَّد) ولا تُعاد توجيهها عمداً — هذا بالضبط الاختبار الحقيقي لاحتياط data-avatar-fallback
    // المُضاف بهذي المراجعة (رابط حيّ لكن ميت ⇐ DEFAULT_AVATAR_URL المحلي تلقائياً)
    const socketIoClientPath = path.join(ROOT, 'node_modules/socket.io/client-dist/socket.io.min.js');
    await page.route('https://cdn.socket.io/**', (route) => route.fulfill({ path: socketIoClientPath, contentType: 'application/javascript' }));
    await page.route(/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\//, (route) => route.abort());
    await page.route(/^https:\/\/res\.cloudinary\.com\//, async (route) => {
        try {
            const resp = await fetch(route.request().url());
            const buf = Buffer.from(await resp.arrayBuffer());
            await route.fulfill({ status: resp.status, contentType: resp.headers.get('content-type') || 'image/png', body: buf });
        } catch (_) {
            await route.abort();
        }
    });
    await page.addInitScript(([tok, u]) => {
        localStorage.setItem('token', tok);
        localStorage.setItem('user', JSON.stringify(u));
    }, [token, userObj]);
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    // 🛡️ غرفة مخصَّصة (isOfficial:false) لا الرسمية ('main') عمداً: الكومبو الحقيقي بـapp.js
    // (createComboSender buildPayload) يُرسِل roomId:undefined صراحة حين roomId==='main' —
    // الغرفة الرسمية لا تُفعِّل أي أثر مرتبط بالغرفة إطلاقاً (لا إعلان/شريط/طيران)، بتصميم
    // سابق للمهمة الحالية. غرفة مستخدم عادية تُرسِل roomId حقيقياً فتُفعِّل المسار كاملاً
    if (isHost) {
        // ✅ المضيف أُجلِس على المقعد 1 مباشرة بقاعدة البيانات (VoiceRoom.createRoom) بلا مرور
        // بتدفّق "بدء بث" الحقيقي بالواجهة — "بثّك لسا شغّال" تظهر له فوراً (showStillLiveModal)،
        // الرجوع للبث هنا هو الطريق الصحيح الحقيقي لدخول غرفته (لا بطاقة القائمة العادية)
        await page.locator('#still-live-return-btn').click({ timeout: 20000 });
    } else {
        await page.locator(`.arena-room-card[data-room-id="${roomMongoId}"]`).click({ timeout: 20000 });
    }
    await page.waitForTimeout(800); // ✅ استقرار بصري بسيط بعد الدخول (تحميل مقاعد/دردشة الغرفة)
    return page;
}

async function main() {
    let replSet = null, serverProcess = null, browser = null;
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
        const Gift = require(path.join(ROOT, 'server/models/Gift'));
        const VoiceRoom = require(path.join(ROOT, 'server/models/VoiceRoom'));

        let gift = null;
        for (let i = 0; i < 100 && !gift; i++) {
            gift = await Gift.findOne({ name: 'وردة' });
            if (!gift) await new Promise(r => setTimeout(r, 100));
        }
        if (!gift) throw new Error('تعذّر العثور على هدية البذر الأساسية');

        const sender = await makeTestUser(User, 'screenshot_sender', 5_000_000);
        const recipient = await makeTestUser(User, 'screenshot_recipient', 0);

        // ✅ غرفة مخصَّصة (لا الرسمية) — المستلِم مضيفها (يُجلَس تلقائياً على المقعد 1 عبر
        // createRoom)، فيصبح المستلِم الافتراضي لأي هدية ترسَل بالغرفة (hostIsSeated بـ
        // showRoomGiftModal) بلا أي تحديد يدوي إضافي بالسكربت
        const room = await VoiceRoom.createRoom({
            hostId: recipient._id, name: 'غرفة تحقّق لقطات', description: '', coverImage: null,
            category: 'chat', seatCount: 9, isPrivate: false
        });
        const roomMongoId = room._id.toString();

        const tokenSender = jwt.sign({ id: sender._id.toString() }, JWT_SECRET);
        const tokenRecipient = jwt.sign({ id: recipient._id.toString() }, JWT_SECRET);

        console.log('🌐 إقلاع Chromium حقيقي بجلستي عميلين مستقلّتين (مُرسِل + مستلِم مضيف الغرفة)...');
        const { chromium } = require('playwright');
        // 🐛 بلا proxy هنا عمداً — Chromium launch({proxy}) جُرِّب أولاً (مع bypass لـ127.0.0.1
        // بكل صيغة ممكنة: فاصلة/فاصلة منقوطة/<local>) لكنه لم يُحترَم إطلاقاً هنا، فطلبات
        // خادم الاختبار المحلي نفسه كانت تُوجَّه للوكيل أيضاً وتفشل بـ405 (الوكيل يخدم فقط أنفاق
        // CONNECT لمضيفين خارجيين حقيقيين، لا طلبات HTTP عادية لعنوان محلي). الحل الفعلي: بلا
        // أي proxy على Chromium نفسه (اتصاله بخادمنا المحلي يبقى مباشراً كما كان)، والوصول إلى
        // res.cloudinary.com حقيقياً عبر إعادة توجيه يدوية بـpage.route+fetch بـNode أدناه
        // (fetch بـNode يحترم HTTPS_PROXY صحيحاً — مُتحقَّق مباشرة)
        browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

        const pageRecipient = await setupPage(browser, tokenRecipient, userLocalStorage(recipient._id.toString(), recipient.username, 0), 'recipient', roomMongoId, true);
        const pageSender = await setupPage(browser, tokenSender, userLocalStorage(sender._id.toString(), sender.username, 5_000_000), 'sender', roomMongoId, false);
        console.log('✅ كلا العميلين دخلا الغرفة المخصَّصة فعلياً');

        console.log('🎁 المُرسِل يفتح شيت الهدايا ويرسل هدية حقيقية واحدة (ضغطة واحدة فعلية)...');
        await pageSender.locator('#room-gift-icon-btn').waitFor({ state: 'attached', timeout: 20000 });
        await pageSender.evaluate(() => document.getElementById('room-gift-icon-btn').click());
        await pageSender.locator('#gsheet-send').click({ timeout: 20000 });
        await pageSender.locator('#gfx-cbtn').waitFor({ state: 'visible', timeout: 15000 });
        const box = await pageSender.locator('#gfx-cbtn').boundingBox();
        await pageSender.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await pageSender.mouse.down();
        await pageSender.mouse.up(); // ✅ ضغطة واحدة فعلية — ليس إمساكاً مطوّلاً (لا جلسة كومبو مستمرة مطلوبة هنا)

        // 🐛 توقيت حاسم: حركة الطيران (.gfx-fly) تدوم 620ms فقط ثم تُزال من الـDOM — أي تأخير
        // (مثل تفريغ تشخيصي هنا) بين الضغطة وفحص ظهورها يُفوِّت النافذة بالكامل. waitFor يبدأ
        // الفحص فوراً ويستطلع (poll) حتى ظهورها الفعلي أو انتهاء المهلة، فلا مشكلة إن استغرق
        // بثّ room-gift-announcement من السيرفر بعض المِلّي ثوانٍ قبل أن يظهر العنصر أصلاً
        console.log('📸 لقطة 1 — منظور المستلِم لحظة طيران الهدية الحقيقي + شريط الإعلان معاً...');
        await pageRecipient.locator('.gfx-fly').first().waitFor({ state: 'visible', timeout: 10000 });
        await require('fs').promises.mkdir(OUT_DIR, { recursive: true });
        await pageRecipient.screenshot({ path: path.join(OUT_DIR, '1-recipient-gift-fly-and-banner.png') });
        console.log(`✅ حُفِظت: ${path.join(OUT_DIR, '1-recipient-gift-fly-and-banner.png')}`);

        console.log('📸 لقطة 2 — بعد لحظات: الشريط لا يزال ظاهراً + سطر دردشة الهدية + ارتداد المقعد...');
        await pageRecipient.waitForTimeout(1200);
        await pageRecipient.screenshot({ path: path.join(OUT_DIR, '2-recipient-banner-and-chat-settled.png') });
        console.log(`✅ حُفِظت: ${path.join(OUT_DIR, '2-recipient-banner-and-chat-settled.png')}`);

        clearTimeout(watchdog);
        console.log('\n✅ تم التقاط لقطتي التحقّق بنجاح من منظور المستلِم (عميل ثانٍ حقيقي غير المُرسِل)');
    } catch (err) {
        console.error('💥 فشل التقاط لقطات التحقّق:', err);
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
