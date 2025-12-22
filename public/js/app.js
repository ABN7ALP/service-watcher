document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    const loadingScreen = document.getElementById('loading-screen');
    const appContainer = document.getElementById('app-container');

    // --- 1. التحقق من المصادقة ---
    if (!token || !user) {
        // إذا لم يكن المستخدم مسجلاً، أعد توجيهه إلى صفحة الدخول
        window.location.href = '/login.html';
        return;
    }

    // --- 2. إظهار التطبيق وإخفاء شاشة التحميل ---
    loadingScreen.classList.add('hidden');
    appContainer.classList.remove('hidden');

    // --- 3. تهيئة واجهة المستخدم ببيانات المستخدم ---
    document.getElementById('username').textContent = user.username;
    document.getElementById('balance').textContent = user.balance.toFixed(2);
    document.getElementById('coins').textContent = user.coins;
    document.getElementById('userLevel').textContent = `المستوى: ${user.level}`;
    document.getElementById('profileImage').src = user.profileImage;

    // --- 4. إنشاء مقاعد الصوت ---
    const voiceGrid = document.getElementById('voice-chat-grid');
    for (let i = 4; i <= 27; i++) {
        const seat = document.createElement('div');
        seat.className = 'voice-seat user-seat';
        seat.dataset.seat = i;
        seat.textContent = i;
        voiceGrid.appendChild(seat);
    }

    // --- 5. ربط الأحداث ---
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    });

    // (سيتم إضافة منطق الدردشة والتحديات هنا لاحقاً)
});

// دالة عامة لإظهار الإشعارات (يمكن وضعها في ملف منفصل لاحقاً)
function showNotification(message, type = 'info') {
    // ... (نفس دالة الإشعارات من الملفات السابقة)
}
 // --- 6. تهيئة Socket.IO في الواجهة الأمامية ---
    const socket = io({
        auth: {
            token: token // إرسال التوكن للمصادقة
        }
    });

    // --- 7. ربط أحداث الدردشة ---
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chat-messages');

    // إرسال رسالة عند الضغط على الزر
    sendBtn.addEventListener('click', sendMessage);

    // إرسال رسالة عند الضغط على Enter
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    function sendMessage() {
        const message = messageInput.value.trim();
        if (message) {
            socket.emit('sendMessage', { message: message });
            messageInput.value = ''; // تفريغ حقل الإدخال
        }
    }

    // --- 8. استقبال الرسائل الجديدة ---
    socket.on('newMessage', (message) => {
        const messageElement = document.createElement('div');
        messageElement.classList.add('p-2', 'rounded-lg', 'mb-2', 'flex', 'items-start', 'gap-2');

        // تحديد إذا كانت الرسالة من المستخدم الحالي
        const isMyMessage = message.sender.id === user.id;

        if (isMyMessage) {
            messageElement.classList.add('bg-purple-800', 'self-end');
        } else {
            messageElement.classList.add('bg-gray-700');
        }

        messageElement.innerHTML = `
            <img src="${message.sender.profileImage}" alt="${message.sender.username}" class="w-8 h-8 rounded-full">
            <div>
                <p class="font-bold text-sm ${isMyMessage ? 'text-yellow-300' : 'text-purple-300'}">${message.sender.username}</p>
                <p class="text-white text-sm">${message.message}</p>
            </div>
        `;
        chatMessages.appendChild(messageElement);
        // التمرير لأسفل تلقائياً لرؤية الرسالة الجديدة
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    // --- 9. معالجة أخطاء الاتصال ---
    socket.on('connect_error', (err) => {
        console.error('Socket Connection Error:', err.message);
        if (err.message === 'Authentication error') {
            // إذا فشلت المصادقة، قم بتسجيل خروج المستخدم
            logout();
        }
    });

}); // نهاية document.addEventListener
