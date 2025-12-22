const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');

/**
 * Middleware للتحقق من توكن المستخدم عند كل اتصال Socket.
 * هذا يضمن أن كل مستخدم متصل هو مستخدم مصادق عليه.
 */
const verifySocketToken = async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
        console.error('Socket Auth Error: No token provided.');
        return next(new Error('Authentication error'));
    }

    try {
        // 1. التحقق من صحة التوكن
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 2. البحث عن المستخدم في قاعدة البيانات
        const currentUser = await User.findById(decoded.id);

        if (!currentUser) {
            console.error('Socket Auth Error: User not found.');
            return next(new Error('Authentication error'));
        }

        // 3. إضافة كائن المستخدم إلى السوكيت ليكون متاحاً في كل مكان
        socket.user = currentUser;
        next(); // السماح بالاتصال

    } catch (err) {
        console.error('Socket Auth Error: Invalid token.', err.message);
        return next(new Error('Authentication error'));
    }
};


/**
 * تهيئة وإعداد خادم Socket.IO
 * @param {http.Server} server - خادم HTTP الذي سيتم ربط Socket.IO به
 * @returns {Server} - نسخة من خادم Socket.IO
 */
const initializeSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*", // في الإنتاج، يجب تحديد نطاق الواجهة الأمامية
            methods: ["GET", "POST"]
        }
    });

    // تطبيق middleware المصادقة على كل الاتصالات الجديدة
    io.use(verifySocketToken);

    // --- معالج الاتصالات الجديدة ---
    io.on('connection', (socket) => {
        console.log(`🟢 User connected: ${socket.id} | UserID: ${socket.user.username}`);

        // الانضمام إلى الغرفة العامة
        socket.join('public-room');

        // --- معالجة إرسال الرسائل ---
        socket.on('sendMessage', async (messageData) => {
            try {
                // التحقق من أن الرسالة ليست فارغة وأن المستخدم موجود
                if (!messageData.message || messageData.message.trim() === '' || !socket.user) {
                    return;
                }

                // 1. حفظ الرسالة في قاعدة البيانات
                const newMessage = await Message.create({
                    content: messageData.message,
                    sender: socket.user.id,
                });

                // 2. بناء كائن الرسالة النهائي لإرساله للواجهة الأمامية
                const finalMessage = {
                    id: newMessage._id,
                    message: newMessage.content,
                    sender: {
                        id: socket.user.id,
                        username: socket.user.username,
                        profileImage: socket.user.profileImage
                    },
                    timestamp: newMessage.createdAt
                };

                // 3. بث الرسالة إلى كل المستخدمين في الغرفة العامة
                io.to('public-room').emit('newMessage', finalMessage);
                
                console.log(`💬 Message from ${finalMessage.sender.username} saved and broadcasted.`);

            } catch (error) {
                console.error('Error handling sendMessage:', error);
                socket.emit('error', { message: 'فشل إرسال الرسالة' });
            }
        });

        // --- معالجة انقطاع الاتصال ---
        socket.on('disconnect', () => {
            console.log(`🔴 User disconnected: ${socket.id} | UserID: ${socket.user.username}`);
        });
    });

    return io;
};

module.exports = initializeSocket;
