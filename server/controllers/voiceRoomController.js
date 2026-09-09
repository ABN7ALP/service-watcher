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
// ✅ POST /api/voice-room/rooms — إنشاء غرفة صوتية جديدة
// =====================================================
exports.createRoom = async (req, res) => {
    try {
        const { name, description, coverImage, category, seatCount, isPrivate, password } = req.body;

        // 🛡️ تحقق صارم من كل مدخل — لا نثق بأي شيء قادم من العميل مهما بدا الشكل بالواجهة سليماً
        const cleanName = String(name || '').trim();
        if (!cleanName || cleanName.length < 2 || cleanName.length > 40) {
            return res.status(400).json({ status: 'fail', message: 'اسم الغرفة يجب أن يكون بين 2 و40 حرفاً' });
        }
        const cleanDescription = String(description || '').trim().slice(0, 120);

        const allowedCategories = ['chat', 'games', 'music', 'dating'];
        const cleanCategory = allowedCategories.includes(category) ? category : 'chat';

        const allowedSeatCounts = [8, 15, 24];
        const cleanSeatCount = allowedSeatCounts.includes(parseInt(seatCount)) ? parseInt(seatCount) : 8;

        // 🛡️ تحقق سيرفر حقيقي من كلمة مرور الغرفة الخاصة (لا يكفي تحقق الواجهة وحده)
        const finalIsPrivate = isPrivate === true || isPrivate === 'true';
        if (finalIsPrivate && (!password || String(password).trim().length < 1)) {
            return res.status(400).json({ status: 'fail', message: 'يرجى إدخال كلمة مرور للغرفة الخاصة' });
        }

        // 🛡️ حد أقصى لعدد الغرف المفتوحة لنفس المستخدم بنفس الوقت — يمنع إغراق قائمة التصفح
        const myActiveRoomsCount = await VoiceRoom.countDocuments({ host: req.user.id, status: 'active' });
        if (myActiveRoomsCount >= 3) {
            return res.status(400).json({ status: 'fail', message: 'وصلت للحد الأقصى (3 غرف) المفتوحة بنفس الوقت. أغلق إحداها أولاً.' });
        }

        const room = await VoiceRoom.createRoom({
            hostId: req.user.id,
            name: cleanName,
            description: cleanDescription,
            coverImage: coverImage || null,
            category: cleanCategory,
            seatCount: cleanSeatCount,
            isPrivate: finalIsPrivate,
            password: finalIsPrivate ? String(password) : undefined
        });

        res.status(201).json({
            status: 'success',
            room: { id: room._id, name: room.name, seatCount: room.seatCount, category: room.category }
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
