const Message = require('../models/Message');

// 📍 استبدل دالة getPublicMessages بهذا الكود المحسّن
exports.getPublicMessages = async (req, res, next) => {
    try {
        // 1️⃣ جلب بيانات المستخدم الحالي مع المحظورين والمحظور من قبلهم
        const User = require('../models/User');
        const currentUser = await User.findById(req.user.id)
            .select('blockedUsers blockedBy');
        
        if (!currentUser) {
            return res.status(404).json({
                status: 'fail',
                message: 'لم يتم العثور على المستخدم'
            });
        }
        
        // 2️⃣ إنشاء قائمة بكل المستخدمين المحظورين (من كلا الجانبين)
        const allBlockedIds = new Set();
        
        // أضف "من حظرتهم أنا"
        if (currentUser.blockedUsers && currentUser.blockedUsers.length > 0) {
            currentUser.blockedUsers.forEach(id => {
                allBlockedIds.add(id.toString());
            });
        }
        
        // أضف "من حظروني"
        if (currentUser.blockedBy && currentUser.blockedBy.length > 0) {
            currentUser.blockedBy.forEach(id => {
                allBlockedIds.add(id.toString());
            });
        }
        
        console.log(`[FILTER] User ${req.user.id} blocked relations:`, {
            iBlocked: currentUser.blockedUsers?.length || 0,
            blockedBy: currentUser.blockedBy?.length || 0,
            totalBlocked: allBlockedIds.size
        });
        
        // 3️⃣ جلب الرسائل
        const messages = await Message.find({ room: 'public-room' })
            .sort('-createdAt')
            .limit(50)
            .populate('sender', 'username profileImage')
            .lean();
        
        // 4️⃣ تصفية الرسائل من كلا الجانبين
        const filteredMessages = messages.filter(message => {
            const senderId = message.sender._id.toString();
            
            // التحقق إذا كان المرسل في قائمة الحظر (من أي جهة)
            const isBlocked = allBlockedIds.has(senderId);
            
            if (isBlocked) {
                console.log(`[FILTER] Filtered message from blocked relation: ${message.sender.username}`);
                return false;
            }
            return true;
        });
        
        console.log(`[FILTER] Original: ${messages.length}, Filtered: ${filteredMessages.length}`);

        // 5️⃣ عكس الترتيب وإرسال الاستجابة
        const sortedMessages = filteredMessages.reverse();

        res.status(200).json({
            status: 'success',
            data: {
                messages: sortedMessages,
                stats: {
                    originalCount: messages.length,
                    filteredCount: filteredMessages.length,
                    blockedRelations: Array.from(allBlockedIds)
                }
            },
        });
    } catch (error) {
        console.error('[ERROR] in getPublicMessages:', error);
        next(error);
    }
};
