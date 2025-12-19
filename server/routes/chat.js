const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { chatImageUpload, chatVoiceUpload } = require('../middleware/upload');

// Get chat rooms for user
router.get('/rooms', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        
        const Chat = require('../models/Chat');
        
        // Find all rooms where user is a participant
        const rooms = await Chat.find({
            participants: userId,
            isActive: true
        })
        .populate('participants', 'username profileImage isOnline')
        .sort('-lastMessageAt')
        .limit(50);
        
        // Format response
        const formattedRooms = rooms.map(room => {
            const otherParticipants = room.participants.filter(p => p._id.toString() !== userId);
            const lastMessage = room.messages[room.messages.length - 1];
            
            return {
                roomId: room.roomId,
                roomType: room.roomType,
                participants: otherParticipants,
                lastMessage: lastMessage ? {
                    content: lastMessage.content || 'صورة' || 'تسجيل صوتي',
                    sender: lastMessage.sender,
                    timestamp: lastMessage.createdAt
                } : null,
                unreadCount: room.messages.filter(m => 
                    !m.readBy?.includes(userId) && 
                    m.sender.toString() !== userId
                ).length,
                updatedAt: room.lastMessageAt
            };
        });
        
        res.json({
            success: true,
            rooms: formattedRooms
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get chat messages
router.get('/rooms/:roomId/messages', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const { roomId } = req.params;
        const { before, limit = 50 } = req.query;
        
        const Chat = require('../models/Chat');
        
        // Find chat room
        const chat = await Chat.findOne({ roomId });
        if (!chat) {
            return res.status(404).json({
                success: false,
                message: 'غرفة الدردشة غير موجودة'
            });
        }
        
        // Check if user is participant
        if (!chat.participants.some(p => p.toString() === userId)) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية للدردشة في هذه الغرفة'
            });
        }
        
        // Filter messages
        let messages = chat.messages;
        
        if (before) {
            const beforeDate = new Date(before);
            messages = messages.filter(m => m.createdAt < beforeDate);
        }
        
        // Sort by date (newest first) and limit
        messages = messages
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, limit)
            .reverse(); // Return in chronological order
        
        // Mark messages as read
        const unreadMessages = messages.filter(m => 
            !m.readBy?.includes(userId) && 
            m.sender.toString() !== userId
        );
        
        if (unreadMessages.length > 0) {
            unreadMessages.forEach(message => {
                if (!message.readBy) message.readBy = [];
                message.readBy.push(userId);
            });
            
            await chat.save();
        }
        
        res.json({
            success: true,
            messages: messages.map(msg => ({
                id: msg._id,
                sender: msg.sender,
                messageType: msg.messageType,
                content: msg.content,
                imageUrl: msg.imageUrl,
                voiceUrl: msg.voiceUrl,
                voiceDuration: msg.voiceDuration,
                gift: msg.gift,
                allowSave: msg.allowSave,
                allowScreenshot: msg.allowScreenshot,
                viewCount: msg.viewCount,
                readBy: msg.readBy || [],
                createdAt: msg.createdAt,
                expiresAt: msg.expiresAt
            })),
            hasMore: chat.messages.length > messages.length
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Upload chat image
router.post('/upload-image', auth, chatImageUpload, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'صورة مطلوبة'
            });
        }
        
        // Upload to Cloudinary
        const cloudinary = require('cloudinary').v2;
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'chat-images',
            transformation: [
                { width: 800, height: 800, crop: 'limit' },
                { quality: 'auto:good' }
            ]
        });
        
        // Delete local file
        const fs = require('fs');
        fs.unlinkSync(req.file.path);
        
        res.json({
            success: true,
            imageUrl: result.secure_url,
            publicId: result.public_id
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Upload chat voice message
router.post('/upload-voice', auth, chatVoiceUpload, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'تسجيل صوتي مطلوب'
            });
        }
        
        // Check file size (max 5MB for voice)
        if (req.file.size > 5 * 1024 * 1024) {
            return res.status(400).json({
                success: false,
                message: 'حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت'
            });
        }
        
        // Get duration (you would need a library like ffmpeg for this)
        // For now, we'll estimate or require client to send duration
        const { duration } = req.body;
        
        if (!duration || duration > 15) {
            return res.status(400).json({
                success: false,
                message: 'مدة التسجيل يجب ألا تتجاوز 15 ثانية'
            });
        }
        
        // Upload to Cloudinary
        const cloudinary = require('cloudinary').v2;
        const result = await cloudinary.uploader.upload(req.file.path, {
            resource_type: 'video',
            folder: 'chat-voices',
            transformation: [
                { audio_codec: 'mp3' }
            ]
        });
        
        // Delete local file
        const fs = require('fs');
        fs.unlinkSync(req.file.path);
        
        res.json({
            success: true,
            voiceUrl: result.secure_url,
            duration: parseFloat(duration),
            publicId: result.public_id
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Create private chat room
router.post('/private/create', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const { recipientId } = req.body;
        
        if (!recipientId) {
            return res.status(400).json({
                success: false,
                message: 'المستخدم المستلم مطلوب'
            });
        }
        
        // Check if recipient exists
        const User = require('../models/User');
        const recipient = await User.findById(recipientId);
        if (!recipient) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم المستلم غير موجود'
            });
        }
        
        // Check if room already exists
        const Chat = require('../models/Chat');
        const existingRoom = await Chat.findOne({
            roomType: 'private',
            participants: { $all: [userId, recipientId], $size: 2 }
        });
        
        if (existingRoom) {
            return res.json({
                success: true,
                roomId: existingRoom.roomId,
                message: 'غرفة الدردشة موجودة مسبقاً'
            });
        }
        
        // Create new room
        const roomId = `private-${userId}-${recipientId}-${Date.now()}`;
        
        const chat = new Chat({
            roomType: 'private',
            roomId,
            participants: [userId, recipientId],
            isActive: true
        });
        
        await chat.save();
        
        res.json({
            success: true,
            roomId,
            message: 'تم إنشاء غرفة الدردشة'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Report chat message
router.post('/report', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const { messageId, roomId, reason, details } = req.body;
        
        if (!messageId || !roomId || !reason) {
            return res.status(400).json({
                success: false,
                message: 'يرجى تقديم جميع المعلومات المطلوبة'
            });
        }
        
        const Chat = require('../models/Chat');
        const Report = require('../models/Report');
        
        // Find the message
        const chat = await Chat.findOne({ roomId });
        if (!chat) {
            return res.status(404).json({
                success: false,
                message: 'غرفة الدردشة غير موجودة'
            });
        }
        
        const message = chat.messages.id(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'الرسالة غير موجودة'
            });
        }
        
        // Create report
        const report = new Report({
            reporter: userId,
            reportedUser: message.sender,
            messageId,
            roomId,
            reason,
            details,
            messageContent: message.content || message.imageUrl || message.voiceUrl,
            messageType: message.messageType,
            status: 'pending'
        });
        
        await report.save();
        
        // Notify admins (in real app, this would be via sockets)
        
        res.json({
            success: true,
            message: 'تم تقديم البلاغ بنجاح. سيتم مراجعته من قبل الإدارة',
            reportId: report._id
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Clear chat history
router.delete('/rooms/:roomId/clear', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const { roomId } = req.params;
        
        const Chat = require('../models/Chat');
        
        const chat = await Chat.findOne({ roomId });
        if (!chat) {
            return res.status(404).json({
                success: false,
                message: 'غرفة الدردشة غير موجودة'
            });
        }
        
        // Check if user is participant
        if (!chat.participants.some(p => p.toString() === userId)) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لهذه الغرفة'
            });
        }
        
        // Clear messages (in production, you might want to archive instead)
        chat.messages = [];
        await chat.save();
        
        res.json({
            success: true,
            message: 'تم مسح سجل الدردشة'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get chat statistics
router.get('/stats', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        
        const Chat = require('../models/Chat');
        
        // Count total messages sent by user
        const totalMessages = await Chat.aggregate([
            { $unwind: '$messages' },
            { $match: { 'messages.sender': userId } },
            { $count: 'total' }
        ]);
        
        // Count unread messages
        const unreadMessages = await Chat.aggregate([
            { $unwind: '$messages' },
            { $match: { 
                'messages.sender': { $ne: userId },
                'messages.readBy': { $ne: userId }
            }},
            { $count: 'total' }
        ]);
        
        // Get recent chat partners
        const recentPartners = await Chat.aggregate([
            { $match: { participants: userId, roomType: 'private' } },
            { $unwind: '$participants' },
            { $match: { participants: { $ne: userId } } },
            { $group: { _id: '$participants' } },
            { $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'user'
            }},
            { $unwind: '$user' },
            { $project: {
                _id: 1,
                username: '$user.username',
                profileImage: '$user.profileImage',
                isOnline: '$user.isOnline'
            }},
            { $limit: 10 }
        ]);
        
        res.json({
            success: true,
            stats: {
                totalMessages: totalMessages[0]?.total || 0,
                unreadMessages: unreadMessages[0]?.total || 0,
                recentPartners
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
