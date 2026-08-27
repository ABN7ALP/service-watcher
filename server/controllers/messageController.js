const Message = require('../models/Message');

exports.getPublicMessages = async (req, res, next) => {
    try {
        const User = require('../models/User');
        const currentUser = await User.findById(req.user.id)
            .select('blockedUsers blockedBy');
        
        if (!currentUser) {
            return res.status(404).json({
                status: 'fail',
                message: 'لم يتم العثور على المستخدم'
            });
        }
        
        const allBlockedIds = new Set();
        if (currentUser.blockedUsers && currentUser.blockedUsers.length > 0) {
            currentUser.blockedUsers.forEach(id => allBlockedIds.add(id.toString()));
        }
        if (currentUser.blockedBy && currentUser.blockedBy.length > 0) {
            currentUser.blockedBy.forEach(id => allBlockedIds.add(id.toString()));
        }
        
        console.log(`[FILTER] User ${req.user.id} blocked relations:`, {
            iBlocked: currentUser.blockedUsers?.length || 0,
            blockedBy: currentUser.blockedBy?.length || 0,
            totalBlocked: allBlockedIds.size
        });
        
        // ✅ جلب الرسائل مع الردود (replyTo)
             const messages = await Message.find({ room: 'public-room' })
            .sort('-createdAt')
            .limit(50)
            .populate('sender', 'username profileImage activeBubbleSkinClass')
            .populate({
                path: 'replyTo',
                populate: {
                    path: 'sender',
                    select: 'username profileImage'
                }
            })
            .lean();
        
        const filteredMessages = messages.filter(message => {
            const senderId = message.sender._id.toString();
            return !allBlockedIds.has(senderId);
        });
        
        console.log(`[FILTER] Original: ${messages.length}, Filtered: ${filteredMessages.length}`);

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
