const Report = require('../models/Report');
const { uploadChatImage } = require('../utils/cloudinary');

exports.createReport = async (req, res) => {
    try {
        const reporterId = req.user.id;
        const { type, reportedUserId, reason, details, messageId, roomId, messageContent, messageType, evidenceUrl } = req.body;

        if (!reportedUserId || !reason) {
            return res.status(400).json({ status: 'fail', message: 'بيانات البلاغ ناقصة' });
        }
        if (reportedUserId === reporterId) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكنك الإبلاغ عن نفسك' });
        }
        if (reason === 'other' && (!details || details.trim().length < 5)) {
            return res.status(400).json({ status: 'fail', message: 'يرجى كتابة تفاصيل كافية عند اختيار "أخرى"' });
        }

        const dup = await Report.checkDuplicate({
            reporter: reporterId, reportedUser: reportedUserId,
            type: type || 'user', reason, messageId
        });
        if (dup) {
            return res.status(409).json({ status: 'fail', message: 'لقد أرسلت بلاغاً مشابهاً مؤخراً، سيتم مراجعته قريباً' });
        }

            const report = await Report.create({
            reporter: reporterId,
            reportedUser: reportedUserId,
            type: type || 'user',
            reason,
            details: (details || '').trim() || 'بدون تفاصيل إضافية',
            messageId: messageId || undefined,
            roomId: roomId || undefined,
            messageContent: messageContent || undefined,
            messageType: messageType || undefined,
            evidence: evidenceUrl ? [evidenceUrl] : []
        });

        // ✅ بوت الموقع: تأكيد فوري لاستلام البلاغ
                const io = req.app.get('socketio');
        const { sendBotMessage } = require('../utils/botMessenger');
        await sendBotMessage(io, reporterId, `تم استلام بلاغك بنجاح (رقم #${report._id.toString().slice(-6)})، سيراجعه فريقنا قريباً. شكراً لمساهمتك في أمان المجتمع 🙏`);

        res.status(201).json({ status: 'success', message: 'تم إرسال بلاغك بنجاح، سيتم مراجعته من قبل الإدارة', data: { reportId: report._id } });
    } catch (error) {
        console.error('[ERROR] in createReport:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء إرسال البلاغ' });
    }
};

// ✅ رفع صورة إثبات مستقلة (لا تتطلب "مستقبل" كباقي مسارات رفع الصور بالدردشة)
exports.uploadEvidence = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ status: 'fail', message: 'الرجاء اختيار صورة' });
        if (req.file.size > 5 * 1024 * 1024) return res.status(400).json({ status: 'fail', message: 'حجم الصورة يتجاوز 5MB' });

        const result = await uploadChatImage(req.file.buffer, {});
        res.status(200).json({ status: 'success', data: { url: result.secure_url } });
    } catch (error) {
        console.error('[ERROR] in uploadEvidence:', error);
        res.status(500).json({ status: 'error', message: 'فشل رفع صورة الإثبات' });
    }
};
