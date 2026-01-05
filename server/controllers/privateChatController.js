const PrivateChat = require('../models/PrivateChat');
const PrivateMessage = require('../models/PrivateMessage');
const User = require('../models/User');
const ChatReport = require('../models/ChatReport');

// =================================================
// إنشاء/جلب دردشة خاصة
// =================================================
exports.getOrCreateChat = async (req, res) => {
    try {
        const userId = req.user.id;
        const otherUserId = req.params.userId;

        console.log(`[CHAT] Getting/Creating chat between ${userId} and ${otherUserId}`);

        // 1. التحقق من عدم إنشاء دردشة مع نفسك
        if (userId === otherUserId) {
            return res.status(400).json({
                status: 'fail',
                message: 'لا يمكنك إنشاء دردشة مع نفسك'
            });
        }

        // 2. التحقق من وجود المستخدم الآخر
        const otherUser = await User.findById(otherUserId);
        if (!otherUser) {
            return res.status(404).json({
                status: 'fail',
                message: 'المستخدم غير موجود'
            });
        }

        // 3. التحقق من الحظر
        const [currentUser, targetUser] = await Promise.all([
            User.findById(userId).select('blockedUsers blockedBy'),
            User.findById(otherUserId).select('blockedUsers blockedBy')
        ]);

        if (!currentUser || !targetUser) {
            return res.status(404).json({
                status: 'fail',
                message: 'المستخدم غير موجود'
            });
        }

        // التحقق من الحظر المتبادل
        const currentUserBlocked = currentUser.blockedUsers.map(id => id.toString());
        const targetUserBlocked = targetUser.blockedUsers.map(id => id.toString());

        if (currentUserBlocked.includes(otherUserId) || targetUserBlocked.includes(userId)) {
            return res.status(403).json({
                status: 'fail',
                message: 'لا يمكنك مراسلة هذا المستخدم بسبب الحظر'
            });
        }

        // 4. البحث عن دردشة موجودة
        const participants = [userId, otherUserId].sort();
        const chatId = participants.join('_');

        let chat = await PrivateChat.findOne({ chatId })
            .populate('participants', 'username profileImage customId level');

        // 5. إذا لم تكن موجودة، إنشاء واحدة جديدة
        // 5. إذا لم تكن موجودة، إنشاء واحدة جديدة
if (!chat) {
    console.log(`[CHAT] Creating new chat: ${chatId}`);
    
    // تأكد من أن participants هي ObjectId
    const mongoose = require('mongoose');
    const participantIds = participants.map(id => new mongoose.Types.ObjectId(id));

    chat = await PrivateChat.create({
        chatId,
        participants: participantIds, // ✅ الآن ObjectId
        participantData: [
            {
                userId: new mongoose.Types.ObjectId(userId),
                username: req.user.username,
                profileImage: req.user.profileImage
            },
            {
                userId: new mongoose.Types.ObjectId(otherUserId),
                username: otherUser.username,
                profileImage: otherUser.profileImage
            }
        ]
    });

            // جلب البيانات مع populate
            chat = await PrivateChat.findById(chat._id)
                .populate('participants', 'username profileImage customId level');
        }

        // 6. جلب آخر 50 رسالة
        const messages = await PrivateMessage.find({ chatId: chat.chatId })
            .sort('-createdAt')
            .limit(50)
            .populate('sender', 'username profileImage')
            .populate('replyTo', 'content sender')
            .lean();

        // ترتيب الرسائل من الأقدم للأحدث
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
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في الخادم أثناء إنشاء/جلب الدردشة'
        });
    }
};

