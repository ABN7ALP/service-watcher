const mongoose = require('mongoose');

// 🛡️ fanclub-v2: تقدّم المهام اليومية المحدودة لنادي معجبين — صف واحد لكل (مالك، عضو، يوم
// دمشقي منتصف ليل، راجع server/utils/poolWeek.js getDayStartForDate). يوم جديد = مستند جديد
// تلقائياً (المفتاح الفريد نفسه يضمن ذلك) — لا منطق "تصفير عند حدود اليوم" يمكن أن يُخطئ، بنفس
// فلسفة HostDailyStat/AgentDailyCounter بهذا المشروع بالضبط. كل حقل هنا سقفه الفعلي بشرط
// الاستعلام الذرّي نفسه (findOneAndUpdate)، لا بثقة بقراءة سابقة
const fanClubDailyProgressSchema = new mongoose.Schema({
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    day: { type: Date, required: true, index: true },
    // ✅ رسائل دردشة اليوم بغرفة المالك — عند بلوغ 3 تُمنَح مكافأة ثابتة (chatBonusAwarded)
    chatMsgCount: { type: Number, default: 0, min: 0 },
    chatBonusAwarded: { type: Boolean, default: false },
    // ✅ تسجيل الحضور اليدوي — مرة واحدة باليوم
    checkinAwarded: { type: Boolean, default: false },
    // ✅ دقائق استماع مؤهّلة اليوم بغرفة المالك المباشرة — تُزاد من تِك ساعات البث الدوري نفسه
    // (socketService.js runLiveHoursTick)، بشرط <30 بالاستعلام الذرّي نفسه (لا سقف "تقريبي")
    listenMinutes: { type: Number, default: 0, min: 0, max: 30 }
}, { timestamps: true });

fanClubDailyProgressSchema.index({ owner: 1, member: 1, day: 1 }, { unique: true });

module.exports = mongoose.model('FanClubDailyProgress', fanClubDailyProgressSchema);
