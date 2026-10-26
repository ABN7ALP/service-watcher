require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const setupMiddleware = require('./middleware/globalMiddleware');
const setupErrorHandlers = require('./middleware/errorHandlers');
const initializeSocket = require('./services/socketService');
 
// --- تهيئة التطبيق والخادم ---
const app = express();
const server = http.createServer(app);

// --- إعدادات أساسية ---
// 🛡️ إصلاح جذري (مراجعة أمنية — redteam-audit-1، البند #4): كانت 1 ثابتة دوماً — تجعل
// Express يثق بآخر قيمة X-Forwarded-For كعنوان العميل الحقيقي حتى بلا أي خادم وكيل حقيقي
// أمامها فعلياً يُعيد كتابة هذا الرأس. أُثبِت فعلياً: 520 طلباً بقيمة X-Forwarded-For مزوَّرة
// مختلفة كل مرة لم تُصطَد بمحدد المعدل العام/تسجيل الدخول/التسجيل إطلاقاً (كلها مفاتيحها من
// req.ip) — تجاوز كامل لحماية مكافحة التخمين/إنشاء حسابات جماعية.
//
// 🛡️ تصحيح لاحق (مراجعة PR #111 — BLOCKER حقيقي رصده المُراجِع): الإصلاح الأصلي جعل false
// الافتراضي دوماً بلا TRUST_PROXY صريح — لكن الإنتاج الفعلي يعمل على Railway خلف وكيلها
// الحقيقي (edge proxy) دوماً. false هناك يعني req.ip = عنوان Railway الداخلي نفسه لكل
// المستخدمين جميعاً بلا استثناء — فكل محددات المعدل (العام/الدخول/التسجيل) تتقاسم دلواً واحداً
// فعلياً: محاولات دخول فاشلة من مستخدم واحد تُقفِل الموقع كاملاً لكل المستخدمين بضع دقائق فقط.
// resolveTrustProxySetting تكتشف الآن Railway تلقائياً (RAILWAY_ENVIRONMENT/RAILWAY_PROJECT_ID
// مُضبوطتان تلقائياً بكل بيئة Railway حقيقية) وتفترض 1 (قفزة وكيل حقيقية واحدة تُعيد كتابة
// X-Forwarded-For بنفسها فعلياً) — TRUST_PROXY الصريح يبقى له الأولوية دوماً فوق هذا الاكتشاف
const { resolveTrustProxySetting, isRailwayEnvironment } = require('./utils/trustProxy');
const trustProxySetting = resolveTrustProxySetting(process.env);
app.set('trust proxy', trustProxySetting);
console.log(`🔒 trust proxy = ${JSON.stringify(trustProxySetting)}${
    process.env.TRUST_PROXY ? ' (من متغيّر البيئة TRUST_PROXY)' :
    isRailwayEnvironment(process.env) ? ' (اكتُشفت بيئة Railway تلقائياً)' :
    ' (لا TRUST_PROXY ولا بيئة Railway — افتراضي آمن)'
}`);

// --- تطبيق الـ Middleware العام ---
setupMiddleware(app);


// --- تهيئة وتشغيل Socket.IO ---
const io = initializeSocket(server);
// ✅ مهمة دورية لإنهاء الإطارات المنتهية تلقائياً
const { startFrameExpiryJob } = require('./utils/frameExpiryJob');
startFrameExpiryJob(io);
app.set('socketio', io);
app.use((req, res, next) => {
    req.io = io;
    next();
});



// --- خدمة الملفات الثابتة للواجهة الأمامية ---
// يخدم ملفات مثل style.css, app.js من مجلد dist و public
app.use(express.static(path.join(__dirname, '../public')));
app.use('/dist', express.static(path.join(__dirname, '../public/dist')));


// --- مسارات API ---
app.use('/api/auth', require('./routes/authRoutes')); // ✅ أضف هذا السطر
app.use('/api/messages', require('./routes/messageRoutes')); // ✅ أضف هذا السطر
app.use('/api/users', require('./routes/userRoutes')); // ✅✅ أضف هذا السطر
app.use('/api/friends', require('./routes/friendRoutes')); // ✅✅ أضف هذا السطر
app.use('/api/blocks', require('./routes/blockRoutes')); // ✅ أضف هذا السطر
app.use('/api/private-chat', require('./routes/privateChatRoutes')); // ⭐ الجديد
app.use('/api/chat-media', require('./routes/chatMediaRoutes')); // ⭐ الجديد
app.use('/api/admin', require('./routes/admin')); // ✅ لوحة التحكم
app.use('/api/frames', require('./routes/frameRoutes')); // ✅ سنضيفها بالفقرة 6
app.use('/api/gifts', require('./routes/giftRoutes')); // ✅ نظام الهدايا والمتصدرين
app.use('/api/fanclub', require('./routes/fanClubRoutes')); // ✅ نظام نادي المعجبين
app.use('/api/withdrawals', require('./routes/withdrawalRoutes'));
app.use('/api/voice-room', require('./routes/voiceRoomRoutes')); // ✅ حالة مقاعد الغرفة الصوتية
app.use('/api/pk-league', require('./routes/pkLeagueRoutes')); // ✅ دوري PK الأسبوعي (ترتيب/غرفتي/مواجهات)
app.use('/api/coin-purchase', require('./routes/coinPurchaseRoutes')); // ✅ نظام شراء الكوينزات
app.use('/api/bubble-skins', require('./routes/bubbleSkinRoutes'));
app.use('/api/gift-redemption', require('./routes/giftRedemptionRoutes'));
app.use('/api/deposits', require('./routes/depositRoutes')); // ✅ نظام شحن الرصيد الدولاري (منفصل عن الكوينز)
app.use('/api/reports', require('./routes/reportRoutes')); // ✅ نظام البلاغات
app.use('/api/support', require('./routes/supportRoutes')); // ✅ نظام الدعم الفني والاستئناف
app.use('/api/music', require('./routes/musicRoutes')); // ✅ مكتبة أغاني مشتركة للغرف الصوتية
app.use('/api/suggestions', require('./routes/suggestionRoutes')); // ✅ صندوق اقتراحات/ملاحظات عام
app.use('/api/client-errors', require('./routes/clientErrorRoutes')); // ✅ أخطاء الواجهة التي يواجهها المستخدمون -> لوحة التحكم
app.use('/api/client-compat', require('./routes/clientCompatRoutes')); // ✅ room-ux-v2 بند 5: عدّاد مجهول لمتصفحات لا تدعم الميزات الحرجة -> لوحة التحكم


