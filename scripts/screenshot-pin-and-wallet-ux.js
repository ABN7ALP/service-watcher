#!/usr/bin/env node
'use strict';

// 🛡️ مراجعة الأمان v2 (PR A) — دليل بصري حقيقي (سيرفر+Mongo حقيقيين، Chromium حقيقي، لا محاكاة)
// لتدفّقات رمز السحب الجديدة (إنشاء/إدخال/نسيت) + زر "+" الدائري بشيت الهدايا + صف المرجع
// القابل للنسخ بتدفّق شام كاش + شيت المساعدة بصورتين (data: URI محليتين، لا شبكة مطلوبة).
// صفحتان مستقلتان (مستخدمان منفصلان): "أ" يستضيف غرفة فقط للقطة زر "+"، و"ب" مستخدم عادي
// (لا غرفة له) للقطات المحفظة/الرمز — يتجنّب كل تعقيد الخروج من واجهة غرفة مباشرة (منطق
// إنهاء البث/الجولة التعريفية) الذي لا علاقة له بما نختبره فعلياً هنا.

const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const ROOT = path.join(__dirname, '..');
const JWT_SECRET = 'screenshot-test-secret-do-not-use-in-prod';
const PORT = 5962;
const OUT_DIR = process.env.SCREENSHOT_OUT_DIR || path.join(ROOT, 'docs/verification/pr-a-pin-and-wallet-ux');

// صورتا مساعدة 1×1 بكسل حقيقيتان (PNG صالح) — كافيتان لإثبات أن الشيت يرسم صندوقي صور فعلاً
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function waitForServerReady(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(url);
            // ✅ المسار يتطلّب مصادقة (401 متوقَّع بلا توكن) — فقط 503 (migrationGate) تعني "غير جاهز بعد"
            if (res.status !== 503) return true;
        } catch (_) {}
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('السيرفر لم يستجب بالوقت المحدد');
}

function userLocalStorage(id, username, coins, balance) {
    return {
        _id: id, username, coins, balance, level: 1, experience: 0,
        isAgent: false, activeFrameClass: null, status: '', friends: [], friendRequestsReceived: []
    };
}

