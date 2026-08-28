const PrivateChat = require('../models/PrivateChat');
const PrivateMessage = require('../models/PrivateMessage');
const User = require('../models/User');
const OneTimeMessageLog = require('../models/OneTimeMessageLog');
const ChatReport = require('../models/ChatReport');
const { deleteChatMedia } = require('../utils/cloudinary');

// =================================================
// إنشاء/جلب دردشة خاصة
// =================================================
exports.getOrCreateChat = async (req, res) => {
    try {
        const userId = req.user.id;
        const otherUserId = req.params.userId;

        if (userId === otherUserId) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكنك إنشاء دردشة مع نفسك' });
        }

        const otherUser = await User.findById(otherUserId);
        if (!otherUser) {
            return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        }

        // ✅ الإصلاح الجوهري: لم نعد نمنع الوصول لسجل المحادثة بسبب الحظر (بأي اتجاه)
        // فقط نمنع إرسال رسائل جديدة إذا كنت أنا من حظرت الطرف الآخر (يُتحقق منه بمكان الإرسال)

        const participants = [userId, otherUserId].sort();
        const chatId = participants.join('_');

        let chat = await PrivateChat.findOne({ chatId })
            .populate('participants', 'username profileImage customId level');

        if (!chat) {
            const mongoose = require('mongoose');
            const participantIds = participants.map(id => new mongoose.Types.ObjectId(id));

            chat = await PrivateChat.create({
                chatId,
                participants: participantIds,
                participantData: [
                    { userId: new mongoose.Types.ObjectId(userId), username: req.user.username, profileImage: req.user.profileImage },
                    { userId: new mongoose.Types.ObjectId(otherUserId), username: otherUser.username, profileImage: otherUser.profileImage }
                ]
            });

            chat = await PrivateChat.findById(chat._id)
                .populate('participants', 'username profileImage customId level');
        }

        const rawMessages = await PrivateMessage.find({ chatId: chat.chatId })
            .sort('-createdAt')
            .limit(50)
            .populate('sender', 'username profileImage')
            .populate({ path: 'replyTo', populate: { path: 'sender', select: 'username' } })
            .lean();

        // ✅ نُخفي فقط الرسائل التي أُرسلت إليّ بينما كنت قد حظرت مرسلها (حظر صامت)
                const messages = rawMessages.filter(m => {
            if (m.isShadowed && m.receiver.toString() === userId.toString()) return false;

            const senderIdStr = m.sender?._id ? m.sender._id.toString() : m.sender.toString();
            const isSenderView = senderIdStr === userId.toString();
            const isReceiverView = m.receiver.toString() === userId.toString();

            if (isSenderView && m.status?.deletedForSender) return false;
            if (isReceiverView && m.status?.deletedForReceiver) return false;
            return true;
        });

        const sortedMessages = messages.reverse();

        res.status(200).json({
            status: 'success',
            data: {
                chat: chat,
                messages: sortedMessages,
                unreadCount: chat.unreadCount.get(userId.toString()) || 0
            }
        });

    } catch (error) {
        console.error('[ERROR] in getOrCreateChat:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء إنشاء/جلب الدردشة' });
    }
};

