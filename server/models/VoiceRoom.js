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
    // ✅ آيدي قصير مميّز لكل غرفة مستخدم (6 أرقام) — يُنشأ تلقائياً عند إنشاء الغرفة، ويبقى
    // ثابتاً طوال عمرها (لا يتغيّر حتى لو تغيّر اسمها)، ويُستخدم للبحث المباشر عنها بالتصفح
    roomCode: { type: String, unique: true, sparse: true, index: true },
    name: { type: String, default: 'غرفة صوتية', maxlength: 40 },
    description: { type: String, default: '', maxlength: 120 },
    coverImage: { type: String, default: null },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true }, // null = الغرفة الرسمية
    category: { type: String, enum: ['chat', 'games', 'music', 'dating'], default: 'chat' },
    isOfficial: { type: Boolean, default: false },
    isPrivate: { type: Boolean, default: false },
    password: { type: String, select: false }, // 🛡️ لا يُرجَع أبداً إلا بطلب صريح select('+password')
    isLocked: { type: Boolean, default: false }, // ✅ قفل الغرفة بالكامل — لا يدخلها أحد غير المضيف/المسؤولين
    backgroundImage: { type: String, default: null }, // ✅ الخلفية النشطة حالياً (مجانية أو مدفوعة)
    backgroundExpiresAt: { type: Date, default: null }, // ✅ متى تنتهي الخلفية المدفوعة (null = مجانية/دائمة)
    seatCount: { type: Number, enum: [9, 15, 24, 80], default: 80 },
    adminSeatCount: { type: Number, default: 5 }, // أول N مقعد محجوز حصرياً للإدارة (0 بالغرف العادية)
    moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // ✅ مسؤولون مساعدون عيّنهم المضيف
    seats: [seatSchema],
    // ✅ طلبات "رفع اليد" لطلب الصعود للمايك — قائمة انتظار يراها المضيف/المسؤولون فقط،
    // ويقدر أي منهم يدعو صاحب الطلب مباشرة لمقعد فاضٍ أو يرفض طلبه
    handRaises: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        requestedAt: { type: Date, default: Date.now }
    }],
    status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },
    // ✅ غرف المستخدمين (وليست الرسمية) تعمل بمنطق "بث مباشر": الغرفة موجودة بقاعدة البيانات
    // دائماً (تاريخها/إعداداتها محفوظة)، لكنها لا تظهر بقائمة التصفح إلا وقت يكون المضيف
    // فعلياً "مباشر" (isLive)؛ تختفي تلقائياً عند خروجه، وتُستأنف بجلسة بث جديدة عند رجوعه
    isLive: { type: Boolean, default: true, index: true },
    liveSince: { type: Date, default: Date.now }, // ✅ بداية جلسة البث الحالية — يُحسب منها "مدة البث" عند انتهائها
    // ✅ متابعو الغرفة تحديداً (مستقل تماماً عن نظام الأصدقاء) — يظهر لهم زر "متابع" بدل "متابعة"
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // ✅ قفل الدردشة — المضيف/المسؤولون فقط يقدرون يكتبون؛ الباقي يبقى يشاهد فقط
    chatLocked: { type: Boolean, default: false },
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

// ✅ يولّد آيدي قصيراً (6 أرقام) غير مستخدم حالياً لغرفة جديدة — احتمال التصادم ضئيل جداً
// (مليون قيمة ممكنة)، لكن الحلقة تعيد المحاولة باحتمال أقل من واحد بالمليون لعدم ترك أي فرصة
voiceRoomSchema.statics.generateRoomCode = async function () {
    for (let attempt = 0; attempt < 8; attempt++) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const exists = await this.exists({ roomCode: code });
        if (!exists) return code;
    }
    // ✅ احتياط أخير (شبه مستحيل الوصول له عملياً): آيدي أطول لضمان عدم التصادم
    return String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 10));
};

