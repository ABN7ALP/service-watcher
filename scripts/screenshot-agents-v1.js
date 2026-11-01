#!/usr/bin/env node
'use strict';

// ✅ feat/agents-v1 — دليل بصري حقيقي (سيرفر+Mongo حقيقيين، Chromium حقيقي، لا محاكاة) لتدفّق
// تحويل الوكيل (بطاقة التأكيد)، قائمة الوكلاء من جهة المستخدم، وصفحة الوكلاء بلوحة الإدارة.
// نفس بنية scripts/screenshot-pin-and-wallet-ux.js (PR A).

const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const ROOT = path.join(__dirname, '..');
const JWT_SECRET = 'screenshot-test-secret-do-not-use-in-prod';
const PORT = 5973;
const OUT_DIR = process.env.SCREENSHOT_OUT_DIR || path.join(ROOT, 'docs/verification/pr-b-agents-v1');

async function waitForServerReady(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(url);
            if (res.status !== 503) return true; // ✅ فقط 503 (migrationGate) تعني "غير جاهز بعد"
        } catch (_) {}
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('السيرفر لم يستجب بالوقت المحدد');
}

function userLocalStorage(id, username, coins, balance, extra = {}) {
    return {
        _id: id, username, coins, balance, level: 1, experience: 0,
        isAgent: false, activeFrameClass: null, status: '', friends: [], friendRequestsReceived: [],
        ...extra
    };
}

