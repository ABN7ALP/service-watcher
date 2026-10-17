const mongoose = require('mongoose');

// =====================================================
// ✅ معركة PK بين غرفتين — التحدي بمرحلتين: طلب معلّق (pending) بانتظار رد مضيف الغرفة
// الأخرى، ثم معركة فعلية (active) لمدة محددة تُحسب فيها قيمة الهدايا المُرسلة داخل كل
// غرفة كنقاط لصفّها. المستند هو مصدر الحقيقة الوحيد (لا حالة بالذاكرة) حتى تصمد
// المعركة لو أعاد أحد فتح الغرفة أو أعاد تحميل الصفحة أثناءها.
//
// ✅ "متجر أدوات المعركة" (قفاز/ضباب) — نفس فلسفة المستند-كمصدر-حقيقة: كل رمية تُسجَّل في
// `effects[]` بدل حالة بالذاكرة، فتصمد لو أعاد أحد تحميل الصفحة أثناء نافذة التأثير. القفاز
// يرفع مضاعف نقاط صفّه على "الشريط" فقط لـ15 ثانية (راجع battleMultiplier) — لا يمسّ القيمة
// الحقيقية للهدية (الكوينز/نقاط الدعم) أبداً، تلك تُحسَب دوماً بالقيمة الأصلية في الاستدعاء
// الذي يُنتج scoreA/scoreB (راجع giftController.applyGiftToActiveBattle). الضباب يُخفي رقم
// صفّه عن الجمهور المنافس فقط (راجع buildAudiencePayload) بينما يبقى حقيقياً بالمستند نفسه.
// =====================================================

const DURATION_PRESETS_SECONDS = [180, 300, 600]; // 3 / 5 / 10 دقائق
const CHALLENGE_EXPIRY_SECONDS = 30;

// ✅ تعريف أدوات متجر المعركة بمكان واحد — نفس القيم يستهلكها الخادم (تحقق السعر/المدة) والعميل
// (عرض السعر/عدّاد التنازل) عبر /api الوصفي، فلا يمكن لعميل مُعدَّل إرسال سعر أو مدة مختلفة
const BATTLE_ITEMS = {
    glove: { price: 3, durationSeconds: 15 }, // ✅ يضاعف نقاط صفّ الرامي على الشريط فقط لمدته
    fog: { price: 4, durationSeconds: 12 }    // ✅ يُخفي رقم صفّ الرامي عن جمهور الغرفة الخصم لمدته
};

const effectSchema = new mongoose.Schema({
    type: { type: String, enum: ['glove', 'fog'], required: true },
    side: { type: String, enum: ['A', 'B'], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, default: '' }, // ✅ مُجمَّد وقت الرمية — يمنع استعلام إضافي بكل بثّ
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true }
}, { _id: false });

