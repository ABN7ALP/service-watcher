// 📁 public/js/app.js

// حالة التطبيق
let appState = {
    isLoggedIn: false,
    user: null,
    token: localStorage.getItem('token'),
    socket: null,
    notifications: [],
    onlineUsers: 0
};

// تهيئة التطبيق
document.addEventListener('DOMContentLoaded', function() {
    // التحقق من التوكن
    if (appState.token) {
        verifyToken();
    }
    
    // إعداد الأحداث
    setupEventListeners();
    
    // الاتصال بالسوكيت إذا كان مسجل دخول
    if (appState.isLoggedIn && appState.token) {
        connectSocket();
    }
    
    // تحديث الإحصائيات
    updateStats();
});

// التحقق من صحة التوكن
async function verifyToken() {
    try {
        const response = await fetch('/api/auth/profile', {
            headers: {
                'Authorization': `Bearer ${appState.token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            appState.isLoggedIn = true;
            appState.user = data.user;
            updateUIForLoggedInUser();
        } else {
            localStorage.removeItem('token');
            appState.token = null;
        }
    } catch (error) {
        console.error('❌ خطأ في التحقق من التوكن:', error);
    }
}

// تحديث واجهة المستخدم للمستخدم المسجل
function updateUIForLoggedInUser() {
    const authButtons = document.querySelector('.auth-buttons');
    if (authButtons && appState.user) {
        authButtons.innerHTML = `
            <div class="user-menu">
                <button class="btn btn-outline" id="balanceBtn">
                    <i class="fas fa-wallet"></i> ${appState.user.balance}$
                </button>
                <button class="btn btn-primary" id="dashboardBtn">
                    <i class="fas fa-user"></i> ${appState.user.username}
                </button>
            </div>
        `;
        
        document.getElementById('balanceBtn').addEventListener('click', showDepositModal);
        document.getElementById('dashboardBtn').addEventListener('click', goToDashboard);
    }
    
    document.getElementById('playNowBtn').textContent = '🎡 تدوير العجلة';
    document.getElementById('playNowBtn').onclick = loadWheelPage;
}

// إعداد مستمعي الأحداث
function setupEventListeners() {
    // أزرار التسجيل/الدخول
    document.getElementById('loginBtn').addEventListener('click', () => {
        document.getElementById('loginModal').style.display = 'flex';
    });
    
    document.getElementById('registerBtn').addEventListener('click', () => {
        showRegisterModal();
    });
    
    // إغلاق النوافذ
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').style.display = 'none';
        });
    });
    
    // نموذج تسجيل الدخول
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // زر اللعب الآن
    document.getElementById('playNowBtn').addEventListener('click', () => {
        if (appState.isLoggedIn) {
            loadWheelPage();
        } else {
            showToast('يجب تسجيل الدخول أولاً', 'warning');
            document.getElementById('loginModal').style.display = 'flex';
        }
    });
}

// تسجيل الدخول
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            appState.token = data.token;
            appState.user = data.user;
            appState.isLoggedIn = true;
            
            localStorage.setItem('token', data.token);
            document.getElementById('loginModal').style.display = 'none';
            updateUIForLoggedInUser();
            connectSocket();
            showToast('✅ تم تسجيل الدخول بنجاح', 'success');
        } else {
            showToast(data.message || '❌ خطأ في تسجيل الدخول', 'error');
        }
    } catch (error) {
        showToast('❌ خطأ في الاتصال بالخادم', 'error');
    }
}

// الاتصال بالسوكيت
function connectSocket() {
    if (appState.socket) {
        appState.socket.disconnect();
    }
    
    appState.socket = io({
        auth: {
            token: appState.token
        }
    });
    
    // أحداث السوكيت
    appState.socket.on('connected', (data) => {
        console.log('✅ متصل بالسوكيت:', data);
        appState.onlineUsers = data.onlineCount;
        updateOnlineCount();
    });
    
    appState.socket.on('notification', (notification) => {
        addNotification(notification);
        showToast(notification.data.message || 'إشعار جديد', 'info');
    });
    
    appState.socket.on('big_win_announcement', (data) => {
        showBigWinNotification(data);
    });
    
    appState.socket.on('online_count', (data) => {
        appState.onlineUsers = data.count;
        updateOnlineCount();
    });
    
    appState.socket.on('user_spinning', (data) => {
        // تحديث واجهة العجلة إذا كان مفتوحة
        if (window.currentPage === 'wheel') {
            updateWheelActivity(data);
        }
    });
    
    appState.socket.on('disconnect', () => {
        showToast('🔌 انقطع الاتصال، جاري إعادة المحاولة...', 'warning');
    });
}

// عرض إشعار كبير بالفوز
function showBigWinNotification(data) {
    const notification = {
        type: 'big_win',
        data: {
            username: data.username || 'لاعب',
            amount: data.amount,
            message: `🎉 ${data.username || 'لاعب'} فاز بـ ${data.amount}$!`,
            timestamp: new Date()
        }
    };
    
    addNotification(notification);
    
    // تأثير خاص للفوز الكبير
    const track = document.getElementById('notificationsTrack');
    const bigWinElement = document.createElement('div');
    bigWinElement.className = 'notification-item big-win';
    bigWinElement.innerHTML = `
        <span class="notification-icon">🏆</span>
        <span class="notification-text">${notification.data.message}</span>
        <span class="notification-time">الآن</span>
    `;
    
    track.insertBefore(bigWinElement, track.firstChild);
    
    // لعب صوت الفوز
    playSound('win');
    
    // إذا كان أكثر من 10 إشعارات، احذف القديم
    if (track.children.length > 10) {
        track.removeChild(track.lastChild);
    }
}

// إضافة إشعار للقائمة
function addNotification(notification) {
    appState.notifications.unshift(notification);
    
    // تحديث واجهة الإشعارات
    const track = document.getElementById('notificationsTrack');
    if (track) {
        const notificationElement = document.createElement('div');
        notificationElement.className = 'notification-item';
        notificationElement.innerHTML = `
            <span class="notification-icon">${getNotificationIcon(notification.type)}</span>
            <span class="notification-text">${notification.data.message || 'إشعار جديد'}</span>
            <span class="notification-time">${formatTime(notification.data.timestamp)}</span>
        `;
        
        track.insertBefore(notificationElement, track.firstChild);
        
        // إذا كان أكثر من 10 إشعارات، احذف القديم
        if (track.children.length > 10) {
            track.removeChild(track.lastChild);
        }
    }
}

// الحصول على أيقونة الإشعار
function getNotificationIcon(type) {
    const icons = {
        'deposit_approved': '💰',
        'deposit_rejected': '⚠️',
        'wheel_spin_win': '🎉',
        'wheel_spin_lose': '💫',
        'big_win': '🏆',
        'default': '🔔'
    };
    
    return icons[type] || icons.default;
}

// تحديث عدد المتصلين
function updateOnlineCount() {
    const playersElement = document.getElementById('totalPlayers');
    if (playersElement) {
        playersElement.textContent = appState.onlineUsers;
    }
}

// تحديث الإحصائيات
// 📁 public/js/app.js

async function updateStats() {
    try {
        const response = await fetch('/api/wheel/stats');
        if (response.ok) {
            const data = await response.json();
                
            // تحديث الأرقام في الصفحة
            const winsElement = document.getElementById('totalWins');
            const prizesElement = document.getElementById('totalPrizes');
                
            if (winsElement && prizesElement) {
                // هذه قيم افتراضية - يمكنك جلبها من API خاص
                winsElement.textContent = '1,234';
                prizesElement.textContent = '15,678$';
            }

            // --- الجزء المضاف ---
            // استدعاء دالة رسم العجلة بعد جلب البيانات
            if (data.success && data.stats.config.prizes) {
                renderWheelPreview(data.stats.config.prizes);
            }
            // --- نهاية الجزء المضاف ---

        }
    } catch (error) {
        console.error('❌ خطأ في تحديث الإحصائيات:', error);
    }
}

// --- الدالة الجديدة المضافة ---
// قم بإضافة هذه الدالة الجديدة في أي مكان في ملف app.js
function renderWheelPreview(prizes) {
    const wheelPreview = document.getElementById('wheelPreview');
    if (!wheelPreview) return;

    // إنشاء عنصر canvas لرسم العجلة
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    const numSegments = prizes.length;
    const angleStep = (2 * Math.PI) / numSegments;
    const colors = ['#6a11cb', '#2575fc', '#ff6b6b', '#fdcb6e', '#00b894', '#2d3436', '#6a11cb', '#2575fc', '#ff6b6b', '#fdcb6e'];

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 16px Cairo';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < numSegments; i++) {
        const angle = i * angleStep;
        // رسم قطعة من العجلة
        ctx.beginPath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.moveTo(150, 150);
        ctx.arc(150, 150, 150, angle, angle + angleStep);
        ctx.lineTo(150, 150);
        ctx.fill();

        // كتابة قيمة الجائزة
        ctx.save();
        ctx.fillStyle = 'white';
        const textAngle = angle + angleStep / 2;
        ctx.translate(150 + Math.cos(textAngle) * 100, 150 + Math.sin(textAngle) * 100);
        ctx.rotate(textAngle + Math.PI / 2);
        ctx.fillText(`$${prizes[i]}`, 0, 0);
        ctx.restore();
    }

    // استبدال رسالة "جاري التحميل" بالعجلة المرسومة
    wheelPreview.innerHTML = '';
    wheelPreview.appendChild(canvas);
}
// --- نهاية الدالة الجديدة ---


// عرض رسالة عائمة
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${getToastIcon(type)}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // إزالة بعد 5 ثوانٍ
    setTimeout(() => {
        toast.style.animation = 'slideUp 0.5s ease reverse';
        setTimeout(() => {
            container.removeChild(toast);
        }, 500);
    }, 5000);
}

function getToastIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// تنسيق الوقت
function formatTime(date) {
    const now = new Date();
    const diff = now - new Date(date);
    
    if (diff < 60000) return 'الآن';
    if (diff < 3600000) return `قبل ${Math.floor(diff / 60000)} دقيقة`;
    if (diff < 86400000) return `قبل ${Math.floor(diff / 3600000)} ساعة`;
    return `قبل ${Math.floor(diff / 86400000)} يوم`;
}

// تشغيل الصوت
function playSound(type) {
    // ستضيف الملفات الصوتية لاحقاً
    const sounds = {
        'win': '/assets/sounds/win.mp3',
        'spin': '/assets/sounds/spin.mp3',
        'notification': '/assets/sounds/notification.mp3'
    };
    
    if (sounds[type]) {
        const audio = new Audio(sounds[type]);
        audio.play().catch(e => console.log('❌ لا يمكن تشغيل الصوت:', e));
    }
}

// تحميل صفحة العجلة
function loadWheelPage() {
    window.location.href = '/wheel.html';
}

// عرض نموذج التسجيل
function showRegisterModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'registerModal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-modal">&times;</span>
            <h2><i class="fas fa-user-plus"></i> إنشاء حساب جديد</h2>
            <form id="registerForm">
                <div class="form-group">
                    <label for="registerUsername"><i class="fas fa-user"></i> اسم المستخدم</label>
                    <input type="text" id="registerUsername" required>
                </div>
                <div class="form-group">
                    <label for="registerEmail"><i class="fas fa-envelope"></i> البريد الإلكتروني</label>
                    <input type="email" id="registerEmail" required>
                </div>
                <div class="form-group">
                    <label for="registerPassword"><i class="fas fa-lock"></i> كلمة المرور</label>
                    <input type="password" id="registerPassword" required>
                </div>
                <button type="submit" class="btn btn-primary btn-block">
                    <i class="fas fa-user-plus"></i> إنشاء حساب
                </button>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    
    // إغلاق النافذة
    modal.querySelector('.close-modal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // إرسال النموذج
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
}

// التسجيل
async function handleRegister(e) {
    e.preventDefault();
    
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ تم إنشاء الحساب بنجاح', 'success');
            document.body.removeChild(document.getElementById('registerModal'));
            
            // تسجيل الدخول تلقائياً
            appState.token = data.token;
            appState.user = data.user;
            appState.isLoggedIn = true;
            localStorage.setItem('token', data.token);
            updateUIForLoggedInUser();
            connectSocket();
        } else {
            showToast(data.message || '❌ خطأ في إنشاء الحساب', 'error');
        }
    } catch (error) {
        showToast('❌ خطأ في الاتصال بالخادم', 'error');
    }
}

// الذهاب للوحة التحكم
function goToDashboard() {
    window.location.href = '/dashboard.html';
}

// عرض نموذج الإيداع
function showDepositModal() {
    // سيتم تنفيذها لاحقاً
    showToast('🚀 ميزة الإيداع قريباً...', 'info');
}

// تحديث نشاط العجلة
function updateWheelActivity(data) {
    // سيتم تنفيذها في ملف العجلة
    console.log('نشاط عجلة:', data);
                  }