// =================================================
// إرسال رسالة نصية
// =================================================
exports.sendMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { receiverId, content, replyTo, type = 'text', metadata = {} } = req.body;

        if (!content && type === 'text') {
            return res.status(400).json({ status: 'fail', message: 'محتوى الرسالة مطلوب' });
        }

        if (content && content.length > 200) {
            return res.status(400).json({ status: 'fail', message: 'الرسالة طويلة جداً (200 حرف كحد أقصى)' });
        }

        const [sender, receiver] = await Promise.all([
            User.findById(userId).select('blockedUsers'),
            User.findById(receiverId).select('blockedUsers socketId')
        ]);

        if (!sender || !receiver) {
            return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        }

        const senderBlocked = sender.blockedUsers.map(id => id.toString());
        const receiverBlocked = receiver.blockedUsers.map(id => id.toString());

        // ✅ نمنع فقط إذا أنا من حظرت المستقبل — لا يمكنني مراسلة شخص حظرته
        if (senderBlocked.includes(receiverId)) {
            return res.status(403).json({ status: 'fail', message: 'لا يمكنك مراسلة هذا المستخدم بسبب الحظر' });
        }

        // ✅ إذا هو من حظرني: أقبل الرسالة لكن بصمت تام — تصل لقاعدة البيانات من ناحيتي فقط،
        // دون أي إشعار أو ظهور له، وتبقى عندي بعلامة واحدة للأبد (لا تتحول لعلامتين)
        const isShadowed = receiverBlocked.includes(userId);

        const participants = [userId, receiverId].sort();
        const chatId = participants.join('_');

        let chat = await PrivateChat.findOne({ chatId });

        if (!chat) {
            chat = await PrivateChat.create({
                chatId,
                participants: participants,
                participantData: [
                    { userId: userId, username: req.user.username, profileImage: req.user.profileImage },
                    { userId: receiverId, username: receiver.username, profileImage: receiver.profileImage }
                ]
            });
        }

        const messageData = {
            chatId,
            sender: userId,
            receiver: receiverId,
            type,
            content: content || '',
            isShadowed: isShadowed,
            metadata: { ...metadata, sentAt: new Date() }
        };

        if (replyTo) messageData.replyTo = replyTo;

        const newMessage = await PrivateMessage.create(messageData);

        // ✅ لا نحدّث أي بيانات ظاهرة (آخر رسالة، عداد غير مقروء) إذا كانت الرسالة مخفية
        // حتى لا يبقى أي أثر لها عند من قام بالحظر
        if (!isShadowed) {
            chat.lastMessage = type === 'text' ? content : `رسالة ${type}`;
            chat.lastMessageAt = new Date();
            chat.lastMessageBy = userId;
            chat.messageCount += 1;

            const currentUnread = chat.unreadCount.get(receiverId.toString()) || 0;
            chat.unreadCount.set(receiverId.toString(), currentUnread + 1);

            // إحياء المحادثة تلقائياً لكلا الطرفين حتى لو كانت محذوفة سابقاً من أحدهما
            chat.hiddenBy = chat.hiddenBy.filter(id =>
                id.toString() !== userId.toString() && id.toString() !== receiverId.toString()
            );

            await chat.save();
        }

        const populatedMessage = await PrivateMessage.findById(newMessage._id)
            .populate('sender', 'username profileImage')
            .populate('replyTo', 'content sender type')
            .lean();

        const io = req.app.get('socketio');
        if (io && receiver.socketId && !isShadowed) {
            io.to(receiver.socketId).emit('privateMessageReceived', {
                message: populatedMessage,
                chatId: chat.chatId,
                senderId: userId,
                senderName: req.user.username
            });
        }

        res.status(201).json({
            status: 'success',
            message: 'تم إرسال الرسالة بنجاح',
            data: {
                message: populatedMessage,
                chatId: chat.chatId,
                unreadCount: isShadowed ? 0 : (chat.unreadCount.get(receiverId.toString()) || 0)
            }
        });

    } catch (error) {
        console.error('[ERROR] in sendMessage:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء إرسال الرسالة' });
    }
};