const roomBattleSchema = new mongoose.Schema({
    roomA: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceRoom', required: true, index: true },
    roomB: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceRoom', required: true, index: true },
    challengedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // مضيف roomA دائماً
    durationSeconds: { type: Number, enum: DURATION_PRESETS_SECONDS, required: true },
    // ✅ 'finalizing' حالة انتقالية ذرّية بين active وended — مرحلة أولى من إنهاء بمرحلتين
    // idempotent (راجع finalizeActiveBattle بـsocketService.js): الادّعاء الذرّي لهذي الحالة
    // بعينها هو ما يمنع تكرار الإنهاء حتى مع عدة نسخ خادم أو نداءات متزامنة لنفس المعركة
    status: {
        type: String,
        enum: ['pending', 'active', 'finalizing', 'ended', 'declined', 'expired', 'cancelled'],
        default: 'pending',
        index: true
    },
    // ✅ وقت آخر ادّعاء لمرحلة finalizing — تُستخدَم فقط لاكتشاف ادّعاء "علق" (تعطّل الخادم
    // أثناء الحساب قبل الوصول لـstatus:'ended') فتُعاد المحاولة له بعد مهلة قصيرة، بدل أن
    // يبقى معلّقاً للأبد لمجرد أن حالته ليست 'active' فتتخطّاه المكنسة
    finalizingAt: { type: Date, default: null },
    // ✅ 🛡️ حمولتا pk:result الجاهزتان (بمنظور كل غرفة) محفوظتان دائماً بالمستند نفسه فور
    // الحسم — مصدر الحقيقة لمسار GET /api/voice-room/pk/:battleId/result (من فاته بثّ
    // socket لحظة انتهاء المعركة يسترجعها هنا بلا أي إعادة حساب، فلا تضارب بين ما استُقبِل
    // لحظياً وما يُسترجَع لاحقاً أبداً)
    resultA: { type: mongoose.Schema.Types.Mixed, default: null },
    resultB: { type: mongoose.Schema.Types.Mixed, default: null },
    finalizedAt: { type: Date, default: null },
    scoreA: { type: Number, default: 0, min: 0 },
    scoreB: { type: Number, default: 0, min: 0 },
    // ✅ 🛡️ الدعم الحقيقي البحت (قبل أي مضاعفة قفاز) لكل صفّ — مصدر الحقيقة الوحيد لأي نظام
    // تصنيف/ترتيب يُبنى على هذي المعركة (كدوري PK الأسبوعي)، كي لا تتسرّب إليه قيمة القفاز
    // الوهمية أبداً، تماماً كما لا تتسرّب للكوينز أو نقاط دعم الغرفة (راجع applyGiftToActiveBattle)
    realSupportA: { type: Number, default: 0, min: 0 },
    realSupportB: { type: Number, default: 0, min: 0 },
    // ✅ نقاط كل داعم (القيمة المُضافة فعلياً للشريط، بعد أي مضاعفة قفاز — تصنيف "أفضل 3 داعمين
    // لهذا التحدي" تحديداً، حماس لحظي لا كوينز حقيقية) + هويته مُجمَّدة وقت كل هدية (username/
    // profileImage) بنفس أسلوب VoiceRoom.sessionSupporters بالضبط — بثّها مباشرة لكل الجمهور
    // بدل الاعتماد على ذاكرة العميل المحلية (كانت السبب: الداعم يظهر فقط لمن رآه بصفحته هو تحديداً)
    supportersA: { type: Map, of: mongoose.Schema.Types.Mixed, default: () => new Map() },
    supportersB: { type: Map, of: mongoose.Schema.Types.Mixed, default: () => new Map() },
    effects: { type: [effectSchema], default: () => [] },
    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    winner: { type: String, enum: ['A', 'B', 'draw', null], default: null },
    // ✅ إحصاءات زينة لنافذة النتيجة (عدد الهدايا الحقيقي + أعلى كومبو رُمي بدفعة واحدة) —
    // راجع giftController.applyGiftToActiveBattle لمكان تحديثها بالضبط
    totalGiftUnits: { type: Number, default: 0, min: 0 },
    highestCombo: { type: Number, default: 0, min: 0 },
    // ✅ 🛡️ علم تسوية دوري PK — ذرّي ومنفصل تماماً عن status/winner: يضمن استحالة احتساب
    // نقاط الدوري مرتين لنفس المعركة حتى لو استُدعي finalizeActiveBattle أكثر من مرة (طلب
    // صريح: idempotent بمعرّف التحدي) — راجع pkLeagueEngine.settleBattle
    lpSettled: { type: Boolean, default: false },
    // ✅ هل احتُسبت نقاط الدوري فعلياً لهذي المعركة بعد اجتياز مكافحة التلاعب؟ + السبب لو لا،
    // ليُراجعها فريق الإدارة لاحقاً (طلب صريح: "سجّل حالات الاشتباه للإدارة")
    lpCounted: { type: Boolean, default: null },
    lpSkippedReason: { type: String, default: null },
    // ✅ 🛡️ عدد محاولات إعادة تسوية الدوري بعد فشل أول محاولة (طلب صريح بمراجعة PR) — تزيد
    // بمهمة retryFailedLeagueSettlements الدورية بـsocketService.js فقط (كل دقيقة)، بسقف 5
    // محاولات إجمالاً كي لا تُحاوَل معركة فاشلة بشكل دائم (مثلاً: غرفة محذوفة) للأبد
    settleAttempts: { type: Number, default: 0 }
}, { timestamps: true });

// ✅ يمنع أي غرفة (سواء طرفها A أو B) من الدخول بأكثر من معركة معلّقة/فعلية بنفس الوقت
roomBattleSchema.statics.findOpenForRoom = async function (roomId) {
    return this.findOne({
        $or: [{ roomA: roomId }, { roomB: roomId }],
        status: { $in: ['pending', 'active'] }
    });
};

// ✅ آخر معركة انتهت لهذي الغرفة خلال نافذة زمنية قصيرة (افتراضياً 60 ثانية) — يستخدمها
// join-room-chat/إعادة الاتصال لإرسال النتيجة لمن فاته بثّ pk:result اللحظي (طلب صريح)
roomBattleSchema.statics.findRecentlyEndedForRoom = async function (roomId, windowMs = 60000) {
    return this.findOne({
        $or: [{ roomA: roomId }, { roomB: roomId }],
        status: 'ended',
        finalizedAt: { $gte: new Date(Date.now() - windowMs) }
    }).sort({ finalizedAt: -1 });
};

// ✅ يجلب المعركة النشطة/المعلّقة الحالية لغرفة معينة، مع بيانات الغرفتين لعرضها بالواجهة
roomBattleSchema.statics.getOpenForRoomPopulated = async function (roomId) {
    return this.findOne({
        $or: [{ roomA: roomId }, { roomB: roomId }],
        status: { $in: ['pending', 'active'] }
    })
        .populate('roomA', 'name coverImage')
        .populate('roomB', 'name coverImage');
};

