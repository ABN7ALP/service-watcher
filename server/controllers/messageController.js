const Message = require('../models/Message');

// 📍 استبدل دالة getPublicMessages كاملة بهذا الكود
exports.getPublicMessages = async (req, res, next) => {
    try {
        // 1️⃣ جلب بيانات المستخدم الحالي (مع قائمة المحظورين)
        const User = require('../models/User'); // تأكد من استيراد نموذج المستخدم
        const currentUser = await User.findById(req.user.id).select('blockedUsers');
        
        if (!currentUser) {
            return res.status(404).json({
                status: 'fail',
                message: 'لم يتم العثور على المستخدم'
            });
        }
        
        // 2️⃣ جلب آخر 50 رسالة مع بيانات المرسل
        const messages = await Message.find({ room: 'public-room' })
            .sort('-createdAt') // ترتيب تنازلي (الأحدث أولاً)
            .limit(50)
            .populate('sender', 'username profileImage')
            .lean(); // ⭐ مهم: تحويل إلى كائن عادي لتسهيل التصفية

        // 3️⃣ تصفية الرسائل: استبعاد رسائل المستخدمين المحظورين
        const filteredMessages = messages.filter(message => {
            // التحقق إذا كان المرسل محظوراً من قبل المستخدم الحالي
            if (currentUser.blockedUsers && currentUser.blockedUsers.length > 0) {
                const isBlocked = currentUser.blockedUsers.some(blockedId => 
                    blockedId.toString() === message.sender._id.toString()
                );
                // إذا كان محظوراً، استبعده
                if (isBlocked) {
                    console.log(`[FILTER] Filtered message from blocked user: ${message.sender.username}`);
                    return false;
                }
            }
            return true; // عرض الرسالة إذا لم يكن محظوراً
        });
        
        console.log(`[FILTER] Original: ${messages.length} messages, Filtered: ${filteredMessages.length} messages`);

        // 4️⃣ عكس ترتيب الرسائل ليكون الأقدم في الأعلى
        const sortedMessages = filteredMessages.reverse();

        res.status(200).json({
            status: 'success',
            data: {
                messages: sortedMessages,
                stats: {
                    originalCount: messages.length,
                    filteredCount: filteredMessages.length,
                    blockedCount: messages.length - filteredMessages.length
                }
            },
        });
    } catch (error) {
        console.error('[ERROR] in getPublicMessages:', error);
        next(error);
    }
};
