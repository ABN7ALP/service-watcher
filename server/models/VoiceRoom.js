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

// ✅ يحرر أي مقعد يشغله هذا المستخدم فعلياً (بحسب قاعدة البيانات وحدها، لا ذاكرة الاتصال)
// يُرجع { seatNumber, wasMuted } ليُبَث للجميع ولترحيل حالة الكتم عند التبديل بين مقعدين،
// أو null لو لم يكن قاعداً أصلاً على أي مقعد.
// هذا هو المرجع الوحيد المستخدم بكل عمليات التحرير (انضمام لمقعد جديد / مغادرة / انقطاع اتصال)
// لضمان عدم بقاء "أشباح" مقاعد بعد إعادة اتصال أو تحديث الصفحة.
voiceRoomSchema.statics.releaseUserSeat = async function (userId) {
    const room = await this.findOne(
        { slug: 'main', 'seats.user': userId },
        { 'seats.$': 1 }
    );
    if (!room || !room.seats.length) return null; // لم يكن قاعداً على أي مقعد أصلاً

    const seatNumber = room.seats[0].seatNumber;
    const wasMuted = !!room.seats[0].isMuted;

    await this.updateOne(
        { slug: 'main' },
        { $set: { 'seats.$[old].user': null, 'seats.$[old].joinedAt': null, 'seats.$[old].isMuted': false } },
        { arrayFilters: [{ 'old.user': userId }] }
    );

    return { seatNumber, wasMuted };
};

module.exports = mongoose.model('VoiceRoom', voiceRoomSchema);
