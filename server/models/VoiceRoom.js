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
    // فقط الغرفة الرسمية (main) تستخدم هذا الحقل — بقية الغرف بدونه (sparse يسمح بتكرار "بدون قيمة")
    slug: { type: String, unique: true, sparse: true },
    name: { type: String, default: 'غرفة صوتية', maxlength: 40 },
    description: { type: String, default: '', maxlength: 120 },
    coverImage: { type: String, default: null },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true }, // null = الغرفة الرسمية
    category: { type: String, enum: ['chat', 'games', 'music', 'dating'], default: 'chat' },
    isOfficial: { type: Boolean, default: false },
    isPrivate: { type: Boolean, default: false },
    password: { type: String, select: false }, // 🛡️ لا يُرجَع أبداً إلا بطلب صريح select('+password')
    seatCount: { type: Number, enum: [8, 15, 24, 80], default: 80 },
    adminSeatCount: { type: Number, default: 5 }, // أول N مقعد محجوز حصرياً للإدارة (0 بالغرف العادية)
    seats: [seatSchema],
    status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },
    lastActivityAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

// ✅ يضمن وجود الغرفة الرئيسية دائماً، وينشئها تلقائياً بمقاعدها أول مرة فقط
voiceRoomSchema.statics.getMainRoom = async function () {
    let room = await this.findOne({ slug: 'main' });
    if (room) {
        // ✅ ترقية تلقائية للمستند القديم (من قبل إضافة نظام الغرف المتعددة) بالحقول الجديدة —
        // مرة واحدة فقط، ذاتية الإصلاح، لا تحتاج أي تدخل يدوي بقاعدة البيانات
        if (!room.isOfficial) {
            room.isOfficial = true;
            room.name = 'الغرفة الرسمية';
            room.category = 'chat';
            room.lastActivityAt = new Date();
            await room.save();
        }
        return room;
    }

    const seats = [];
    for (let i = 1; i <= 80; i++) seats.push({ seatNumber: i });

    try {
        room = await this.create({ slug: 'main', name: 'الغرفة الرسمية', isOfficial: true, category: 'chat', seats });
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

// ✅ إنشاء غرفة صوتية جديدة يملكها مستخدم (نظام الغرف المتعددة)
voiceRoomSchema.statics.createRoom = async function ({ hostId, name, description, coverImage, category, seatCount, isPrivate, password }) {
    const seats = [];
    for (let i = 1; i <= seatCount; i++) seats.push({ seatNumber: i });

    return this.create({
        name,
        description: description || '',
        coverImage: coverImage || null,
        host: hostId,
        category,
        seatCount,
        adminSeatCount: 0, // الغرف العادية بدون مقاعد إدارة محجوزة
        isOfficial: false,
        isPrivate: !!isPrivate,
        password: isPrivate ? password : undefined,
        seats,
        status: 'active',
        lastActivityAt: new Date()
    });
};

// ✅ قائمة الغرف للتصفح (الرسمية + كل غرف المستخدمين) — لا تُرجع كلمة المرور أبداً،
// ولا مصفوفة المقاعد كاملة (ثقيلة وغير لازمة لقائمة التصفح، فقط عدد الشاغلين الحالي)
voiceRoomSchema.statics.listRooms = async function ({ search, sort = 'newest', page = 1, limit = 20 } = {}) {
    const query = { status: 'active' };
    if (search && search.trim()) {
        query.name = { $regex: search.trim().slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }

    const sortMap = {
        newest: { isOfficial: -1, createdAt: -1 },
        active: { isOfficial: -1, lastActivityAt: -1 },
    };

    const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50); // ✅ سقف أقصى يمنع طلب كميات ضخمة دفعة واحدة
    const safePage = Math.max(parseInt(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [rooms, total] = await Promise.all([
        this.find(query)
            .select('-password -seats')
            .populate('host', 'username profileImage')
            .sort(sortMap[sort] || sortMap.newest)
            .skip(skip)
            .limit(safeLimit)
            .lean(),
        this.countDocuments(query)
    ]);

    // ✅ عدد الشاغلين الفعلي محسوب مباشرة بقاعدة البيانات بدون تحميل مصفوفة المقاعد كاملة للقائمة
    const roomIds = rooms.map(r => r._id);
    const occupancy = roomIds.length ? await this.aggregate([
        { $match: { _id: { $in: roomIds } } },
        { $project: { occupied: { $size: { $filter: { input: '$seats', cond: { $ne: ['$$this.user', null] } } } } } }
    ]) : [];
    const occupancyMap = new Map(occupancy.map(o => [o._id.toString(), o.occupied]));

    return {
        rooms: rooms.map(r => ({
            id: r._id,
            name: r.name,
            description: r.description,
            coverImage: r.coverImage,
            host: r.host,
            category: r.category,
            seatCount: r.seatCount,
            isOfficial: r.isOfficial,
            isPrivate: r.isPrivate,
            occupied: occupancyMap.get(r._id.toString()) || 0,
            createdAt: r.createdAt
        })),
        total,
        page: safePage,
        pages: Math.ceil(total / safeLimit)
    };
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