// ✅ إنشاء غرفة صوتية جديدة يملكها مستخدم (نظام الغرف المتعددة) — المضيف يُجلَس تلقائياً على
// المقعد رقم 1 فور الإنشاء (لا يقدر ينزل منه — يُنهي البث بدل ذلك، انظر endBroadcast أدناه)
voiceRoomSchema.statics.createRoom = async function ({ hostId, name, description, coverImage, category, seatCount, isPrivate, password }) {
    const seats = [];
    for (let i = 1; i <= seatCount; i++) {
        seats.push(i === 1 ? { seatNumber: 1, user: hostId, joinedAt: new Date() } : { seatNumber: i });
    }

    const roomCode = await this.generateRoomCode();

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
        roomCode,
        isLive: true,
        liveSince: new Date(),
        status: 'active',
        lastActivityAt: new Date()
    });
};

// ✅ قائمة الغرف للتصفح (الرسمية + كل غرف المستخدمين) — لا تُرجع كلمة المرور أبداً،
// ولا مصفوفة المقاعد كاملة (ثقيلة وغير لازمة لقائمة التصفح، فقط عدد الشاغلين الحالي)
voiceRoomSchema.statics.listRooms = async function ({ search, sort = 'newest', page = 1, limit = 20 } = {}) {
    // ✅ غرفة مستخدم غير مباشرة حالياً (المضيف غير موجود) لا تظهر بالتصفح إطلاقاً —
    // الرسمية مُستثناة دائماً من هذا الشرط (isLive غير ذي معنى بالنسبة لها)
    const query = { status: 'active', $or: [{ isOfficial: true }, { isLive: true }] };
    if (search && search.trim()) {
        const cleanSearch = search.trim().slice(0, 50);
        const escapedSearch = cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // ✅ يبحث بالاسم أو بآيدي الغرفة القصير معاً (نفس الطلب: البحث عبر الآيدي)
        query.$and = [{ $or: [{ name: { $regex: escapedSearch, $options: 'i' } }, { roomCode: cleanSearch }] }];
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
            roomCode: r.roomCode || null,
            occupied: occupancyMap.get(r._id.toString()) || 0,
            createdAt: r.createdAt
        })),
        total,
        page: safePage,
        pages: Math.ceil(total / safeLimit)
    };
};

// ✅ يحل معرّف الغرفة القادم من العميل: 'main' يعني الغرفة الرسمية، وإلا يُعامل كمعرّف MongoDB حقيقي
voiceRoomSchema.statics.resolveRoom = async function (roomId) {
    if (roomId === 'main') return this.getMainRoom();
    if (!mongoose.Types.ObjectId.isValid(roomId)) return null;
    return this.findOne({ _id: roomId, status: 'active' });
};

// ✅ يحرر كل مقاعد هذا المستخدم عبر كل الغرف (لا يمكن الجلوس بأكثر من غرفة بنفس الوقت) —
// بحسب قاعدة البيانات وحدها، لا ذاكرة الاتصال. عادة مقعد واحد فقط، لكن لو حصل ازدواج
// (تصادم طلبات متزامنة) يحررهم كلهم ويبلغ عنهم كلهم، فيصحح نفسه تلقائياً.
// يُرجع مصفوفة [{ roomId, seatNumber, wasMuted }, ...] (فاضية لو لم يكن قاعداً بأي مكان).
voiceRoomSchema.statics.releaseUserSeatEverywhere = async function (userId) {
    const rooms = await this.find({ 'seats.user': userId });
    if (!rooms.length) return [];

    const released = [];
    for (const room of rooms) {
        // 🛡️ لا تُحرَّر أبداً مقاعد مضيف بغرفته الخاصة (دائماً مقعد 1) عبر هذا المسار العام —
        // فقط startBroadcast/endBroadcast الصريحان يتحكمان بمقعده. يحمي من كل الحالات غير
        // المباشرة: قطع اتصال مؤقت، أو محاولة الجلوس بغرفة أخرى وهو لسا "مثبَّت" بغرفته
        if (room.host && room.host.toString() === userId.toString()) continue;

        const occupied = room.seats.filter(s => s.user && s.user.toString() === userId.toString());
        occupied.forEach(s => {
            released.push({
                roomId: room.slug === 'main' ? 'main' : room._id.toString(),
                seatNumber: s.seatNumber,
                wasMuted: !!s.isMuted
            });
        });

        await this.updateOne(
            { _id: room._id },
            { $set: { 'seats.$[old].user': null, 'seats.$[old].joinedAt': null, 'seats.$[old].isMuted': false } },
            { arrayFilters: [{ 'old.user': userId }] }
        );
    }

    return released;
};