// =================================================
// جلب قائمة الدردشات
// =================================================
exports.getChatList = async (req, res) => {
    try {
        const userId = req.user.id;

        const chats = await PrivateChat.find({
            participants: userId,
            isActive: true,
            hiddenBy: { $ne: userId } // ✅ استثناء المحادثات التي حذفها هذا المستخدم فقط
        })
        .populate('participants', 'username profileImage customId isAgent activeFrameClass')
        .sort('-lastMessageAt')
        .limit(50)
        .lean();

        // ✅ جلب قائمة من حظرهم المستخدم الحالي (متاحة أصلاً في req.user)
        const myBlockedIds = (req.user.blockedUsers || []).map(id => id.toString());

        const enrichedChats = await Promise.all(
            chats.map(async (chat) => {
                                const recentMessages = await PrivateMessage.find({ chatId: chat.chatId })
                    .sort('-createdAt')
                    .limit(5)
                    .populate('sender', 'username profileImage')
                    .lean();

                // ✅ نتجاوز أي رسالة مخفية عني بسبب حظري لمرسلها عند اختيار "آخر رسالة" المعروضة
                const lastMessageDoc = recentMessages.find(m =>
                    !(m.isShadowed && m.receiver.toString() === userId.toString())
                ) || null;

                let unreadCount = 0;
                if (chat.unreadCount) {
                    if (typeof chat.unreadCount.get === 'function') {
                        unreadCount = chat.unreadCount.get(userId.toString()) || 0;
                    } else {
                        unreadCount = chat.unreadCount[userId.toString()] || 0;
                    }
                }

                const otherParticipant = chat.participants
                    ? chat.participants.find(p => p._id.toString() !== userId.toString())
                    : null;

                // ✅ جديد: هل قمت بحظر هذا الشخص؟
                const isBlockedByMe = otherParticipant
                    ? myBlockedIds.includes(otherParticipant._id.toString())
                    : false;

                return {
                    ...chat,
                    lastMessage: chat.lastMessage,
                    lastMessageDetails: lastMessageDoc,
                    unreadCount: unreadCount,
                    otherParticipant: otherParticipant,
                    isBlockedByMe: isBlockedByMe
                };
            })
        );

        res.status(200).json({
            status: 'success',
            data: {
                chats: enrichedChats,
                total: chats.length
            }
        });

    } catch (error) {
        console.error('[ERROR] in getChatList:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في الخادم أثناء جلب قائمة الدردشات'
        });
    }
};

// =================================================
// تحديث حالة الرسالة (تم التسليم/القراءة)
// =================================================
exports.updateMessageStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const { messageId, status } = req.body;

        if (!['delivered', 'seen'].includes(status)) {
            return res.status(400).json({
                status: 'fail',
                message: 'حالة غير صالحة'
            });
        }

        const message = await PrivateMessage.findById(messageId);

        if (!message) {
            return res.status(404).json({
                status: 'fail',
                message: 'الرسالة غير موجودة'
            });
        }

        if (message.receiver.toString() !== userId.toString()) {
            return res.status(403).json({
                status: 'fail',
                message: 'ليس لديك صلاحية لتحديث حالة هذه الرسالة'
            });
        }

        if (status === 'delivered' && !message.status.delivered) {
            message.status.delivered = true;
            message.status.deliveredAt = new Date();
        } else if (status === 'seen' && !message.status.seen) {
            message.status.seen = true;
            message.status.seenAt = new Date();
        }

        await message.save();

        // ✅ الإصلاح: نجيب socketId الخاص بالمرسل مباشرة ونرسل له عليه
        // بدل الاعتماد على غرفة user-ID التي لا يوجد أي socket منضم لها فعلياً
        const io = req.app.get('socketio');
        if (io) {
            const senderUser = await User.findById(message.sender).select('socketId');
            if (senderUser && senderUser.socketId) {
                io.to(senderUser.socketId).emit('messageStatusUpdated', {
                    messageId: message._id,
                    status: status,
                    updatedAt: new Date()
                });
                console.log(`[STATUS UPDATE] Sent '${status}' notification to sender socket: ${senderUser.socketId}`);
            }
        }

        res.status(200).json({
            status: 'success',
            message: `تم تحديث حالة الرسالة إلى ${status === 'seen' ? 'مقروءة' : 'تم التسليم'}`
        });

    } catch (error) {
        console.error('[ERROR] in updateMessageStatus:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في الخادم أثناء تحديث حالة الرسالة'
        });
    }
};