async function setupPage(browser, token, userObj, { blockExternal = true } = {}) {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    page.on('pageerror', (err) => console.log(`[error] ${err.message}`));
    const socketIoClientPath = path.join(ROOT, 'node_modules/socket.io/client-dist/socket.io.min.js');
    await page.route('https://cdn.socket.io/**', (route) => route.fulfill({ path: socketIoClientPath, contentType: 'application/javascript' }));
    // ✅ صفحة لوحة الإدارة تحتاج Bootstrap الحقيقي من jsdelivr لتظهر مُنسَّقة بصرياً — فقط صفحة
    // التطبيق الرئيسي (app.js) تحجب هذي النطاقات (ليست موضوع هذه اللقطات الثلاث أصلاً)
    if (blockExternal) {
        await page.route(/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|res\.cloudinary\.com|i\.ibb\.co)\//, (route) => route.abort());
    } else {
        await page.route(/^https:\/\/i\.ibb\.co\//, (route) => route.abort());
    }
    await page.addInitScript(([tok, u]) => {
        localStorage.setItem('token', tok);
        localStorage.setItem('user', JSON.stringify(u));
        localStorage.setItem('theme', 'dark');
    }, [token, userObj]);
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
        serverProcess.stdout.on('data', () => {});

        await waitForServerReady(`http://127.0.0.1:${PORT}/api/gifts/shop`, 60000);
        console.log('✅ السيرفر يستجب فعلياً');

        await mongoose.connect(mongoUri);
        const User = require(path.join(ROOT, 'server/models/User'));
        const Agent = require(path.join(ROOT, 'server/models/Agent'));

        const admin = await User.create({
            customId: 'SSADMIN01', username: 'screenshot_admin', email: 'admin@screenshottest.local',
            password: 'ScreenshotTest123!', gender: 'male', birthDate: new Date('2000-01-01'), isAdmin: true
        });
        const agentUser = await User.create({
            customId: 'SSAGENT01', username: 'وكيل_سارة', email: 'agent@screenshottest.local',
            password: 'ScreenshotTest123!', gender: 'female', birthDate: new Date('2000-01-01'),
            isAgent: true, isOnline: true, walletAgentInventory: 220500
        });
        const agentDoc = await Agent.create({
            user: agentUser._id, displayName: 'وكيل سارة', status: 'active',
            ratingSum: 46, ratingCount: 10, totalTransfers: 37, totalCoinsTransferred: 950000,
            createdBy: admin._id
        });
        const recipient = await User.create({
            customId: 'SSRECV001', username: 'مستخدم_عادي', email: 'recv@screenshottest.local',
            password: 'ScreenshotTest123!', gender: 'male', birthDate: new Date('2000-01-01')
        });

        const adminToken = jwt.sign({ id: admin._id.toString() }, JWT_SECRET);
        const agentToken = jwt.sign({ id: agentUser._id.toString() }, JWT_SECRET);
        const recipientToken = jwt.sign({ id: recipient._id.toString() }, JWT_SECRET);

        console.log('🌐 إقلاع Chromium حقيقي (375px)...');
        const { chromium } = require('playwright');
        browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
        await require('fs').promises.mkdir(OUT_DIR, { recursive: true });

        // ===== 1) بطاقة تأكيد تحويل الوكيل =====
        console.log('📸 1/3 — بطاقة تأكيد تحويل الوكيل...');
        const agentPage = await setupPage(browser, agentToken, userLocalStorage(agentUser._id.toString(), agentUser.username, 0, 0, { isAgent: true }));
        await agentPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
        // ✅ نقرات DOM حقيقية فقط — دوال app.js ليست على window (مُتحقَّق سابقاً بنص PR A نفسه).
        // #profileImage الذي يفتح showMyProfileHub() حصراً لسطح المكتب — على الهاتف (375px) يُفتح
        // الملف الشخصي عبر زر "المزيد" بالشريط السفلي ثم "ملفي الشخصي" داخل الشيت
        await agentPage.locator('#mobile-more-btn').click({ timeout: 15000 });
        await agentPage.locator('#mobile-sheet-my-profile-btn').waitFor({ state: 'visible', timeout: 10000 });
        await agentPage.locator('#mobile-sheet-my-profile-btn').click();
        await agentPage.locator('#profile-hub-more-btn').waitFor({ state: 'visible', timeout: 15000 });
        await agentPage.locator('#profile-hub-more-btn').click();
        await agentPage.locator('#hub-more-agent-panel').waitFor({ state: 'visible', timeout: 10000 });
        await agentPage.locator('#hub-more-agent-panel').click();
        await agentPage.locator('#agent-panel-transfer-btn').waitFor({ state: 'visible', timeout: 15000 });
        await agentPage.locator('#agent-panel-transfer-btn').click();
        await agentPage.locator('#at-customid').waitFor({ state: 'visible', timeout: 10000 });
        await agentPage.locator('#at-customid').fill('SSRECV001');
        await agentPage.locator('#at-find-btn').click();
        await agentPage.locator('#at-amount').waitFor({ state: 'visible', timeout: 10000 });
        await agentPage.locator('#at-amount').fill('15000');
        await agentPage.screenshot({ path: path.join(OUT_DIR, '1-agent-transfer-confirm.png') });
        await agentPage.close();

        // ===== 2) قائمة الوكلاء (جهة المستخدم) =====
        console.log('📸 2/3 — قائمة الوكلاء المعتمدين (جهة المستخدم)...');
        const userPage = await setupPage(browser, recipientToken, userLocalStorage(recipient._id.toString(), recipient.username, 0, 0));
        await userPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
        await userPage.locator('#buy-coins-btn').waitFor({ state: 'visible', timeout: 15000 });
        await userPage.locator('#buy-coins-btn').click();
        await userPage.locator('#wallet-agent-method-btn').waitFor({ state: 'visible', timeout: 15000 });
        await userPage.locator('#wallet-agent-method-btn').click();
        await userPage.locator('.agent-card').first().waitFor({ state: 'visible', timeout: 15000 });
        await userPage.screenshot({ path: path.join(OUT_DIR, '2-user-agent-list.png') });
        await userPage.close();

        // ===== 3) صفحة الوكلاء بلوحة الإدارة =====
        console.log('📸 3/3 — صفحة الوكلاء بلوحة الإدارة...');
        const adminPage = await setupPage(browser, adminToken, { ...userLocalStorage(admin._id.toString(), admin.username, 0, 0), isAdmin: true }, { blockExternal: false });
        await adminPage.goto(`http://127.0.0.1:${PORT}/admin/admin.html`, { waitUntil: 'domcontentloaded' });
        // ✅ الشريط الجانبي خارج الشاشة افتراضياً على 375px — زر الهامبرغر المُضاف ديناميكياً يفتحه
        await adminPage.locator('.mobile-menu-toggle').click({ timeout: 15000 });
        await adminPage.locator('.menu-item[data-page="agents"]').waitFor({ state: 'visible', timeout: 15000 });
        await adminPage.locator('.menu-item[data-page="agents"]').click();
        await adminPage.locator('#agentsSubContainer table').waitFor({ state: 'visible', timeout: 15000 });
        await adminPage.evaluate(() => window.scrollTo(0, 0));
        await adminPage.locator('#agentsSubContainer table').scrollIntoViewIfNeeded();
        await adminPage.waitForTimeout(400);
        await adminPage.screenshot({ path: path.join(OUT_DIR, '3-admin-agents-page.png') });
        await adminPage.close();

        clearTimeout(watchdog);
        console.log('\n✅ تم التقاط كل اللقطات الثلاث بنجاح على عرض 375px');
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