// ✅ تنظيف شامل لمرة واحدة عند إقلاع السيرفر: يزيل أي ازدواج قديم متراكم عبر كل الغرف
// (مستخدم واحد ظاهر على أكثر من مقعد — حتى بغرف مختلفة — بنفس اللحظة) —
// يُبقي فقط أحدث مقعد انضم له كل مستخدم (بحسب joinedAt) ويُفرغ الباقي.
voiceRoomSchema.statics.deduplicateSeats = async function () {
    await this.getMainRoom(); // يضمن وجود الغرفة الرسمية قبل الفحص
    const rooms = await this.find({ 'seats.user': { $ne: null } });

    const seatsByUser = new Map(); // userId -> [{ room, seat }]
    rooms.forEach(room => {
        room.seats.forEach(s => {
            if (!s.user) return;
            const key = s.user.toString();
            if (!seatsByUser.has(key)) seatsByUser.set(key, []);
            seatsByUser.get(key).push({ room, seat: s });
        });
    });

    let clearedCount = 0;
    const roomsToSave = new Map();
    for (const [, entries] of seatsByUser) {
        if (entries.length <= 1) continue;
        // أبقِ الأحدث انضماماً فقط (حتى لو بغرفة مختلفة)، حرر الباقي أينما كان
        entries.sort((a, b) => new Date(b.seat.joinedAt || 0) - new Date(a.seat.joinedAt || 0));
        const toClear = entries.slice(1);
        for (const { room, seat } of toClear) {
            seat.user = null;
            seat.joinedAt = null;
            seat.isMuted = false;
            clearedCount++;
            roomsToSave.set(room._id.toString(), room);
        }
    }

    for (const room of roomsToSave.values()) {
        await room.save();
    }

    if (clearedCount > 0) {
        console.log(`[VOICE ROOM] تم تنظيف ${clearedCount} مقعد مكرر عند الإقلاع`);
    }
    return clearedCount;
};

// ✅ إصلاح ذاتي لفهرس slug القديم (كان unique بدون sparse قبل نظام الغرف المتعددة) —
// يُستدعى مرة واحدة عند إقلاع السيرفر. بدونه: أي غرفة جديدة بدون slug تتصادم مع الفهرس
// القديم وترمي E11000 dup key: { slug: null }.
voiceRoomSchema.statics.fixSlugIndex = async function () {
    try {
        const collection = this.collection;
        const indexes = await collection.indexes();
        const slugIndex = indexes.find(idx => idx.name === 'slug_1');
        if (slugIndex && !slugIndex.sparse) {
            await collection.dropIndex('slug_1');
            console.log('[VOICE ROOM] ✅ تم حذف فهرس slug القديم غير الصحيح — سيُعاد بناؤه صحيحاً (sparse) تلقائياً');
        }
    } catch (err) {
        console.error('[VOICE ROOM] فشل إصلاح فهرس slug:', err.message);
    }
};

// ✅ يتحقق هل هذا المستخدم مخوّل بإدارة الغرفة (مضيف أو مسؤول مساعد عيّنه المضيف)
voiceRoomSchema.methods.canModerate = function (userId) {
    const uid = userId.toString();
    if (this.host && this.host.toString() === uid) return true;
    return this.moderators.some(m => m.toString() === uid);
};

// ✅ يسقط الخلفية المدفوعة تلقائياً لو انتهت مدتها (فحص عند كل قراءة، بدون الحاجة لمهمة دورية منفصلة)
voiceRoomSchema.methods.checkBackgroundExpiry = async function () {
    if (this.backgroundExpiresAt && this.backgroundExpiresAt < new Date()) {
        this.backgroundImage = null;
        this.backgroundExpiresAt = null;
        await this.save();
    }
};