// --- مسار "التقاط الكل" لخدمة الواجهة الأمامية --
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html')); 
});

// --- معالجة الأخطاء (يجب أن يكون آخر middleware) ---
setupErrorHandlers(app);

// --- الاتصال بقاعدة البيانات ---
mongoose.connect(process.env.MONGODB_URI)
        .then(async () => {
        console.log('✅ MongoDB connected successfully.');
        await require('./utils/autoSeed')();
        // 🛡️ دفتر الأستاذ (feat/wallet-ledger-v1): إعادة تسمية العملة ×10 — مرّة واحدة للأبد
        // (ادّعاء JobRun ذرّي يحميها من التكرار حتى مع تعدّد نسخ الخادم)، قبل أي مهمة أخرى
        // تمنح/تخصم كوينز (موسم PK، إطار نادي المعجبين الأسبوعي) كي تعمل كل المهام اللاحقة
        // على المقياس الجديد مباشرة
        await require('./utils/walletRedenominationMigration').runMigration({ dryRun: false });
        require('./utils/mediaCleanupJob').startMediaCleanupJob(); // ✅ حذف تلقائي كل 24 ساعة (رسائل + وسائط Cloudinary)
        require('./utils/fanClubWeeklyFrameJob').startFanClubWeeklyFrameJob(io); // ✅ منح إطار المساهم لفائزي الأسبوع تلقائياً
        require('./utils/pkSeasonCloseJob').startPkSeasonCloseJob(io); // ✅ إغلاق موسم دوري PK الأسبوعي + منح مكافآت المراكز تلقائياً
        require('./utils/dependencyHealthJob').startDependencyHealthJob(); // ✅ فحص صحة الاعتماديات (outdated/audit) — مؤجَّل دقيقتين عند الإقلاع ثم يومياً
        // ✅ استوديو الإطارات: تهيئة idempotent — تملأ assetUrl/staticUrl/display الناقصة فقط
        // (الإطارات الـ11 الأصلية من frame-display.json)، بلا لمس أي إطار عدَّله الأدمن مسبقاً
        await require('./models/ProfileFrame').seedDisplayDefaults();
        // ✅ إصلاح فهرس slug القديم قبل أي شيء (يمنع خطأ E11000 عند إنشاء غرف جديدة)
        await require('./models/VoiceRoom').fixSlugIndex();
        // ✅ تنظيف أي مقاعد صوتية مكررة تراكمت قبل إصلاح القفل التسلسلي (مرة واحدة عند كل إقلاع، آمنة تماماً)
        await require('./models/VoiceRoom').deduplicateSeats();
    })
    .catch(err => console.error('❌ MongoDB connection error:', err));

// --- تشغيل الخادم ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// --- معالجة الأخطاء غير المتوقعة ---
// 🐛 إصلاح جوهري لعلّة "الموقع يتوقف بالكامل 30-60 ثانية أحياناً": كان أي وعد (Promise)
// مرفوض بلا معالجة بأي مكان بالتطبيق (حتى خطأ بسيط بطلب واحد من مستخدم واحد، مثل قراءة
// حقل من مستند لم يُملأ/populate بشكل متوقع) يوقف الخادم بأكمله فوراً (server.close +
// process.exit) — لكل المستخدمين، كل الغرف، كل البثوث المباشرة دفعة واحدة، لحين إعادة
// تشغيل المنصة المستضيفة للعملية (Railway/PM2...) تلقائياً — وهذا ما يفسّر التعطّل الكامل
// المتكرر لدقيقة تقريباً. هذا النمط ("crash on any unhandled rejection") مناسب لسكربتات
// قصيرة العمر، لكنه هش جداً لسيرفر Socket.IO حيّ يخدم عشرات الغرف والمستخدمين المتزامنين
// بآن واحد — خطأ منعزل بطلب هدية واحد مثلاً لا يجب أن يُسقط الجميع. الحل: تسجيل الخطأ
// بوضوح بالسجلات للتشخيص، دون إيقاف الخدمة — بقية الغرف/المستخدمين يستمرون بلا انقطاع.
process.on('unhandledRejection', (err) => {
    console.error('⚠️ UNHANDLED REJECTION (تم تسجيله، الخادم مستمر بالعمل):');
    console.error(err?.stack || err);
});

// ✅ نفس المنطق لأي استثناء متزامن غير مُمسوك بالكامل — يُسجَّل بوضوح دون إسقاط الخدمة بأكملها
process.on('uncaughtException', (err) => {
    console.error('⚠️ UNCAUGHT EXCEPTION (تم تسجيله، الخادم مستمر بالعمل):');
    console.error(err?.stack || err);
});