// =================================================
// إرسال رسالة نصية
// =================================================
exports.sendMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { receiverId, content, replyTo, type = 'text', metadata = {} } = req.body;

        console.log(`[CHAT] Sending message from ${userId} to ${receiverId}`);

        if (!content && type === 'text') {
            return res.status(400).json({
                status: 'fail',
                message: 'محتوى الرسالة مطلوب'
            });
        }

        if (content && content.length > 200) {
            return res.status(400).json({
                status: 'fail',
                message: 'الرسالة طويلة جداً (200 حرف كحد أقصى)'
            });
        }

        // 1. التحقق من الحظر
        const [sender, receiver] = await Promise.all([
            User.findById(userId).select('blockedUsers'),
            User.findById(receiverId).select('blockedUsers socketId')
        ]);

        if (!sender || !receiver) {
            return res.status(404).json({
                status: 'fail',
                message: 'المستخدم غير موجود'
            });
        }

        // التحقق من الحظر
        const senderBlocked = sender.blockedUsers.map(id => id.toString());
        const receiverBlocked = receiver.blockedUsers.map(id => id.toString());

        if (senderBlocked.includes(receiverId) || receiverBlocked.includes(userId)) {
            return res.status(403).json({
                status: 'fail',
                message: 'لا يمكنك مراسلة هذا المستخدم بسبب الحظر'
            });
        }

        // 2. الحصول على الدردشة أو إنشاؤها
        const participants = [userId, receiverId].sort();
        const chatId = participants.join('_');

        let chat = await PrivateChat.findOne({ chatId });

        if (!chat) {
            chat = await PrivateChat.create({
                chatId,
                participants: participants,
                participantData: [
                    {
                        userId: userId,
                        username: req.user.username,
                        profileImage: req.user.profileImage
                    },
                    {
                        userId: receiverId,
                        username: receiver.username,
                        profileImage: receiver.profileImage
                    }
                ]
            });
        }

        // 3. إنشاء الرسالة
        const messageData = {
            chatId,
            sender: userId,
            receiver: receiverId,
            type,
            content: content || '',
            metadata: {
                ...metadata,
                sentAt: new Date()
            }
        };

        if (replyTo) {
            messageData.replyTo = replyTo;
        }

        const newMessage = await PrivateMessage.create(messageData);

        // 4. تحديث الدردشة
        chat.lastMessage = type === 'text' ? content : `رسالة ${type}`;
        chat.lastMessageAt = new Date();
        chat.lastMessageBy = userId;
        chat.messageCount += 1;

        // زيادة عداد غير المقروء للمستقبل
        const currentUnread = chat.unreadCount.get(receiverId.toString()) || 0;
        chat.unreadCount.set(receiverId.toString(), currentUnread + 1);

        await chat.save();

        // 5. جلب الرسالة مع بيانات المرسل
        const populatedMessage = await PrivateMessage.findById(newMessage._id)
            .populate('sender', 'username profileImage')
            .populate('replyTo', 'content sender')
            .lean();

        // 6. إرسال عبر Socket
        const io = req.app.get('socketio');
        if (io && receiver.socketId) {
            io.to(receiver.socketId).emit('privateMessageReceived', {
                message: populatedMessage,
                chatId: chat.chatId,
                senderId: userId,
                senderName: req.user.username
            });
        }

        // 7. الرد الناجح
        res.status(201).json({
            status: 'success',
            message: 'تم إرسال الرسالة بنجاح',
            data: {
                message: populatedMessage,
                chatId: chat.chatId,
                unreadCount: chat.unreadCount.get(receiverId.toString()) || 0
            }
        });

    } catch (error) {
        console.error('[ERROR] in sendMessage:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في الخادم أثناء إرسال الرسالة'
        });
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
            isActive: true
        })
        .populate('participants', 'username profileImage customId')
        .sort('-lastMessageAt')
        .limit(50)
        .lean();

        // إضافة معلومات إضافية لكل دردشة
        const enrichedChats = await Promise.all(
            chats.map(async (chat) => {
                // جلب آخر رسالة
                const lastMessage = await PrivateMessage.findOne(
                    { chatId: chat.chatId }
                )
                .sort('-createdAt')
                .populate('sender', 'username profileImage')
                .lean();

                // عدد الرسائل غير المقروءة
                const unreadCount = chat.unreadCount.get(userId.toString()) || 0;

                // بيانات المشارك الآخر
                const otherParticipant = chat.participants.find(
                    p => p._id.toString() !== userId.toString()
                );

                return {
                    ...chat,
                    lastMessage: lastMessage,
                    unreadCount: unreadCount,
                    otherParticipant: otherParticipant
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

        // التحقق من أن المستخدم هو المستقبل
        if (message.receiver.toString() !== userId.toString()) {
            return res.status(403).json({
                status: 'fail',
                message: 'ليس لديك صلاحية لتحديث حالة هذه الرسالة'
            });
        }

        // تحديث الحالة
        if (status === 'delivered' && !message.status.delivered) {
            message.status.delivered = true;
            message.status.deliveredAt = new Date();
        } else if (status === 'seen' && !message.status.seen) {
            message.status.seen = true;
            message.status.seenAt = new Date();
        }

        await message.save();

        // إرسال إشعار للمرسل عبر Socket
        const io = req.app.get('socketio');
        if (io) {
            io.to(`user-${message.sender.toString()}`).emit('messageStatusUpdated', {
                messageId: message._id,
                status: status,
                updatedAt: new Date()
            });
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
        const { messageId, deleteForEveryone } = req.body;

        const message = await PrivateMessage.findById(messageId);

        if (!message) {
            return res.status(404).json({
                status: 'fail',
                message: 'الرسالة غير موجودة'
            });
        }

        // التحقق من أن المستخدم هو المرسل أو المستقبل
        const isSender = message.sender.toString() === userId.toString();
        const isReceiver = message.receiver.toString() === userId.toString();

        if (!isSender && !isReceiver) {
            return res.status(403).json({
                status: 'fail',
                message: 'ليس لديك صلاحية لحذف هذه الرسالة'
            });
        }

        if (deleteForEveryone) {
            // حذف للجميع (فقط المرسل يمكنه فعل هذا خلال وقت محدد)
            if (!isSender) {
                return res.status(403).json({
                    status: 'fail',
                    message: 'فقط المرسل يمكنه حذف الرسالة للجميع'
                });
            }

            // التحقق من الوقت (مثلاً خلال 5 دقائق فقط)
            const messageAge = Date.now() - new Date(message.createdAt).getTime();
            const fiveMinutes = 5 * 60 * 1000;

            if (messageAge > fiveMinutes) {
                return res.status(400).json({
                    status: 'fail',
                    message: 'انتهى الوقت المسموح لحذف الرسالة للجميع'
                });
            }

            // حذف فعلي من قاعدة البيانات
            await PrivateMessage.findByIdAndDelete(messageId);

        } else {
            // حذف من جهة واحدة فقط
            if (isSender) {
                message.status.deletedForSender = true;
            } else if (isReceiver) {
                message.status.deletedForReceiver = true;
            }
            
            message.status.deletedAt = new Date();
            await message.save();
        }

        res.status(200).json({
            status: 'success',
            message: deleteForEveryone ? 'تم حذف الرسالة للجميع' : 'تم حذف الرسالة'
        });

    } catch (error) {
        console.error('[ERROR] in deleteMessage:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في الخادم أثناء حذف الرسالة'
        });
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
// إرسال رسالة وسائط
// =================================================
exports.sendMediaMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { 
            receiverId, 
            mediaUrl, 
            mediaType, 
            thumbnail, 
            duration, 
            dimensions, 
            metadata = {} 
        } = req.body;

        console.log(`[CHAT MEDIA] Sending ${mediaType} message from ${userId} to ${receiverId}`);

        if (!mediaUrl || !mediaType || !receiverId) {
            return res.status(400).json({
                status: 'fail',
                message: 'بيانات الوسائط ناقصة'
            });
        }

        // التحقق من الحظر
        const [sender, receiver] = await Promise.all([
            User.findById(userId).select('blockedUsers'),
            User.findById(receiverId).select('blockedUsers socketId')
        ]);

        if (!sender || !receiver) {
            return res.status(404).json({
                status: 'fail',
                message: 'المستخدم غير موجود'
            });
        }

        const senderBlocked = sender.blockedUsers.map(id => id.toString());
        const receiverBlocked = receiver.blockedUsers.map(id => id.toString());

        if (senderBlocked.includes(receiverId) || receiverBlocked.includes(userId)) {
            return res.status(403).json({
                status: 'fail',
                message: 'لا يمكنك إرسال وسائط لمستخدم حظرك أو حظرته'
            });
        }

        // 1. الحصول على الدردشة أو إنشاؤها
        const participants = [userId, receiverId].sort();
        const chatId = participants.join('_');

        let chat = await PrivateChat.findOne({ chatId });

        if (!chat) {
            chat = await PrivateChat.create({
                chatId,
                participants: participants.map(id => new mongoose.Types.ObjectId(id)),
                participantData: [
                    {
                        userId: new mongoose.Types.ObjectId(userId),
                        username: req.user.username,
                        profileImage: req.user.profileImage
                    },
                    {
                        userId: new mongoose.Types.ObjectId(receiverId),
                        username: receiver.username,
                        profileImage: receiver.profileImage
                    }
                ]
            });
        }

        // 2. إنشاء رسالة الوسائط
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
                format: metadata.format
            }
        };

        const newMessage = await PrivateMessage.create(messageData);

        // 3. تحديث الدردشة
        chat.lastMessage = `رسالة ${mediaType}`;
        chat.lastMessageAt = new Date();
        chat.lastMessageBy = userId;
        chat.messageCount += 1;

        // زيادة عداد غير المقروء
        const currentUnread = chat.unreadCount.get(receiverId.toString()) || 0;
        chat.unreadCount.set(receiverId.toString(), currentUnread + 1);

        await chat.save();

        // 4. جلب الرسالة مع بيانات المرسل
        const populatedMessage = await PrivateMessage.findById(newMessage._id)
            .populate('sender', 'username profileImage')
            .lean();

        // 5. إرسال عبر Socket
        const io = req.app.get('socketio');
        if (io && receiver.socketId) {
            io.to(receiver.socketId).emit('privateMessageReceived', {
                message: populatedMessage,
                chatId: chat.chatId,
                senderId: userId,
                senderName: req.user.username
            });
        }

        // 6. إذا كانت View Once، جدولة الحذف
        if (metadata.viewOnce) {
            setTimeout(async () => {
                try {
                    const freshMessage = await PrivateMessage.findById(newMessage._id);
                    if (freshMessage && freshMessage.status.viewed) {
                        // حذف الوسائط بعد المشاهدة
                        if (metadata.publicId) {
                            const { deleteChatMedia } = require('../utils/cloudinary');
                            await deleteChatMedia(metadata.publicId, mediaType === 'video' ? 'video' : 'image');
                        }
                        
                        freshMessage.content = 'تم حذف الوسائط (مشاهدة مرة واحدة)';
                        freshMessage.metadata.deleted = true;
                        await freshMessage.save();
                    }
                } catch (error) {
                    console.error('[CHAT MEDIA] Error cleaning viewOnce media:', error);
                }
            }, 5 * 60 * 1000); // 5 دقائق
        }

        // 7. الرد الناجح
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
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في الخادم أثناء إرسال الوسائط'
        });
    }
};



module.exports = exports;
