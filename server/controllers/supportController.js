const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');

exports.createTicket = async (req, res) => {
    try {
        const { type, subject, message, contextData } = req.body;
        if (!subject || !message || message.trim().length < 5) {
            return res.status(400).json({ status: 'fail', message: 'يرجى كتابة تفاصيل كافية (5 أحرف على الأقل)' });
        }
        const ticket = await SupportTicket.create({
            user: req.user.id, type: type || 'general',
            subject: subject.trim(), message: message.trim(), contextData
        });
        res.status(201).json({ status: 'success', message: 'تم إرسال طلبك، سيتواصل معك فريق الدعم قريباً', data: { ticketId: ticket._id } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ✅ مسار عام (بدون توكن) خاص باستئناف الحظر فقط — المستخدم المحظور لا يملك جلسة صالحة أصلاً
const banAppealRateMap = new Map();
exports.createBanAppeal = async (req, res) => {
    try {
        const { userId, message } = req.body;
        if (!userId || !message || message.trim().length < 5) {
            return res.status(400).json({ status: 'fail', message: 'يرجى كتابة تفاصيل كافية' });
        }

        const lastAppeal = banAppealRateMap.get(userId);
        if (lastAppeal && Date.now() - lastAppeal < 6 * 60 * 60 * 1000) {
            return res.status(429).json({ status: 'fail', message: 'لقد أرسلت طلب استئناف مؤخراً، يرجى الانتظار قبل إرسال طلب آخر' });
        }

        const user = await User.findById(userId).select('isBanned banReason username');
        if (!user || !user.isBanned) {
            return res.status(400).json({ status: 'fail', message: 'لا يوجد حظر نشط مرتبط بهذا الحساب' });
        }

        await SupportTicket.create({
            user: user._id, type: 'ban_appeal',
            subject: `استئناف حظر — ${user.username}`,
            message: message.trim(), contextData: { banReason: user.banReason }
        });

        banAppealRateMap.set(userId, Date.now());
        res.status(201).json({ status: 'success', message: 'تم إرسال طلب الاستئناف، سيراجعه فريق الدعم قريباً' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};