// =================================================
// حذف رسالة
// =================================================
exports.deleteMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { messageId, scope } = req.body; // scope: 'everyone' | 'me'

        const message = await PrivateMessage.findById(messageId);
        if (!message) return res.status(404).json({ status: 'fail', message: 'الرسالة غير موجودة' });

        const isSender = message.sender.toString() === userId.toString();
        const isReceiver = message.receiver.toString() === userId.toString();
        if (!isSender && !isReceiver) {
            return res.status(403).json({ status: 'fail', message: 'ليس لديك صلاحية لحذف هذه الرسالة' });
        }

        // ✅ حذف لدي فقط: بدون أي قيد زمني، يخفيها فقط عند الطرف الطالب
        if (scope === 'me') {
            if (isSender) message.status.deletedForSender = true;
            if (isReceiver) message.status.deletedForReceiver = true;
            await message.save();
            return res.status(200).json({ status: 'success', message: 'تم حذف الرسالة من عندك فقط' });
        }

        // حذف للجميع: يشترط أن تكون خلال 5 دقائق
        const ageMs = Date.now() - new Date(message.createdAt).getTime();
        if (ageMs > 5 * 60 * 1000) {
            return res.status(400).json({ status: 'fail', message: 'انتهت مهلة حذف هذه الرسالة للجميع (5 دقائق)، يمكنك حذفها من عندك فقط' });
        }

        const publicId = message.metadata?.publicId;
        if (publicId) {
            const resourceType = message.type === 'image' ? 'image' : 'video';
            await deleteChatMedia(publicId, resourceType);
        }

        await PrivateMessage.findByIdAndDelete(messageId);

        const io = req.app.get('socketio');
        const otherUserId = isSender ? message.receiver : message.sender;
        const otherUser = await User.findById(otherUserId).select('socketId');
        if (io && otherUser?.socketId) {
            io.to(otherUser.socketId).emit('privateMessageDeleted', { messageId });
        }

        res.status(200).json({ status: 'success', message: 'تم حذف الرسالة للجميع' });

    } catch (error) {
        console.error('[ERROR] in deleteMessage:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء حذف الرسالة' });
    }
};

// =================================================
// تعديل رسالة نصية (خلال دقيقتين، للمرسل فقط)
// =================================================
exports.editMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { messageId, newContent } = req.body;

        if (!newContent || newContent.trim().length === 0) {
            return res.status(400).json({ status: 'fail', message: 'المحتوى الجديد مطلوب' });
        }
        if (newContent.length > 200) {
            return res.status(400).json({ status: 'fail', message: 'الرسالة طويلة جداً' });
        }

        const message = await PrivateMessage.findById(messageId);
        if (!message) return res.status(404).json({ status: 'fail', message: 'الرسالة غير موجودة' });

        if (message.sender.toString() !== userId.toString()) {
            return res.status(403).json({ status: 'fail', message: 'يمكنك تعديل رسائلك فقط' });
        }
        if (message.type !== 'text') {
            return res.status(400).json({ status: 'fail', message: 'لا يمكن تعديل هذا النوع من الرسائل' });
        }

        const ageMs = Date.now() - new Date(message.createdAt).getTime();
        if (ageMs > 2 * 60 * 1000) {
            return res.status(400).json({ status: 'fail', message: 'انتهت مهلة تعديل هذه الرسالة (دقيقتان)' });
        }

        message.content = newContent.trim();
        message.metadata = { ...message.metadata, edited: true };
        await message.save();

        const io = req.app.get('socketio');
        const receiverUser = await User.findById(message.receiver).select('socketId');
        if (io && receiverUser?.socketId) {
            io.to(receiverUser.socketId).emit('privateMessageEdited', { messageId, newContent: message.content });
        }

        res.status(200).json({ status: 'success', message: 'تم تعديل الرسالة' });

    } catch (error) {
        console.error('[ERROR] in editMessage:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء تعديل الرسالة' });
    }
};

// =================================================
// الإبلاغ عن رسالة
// =================================================
exports.reportMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { messageId, reason, description } = req.body;

        const message = await PrivateMessage.findById(messageId)
            .populate('sender', 'username');

        if (!message) {
            return res.status(404).json({
                status: 'fail',
                message: 'الرسالة غير موجودة'
            });
        }

        // التحقق من أن المستخدم هو المستقبل
        if (message.receiver.toString() !== userId.toString()) {
            return res.status(403).json({
                status: 'fail',
                message: 'يمكنك الإبلاغ عن الرسائل الموجهة لك فقط'
            });
        }

        // إنشاء بلاغ
        const report = await ChatReport.create({
            reporter: userId,
            reportedUser: message.sender._id,
            messageId: message._id,
            chatId: message.chatId,
            reason,
            description,
            evidence: {
                messageContent: message.content,
                messageType: message.type
            }
        });

        // تحديث عداد البلاغات في الرسالة
        message.reportCount += 1;
        message.isReported = true;
        await message.save();

        res.status(201).json({
            status: 'success',
            message: 'تم تقديم البلاغ بنجاح، سنراجعه في أقرب وقت',
            data: { reportId: report._id }
        });

    } catch (error) {
        console.error('[ERROR] in reportMessage:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في الخادم أثناء الإبلاغ عن الرسالة'
        });
    }
};

