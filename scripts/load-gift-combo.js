#!/usr/bin/env node
'use strict';

// 🛡️ تحقّق حمل حقيقي (الموثوقية والسرعة — هدايا v2): سيرفر حقيقي (server/server.js، عملية
// Node منفصلة فعلياً) + Mongo replica-set حقيقي (mongodb-memory-server) + عميلا Socket.IO
// حقيقيان، كل واحد يُمسك زر الكومبو بمعدّل 20 ضغطة/ث لمدة 15 ثانية — نفس مسار gift:combo
// الحقيقي بالضبط (لا محاكاة/stub لأي طبقة). يُعيد منطق createComboSender بـpublic/js/app.js
// حرفياً (عمق أنبوب=1 + إعادة محاولة نفس seq عند فشل عابر، لا رفض نهائي)، لأن هذا هو العقد
// الحقيقي الذي يجب التحقق منه، لا مجرّد إرسال عشوائي. يطبع ملخّصاً نهائياً ويخرج بكود 0/1.
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { io: ioClient } = require('socket.io-client');

const ROOT = path.join(__dirname, '..');
const JWT_SECRET = 'load-test-secret-do-not-use-in-prod';
const PORT = 5959;
const DURATION_MS = 15000;
const TAPS_PER_SEC = 20;
const TAP_INTERVAL_MS = 1000 / TAPS_PER_SEC;
const INITIAL_COINS = 5_000_000;

// ✅ مطابقة تامة لـGFX_COMBO_RETRY_DELAYS_MS/GFX_COMBO_DEFINITIVE_FAIL_CODES بـcreateComboSender
// الحقيقي (public/js/app.js) — التحقق يجب أن يُحاكي نفس العقد الذي يستخدمه العميل الفعلي
const RETRY_DELAYS_MS = [300, 800, 1500];
const DEFINITIVE_FAIL_CODES = new Set([
    'INSUFFICIENT', 'BAD_QTY', 'BAD_SEQ', 'BAD_TAPS', 'BAD_COMBO_ID',
    'NO_GIFT', 'NO_ROOM', 'NO_RECIPIENTS', 'NO_VALID_RECIPIENTS', 'NO_SENDER'
]);

