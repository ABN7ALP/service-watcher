const mongoose = require('mongoose');

// =====================================================
// ✅ نظام الغرفة الصوتية — حالة حقيقية بقاعدة البيانات
// -----------------------------------------------------
// حالياً: غرفة واحدة ثابتة (slug: 'main') بديلاً عن الاعتماد الكامل
// على أحداث Socket فقط (كانت الحالة السابقة بلا أي مصدر حقيقة موثوق:
// لا قاعدة بيانات، ولا "لقطة حالة" عند الدخول — أي مستخدم يفتح التطبيق
// بعد أن يكون آخرون قد جلسوا لا يرى شيئاً حتى يغادروا وينضموا من جديد).
//
// مصمم من الآن ليكون الأساس لنظام "غرف متعددة" لاحقاً: كل ما يلزم وقتها
// هو السماح بعدة مستندات (documents) بدل مستند واحد بـ slug: 'main'،
// دون تغيير شكل البيانات نفسه.
// =====================================================

const seatSchema = new mongoose.Schema({
    seatNumber: { type: Number, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    isMuted: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false }, // يمنع الجلوس عليه (تحكم إداري/مضيف)
    joinedAt: { type: Date, default: null }
}, { _id: false });

const voiceRoomSchema = new mongoose.Schema({
    slug: { type: String, required: true, unique: true, default: 'main' },
    name: { type: String, default: 'الغرفة الرئيسية' },
    seatCount: { type: Number, default: 80 },
    adminSeatCount: { type: Number, default: 5 }, // أول N مقعد محجوز حصرياً للإدارة
    seats: [seatSchema],
}, { timestamps: true });

// ✅ يضمن وجود الغرفة الرئيسية دائماً، وينشئها تلقائياً بمقاعدها أول مرة فقط
voiceRoomSchema.statics.getMainRoom = async function () {
    let room = await this.findOne({ slug: 'main' });
    if (room) return room;

    const seats = [];
    for (let i = 1; i <= 80; i++) seats.push({ seatNumber: i });

    try {
        room = await this.create({ slug: 'main', seats });
    } catch (err) {
        // ✅ حماية من تصادم إنشاء مزدوج لو وصلت طلبات متزامنة لحظة أول تشغيل للسيرفر
        if (err.code === 11000) {
            room = await this.findOne({ slug: 'main' });
        } else {
            throw err;
        }
    }
    return room;
};

// ✅ يحرر كل المقاعد التي يشغلها هذا المستخدم فعلياً (بحسب قاعدة البيانات وحدها، لا ذاكرة الاتصال)
// — عادة مقعد واحد فقط، لكن لو حصل ازدواج (تصادم طلبات متزامنة) يحررهم كلهم ويبلغ عنهم كلهم،
// فيصحح نفسه تلقائياً بمجرد أي حركة جديدة للمستخدم المتضرر.
// يُرجع مصفوفة [{ seatNumber, wasMuted }, ...] (فاضية لو لم يكن قاعداً على أي مقعد أصلاً).
voiceRoomSchema.statics.releaseUserSeat = async function (userId) {
    const room = await this.findOne({ slug: 'main', 'seats.user': userId });
    if (!room) return [];

    const occupied = room.seats.filter(s => s.user && s.user.toString() === userId.toString());
    if (!occupied.length) return [];

    await this.updateOne(
        { slug: 'main' },
        { $set: { 'seats.$[old].user': null, 'seats.$[old].joinedAt': null, 'seats.$[old].isMuted': false } },
        { arrayFilters: [{ 'old.user': userId }] }
    );

    return occupied.map(s => ({ seatNumber: s.seatNumber, wasMuted: !!s.isMuted }));
};

// ✅ تنظيف شامل لمرة واحدة عند إقلاع السيرفر: يزيل أي ازدواج قديم متراكم بقاعدة البيانات
// (مستخدم واحد ظاهر على أكثر من مقعد بنفس اللحظة) من فترة ما قبل إصلاح القفل أدناه —
// يُبقي فقط أحدث مقعد انضم له كل مستخدم (بحسب joinedAt) ويُفرغ الباقي.
voiceRoomSchema.statics.deduplicateSeats = async function () {
    const room = await this.getMainRoom();
    const seatsByUser = new Map();
    room.seats.forEach(s => {
        if (!s.user) return;
        const key = s.user.toString();
        if (!seatsByUser.has(key)) seatsByUser.set(key, []);
        seatsByUser.get(key).push(s);
    });

    let clearedCount = 0;
    for (const [, userSeats] of seatsByUser) {
        if (userSeats.length <= 1) continue;
        // أبقِ الأحدث انضماماً فقط، حرر البقية
        userSeats.sort((a, b) => new Date(b.joinedAt || 0) - new Date(a.joinedAt || 0));
        const toClear = userSeats.slice(1);
        for (const seat of toClear) {
            seat.user = null;
            seat.joinedAt = null;
            seat.isMuted = false;
            clearedCount++;
        }
    }

    if (clearedCount > 0) {
        await room.save();
        console.log(`[VOICE ROOM] تم تنظيف ${clearedCount} مقعد مكرر عند الإقلاع`);
    }
    return clearedCount;
};

module.exports = mongoose.model('VoiceRoom', voiceRoomSchema);