// =================================================
// تصفير عداد الرسائل غير المقروءة عند فتح المحادثة
// =================================================
exports.markChatAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const otherUserId = req.params.userId;

        const participants = [userId, otherUserId].sort();
        const chatId = participants.join('_');

        // ✅ ملاحظة: بدون .lean() هنا عمداً، لأننا نحتاج نستخدم .set() و .save()
        // وهذا يتطلب مستند Mongoose حقيقي (Map)، وليس كائن عادي
        const chat = await PrivateChat.findOne({ chatId });
        if (!chat) {
            return res.status(200).json({ status: 'success', message: 'لا توجد محادثة بعد' });
        }

        chat.unreadCount.set(userId.toString(), 0);
        await chat.save();

        res.status(200).json({ status: 'success', message: 'تم تصفير عداد الرسائل' });
    } catch (error) {
        console.error('[ERROR] in markChatAsRead:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// =================================================
// إرسال رسالة وسائط
// =================================================
exports.sendMediaMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { receiverId, mediaUrl, mediaType, thumbnail, duration, dimensions, metadata = {} } = req.body;

        console.log(`[CHAT MEDIA] Sending ${mediaType} message from ${userId} to ${receiverId}`);

        if (!mediaUrl || !mediaType || !receiverId) {
            return res.status(400).json({ status: 'fail', message: 'بيانات الوسائط ناقصة' });
        }

        const [sender, receiver] = await Promise.all([
            User.findById(userId).select('blockedUsers'),
            User.findById(receiverId).select('blockedUsers socketId')
        ]);

        if (!sender || !receiver) {
            return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        }

        const senderBlocked = sender.blockedUsers.map(id => id.toString());
        const receiverBlocked = receiver.blockedUsers.map(id => id.toString());

        if (senderBlocked.includes(receiverId) || receiverBlocked.includes(userId)) {
            return res.status(403).json({ status: 'fail', message: 'لا يمكنك إرسال وسائط لمستخدم حظرك أو حظرته' });
        }

        const participants = [userId, receiverId].sort();
        const chatId = participants.join('_');

        let chat = await PrivateChat.findOne({ chatId });
        if (!chat) {
            chat = await PrivateChat.create({
                chatId,
                participants: participants.map(id => new mongoose.Types.ObjectId(id)),
                participantData: [
                    { userId: new mongoose.Types.ObjectId(userId), username: req.user.username, profileImage: req.user.profileImage },
                    { userId: new mongoose.Types.ObjectId(receiverId), username: receiver.username, profileImage: receiver.profileImage }
                ]
            });
        }

        const messageData = {
            chatId,
            sender: userId,
            receiver: receiverId,
            type: mediaType,
            content: mediaUrl,
            metadata: {
                thumbnail: thumbnail,
                duration: duration,
                dimensions: dimensions,
                viewOnce: metadata.viewOnce || false,
                disableSave: metadata.disableSave || false,
                hasWatermark: metadata.hasWatermark || false,
                disableReply: metadata.disableReply || false,
                autoDelete: metadata.autoDelete || false,
                publicId: metadata.publicId,
                fileSize: metadata.fileSize,
                format: metadata.format,
                _viewOnce: metadata.viewOnce ? true : false
            }
        };

        const newMessage = await PrivateMessage.create(messageData);

        chat.lastMessage = `رسالة ${mediaType}`;
        chat.lastMessageAt = new Date();
        chat.lastMessageBy = userId;
        chat.messageCount += 1;

                const currentUnread = chat.unreadCount.get(receiverId.toString()) || 0;
        chat.unreadCount.set(receiverId.toString(), currentUnread + 1);

        // ✅ نفس الإصلاح: إحياء المحادثة لكلا الطرفين عند وصول وسائط جديدة
        chat.hiddenBy = chat.hiddenBy.filter(id =>
            id.toString() !== userId.toString() && id.toString() !== receiverId.toString()
        );

        await chat.save();

        const populatedMessage = await PrivateMessage.findById(newMessage._id)
            .populate('sender', 'username profileImage')
            .lean();

        const io = req.app.get('socketio');
        if (io && receiver.socketId) {
            io.to(receiver.socketId).emit('privateMessageReceived', {
                message: populatedMessage,
                chatId: chat.chatId,
                senderId: userId,
                senderName: req.user.username
            });
        }

        // جدولة حذف View Once بعد 5 دقائق
        if (metadata.viewOnce && metadata.publicId) {
            setTimeout(async () => {
                try {
                    const { deleteChatMedia } = require('../utils/cloudinary');
                    await deleteChatMedia(metadata.publicId, 'image');
                    await PrivateMessage.findByIdAndUpdate(newMessage._id, {
                        content: 'تم حذف الصورة (مشاهدة مرة واحدة)',
                        'metadata.deleted': true
                    });
                } catch (e) {
                    console.error('[VIEW ONCE] Error deleting image:', e);
                }
            }, 5 * 60 * 1000);
        }

        res.status(201).json({
            status: 'success',
            message: `تم إرسال ${mediaType === 'image' ? 'الصورة' : mediaType === 'voice' ? 'الرسالة الصوتية' : 'الفيديو'} بنجاح`,
            data: {
                message: populatedMessage,
                chatId: chat.chatId,
                unreadCount: chat.unreadCount.get(receiverId.toString()) || 0
            }
        });

    } catch (error) {
        console.error('[ERROR] in sendMediaMessage:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء إرسال الوسائط' });
    }
};