async function setupPage(browser, token, userObj) {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    page.on('pageerror', (err) => console.log(`[error] ${err.message}`));
    const socketIoClientPath = path.join(ROOT, 'node_modules/socket.io/client-dist/socket.io.min.js');
    await page.route('https://cdn.socket.io/**', (route) => route.fulfill({ path: socketIoClientPath, contentType: 'application/javascript' }));
    await page.route(/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|res\.cloudinary\.com|i\.ibb\.co)\//, (route) => route.abort());
    await page.addInitScript(([tok, u]) => {
        localStorage.setItem('token', tok);
        localStorage.setItem('user', JSON.stringify(u));
        // ✅ Chromium headless بلا تفضيل نظام للوضع الداكن افتراضياً — نفس الوضع الذي يصمَّم
        // له التطبيق أولاً (CLAUDE.md: "Dark Mode First") كي تعكس اللقطات الاستخدام الحقيقي
        localStorage.setItem('theme', 'dark');
    }, [token, userObj]);
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
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
        console.error('💥 انتهت مهلة الأمان العامة (120s)');
        await cleanup();
        process.exit(1);
    }, 120000);

    try {
        console.log('🚀 إقلاع Mongo + السيرفر الحقيقيين...');
        const { MongoMemoryReplSet } = require('mongodb-memory-server');
        replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const mongoUri = replSet.getUri();

        serverProcess = spawn(process.execPath, [path.join(ROOT, 'server/server.js')], {
            cwd: ROOT,
            env: { ...process.env, MONGODB_URI: mongoUri, JWT_SECRET, PORT: String(PORT), NODE_ENV: 'test', ALLOWED_ORIGINS: '', WALLET_MIGRATION: 'apply' },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        serverProcess.stderr.on('data', (chunk) => process.stderr.write(`[server:err] ${chunk}`));
        serverProcess.stdout.on('data', (chunk) => process.stdout.write(`[server:out] ${chunk}`));

        await waitForServerReady(`http://127.0.0.1:${PORT}/api/gifts/shop`, 60000);
        console.log('✅ السيرفر يستجب فعلياً');

        await mongoose.connect(mongoUri);
        const User = require(path.join(ROOT, 'server/models/User'));
        const VoiceRoom = require(path.join(ROOT, 'server/models/VoiceRoom'));
        const SystemSettings = require(path.join(ROOT, 'server/models/SystemSettings'));

        // ✅ صورتا مساعدة شام كاش بصيغة data: — تثبت أن الشيت يرسمهما فعلاً بلا اعتماد على شبكة/Cloudinary
        await SystemSettings.getSettings();
        await SystemSettings.updateOne({ singletonKey: 'main' }, {
            $set: {
                shamCashWallet: '0912345678', shamCashHolderName: 'منصة الخدمة',
                shamCashHelpImage1: `data:image/png;base64,${TINY_PNG}`,
                shamCashHelpImage2: `data:image/png;base64,${TINY_PNG}`
            }
        });

        const hostUser = await User.create({
            customId: 'SS100200301', username: 'screenshot_host', email: 'host@screenshottest.local',
            password: 'ScreenshotTest123!', gender: 'male', birthDate: new Date('2000-01-01'), coins: 1000
        });
        const room = await VoiceRoom.createRoom({
            hostId: hostUser._id, name: 'غرفة تحقّق بصري', description: '', coverImage: null,
            category: 'chat', seatCount: 9, isPrivate: false
        });
        const hostToken = jwt.sign({ id: hostUser._id.toString() }, JWT_SECRET);

        const walletUser = await User.create({
            customId: 'SS100200302', username: 'screenshot_pin_user', email: 'pinux@screenshottest.local',
            password: 'ScreenshotTest123!', gender: 'male', birthDate: new Date('2000-01-01'),
            coins: 50000, walletCoinsPaid: 50000, walletUsdCents: 10000, balance: 100
        });
        const walletToken = jwt.sign({ id: walletUser._id.toString() }, JWT_SECRET);

        console.log('🌐 إقلاع Chromium حقيقي (375px)...');
        const { chromium } = require('playwright');
        browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
        await require('fs').promises.mkdir(OUT_DIR, { recursive: true });

        // ===== 1) زر "+" الدائري بشيت الهدايا (البند 3) — صفحة مستقلة لمضيف الغرفة =====
        console.log('📸 1/6 — زر "+" الدائري بشيت الهدايا...');
        const hostPage = await setupPage(browser, hostToken, userLocalStorage(hostUser._id.toString(), hostUser.username, 1000, 0));
        await hostPage.locator('#still-live-return-btn').click({ timeout: 20000 });
        await hostPage.waitForTimeout(600);
        // ✅ جولة تعريفية تلقائية بأول دخول غرفة — نتخطّاها كي لا تغطي زر "+" المطلوب التقاطه
        await hostPage.locator('#rtour-later-btn').click({ timeout: 10000 }).catch(() => {});
        await hostPage.locator('#room-gift-icon-btn').waitFor({ state: 'attached', timeout: 20000 });
        await hostPage.evaluate(() => document.getElementById('room-gift-icon-btn').click());
        await hostPage.locator('#gsheet-recharge-btn').waitFor({ state: 'visible', timeout: 10000 });
        await hostPage.screenshot({ path: path.join(OUT_DIR, '1-gift-sheet-circular-plus-button.png') });
        const plusBox = await hostPage.locator('#gsheet-recharge-btn').boundingBox();
        console.log(`   أبعاد الزر: ${plusBox.width.toFixed(2)}×${plusBox.height.toFixed(2)} (يجب أن تتطابق تماماً)`);
        await hostPage.close();

        // ===== بقية اللقطات — صفحة مستقلة لمستخدم عادي بلا غرفة (لا تعقيد خروج/جولة تعريفية) =====
        // ✅ #deposit-balance-btn بالترويسة يفتح شيت "شحن الرصيد" القديم (نظام منفصل تماماً) —
        // صفحة المحفظة الجديدة (feat/wallet-recharge-v1، بتبويبات شحن/استبدال/سحب) تُفتَح فعلياً
        // عبر #buy-coins-btn (تبويب شحن) أو #withdraw-balance-btn (تبويب سحب مباشرة)
        const page = await setupPage(browser, walletToken, userLocalStorage(walletUser._id.toString(), walletUser.username, 50000, 100));
        await page.locator('#buy-coins-btn').waitFor({ state: 'visible', timeout: 15000 });

        // ===== 2) صف المرجع القابل للنسخ + 3) شيت المساعدة بصورتين (البندان 4 و5) =====
        console.log('📸 2/6 — صف "رقم طلبك" القابل للنسخ بخطوة التحويل...');
        await page.locator('#buy-coins-btn').click();
        await page.locator('#wallet-packages [data-pkg="0"]').waitFor({ state: 'visible', timeout: 15000 });
        await page.locator('#wallet-packages [data-pkg="0"]').click();
        await page.locator('#wallet-pay-btn').click();
        await page.locator('#sc-next1').waitFor({ state: 'visible', timeout: 15000 });
        await page.screenshot({ path: path.join(OUT_DIR, '2-deposit-step1-copyable-ref-row.png') });

        console.log('📸 3/6 — شيت "أين أجد رقم العملية؟" بصورتين فعليتين...');
        await page.locator('#sc-next1').click();
        await page.locator('#sc-help-btn').waitFor({ state: 'visible', timeout: 10000 });
        await page.locator('#sc-help-btn').click();
        await page.locator('[data-help-img="0"]').waitFor({ state: 'visible', timeout: 10000 });
        await page.screenshot({ path: path.join(OUT_DIR, '3-sham-cash-help-sheet-with-images.png') });
        await page.locator('#sc-help-close').click();
        await page.evaluate(() => document.querySelector('.sham-cash-overlay')?.remove());

        // ===== 4) إنشاء رمز السحب أول مرة (البند 2) =====
        console.log('📸 4/6 — إنشاء رمز السحب (أول دخول لتبويب السحب)...');
        // ✅ تبويبا "شحن"/"سحب" بنفس شيت المحفظة المفتوح فعلاً — لا حاجة لإغلاقه وإعادة فتحه
        await page.locator('#wallet-tabs [data-wallet-tab="withdraw"]').click();
        await page.locator('#pin-pad-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await page.screenshot({ path: path.join(OUT_DIR, '4-withdrawal-pin-setup.png') });
        for (const d of ['1', '2', '3', '4']) await page.locator(`.pin-pad-key[data-k="${d}"]`).click();
        await page.locator('#pin-pad-confirm').click();
        await page.locator('#pin-pad-confirm').waitFor({ state: 'visible', timeout: 10000 }); // شاشة التأكيد الثانية
        for (const d of ['1', '2', '3', '4']) await page.locator(`.pin-pad-key[data-k="${d}"]`).click();
        await page.locator('#pin-pad-confirm').click();
        await page.waitForTimeout(500);

        // ===== 5) إدخال الرمز + 6) "نسيت الرمز؟" (البند 2) =====
        console.log('📸 5/6 — إدخال رمز السحب (حفظ محفظة الصرف)...');
        await page.locator('.withdraw-method-btn[data-method="sham_cash"]').click();
        await page.locator('#w-change-wallet-btn').waitFor({ state: 'visible', timeout: 10000 });
        await page.locator('#w-change-wallet-btn').click();
        await page.locator('#pin-pad-confirm').waitFor({ state: 'visible', timeout: 10000 });
        await page.screenshot({ path: path.join(OUT_DIR, '5-withdrawal-pin-entry.png') });

        console.log('📸 6/6 — تدفّق "نسيت الرمز؟"...');
        await page.locator('#pin-pad-forgot').click();
        await page.locator('#fp-password').waitFor({ state: 'visible', timeout: 10000 });
        await page.screenshot({ path: path.join(OUT_DIR, '6-forgot-pin-flow.png') });

        clearTimeout(watchdog);
        console.log('\n✅ تم التقاط كل اللقطات الست بنجاح على عرض 375px');
    } catch (err) {
        console.error('💥 فشل التقاط اللقطات:', err);
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
