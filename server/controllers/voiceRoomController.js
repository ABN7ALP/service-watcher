const VoiceRoom = require('../models/VoiceRoom');

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
