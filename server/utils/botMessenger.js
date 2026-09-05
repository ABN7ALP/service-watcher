const User = require('../models/User');
const PrivateChat = require('../models/PrivateChat');
const PrivateMessage = require('../models/PrivateMessage');

let cachedBotId = null;

async function getBotUser() {
    if (cachedBotId) return cachedBotId;
    const bot = await User.findOne({ isBot: true }).select('_id');
    if (bot) cachedBotId = bot._id.toString();
    return cachedBotId;
}

// ✅ يُرسل رسالة حقيقية دائمة (بلا انتهاء صلاحية 12 ساعة) من حساب البوت لأي مستخدم
async function sendBotMessage(io, userId, content, type = 'text') {
    try {
        const botId = await getBotUser();
        if (!botId) { console.error('[BOT] لم يتم إيجاد حساب البوت — تأكد من تشغيل autoSeed'); return; }
        if (botId === userId.toString()) return;

        const participants = [botId, userId.toString()].sort();
        const chatId = participants.join('_');

        const botUser = await User.findById(botId).select('username profileImage');
        const targetUser = await User.findById(userId).select('username profileImage socketId');
        if (!targetUser) return;

        let chat = await PrivateChat.findOne({ chatId });
        if (!chat) {
            chat = await PrivateChat.create({
                chatId, participants,
                participantData: [
                    { userId: botId, username: botUser.username, profileImage: botUser.profileImage },
                    { userId: userId, username: targetUser.username, profileImage: targetUser.profileImage }
                ]
            });
        }

        const message = await PrivateMessage.create({
            chatId, sender: botId, receiver: userId, type, content,
            expiresAt: null // ✅ استثناء صريح من مؤقّت الحذف التلقائي (12 ساعة) لبقاء محادثة البوت دائمة
        });

        chat.lastMessage = type === 'text' ? content : `رسالة ${type}`;
        chat.lastMessageAt = new Date();
        chat.lastMessageBy = botId;
        chat.messageCount += 1;
        const currentUnread = chat.unreadCount.get(userId.toString()) || 0;
        chat.unreadCount.set(userId.toString(), currentUnread + 1);
        chat.hiddenBy = chat.hiddenBy.filter(id => id.toString() !== userId.toString());
        await chat.save();

        const populatedMessage = await PrivateMessage.findById(message._id).populate('sender', 'username profileImage').lean();

        if (io && targetUser.socketId) {
            io.to(targetUser.socketId).emit('privateMessageReceived', {
                message: populatedMessage, chatId, senderId: botId, senderName: botUser.username, isBot: true
            });
        }
    } catch (error) {
        console.error('[BOT MESSENGER ERROR]', error);
    }
}

module.exports = { sendBotMessage, getBotUser };
