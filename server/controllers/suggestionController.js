const Suggestion = require('../models/Suggestion');

// =====================================================
// ✅ POST /api/suggestions — إرسال اقتراح/ملاحظة (أي مستخدم مسجّل دخول)
// نوعان: 'song' (اقتراح أغنية لمكتبة الموسيقى المشتركة) أو 'general' (أي ملاحظة أخرى)
// =====================================================
exports.submitSuggestion = async (req, res) => {
    try {
        const { type, message, songTitle, songArtist, songUrl, roomId } = req.body;
        const cleanType = type === 'song' ? 'song' : 'general';

        if (cleanType === 'song') {
            const cleanTitle = String(songTitle || '').trim();
            if (!cleanTitle) {
                return res.status(400).json({ status: 'fail', message: 'اسم الأغنية مطلوب' });
            }
        } else {
            const cleanMessage = String(message || '').trim();
            if (!cleanMessage) {
                return res.status(400).json({ status: 'fail', message: 'يرجى كتابة اقتراحك أولاً' });
            }
        }

        const suggestion = await Suggestion.create({
            type: cleanType,
            message: String(message || '').trim().slice(0, 500),
            songTitle: String(songTitle || '').trim().slice(0, 80),
            songArtist: String(songArtist || '').trim().slice(0, 60),
            songUrl: String(songUrl || '').trim().slice(0, 300),
            submittedBy: req.user.id,
            room: roomId || null
        });

        // ✅ إشعار فوري للوحة التحكم — نفس قناة "admin-notification" التي تُظهر Toast جاهزة أصلاً
        const io = req.app.get('socketio');
        if (io) {
            const label = cleanType === 'song' ? `اقتراح أغنية: ${suggestion.songTitle}` : 'اقتراح/ملاحظة جديدة';
            io.of('/admin').emit('admin-notification', {
                message: `💡 ${label} من ${req.user.username}`,
                type: 'info'
            });
        }

        res.status(201).json({ status: 'success', message: 'تم إرسال اقتراحك، شكراً لك!' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
