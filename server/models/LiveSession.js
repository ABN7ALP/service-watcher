const mongoose = require('mongoose');

// ✅ feat/live-hours-host-center: جلسة بث واحدة لكل "دخول مباشر" حقيقي لمضيف — تُفتَح عند
// host-start-broadcast وتُغلَق عند host-end-broadcast/مكنسة انقطاع المضيف (راجع socketService.js
// endRoomBroadcastForHost/openLiveSession/closeLiveSession). لا يُحسَب شيء من العميل أبداً، فقط
// من تِك دوري بالخادم (runLiveHoursTick) يفحص عدد المستمعين الحقيقيين كل 60 ثانية
// 🛡️ مراجعة #155: qualifiedSeconds هنا يمنع العدّ المزدوج *ضمن نفس التِك* فقط (راجع applyTick
// أدناه) ويُستخدَم لـpeakListeners — مصدر الحقيقة المعروض بمركز المضيف (الساعات يوماً بيوم) هو
// HostDailyStat، تُزاد مباشرة من socketService.js بنفس لحظة التِك لا بيوم بداية هذي الجلسة
const liveSessionSchema = new mongoose.Schema({
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceRoom', required: true, index: true },
    startedAt: { type: Date, required: true, default: Date.now },
    endedAt: { type: Date, default: null },
    // ✅ آخر لحظة أُكِّد فيها فعلياً أن الجلسة لا تزال حيّة (كل تِك ناجح يُحدِّثه) — أساس التعافي
    // من انهيار الخادم (راجع recoverStaleOnBoot): لا نمنح أي وقت لم يُثبَّت بتِك فعلي
    lastTickAt: { type: Date, required: true, default: Date.now },
    qualifiedSeconds: { type: Number, default: 0 },
    peakListeners: { type: Number, default: 0 }
}, { timestamps: true });

// ✅ جلسة مفتوحة واحدة فقط لكل غرفة بأي لحظة — فهرس جزئي فريد (لا قراءة-ثم-إنشاء عرضة للتسابق)
liveSessionSchema.index({ room: 1 }, { unique: true, partialFilterExpression: { endedAt: null } });
liveSessionSchema.index({ host: 1, startedAt: -1 });
liveSessionSchema.index({ endedAt: 1 });

liveSessionSchema.statics.openForRoom = async function (roomId, hostId) {
    const now = new Date();
    try {
        return await this.create({ host: hostId, room: roomId, startedAt: now, lastTickAt: now });
    } catch (error) {
        if (error.code === 11000) return null; // جلسة مفتوحة أصلاً لهذي الغرفة — نداء مكرّر/سباق، يُتجاهَل بأمان
        throw error;
    }
};

liveSessionSchema.statics.closeForRoom = async function (roomId) {
    return this.findOneAndUpdate(
        { room: roomId, endedAt: null },
        { $set: { endedAt: new Date() } },
        { new: true }
    );
};

// 🛡️ مراجعة #154 (بند 1): ادّعاء الدقيقة نفسه ذرّي الآن، لا فقط endedAt:null — lastTickAt ضمن
// شرط الاستعلام نفسه (lastTickAt:null، أو مرّ عليه >= 55 ثانية) يمنع عدّ الدقيقة نفسها مرتين
// حين يتصادف تِكان قريبان جداً من بعضهما زمنياً (تِك الإقلاع الفوري + مؤقّت 60 ثانية بنفس
// العملية، أو تداخل حاوية قديمة/جديدة أثناء إعادة نشر Railway — كلتاهما تكتبان على نفس
// المستند بقاعدة البيانات نفسها). 55 لا 60 ثانية بالضبط = هامش تسامح صغير لتذبذب التوقيت
// الطبيعي (تأخر حلقة الحدث قليلاً) بلا فتح نافذة عدّ مزدوج حقيقية. المستدعي (runLiveHoursTick)
// يعتمد على *نجاح* هذا الادّعاء (قيمة غير null) قبل أن يزيد HostWeeklyStat — فلو رُفض الادّعاء
// هنا (تِك ثانٍ بنفس الدقيقة تقريباً)، لا تُضاف أي ثانية بإحصائية الأسبوع أيضاً
liveSessionSchema.statics.applyTick = async function (sessionId, { qualifies, listenerCount, now }) {
    const MIN_TICK_INTERVAL_MS = 55 * 1000;
    const update = { $set: { lastTickAt: now }, $max: { peakListeners: listenerCount } };
    if (qualifies) update.$inc = { qualifiedSeconds: 60 };
    return this.findOneAndUpdate(
        {
            _id: sessionId,
            endedAt: null,
            $or: [{ lastTickAt: null }, { lastTickAt: { $lte: new Date(now.getTime() - MIN_TICK_INTERVAL_MS) } }]
        },
        update,
        { new: true }
    );
};

// 🛡️ تعافٍ من انهيار الخادم: جلسة بقيت مفتوحة (endedAt:null) من عملية سابقة انهارت/أُعيد
// تشغيلها قبل أن تُغلِقها هي بنفسها (لا host-end-broadcast ولا مكنسة انقطاع وصلت لها أبداً) —
// تُغلَق هنا عند *آخر تِك مؤكَّد فعلياً* (lastTickAt) لا "الآن"، فلا نمنح وقتاً بين آخر تِك
// ناجح وتوقّف العملية لم يُثبَت بتِك فعلي قد يصل لدقيقة كاملة من وقت غير حقيقي بالمسبح
liveSessionSchema.statics.recoverStaleOnBoot = async function () {
    const open = await this.find({ endedAt: null }).select('_id lastTickAt');
    for (const s of open) {
        await this.updateOne({ _id: s._id, endedAt: null }, { $set: { endedAt: s.lastTickAt } });
    }
    return open.length;
};

module.exports = mongoose.model('LiveSession', liveSessionSchema);
