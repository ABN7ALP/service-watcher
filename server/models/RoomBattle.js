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
    status: {
        type: String,
        enum: ['pending', 'active', 'ended', 'declined', 'expired', 'cancelled'],
        default: 'pending',
        index: true
    },
    scoreA: { type: Number, default: 0, min: 0 },
    scoreB: { type: Number, default: 0, min: 0 },
    // ✅ نقاط كل داعم (القيمة الحقيقية المُضافة فعلياً للشريط، بعد أي مضاعفة قفاز — هذا تحديداً
    // تصنيف "أكثر ثلاث دعماً لهذا التحدي" وليس سجل كوينز حقيقي، راجع topSupporters أسفله)
    supportersA: { type: Map, of: Number, default: () => new Map() },
    supportersB: { type: Map, of: Number, default: () => new Map() },
    effects: { type: [effectSchema], default: () => [] },
    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    winner: { type: String, enum: ['A', 'B', 'draw', null], default: null },
}, { timestamps: true });

// ✅ يمنع أي غرفة (سواء طرفها A أو B) من الدخول بأكثر من معركة معلّقة/فعلية بنفس الوقت
roomBattleSchema.statics.findOpenForRoom = async function (roomId) {
    return this.findOne({
        $or: [{ roomA: roomId }, { roomB: roomId }],
        status: { $in: ['pending', 'active'] }
    });
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

// ✅ أعلى 3 داعمين لهذا التحدي بصف معيّن — تُستخدم بشريط "أفضل 3 داعمين" أسفل الخط. تُرجع
// فقط المعرّف والنقاط؛ الواجهة تستكمل الاسم/الصورة من قائمة مشاهدي الغرفة المخزّنة لديها محلياً
// بالفعل (لا استعلام قاعدة بيانات إضافي بكل تحديث نقاط — أداء)
roomBattleSchema.methods.topSupporters = function (side, limit = 3) {
    const map = side === 'A' ? this.supportersA : this.supportersB;
    if (!map || map.size === 0) return [];
    return Array.from(map.entries())
        .map(([userId, points]) => ({ userId, points }))
        .sort((a, b) => b.points - a.points)
        .slice(0, limit);
};

module.exports = mongoose.model('RoomBattle', roomBattleSchema);
module.exports.DURATION_PRESETS_SECONDS = DURATION_PRESETS_SECONDS;
module.exports.CHALLENGE_EXPIRY_SECONDS = CHALLENGE_EXPIRY_SECONDS;
module.exports.BATTLE_ITEMS = BATTLE_ITEMS;
