const mongoose = require('mongoose');
const VoiceRoom = require('../models/VoiceRoom');

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
        const room = await VoiceRoom.findOne({ _id: req.params.id, status: 'active' })
            .populate('seats.user', 'username profileImage activeFrameClass isAdmin')
            .populate('host', 'username profileImage');
        if (!room) {
            return res.status(404).json({ status: 'fail', message: 'الغرفة غير موجودة أو أُغلقت' });
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
            seatCount: room.seatCount,
            adminSeatCount: room.adminSeatCount,
            seats
        });
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
