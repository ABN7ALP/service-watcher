const mongoose = require('mongoose');
const VoiceRoom = require('../models/VoiceRoom');
const Message = require('../models/Message');
const User = require('../models/User');

// =====================================================
// ✅ كتالوج خلفيات الغرفة — خلفية مجانية دائمة + خلفيات مدفوعة (10 كوينز / 5 أيام)
// =====================================================
const FREE_DEFAULT_BACKGROUND = 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=800&q=60';
const PREMIUM_BACKGROUNDS = [
    { id: 'bg_galaxy', url: 'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=800&q=60', price: 10 },
    { id: 'bg_neon', url: 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=800&q=60', price: 10 },
    { id: 'bg_gold', url: 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=800&q=60', price: 10 },
    { id: 'bg_ocean', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=60', price: 10 },
    { id: 'bg_desert', url: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=800&q=60', price: 10 },
    { id: 'bg_forest', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=60', price: 10 }
];
const BACKGROUND_DAYS = 5;

// =====================================================
// ✅ GET /api/voice-room/rooms — قائمة التصفح (الرسمية + غرف المستخدمين)
// =====================================================
exports.listRooms = async (req, res) => {
    try {
        const { search, sort, page, limit } = req.query;
        const result = await VoiceRoom.listRooms({
            search,
            sort: sort === 'active' ? 'active' : 'newest',
            page,
            limit
        });
        res.json({ status: 'success', ...result });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// =====================================================
// ✅ GET /api/voice-room/my-room — غرفتي الخاصة إن وُجدت (لتوجيه أيقونة الإنشاء مباشرة إليها)
// =====================================================
exports.getMyRoom = async (req, res) => {
    try {
        const room = await VoiceRoom.findOne({ host: req.user.id, status: 'active' }).select('-password -seats');
        res.json({ status: 'success', room: room ? { id: room._id, name: room.name, coverImage: room.coverImage, seatCount: room.seatCount, isPrivate: room.isPrivate, isOfficial: false } : null });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// =====================================================
// ✅ POST /api/voice-room/rooms — إنشاء غرفة صوتية جديدة (اسم + غلاف فقط أول مرة —
// بقية الإعدادات (خصوصية/عدد مقاعد/تصنيف) تُعدَّل لاحقاً من إعدادات المضيف داخل غرفته)
// =====================================================
exports.createRoom = async (req, res) => {
    try {
        const { name, coverImage } = req.body;

        // 🛡️ تحقق صارم من كل مدخل — لا نثق بأي شيء قادم من العميل مهما بدا الشكل بالواجهة سليماً
        const cleanName = String(name || '').trim();
        if (!cleanName || cleanName.length < 2 || cleanName.length > 40) {
            return res.status(400).json({ status: 'fail', message: 'اسم الغرفة يجب أن يكون بين 2 و40 حرفاً' });
        }

        // 🛡️ غرفة واحدة فقط لكل مستخدم — أيقونة الإنشاء تأخذه مباشرة لغرفته لو عنده وحدة أصلاً
        const existingRoom = await VoiceRoom.findOne({ host: req.user.id, status: 'active' });
        if (existingRoom) {
            return res.status(400).json({ status: 'fail', message: 'لديك غرفة بالفعل — لا يمكن إنشاء أكثر من غرفة واحدة' });
        }

        // 🛡️ الغلاف: من قائمة جاهزة فقط حالياً (لا يوجد رفع ملفات بعد) — يمنع إدخال روابط عشوائية
        const presetCovers = [
            'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=60',
            'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=400&q=60',
            'https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=400&q=60',
            'https://images.unsplash.com/photo-1533158307587-828f0a76ef46?w=400&q=60',
            'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=400&q=60',
            'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=400&q=60'
        ];
        const cleanCover = presetCovers.includes(coverImage) ? coverImage : presetCovers[0];

        const room = await VoiceRoom.createRoom({
            hostId: req.user.id,
            name: cleanName,
            description: '',
            coverImage: cleanCover,
            category: 'chat',
            seatCount: 8,
            isPrivate: false,
            password: undefined
        });

        res.status(201).json({
            status: 'success',
            room: { id: room._id, name: room.name, coverImage: room.coverImage, seatCount: room.seatCount, isPrivate: room.isPrivate }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// =====================================================
// ✅ GET /api/voice-room/rooms/:id — حالة غرفة محددة بمعرّفها
// =====================================================
exports.getRoomById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غرفة غير صالح' });
        }
        // نحتاج +password لو الغرفة خاصة للتحقق يدوياً، ثم نزيله قبل الإرسال للعميل أبداً
        const room = await VoiceRoom.findOne({ _id: req.params.id, status: 'active' })
            .select('+password')
            .populate('seats.user', 'username profileImage activeFrameClass isAdmin')
            .populate('host', 'username profileImage')
            .populate('moderators', 'username profileImage');
        if (!room) {
            return res.status(404).json({ status: 'fail', message: 'الغرفة غير موجودة أو أُغلقت' });
        }

        // ✅ يسقط الخلفية المدفوعة تلقائياً لو انتهت مدتها قبل إرسال الرد
        await room.checkBackgroundExpiry();

        const isHost = room.host && room.host._id.toString() === req.user.id;
        const isModerator = room.moderators.some(m => m.toString() === req.user.id);

        // 🛡️ غرفة مقفولة بالكامل — لا يدخلها أحد غير المضيف/المسؤولين (منفصل عن حماية كلمة المرور)
        if (room.isLocked && !isHost && !isModerator) {
            return res.status(403).json({ status: 'fail', message: 'هذه الغرفة مقفلة حالياً من المضيف' });
        }

        // 🛡️ حماية دخول الغرفة نفسها بكلمة مرور (وليس فقط الجلوس على مقعد) — لا يشمل المضيف/المسؤولين
        if (room.isPrivate && !isHost && !isModerator) {
            const suppliedPassword = req.query.password || '';
            if (!suppliedPassword || suppliedPassword !== room.password) {
                return res.status(403).json({ status: 'fail', message: 'كلمة مرور الغرفة غير صحيحة', requiresPassword: true });
            }
        }

        const seats = room.seats.map(s => ({
            seatNumber: s.seatNumber,
            isLocked: s.isLocked,
            isMuted: s.isMuted,
            user: s.user ? {
                id: s.user._id,
                username: s.user.username,
                profileImage: s.user.profileImage,
                activeFrameClass: s.user.activeFrameClass
            } : null
        }));

        res.json({
            status: 'success',
            id: room._id,
            name: room.name,
            description: room.description,
            category: room.category,
            host: room.host,
            isOfficial: room.isOfficial,
            isPrivate: room.isPrivate,
            isLocked: room.isLocked,
            backgroundImage: room.backgroundImage,
            backgroundExpiresAt: room.backgroundExpiresAt,
            seatCount: room.seatCount,
            adminSeatCount: room.adminSeatCount,
            seats,
            moderators: room.moderators.map(m => ({ id: m._id, username: m.username, profileImage: m.profileImage })),
            myRole: isHost ? 'host' : (isModerator ? 'moderator' : 'guest')
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// =====================================================
// ✅ PATCH /api/voice-room/rooms/:id — تعديل إعدادات الغرفة (المضيف فقط)
// =====================================================
exports.updateRoom = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غرفة غير صالح' });
        }
        const room = await VoiceRoom.findOne({ _id: req.params.id, status: 'active' });
        if (!room) {
            return res.status(404).json({ status: 'fail', message: 'الغرفة غير موجودة' });
        }
        // 🛡️ المضيف فقط يعدّل إعدادات الغرفة (وليس المسؤولون المساعدون — صلاحياتهم محصورة بإدارة المقاعد)
        if (!room.host || room.host.toString() !== req.user.id) {
            return res.status(403).json({ status: 'fail', message: 'لا تملك صلاحية تعديل هذه الغرفة' });
        }

        const { name, description, isPrivate, password, isLocked, kickAll, seatCount } = req.body;

        if (name !== undefined) {
            const cleanName = String(name).trim();
            if (!cleanName || cleanName.length < 2 || cleanName.length > 40) {
                return res.status(400).json({ status: 'fail', message: 'اسم الغرفة يجب أن يكون بين 2 و40 حرفاً' });
            }
            room.name = cleanName;
        }

        if (description !== undefined) {
            room.description = String(description).trim().slice(0, 120);
        }

        if (isPrivate !== undefined) {
            const finalIsPrivate = isPrivate === true || isPrivate === 'true';
            if (finalIsPrivate) {
                // لازم كلمة مرور جديدة، أو تبقى الحالية لو الغرفة كانت خاصة أصلاً وما تغيّرت
                if (password && String(password).trim().length > 0) {
                    room.password = String(password).trim();
                } else if (!room.isPrivate) {
                    return res.status(400).json({ status: 'fail', message: 'يرجى إدخال كلمة مرور لتفعيل الخصوصية' });
                }
            } else {
                room.password = undefined;
            }
            room.isPrivate = finalIsPrivate;
        }

        // ✅ الخلفية الآن تُدار عبر نقطتي /background/shop و/background/purchase المخصصتين (تدعم الشراء والانتهاء)

        // ✅ زيادة عدد المقاعد فقط (اتجاه واحد 8←15←24)
        if (seatCount !== undefined) {
            const ok = room.increaseSeatCount(parseInt(seatCount));
            if (!ok) {
                return res.status(400).json({ status: 'fail', message: 'لا يمكن تقليل عدد المقاعد، فقط زيادته (8 ← 15 ← 24)' });
            }
        }

        const io = req.app.get('socketio');

        // ✅ قفل/فتح الغرفة — طرد الجميع (إن طُلب) يتم بعد الحفظ كعملية منفصلة، وإلا فإن حفظ هذا
        // المستند سيُعيد كتابة مصفوفة المقاعد بنسخته القديمة بالذاكرة ويُلغي التفريغ عن طريق الخطأ
        let shouldKickAll = false;
        if (isLocked !== undefined) {
            const finalIsLocked = isLocked === true || isLocked === 'true';
            room.isLocked = finalIsLocked;
            shouldKickAll = finalIsLocked && (kickAll === true || kickAll === 'true');
        }

        await room.save();

        let kickedSeats = [];
        if (shouldKickAll) {
            kickedSeats = await VoiceRoom.releaseAllSeatsInRoom(room._id);
        }

        // ✅ البث بعد الحفظ: تحرير المقاعد المطرودة + إشعار كل من بالغرفة بإغلاقها لو تم طردهم
        if (io && kickedSeats.length > 0) {
            const roomIdStr = room._id.toString();
            kickedSeats.forEach(seatNumber => {
                io.emit('user-left-seat', { roomId: roomIdStr, seatNumber });
            });
            io.to(`room-chat-${roomIdStr}`).emit('room-force-closed', { roomId: roomIdStr, reason: 'locked' });
        }

        res.json({
            status: 'success',
            room: {
                id: room._id,
                name: room.name,
                description: room.description,
                isPrivate: room.isPrivate,
                isLocked: room.isLocked,
                backgroundImage: room.backgroundImage,
                seatCount: room.seatCount
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// =====================================================
// ✅ GET /api/voice-room/rooms/:id/messages — آخر رسائل دردشة الغرفة (حتى 50)
// =====================================================
exports.getRoomMessages = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id) && req.params.id !== 'main') {
            return res.status(400).json({ status: 'fail', message: 'معرّف غرفة غير صالح' });
        }
        const channel = `room-chat-${req.params.id}`;
        const messages = await Message.find({ room: channel })
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('sender', 'username profileImage activeFrameClass')
            .lean();
        res.json({ status: 'success', messages: messages.reverse() });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// =====================================================
// ✅ GET /api/voice-room — لقطة الحالة الحالية للمقاعد
// -----------------------------------------------------
// تُستدعى عند فتح واجهة الغرفة الصوتية لأول مرة، لتعرض الواجهة
// مين قاعد فعلياً على أي مقعد بدل شبكة فاضية (كان هذا مفقوداً بالكامل).
// الأحداث اللحظية (join/leave/mute) تُبث بعدها عبر Socket.IO فقط،
// بنفس نمط بقية المشروع (REST للتحميل الأولي + Socket للتحديث الحي).
// =====================================================
exports.getVoiceRoomState = async (req, res) => {
    try {
        const room = await VoiceRoom.getMainRoom();
        await room.populate('seats.user', 'username profileImage activeFrameClass isAdmin');

        const seats = room.seats.map(s => ({
            seatNumber: s.seatNumber,
            isLocked: s.isLocked,
            isMuted: s.isMuted,
            user: s.user ? {
                id: s.user._id,
                username: s.user.username,
                profileImage: s.user.profileImage,
                activeFrameClass: s.user.activeFrameClass
            } : null
        }));

        res.json({
            status: 'success',
            seatCount: room.seatCount,
            adminSeatCount: room.adminSeatCount,
            seats
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// =====================================================
// ✅ GET /api/voice-room/background-shop — كتالوج الخلفيات (مجانية + مدفوعة)
// =====================================================
exports.getBackgroundShop = async (req, res) => {
    res.json({
        status: 'success',
        freeDefault: FREE_DEFAULT_BACKGROUND,
        premium: PREMIUM_BACKGROUNDS,
        days: BACKGROUND_DAYS
    });
};

// =====================================================
// ✅ POST /api/voice-room/rooms/:id/background — تفعيل خلفية (مجانية فورية أو شراء مدفوعة)
// =====================================================
exports.purchaseBackground = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غرفة غير صالح' });
        }
        const room = await VoiceRoom.findOne({ _id: req.params.id, status: 'active' });
        if (!room) {
            return res.status(404).json({ status: 'fail', message: 'الغرفة غير موجودة' });
        }
        // 🛡️ المضيف فقط يغيّر خلفية غرفته
        if (!room.host || room.host.toString() !== req.user.id) {
            return res.status(403).json({ status: 'fail', message: 'لا تملك صلاحية تعديل هذه الغرفة' });
        }

        const { backgroundId } = req.body;

        // ✅ الرجوع للخلفية المجانية الافتراضية — فوري ومجاني دائماً
        if (backgroundId === 'free') {
            room.backgroundImage = null;
            room.backgroundExpiresAt = null;
            await room.save();
            return res.json({ status: 'success', backgroundImage: null, backgroundExpiresAt: null, newBalance: null });
        }

        // 🛡️ التحقق من وجود الخلفية بالكتالوج الفعلي بالسيرفر (لا نثق بسعر يرسله العميل)
        const chosen = PREMIUM_BACKGROUNDS.find(bg => bg.id === backgroundId);
        if (!chosen) {
            return res.status(400).json({ status: 'fail', message: 'خلفية غير موجودة بالمتجر' });
        }

        const user = await User.findById(req.user.id);
        if (!user || user.coins < chosen.price) {
            return res.status(400).json({ status: 'fail', message: 'رصيد الكوينز غير كافٍ' });
        }

        user.coins -= chosen.price;
        await user.save();

        const expiresAt = new Date(Date.now() + BACKGROUND_DAYS * 24 * 60 * 60 * 1000);
        room.backgroundImage = chosen.url;
        room.backgroundExpiresAt = expiresAt;
        await room.save();

        res.json({
            status: 'success',
            backgroundImage: room.backgroundImage,
            backgroundExpiresAt: room.backgroundExpiresAt,
            newBalance: user.coins
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
