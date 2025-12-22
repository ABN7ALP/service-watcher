const Message = require('../models/Message');

exports.getPublicMessages = async (req, res, next) => {
    try {
        // جلب آخر 50 رسالة من الغرفة العامة
        const messages = await Message.find({ room: 'public-room' })
            .sort('-createdAt') // ترتيب تنازلي (الأحدث أولاً)
            .limit(50)
            .populate('sender', 'username profileImage'); // جلب بيانات المرسل

        // عكس ترتيب الرسائل ليكون الأقدم في الأعلى والأحدث في الأسفل
        const sortedMessages = messages.reverse();

        res.status(200).json({
            status: 'success',
            data: {
                messages: sortedMessages,
            },
        });
    } catch (error) {
        next(error);
    }
};