// ✅ آخر تأثير فعّال (لم تنتهِ مدته) من نوع معيّن لصفّ معيّن — يُستخدم لتحديد المضاعف وعرض عدّاد التنازل
roomBattleSchema.methods.activeEffect = function (side, type) {
    const now = Date.now();
    let latest = null;
    for (const e of this.effects) {
        if (e.side === side && e.type === type && new Date(e.expiresAt).getTime() > now) {
            if (!latest || new Date(e.expiresAt).getTime() > new Date(latest.expiresAt).getTime()) latest = e;
        }
    }
    return latest;
};

// ✅ هل لهذا المستخدم بعينه رمية (قفاز أو ضباب) فعّالة لم تنتهِ مدتها؟ — شرط منع إعادة الرمي
roomBattleSchema.methods.userActiveThrow = function (userId) {
    const now = Date.now();
    const uid = userId.toString();
    let latest = null;
    for (const e of this.effects) {
        if (e.user.toString() === uid && new Date(e.expiresAt).getTime() > now) {
            if (!latest || new Date(e.expiresAt).getTime() > new Date(latest.expiresAt).getTime()) latest = e;
        }
    }
    return latest;
};

// ✅ مضاعف نقاط "الشريط" فقط لهذا الصف الآن — 2 لو قفاز فعّال، وإلا 1. لا علاقة له بالكوينز
// الحقيقية أو نقاط الدعم أبداً (تلك تُحسب دوماً بالقيمة الأصلية في المتصل، راجع التعليق أعلى الملف)
roomBattleSchema.methods.battleMultiplier = function (side) {
    return this.activeEffect(side, 'glove') ? 2 : 1;
};

// ✅ يبني اللقطة التي يراها جمهور غرفة معيّنة — إن كان الصف الآخر قد رمى ضباباً فعّالاً، يُخفي
// رقمه الحقيقي عن هذا الجمهور تحديداً (يبقى ظاهراً لجمهور صفّه هو نفسه). التعتيم من الخادم لا
// الواجهة فقط — القيمة الحقيقية لا تُرسَل أصلاً لمن يُفترض ألا يراها، وليس مجرد إخفاء عرضي
roomBattleSchema.methods.buildAudiencePayload = function (audienceSide) {
    const fogA = this.activeEffect('A', 'fog');
    const fogB = this.activeEffect('B', 'fog');
    const hideAFromAudience = !!fogA && audienceSide !== 'A';
    const hideBFromAudience = !!fogB && audienceSide !== 'B';
    return {
        scoreA: hideAFromAudience ? null : this.scoreA,
        scoreB: hideBFromAudience ? null : this.scoreB,
        fogged: { A: hideAFromAudience, B: hideBFromAudience }
    };
};

// ✅ أعلى 3 داعمين لهذا التحدي بصف معيّن — تُستخدم بشريط "أفضل 3 داعمين" أسفل الخط ونافذة
// النتيجة. تُرجع الهوية الكاملة (username/profileImage المُجمَّدين وقت الهدية + activeFrameClass
// حيّ) مباشرة من الخادم — بلا أي اعتماد على ما قد يكون العميل رآه أو لم يره من قبل، فيظهر
// الداعم لكل الجمهور لا لمن صادف أن لديه بياناته محليّاً فقط (نفس أسلوب VoiceRoom.topSupportersFromMap)
roomBattleSchema.methods.topSupporters = async function (side, limit = 3) {
    const map = side === 'A' ? this.supportersA : this.supportersB;
    if (!map || map.size === 0) return [];
    const top = Array.from(map.entries())
        .map(([userId, data]) => ({
            userId,
            username: data?.username || '',
            profileImage: data?.profileImage || '',
            points: data?.points || 0
        }))
        .sort((a, b) => b.points - a.points)
        .slice(0, limit);
    if (top.length === 0) return top;
    const User = require('./User');
    const liveUsers = await User.find({ _id: { $in: top.map(s => s.userId) } }).select('activeFrameClass').lean();
    const frameByUserId = new Map(liveUsers.map(u => [u._id.toString(), u.activeFrameClass || '']));
    return top.map(s => ({ ...s, activeFrameClass: frameByUserId.get(s.userId) || '' }));
};

module.exports = mongoose.model('RoomBattle', roomBattleSchema);
module.exports.DURATION_PRESETS_SECONDS = DURATION_PRESETS_SECONDS;
module.exports.CHALLENGE_EXPIRY_SECONDS = CHALLENGE_EXPIRY_SECONDS;
module.exports.BATTLE_ITEMS = BATTLE_ITEMS;