// =================================================
// حذف/إخفاء محادثة من قائمة مستخدم واحد فقط (لا تُحذف للطرف الآخر)
// =================================================
exports.hideChatForUser = async (req, res) => {
    try {
        const userId = req.user.id;
        const otherUserId = req.params.userId;

        const participants = [userId, otherUserId].sort();
        const chatId = participants.join('_');

        const chat = await PrivateChat.findOne({ chatId });
        if (!chat) {
            return res.status(200).json({ status: 'success', message: 'لا توجد محادثة لحذفها' });
        }

        const alreadyHidden = chat.hiddenBy.map(id => id.toString()).includes(userId.toString());
        if (!alreadyHidden) {
            chat.hiddenBy.push(userId);
            await chat.save();
        }

        res.status(200).json({ status: 'success', message: 'تم حذف المحادثة من قائمتك' });
    } catch (error) {
        console.error('[ERROR] in hideChatForUser:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// =================================================
// إرسال رسالة واحدة لمستخدم حظرك (متاحة من مستوى 4)
// =================================================
exports.sendOneTimeMessage = async (req, res) => {
    try {
        const senderId = req.user.id;
        const { receiverId, content, payExtra } = req.body;
        const EXTRA_MESSAGE_COST = 50;

        if (!receiverId || !content) {
            return res.status(400).json({ status: 'fail', message: 'بيانات ناقصة' });
        }
        if (req.user.level < 4) {
            return res.status(403).json({ status: 'fail', message: 'هذه الميزة تُفتح عند المستوى 4' });
        }
        if (content.trim().length === 0) {
            return res.status(400).json({ status: 'fail', message: 'اكتب رسالة أولاً' });
        }
        if (content.length > 25) {
            return res.status(400).json({ status: 'fail', message: 'الرسالة يجب ألا تتجاوز 25 حرفاً' });
        }

        const receiver = await User.findById(receiverId).select('blockedUsers socketId username profileImage');
        if (!receiver) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });

        const heBlockedMe = receiver.blockedUsers.map(id => id.toString()).includes(senderId.toString());
        if (!heBlockedMe) {
            return res.status(400).json({ status: 'fail', message: 'هذه الميزة متاحة فقط لمن حظرك' });
        }

        const priorCount = await OneTimeMessageLog.countDocuments({ sender: senderId, receiver: receiverId });
        let wasPaid = false;
        let senderDoc = null;

        if (priorCount > 0) {
            if (!payExtra) {
                return res.status(402).json({
                    status: 'fail',
                    code: 'PAYMENT_REQUIRED',
                    message: `لقد أرسلت رسالتك المجانية مسبقاً. إرسال رسالة إضافية يكلّف ${EXTRA_MESSAGE_COST} كوينز.`,
                    cost: EXTRA_MESSAGE_COST
                });
            }

            senderDoc = await User.findById(senderId);
            if (!senderDoc) {
                return res.status(404).json({ status: 'fail', message: 'حسابك غير موجود' });
            }
            if (senderDoc.coins < EXTRA_MESSAGE_COST) {
                return res.status(400).json({
                    status: 'fail',
                    code: 'INSUFFICIENT_COINS',
                    message: `رصيدك من الكوينز غير كافٍ (تحتاج ${EXTRA_MESSAGE_COST} كوينز)`
                });
            }

            senderDoc.coins -= EXTRA_MESSAGE_COST;
            await senderDoc.save();
            wasPaid = true;
        }

        const participants = [senderId.toString(), receiverId.toString()].sort();
        const chatId = participants.join('_');

        let chat = await PrivateChat.findOne({ chatId });
        if (!chat) {
            chat = await PrivateChat.create({
                chatId,
                participants,
                participantData: [
                    { userId: senderId, username: req.user.username, profileImage: req.user.profileImage },
                    { userId: receiverId, username: receiver.username, profileImage: receiver.profileImage }
                ]
            });
        }

        const message = await PrivateMessage.create({
            chatId,
            sender: senderId,
            receiver: receiverId,
            type: 'text',
            content: `${content.trim()} (رسالة تجاوز حظر)`,
            isShadowed: false
        });

        // ✅ نسجل استخدام الرسالة فقط بعد نجاح كل الخطوات الحرجة (لتفادي حجب رسائل مجانية بسبب خطأ لاحق)
        await OneTimeMessageLog.create({ sender: senderId, receiver: receiverId, wasPaid });

        chat.lastMessage = content.trim();
        chat.lastMessageAt = new Date();
        chat.lastMessageBy = senderId;
        chat.hiddenBy = chat.hiddenBy.filter(id => id.toString() !== senderId.toString() && id.toString() !== receiverId.toString());
        await chat.save();

        const populatedMessage = await PrivateMessage.findById(message._id).populate('sender', 'username profileImage').lean();

        const io = req.app.get('socketio');
        if (io && receiver.socketId) {
            io.to(receiver.socketId).emit('privateMessageReceived', {
                message: populatedMessage, chatId, senderId, senderName: req.user.username
            });
        }
        if (io && wasPaid && req.user.socketId) {
            io.to(req.user.socketId).emit('coinsUpdated', { newCoins: senderDoc.coins });
        }

        res.status(201).json({
            status: 'success',
            message: wasPaid ? `تم إرسال رسالتك (خُصمت ${EXTRA_MESSAGE_COST} كوينز)` : 'تم إرسال رسالتك المجانية بنجاح',
            data: { wasPaid, newCoins: senderDoc ? senderDoc.coins : undefined }
        });

    } catch (error) {
        console.error('[ERROR] in sendOneTimeMessage:', error.message);
        console.error(error.stack);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء إرسال الرسالة' });
    }
};

// =================================================
// حذف محادثة بالكامل من الطرفين (رسائل + وسائط Cloudinary)
// =================================================
exports.deleteEntireChat = async (req, res) => {
    try {
        const userId = req.user.id;
        const otherUserId = req.params.userId;

        const participants = [userId, otherUserId].sort();
        const chatId = participants.join('_');

        const messages = await PrivateMessage.find({ chatId });

        // ✅ حذف كل ملفات الوسائط من Cloudinary أولاً
        for (const msg of messages) {
            const publicId = msg.metadata?.publicId;
            if (publicId) {
                const resourceType = msg.type === 'image' ? 'image' : 'video'; // الصوت والفيديو يُخزنان كـ video
                await deleteChatMedia(publicId, resourceType);
            }
        }

        await PrivateMessage.deleteMany({ chatId });
        await PrivateChat.deleteOne({ chatId });

        const io = req.app.get('socketio');
        const otherUser = await User.findById(otherUserId).select('socketId');
        if (io && otherUser?.socketId) {
            io.to(otherUser.socketId).emit('chatFullyDeleted', { chatId, byUserId: userId });
        }

        res.status(200).json({ status: 'success', message: 'تم حذف المحادثة بالكامل من الطرفين' });

    } catch (error) {
        console.error('[ERROR] in deleteEntireChat:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء حذف المحادثة' });
    }
};

module.exports = exports;