// ✅ زيادة عدد المقاعد فقط (اتجاه واحد: 9←15←24) — يضيف مقاعد فاضية جديدة بدون المساس بالموجود
voiceRoomSchema.methods.increaseSeatCount = function (newCount) {
    const allowedSteps = [9, 15, 24];
    if (!allowedSteps.includes(newCount) || newCount <= this.seatCount) return false;
    for (let i = this.seatCount + 1; i <= newCount; i++) {
        this.seats.push({ seatNumber: i });
    }
    this.seatCount = newCount;
    return true;
};

// ✅ يحرر كل مقاعد هذي الغرفة دفعة واحدة (يُستخدم عند اختيار المضيف "طرد الجميع" عند قفل الغرفة)
// — عدا مقعد المضيف نفسه، فهو مثبَّت دائماً ولا يُطرَد حتى بهذا الإجراء الجماعي —
// يُرجع مصفوفة أرقام المقاعد التي كانت مشغولة فعلياً وأُفرغت، لبثّها للجميع
// ✅ يُرجع {seatNumber, userId} لكل مقعد أُفرِغ (وليس رقم المقعد وحده) — العميل يحتاج
// userId ليُنهي اتصالات الصوت الحي (WebRTC) الخاصة بكل شخص طُرد تحديداً، لا فقط تحديث المقعد بصرياً
voiceRoomSchema.statics.releaseAllSeatsInRoom = async function (roomId) {
    const room = await this.findById(roomId);
    if (!room) return [];
    const hostId = room.host ? room.host.toString() : null;
    const occupiedSeats = room.seats.filter(s => s.user && s.user.toString() !== hostId);
    if (!occupiedSeats.length) return [];
    const released = occupiedSeats.map(s => ({ seatNumber: s.seatNumber, userId: s.user.toString() }));
    const seatNumbers = occupiedSeats.map(s => s.seatNumber);
    await this.updateOne(
        { _id: roomId },
        { $set: { 'seats.$[s].user': null, 'seats.$[s].joinedAt': null, 'seats.$[s].isMuted': false } },
        { arrayFilters: [{ 's.seatNumber': { $in: seatNumbers } }] }
    );
    return released;
};

// ✅ المضيف يبدأ جلسة بث جديدة بغرفته (عند فتحها وهي غير مباشرة حالياً) — يمسح دردشة الجلسة
// السابقة، يعيد إجلاسه على المقعد 1 وحده (يُفرغ أي مقاعد أخرى بقيت من الجلسة السابقة)،
// ويجعل الغرفة ظاهرة بالتصفح من جديد
voiceRoomSchema.statics.startBroadcast = async function (roomId, hostId) {
    const Message = require('./Message');
    const room = await this.findOne({ _id: roomId, host: hostId, isOfficial: false });
    if (!room) return null;

    await Message.deleteMany({ room: `room-chat-${roomId}` });

    room.isLive = true;
    room.liveSince = new Date();
    room.handRaises = [];
    room.seats.forEach(s => { s.user = null; s.joinedAt = null; s.isMuted = false; s.isLocked = false; });
    const firstSeat = room.seats.find(s => s.seatNumber === 1);
    if (firstSeat) { firstSeat.user = hostId; firstSeat.joinedAt = new Date(); }
    room.lastActivityAt = new Date();
    await room.save();
    return room;
};

// ✅ إنهاء البث (المضيف أنهاه صراحة، أو انقطع اتصاله) — يُفرغ كل المقاعد ويُخفي الغرفة عن
// التصفح، ويُرجع من كان حاضراً (لإشعارهم بانتهاء البث) ومدته (لعرضها على شاشة الانتهاء)
voiceRoomSchema.statics.endBroadcast = async function (roomId) {
    const room = await this.findById(roomId);
    if (!room || room.isOfficial || !room.isLive) return null;

    const occupantIds = room.seats.filter(s => s.user).map(s => s.user.toString());
    const durationSeconds = room.liveSince ? Math.max(0, Math.round((Date.now() - room.liveSince.getTime()) / 1000)) : 0;

    room.isLive = false;
    room.seats.forEach(s => { s.user = null; s.joinedAt = null; s.isMuted = false; });
    room.handRaises = [];
    await room.save();

    return { room, occupantIds, durationSeconds };
};

module.exports = mongoose.model('VoiceRoom', voiceRoomSchema);
