const mongoose = require('mongoose');

// ✅ feat/live-hours-host-center: جلسة بث واحدة لكل "دخول مباشر" حقيقي لمضيف — تُفتَح عند
// host-start-broadcast وتُغلَق عند host-end-broadcast/مكنسة انقطاع المضيف (راجع socketService.js
// endRoomBroadcastForHost/openLiveSession/closeLiveSession). qualifiedSeconds هو مصدر الحقيقة
// الوحيد لساعات مسبح المضيفين الأسبوعي — لا يُحسَب شيء من العميل أبداً، فقط من تِك دوري بالخادم
// (runLiveHoursTick) يفحص عدد المستمعين الحقيقيين كل 60 ثانية (راجع HostWeeklyStat)
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

// ✅ ادّعاء ذرّي واحد لكل تِك — الشرط endedAt:null بالاستعلام نفسه يمنع تطبيق تِك على جلسة
// أُغلقت للتو بنفس اللحظة تقريباً (لا قراءة-ثم-كتابة منفصلتين قد تتسابقان مع closeForRoom)
liveSessionSchema.statics.applyTick = async function (sessionId, { qualifies, listenerCount, now }) {
    const update = { $set: { lastTickAt: now }, $max: { peakListeners: listenerCount } };
    if (qualifies) update.$inc = { qualifiedSeconds: 60 };
    return this.findOneAndUpdate({ _id: sessionId, endedAt: null }, update, { new: true });
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
