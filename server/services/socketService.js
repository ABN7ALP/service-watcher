const { Server } = require('socket.io');

// سنضيف منطق المصادقة هنا لاحقاً
// const { verifySocketToken } = require('../middleware/authMiddleware');

const initializeSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*", // في الإنتاج، يجب تحديد النطاق الخاص بك
            methods: ["GET", "POST"]
        }
    });

    // middleware للتحقق من التوكن لكل اتصال سوكيت (سيتم تفعيله لاحقاً)
    // io.use(verifySocketToken);

    // --- معالج الاتصالات الجديدة ---
    io.on('connection', (socket) => {
        console.log(`🟢 User connected: ${socket.id} | UserID: ${socket.user?.id || 'Guest'}`);

        // الانضمام إلى غرفة عامة
        socket.join('public-room');

        // --- معالجة إرسال الرسائل ---
        socket.on('sendMessage', (messageData) => {
            // التحقق من صحة الرسالة
            if (!messageData.message || messageData.message.trim() === '') {
                return; // تجاهل الرسائل الفارغة
            }

            // بناء كائن الرسالة النهائي مع معلومات المستخدم من السوكيت
            const finalMessage = {
                id: new Date().getTime(), // ID مؤقت
                message: messageData.message,
                sender: {
                    id: socket.user?.id || 'unknown',
                    username: socket.user?.username || 'Anonymous',
                    profileImage: socket.user?.profileImage || 'https://via.placeholder.com/40'
                },
                timestamp: new Date()
            };

            // بث الرسالة إلى كل المستخدمين في الغرفة العامة
            io.to('public-room').emit('newMessage', finalMessage);
            
            console.log(`💬 Message from ${finalMessage.sender.username}: ${finalMessage.message}`);
        });


        // --- معالجة انقطاع الاتصال ---
        socket.on('disconnect', () => {
            console.log(`🔴 User disconnected: ${socket.id}`);
        });
    });

    return io;
};

module.exports = initializeSocket;