function createTestSender(socket, recipientId, giftId, label) {
    const comboId = `loadtest-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let seq = 0;
    let pendingTaps = 0;
    let inFlight = false;
    let totalTapsQueued = 0;
    let totalTapsSettledOk = 0;
    let failedBatches = 0;
    const ackLatencies = [];

    function maybeSendNext() {
        if (inFlight || pendingTaps === 0) return;
        inFlight = true;
        const taps = pendingTaps;
        pendingTaps = 0;
        sendBatch(++seq, taps, 0, Date.now());
    }

    function sendBatch(mySeq, taps, attempt, sentAt) {
        const payload = { comboId, seq: mySeq, taps, giftId, quantity: 1, recipientIds: [recipientId] };
        socket.timeout(6000).emit('gift:combo', payload, (err, res) => {
            const failed = !!err || !res?.ok;
            const isDefinitive = !err && res && DEFINITIVE_FAIL_CODES.has(res.code);
            if (failed && !isDefinitive && attempt < RETRY_DELAYS_MS.length) {
                setTimeout(() => sendBatch(mySeq, taps, attempt + 1, sentAt), RETRY_DELAYS_MS[attempt]);
                return;
            }
            inFlight = false;
            if (failed) {
                failedBatches++;
                console.error(`[${label}] batch seq=${mySeq} (${taps} taps) FAILED definitively: ${err ? (err.message || err) : res?.code}`);
            } else {
                totalTapsSettledOk += taps;
                ackLatencies.push(Date.now() - sentAt);
            }
            maybeSendNext();
        });
    }

    return {
        tap() { pendingTaps++; totalTapsQueued++; maybeSendNext(); },
        isIdle() { return !inFlight && pendingTaps === 0; },
        stats() { return { totalTapsQueued, totalTapsSettledOk, failedBatches, ackLatencies }; }
    };
}

async function waitForIdle(senders, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (senders.every(s => s.isIdle())) return true;
        await new Promise(r => setTimeout(r, 50));
    }
    return senders.every(s => s.isIdle());
}

function waitForConnect(socket, label) {
    return new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', (err) => reject(new Error(`[${label}] connect_error: ${err.message}`)));
    });
}

async function waitForServerReady(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            await fetch(url);
            return true; // ✅ أي رد HTTP (حتى 401 بلا توكن) يكفي دليلاً أن السيرفر استيقظ فعلياً
        } catch {
            await new Promise(r => setTimeout(r, 200));
        }
    }
    throw new Error('السيرفر لم يستجب بالوقت المحدد');
}

async function makeTestUser(User, usernameBase, coins) {
    const suffix = Math.random().toString(36).slice(2, 8);
    return User.create({
        customId: `LT${suffix}`,
        username: `${usernameBase}_${suffix}`,
        email: `${usernameBase}_${suffix}@loadtest.local`,
        password: 'LoadTest123!',
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
    console.log('🚀 إقلاع Mongo replica-set حقيقي (مطلوب للمعاملات)...');
    const { MongoMemoryReplSet } = require('mongodb-memory-server');
    const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const mongoUri = replSet.getUri();
    console.log(`✅ Mongo جاهز: ${mongoUri}`);

    console.log('🚀 إقلاع السيرفر الحقيقي (server/server.js) بعملية Node منفصلة...');
    const serverProcess = spawn(process.execPath, [path.join(ROOT, 'server/server.js')], {
        cwd: ROOT,
        env: {
            ...process.env,
            MONGODB_URI: mongoUri,
            JWT_SECRET,
            PORT: String(PORT),
            NODE_ENV: 'test',
            DEBUG_GIFTS: '1',
            ALLOWED_ORIGINS: ''
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    serverProcess.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        if (/DEBUG_GIFTS|MongoDB connected|Server running|❌|⚠️/.test(text)) process.stdout.write(`[server] ${text}`);
    });
    serverProcess.stderr.on('data', (chunk) => process.stderr.write(`[server:err] ${chunk}`));
    serverProcess.on('exit', (code) => {
        if (code !== null && code !== 0) console.error(`[server] خرجت العملية بكود ${code}`);
    });

    await waitForServerReady(`http://127.0.0.1:${PORT}/api/gifts/shop`, 30000);
    console.log('✅ السيرفر يستجب فعلياً');

    console.log('🌱 تهيئة مستخدمي الاختبار + انتظار بذر كتالوج الهدايا التلقائي...');
    await mongoose.connect(mongoUri);
    const User = require(path.join(ROOT, 'server/models/User'));
    const Gift = require(path.join(ROOT, 'server/models/Gift'));

    let gift = null;
    for (let i = 0; i < 100 && !gift; i++) {
        gift = await Gift.findOne({ name: 'وردة' });
        if (!gift) await new Promise(r => setTimeout(r, 100));
    }
    if (!gift) throw new Error('تعذّر العثور على هدية البذر الأساسية (autoSeed) — راجع server/utils/autoSeed.js');

    const [senderA, senderB, recipientC] = await Promise.all([
        makeTestUser(User, 'loadtest_sender_a', INITIAL_COINS),
        makeTestUser(User, 'loadtest_sender_b', INITIAL_COINS),
        makeTestUser(User, 'loadtest_recipient_c', 0)
    ]);

    const tokenA = jwt.sign({ id: senderA._id.toString() }, JWT_SECRET);
    const tokenB = jwt.sign({ id: senderB._id.toString() }, JWT_SECRET);

    console.log('🔌 ربط عميلي Socket.IO حقيقيين...');
    const socketA = ioClient(`http://127.0.0.1:${PORT}`, { auth: { token: tokenA }, transports: ['websocket'] });
    const socketB = ioClient(`http://127.0.0.1:${PORT}`, { auth: { token: tokenB }, transports: ['websocket'] });
    await Promise.all([waitForConnect(socketA, 'A'), waitForConnect(socketB, 'B')]);
    console.log('✅ متصلان');

    const unitPrice = gift.discountedPrice || gift.price;
    const senderObjA = createTestSender(socketA, recipientC._id.toString(), gift._id.toString(), 'A');
    const senderObjB = createTestSender(socketB, recipientC._id.toString(), gift._id.toString(), 'B');

    console.log(`🎯 إمساك الكومبو بمعدّل ${TAPS_PER_SEC} ضغطة/ث لمدة ${DURATION_MS / 1000}ث على العميلين معاً...`);
    const intervalA = setInterval(() => senderObjA.tap(), TAP_INTERVAL_MS);
    const intervalB = setInterval(() => senderObjB.tap(), TAP_INTERVAL_MS);
    await new Promise(r => setTimeout(r, DURATION_MS));
    clearInterval(intervalA);
    clearInterval(intervalB);

    console.log('⏳ استكمال تفريغ أي دفعات معلّقة/قيد الطيران...');
    const drained = await waitForIdle([senderObjA, senderObjB], 20000);

    const statsA = senderObjA.stats();
    const statsB = senderObjB.stats();

    socketA.close();
    socketB.close();

    const freshA = await User.findById(senderA._id);
    const freshB = await User.findById(senderB._id);

    const expectedA = INITIAL_COINS - unitPrice * statsA.totalTapsSettledOk;
    const expectedB = INITIAL_COINS - unitPrice * statsB.totalTapsSettledOk;
    const balanceOkA = freshA.coins === expectedA;
    const balanceOkB = freshB.coins === expectedB;

    // 🛡️ تحقّق صريح (مراجعة أمنية — سجلّ GiftLog هو قيمة المُستلِم الحقيقية القابلة للاستبدال
    // نقداً عبر giftRedemptionController، لا أثراً جانبياً فقط): تحت حمل حقيقي متزامن فعلياً،
    // مجموع GiftLog.totalPrice للمُستلِم يجب أن يُطابق تماماً إجمالي ما خُصم من كلا المُرسِلين —
    // لا سجلّ ناقص (قيمة مفقودة للمُستلِم) ولا زائد (سجلّ مزدوج) تحت أي تزامن/إعادة محاولة فعلية
    const GiftLog = require(path.join(ROOT, 'server/models/GiftLog'));
    const receiverLogs = await GiftLog.find({ receiver: recipientC._id });
    const loggedTotal = receiverLogs.reduce((sum, l) => sum + l.totalPrice, 0);
    const expectedLoggedTotal = unitPrice * (statsA.totalTapsSettledOk + statsB.totalTapsSettledOk);
    const giftLogOk = loggedTotal === expectedLoggedTotal;

    const allLatencies = [...statsA.ackLatencies, ...statsB.ackLatencies];
    const p50 = percentile(allLatencies, 50);
    const p95 = percentile(allLatencies, 95);
    const totalFailedBatches = statsA.failedBatches + statsB.failedBatches;

    console.log('\n================ نتائج اختبار الحمل ================');
    console.log(`تفريغ كامل قبل انتهاء المهلة: ${drained}`);
    console.log(`عميل A — ضغطات مُراكَمة: ${statsA.totalTapsQueued}, استُقرت بنجاح: ${statsA.totalTapsSettledOk}, دفعات فاشلة نهائياً: ${statsA.failedBatches}`);
    console.log(`عميل B — ضغطات مُراكَمة: ${statsB.totalTapsQueued}, استُقرت بنجاح: ${statsB.totalTapsSettledOk}, دفعات فاشلة نهائياً: ${statsB.failedBatches}`);
    console.log(`إجمالي الدفعات الفاشلة: ${totalFailedBatches} (الهدف: 0)`);
    console.log(`رصيد A — المتوقع: ${expectedA}, الفعلي: ${freshA.coins} -> ${balanceOkA ? 'مطابق ✅' : 'غير مطابق ❌'}`);
    console.log(`رصيد B — المتوقع: ${expectedB}, الفعلي: ${freshB.coins} -> ${balanceOkB ? 'مطابق ✅' : 'غير مطابق ❌'}`);
    console.log(`سجلّ GiftLog للمُستلِم (عدد: ${receiverLogs.length}) — المتوقع: ${expectedLoggedTotal}, الفعلي: ${loggedTotal} -> ${giftLogOk ? 'مطابق ✅' : 'غير مطابق ❌'}`);
    console.log(`زمن الـack (ذهاب-إياب من منظور العميل) — p50: ${p50}ms, p95: ${p95}ms, n=${allLatencies.length} (الهدف: p95 < 300ms)`);
    console.log('======================================================\n');

    const pass = drained && totalFailedBatches === 0 && balanceOkA && balanceOkB && giftLogOk && p95 < 300;
    console.log(pass ? '✅ PASS — كل الأهداف تحقّقت (0 دفعات فاشلة، رصيد مطابق تماماً، p95 < 300ms)' : '❌ FAIL — راجع التفاصيل أعلاه');

    await mongoose.disconnect();
    serverProcess.kill();
    await replSet.stop();
    process.exit(pass ? 0 : 1);
}

main().catch((err) => {
    console.error('💥 فشل اختبار الحمل:', err);
    process.exit(1);
});
