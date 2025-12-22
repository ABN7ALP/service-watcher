document.addEventListener('DOMContentLoaded', () => {

    // =============================
    // 1) جلب بيانات الجلسة
    // =============================
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    const loadingScreen = document.getElementById('loading-screen');
    const appContainer = document.getElementById('app-container');

    // =============================
    // 2) التحقق من تسجيل الدخول
    // =============================
    if (!token || !user) {
        window.location.href = '/login.html';
        return;
    }

    // =============================
    // 3) إظهار التطبيق
    // =============================
    loadingScreen.classList.add('hidden');
    appContainer.classList.remove('hidden');

    // =============================
    // 4) تهيئة واجهة المستخدم
    // =============================
    document.getElementById('username').textContent = user.username;
    document.getElementById('balance').textContent = Number(user.balance).toFixed(2);
    document.getElementById('coins').textContent = user.coins;
    document.getElementById('userLevel').textContent = `المستوى: ${user.level}`;
    document.getElementById('profileImage').src = user.profileImage;

    // =============================
    // 5) إنشاء مقاعد الصوت
    // =============================
    const voiceGrid = document.getElementById('voice-chat-grid');
    voiceGrid.innerHTML = '';

    for (let i = 4; i <= 27; i++) {
        const seat = document.createElement('div');
        seat.className = 'voice-seat user-seat';
        seat.dataset.seat = i;
        seat.textContent = i;
        voiceGrid.appendChild(seat);
    }

    // =============================
    // 6) زر تسجيل الخروج
    // =============================
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.addEventListener('click', logout);

    function logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    }

    // =============================
    // 7) Socket.IO
    // =============================
    const socket = io({
        auth: {
            token: token
        }
    });

    // =============================
    // 8) الدردشة
    // =============================
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chat-messages');

    sendBtn.addEventListener('click', sendMessage);

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    function sendMessage() {
        const message = messageInput.value.trim();
        if (!message) return;

        socket.emit('sendMessage', { message });
        messageInput.value = '';
    }

    // =============================
    // 9) استقبال الرسائل
    // =============================
    socket.on('newMessage', (message) => {

        const isMyMessage = message.sender.id === user.id;

        const messageElement = document.createElement('div');
        messageElement.className = `
            p-2 rounded-lg mb-2 flex items-start gap-2
            ${isMyMessage ? 'bg-purple-800 self-end' : 'bg-gray-700'}
        `;

        messageElement.innerHTML = `
            <img src="${message.sender.profileImage}" class="w-8 h-8 rounded-full">
            <div>
                <p class="font-bold text-sm ${isMyMessage ? 'text-yellow-300' : 'text-purple-300'}">
                    ${message.sender.username}
                </p>
                <p class="text-white text-sm">${message.message}</p>
            </div>
        `;

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    // =============================
    // 10) أخطاء الاتصال
    // =============================
    socket.on('connect_error', (err) => {
        console.error('Socket error:', err.message);

        if (err.message === 'Authentication error') {
            logout();
        }
    });

});


// =============================
// إشعارات (اختياري)
// =============================
function showNotification(message, type = 'info') {
    console.log(`[${type}]`, message);
}
