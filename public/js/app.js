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
