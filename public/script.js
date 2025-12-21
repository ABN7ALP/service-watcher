// Global Variables
let socket = null;
let currentUser = null;
let currentSeat = null;
let activeBattle = null;
let authToken = null;

// DOM Elements
const elements = {
    balance: document.getElementById('balance'),
    coins: document.getElementById('coins'),
    level: document.getElementById('level'),
    username: document.getElementById('username'),
    userId: document.getElementById('userId'),
    messageInput: document.getElementById('messageInput'),
    chatMessages: document.getElementById('chatMessages')
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initSocket();
    loadUserData();
    setupEventListeners();
});

// Check Authentication
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    authToken = token;
    currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    
    // Update UI with user data
    if (currentUser) {
        elements.username.textContent = currentUser.username || 'اسم المستخدم';
        elements.userId.textContent = currentUser.id?.slice(-6) || '123456';
        elements.balance.textContent = `${currentUser.balance || 0}$`;
        elements.coins.textContent = currentUser.coins || 0;
        elements.level.textContent = currentUser.level || 1;
    }
}

// Initialize Socket Connection
function initSocket() {
    const socketUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000'
        : window.location.origin;
    
    socket = io(socketUrl, {
        auth: {
            token: authToken
        }
    });

    // Socket event handlers
    socket.on('connect', () => {
        console.log('✅ Connected to server');
        socket.emit('join-user', currentUser.id);
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
    });

    // Join voice chat seat
    socket.on('user-joined-seat', (data) => {
        updateSeatUI(data.seatNumber, data.userId, true);
    });

    socket.on('user-left-seat', (data) => {
        updateSeatUI(data.seatNumber, data.userId, false);
    });

    // Chat messages
    socket.on('new-message', (message) => {
        addMessageToChat(message);
    });

    socket.on('new-image', (data) => {
        addImageToChat(data);
    });

    socket.on('new-voice', (data) => {
        addVoiceToChat(data);
    });

    // Battle events
    socket.on('new-battle-created', (battle) => {
        addBattleToUI(battle);
    });

    socket.on('battle-updated', (update) => {
        updateBattleUI(update);
    });

    socket.on('player-joined', (data) => {
        updateBattlePlayers(data);
    });

    socket.on('battle-started', (data) => {
        showBattleStarted(data);
    });

    socket.on('battle-ended', (data) => {
        showBattleResults(data);
    });

    socket.on('victory-modal', (data) => {
        showVictoryModal(data);
    });

    // Notifications
    socket.on('notification', (notification) => {
        showNotification(notification);
    });

    socket.on('receive-gift', (gift) => {
        showGiftAnimation(gift);
    });
}

// Load User Data
// تأكد من أن دالة loadUserData تبدو هكذا
async function loadUserData() {
    try {
        const response = await fetch('/api/auth/profile', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
            
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                // ✅ هذا السطر مهم جداً ويحل المشكلة
                updateUserUI(data.user); 
            }
        } else {
            // إذا فشل جلب البيانات (مثلاً، التوكن منتهي الصلاحية)، أعد المستخدم لصفحة الدخول
            if (response.status === 401) {
                logout(); // دالة تقوم بمسح localStorage وإعادة التوجيه
            }
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// وأضف دالة logout إذا لم تكن موجودة
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}


// Setup Event Listeners
function setupEventListeners() {
    // Chat input
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

 // أضف هذا الكود داخل دالة setupEventListeners() في ملف script.js

// --- منطق التنقل بين الصفحات ---
const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
const pageViews = document.querySelectorAll('.page-view');

navItems.forEach(item => {
    item.addEventListener('click', function(event) {
        event.preventDefault(); // امنع تحديث الصفحة

        const targetId = this.dataset.target;
        if (!targetId) return; // تجاهل الروابط التي لا تحتوي على data-target

        const targetView = document.getElementById(targetId);

        // 1. تحديث حالة الروابط
        navItems.forEach(nav => nav.classList.remove('active'));
        this.classList.add('active');

        // 2. إخفاء جميع الأقسام
        pageViews.forEach(view => {
            view.style.display = 'none';
            view.classList.remove('active');
        });

        // 3. إظهار القسم المستهدف فقط
        if (targetView) {
            targetView.style.display = 'block';
            targetView.classList.add('active');
        }

        // 4. تحديث عنوان URL
        window.history.pushState(null, '', this.getAttribute('href'));
    });
});

// --- إنشاء دوائر الدردشة الصوتية ديناميكياً ---
const circlesGrid = document.querySelector('.voice-chat .circles-grid');
if (circlesGrid) {
    for (let i = 1; i <= 23; i++) {
        const circleSeat = document.createElement('div');
        circleSeat.className = 'circle-seat';
        circleSeat.dataset.seat = i;
        circleSeat.innerHTML = `<div class="seat-number">${i}</div><div class="seat-user"></div>`;
        circlesGrid.appendChild(circleSeat);
    }
}


    // Seat click
    document.querySelectorAll('.circle-seat').forEach(seat => {
        seat.addEventListener('click', () => {
            const seatNumber = parseInt(seat.dataset.seat);
            joinVoiceSeat(seatNumber);
        });
    });

    // Create battle button
    // الكود الجديد والمعدل
document.querySelector('.btn-create-battle')?.addEventListener('click', () => {
    if (!currentUser) {
        showNotification('جاري تحميل بيانات المستخدم، يرجى الانتظار قليلاً.', 'info');
        return;
    }
    showCreateBattleModal();
});

document.querySelector('.btn-deposit')?.addEventListener('click', () => {
    if (!currentUser) {
        showNotification('جاري تحميل بيانات المستخدم، يرجى الانتظار قليلاً.', 'info');
        return;
    }
    showDepositModal();
});

document.querySelector('.btn-withdraw')?.addEventListener('click', () => {
    if (!currentUser) {
        showNotification('جاري تحميل بيانات المستخدم، يرجى الانتظار قليلاً.', 'info');
        return;
    }
    showWithdrawalModal();
});


    // Battle type buttons
    document.querySelectorAll('.battle-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.battle-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadBattles(btn.textContent.trim());
        });
    });
}
    
// استخدام تفويض الأحداث للتعامل مع العناصر التي تضاف لاحقاً
document.body.addEventListener('click', function(event) {
    // زر إغلاق النوافذ المنبثقة
    const modalCloseButton = event.target.closest('.modal-close');
    if (modalCloseButton) {
        const modal = modalCloseButton.closest('.modal-overlay');
        if (modal) {
            closeModal(modal.id);
        }
        return; // توقف هنا لتجنب تداخل الأحداث
    }

    // أزرار أخرى داخل النوافذ المنبثقة
    const targetId = event.target.id;
    const targetClasses = event.target.classList;

    switch (true) {
        // زر نسخ رقم المحفظة
        case targetClasses.contains('btn-copy'):
            copyWalletNumber();
            break;
            
        // زر بدء عملية الشحن
        case targetId === 'startDepositBtn':
            startDepositProcess();
            break;

        // زر رفع الإيصال
        case targetId === 'uploadReceiptBtn': // سنعطي هذا ID للزر في دالة showDepositModal
            uploadReceipt();
            break;

        // زر إنشاء التحدي
        case targetId === 'createBattleBtn': // سنعطي هذا ID للزر في دالة showCreateBattleModal
            createBattle();
            break;

        // عرض الصورة في نافذة منبثقة
        case targetClasses.contains('chat-image-preview'):
            openImageModal(event.target.src);
            break;
    }
});


// Join Voice Seat
function joinVoiceSeat(seatNumber) {
    if (currentSeat === seatNumber) {
        // Leave seat
        socket.emit('leave-voice-seat', {
            seatNumber,
            userId: currentUser.id
        });
        currentSeat = null;
        return;
    }

    if (currentSeat) {
        // Leave current seat first
        socket.emit('leave-voice-seat', {
            seatNumber: currentSeat,
            userId: currentUser.id
        });
    }

    socket.emit('join-voice-seat', {
        seatNumber,
        userId: currentUser.id
    });
    
    currentSeat = seatNumber;
}

// Update Seat UI
function updateSeatUI(seatNumber, userId, isOccupied) {
    const seat = document.querySelector(`.circle-seat[data-seat="${seatNumber}"]`);
    if (!seat) return;

    if (isOccupied) {
        seat.classList.add('occupied');
        seat.querySelector('.seat-user').style.backgroundColor = 
            userId === currentUser.id ? '#6a11cb' : '#2575fc';
    } else {
        seat.classList.remove('occupied');
        seat.querySelector('.seat-user').style.backgroundColor = 'transparent';
    }
}

// Send Message
function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (!message || !socket) return;

    const messageData = {
        roomId: 'public',
        message,
        type: 'text',
        senderId: currentUser.id,
        senderName: currentUser.username,
        allowSave: true,
        allowScreenshot: true
    };

    socket.emit('send-message', messageData);
    elements.messageInput.value = '';
}

// Add Message to Chat
function addMessageToChat(message) {
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${message.senderId === currentUser.id ? 'my-message' : 'other-message'}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit'
    });

    messageElement.innerHTML = `
        <div class="message-header">
            <strong>${message.senderName || 'مستخدم'}</strong>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${escapeHtml(message.message)}</div>
    `;

    elements.chatMessages.appendChild(messageElement);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Add Image to Chat
function addImageToChat(data) {
    const imageElement = document.createElement('div');
    imageElement.className = `chat-image ${data.senderId === currentUser.id ? 'my-image' : 'other-image'}`;
    
    imageElement.innerHTML = `
        <div class="image-header">
            <strong>${data.senderName || 'مستخدم'}</strong>
        </div>
        <img src="${data.imageUrl}" 
             alt="صورة" 
             class="chat-image-preview"
             onclick="openImageModal('${data.imageUrl}')">
        ${!data.allowScreenshot ? '<div class="screenshot-warning">ممنوع أخذ لقطة للشاشة</div>' : ''}
    `;

    elements.chatMessages.appendChild(imageElement);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Show Create Battle Modal
function showCreateBattleModal() {
    const modalHTML = `
        <div class="modal-overlay active" id="createBattleModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-plus-circle"></i> إنشاء تحدٍ جديد</h3>
                    <button class="modal-close" onclick="closeModal('createBattleModal')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>نوع التحدي</label>
                        <div class="battle-type-select">
                            <button class="battle-type-option active" data-type="1v1">1 ضد 1</button>
                            <button class="battle-type-option" data-type="2v2">2 ضد 2</button>
                            <button class="battle-type-option" data-type="4v4">4 ضد 4</button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="betAmount">مبلغ الرهان ($)</label>
                        <input type="number" 
                               id="betAmount" 
                               min="1" 
                               max="${currentUser.balance || 0}" 
                               value="1"
                               class="form-control">
                        <small class="form-text">الرصيد المتاح: ${currentUser.balance || 0}$</small>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="isPrivate"> تحدٍ خاص
                        </label>
                        <input type="password" 
                               id="battlePassword" 
                               placeholder="كلمة المرور" 
                               class="form-control mt-2" 
                               style="display: none;">
                    </div>
                    <div class="commission-notice">
                        <i class="fas fa-info-circle"></i>
                        عمولة المطور: 0.20$ من كل دولار (الفائز يحصل على 1.80$)
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal('createBattleModal')">إلغاء</button>
                    <button class="btn btn-primary" id="createBattleBtn">إنشاء التحدي</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add event listeners
    document.querySelectorAll('.battle-type-option').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.battle-type-option').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    document.getElementById('isPrivate').addEventListener('change', function() {
        document.getElementById('battlePassword').style.display = this.checked ? 'block' : 'none';
    });
}

// Create Battle
async function createBattle() {
    const battleType = document.querySelector('.battle-type-option.active').dataset.type;
    const betAmount = parseFloat(document.getElementById('betAmount').value);
    const isPrivate = document.getElementById('isPrivate').checked;
    const password = isPrivate ? document.getElementById('battlePassword').value : null;

    if (betAmount < 1 || betAmount > (currentUser.balance || 0)) {
        showNotification('المبلغ غير صحيح', 'error');
        return;
    }

    try {
        const response = await fetch('/api/battle/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                type: battleType,
                betAmount,
                isPrivate,
                password
            })
        });

        const data = await response.json();
        
        if (data.success) {
            closeModal('createBattleModal');
            showNotification('تم إنشاء التحدي بنجاح', 'success');
            
            // Socket will handle updating the UI
        } else {
            showNotification(data.message || 'فشل إنشاء التحدي', 'error');
        }
    } catch (error) {
        console.error('Create battle error:', error);
        showNotification('حدث خطأ أثناء إنشاء التحدي', 'error');
    }
}
// الكود الجديد لإضافته في script.js

function updateUserUI(user) {
    if (!user) return;

    // تحديث الهيدر
    if (elements.balance) elements.balance.textContent = `${user.balance?.toFixed(2) || '0.00'}$`;
    if (elements.coins) elements.coins.textContent = user.coins?.toLocaleString() || '0';
    if (elements.level) elements.level.textContent = user.level || '1';

    // تحديث الشريط الجانبي
    const profileImg = document.querySelector('.user-profile .profile-img');
    const usernameSidebar = document.querySelector('.user-profile #username');
    const userIdSidebar = document.querySelector('.user-profile #userId');

    if (profileImg) profileImg.src = user.profileImage || 'https://via.placeholder.com/80';
    if (usernameSidebar) usernameSidebar.textContent = user.username || 'مستخدم';
    if (userIdSidebar) userIdSidebar.textContent = user._id?.slice(-6) || 'N/A';

    // تحديث المتغير العام
    currentUser = user;
}


// Show Deposit Modal
function showDepositModal() {
    const modalHTML = `
        <div class="modal-overlay active" id="depositModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-plus-circle"></i> شحن الرصيد</h3>
                    <button class="modal-close" onclick="closeModal('depositModal')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="wallet-info">
                        <h4><i class="fas fa-wallet"></i> محفظة شام كاش</h4>
                        <div class="wallet-number">
                            <span id="walletNumber">جاري التحميل...</span>
                            <button class="btn-copy" onclick="copyWalletNumber()">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                        <p class="wallet-instructions">قم بتحويل المبلغ إلى الرقم أعلاه</p>
                    </div>
                    
                    <div class="form-group">
                        <label for="depositAmount">المبلغ المطلوب ($)</label>
                        <input type="number" 
                               id="depositAmount" 
                               min="1" 
                               max="1000" 
                               value="10"
                               class="form-control">
                        <small class="form-text">الحد الأدنى: 1$ - الحد الأقصى: 1000$</small>
                    </div>

                    <div class="deposit-steps">
                        <h5>خطوات الشحن:</h5>
                        <ol>
                            <li>أدخل المبلغ المطلوب</li>
                            <li>قم بتحويل المبلغ إلى رقم المحفظة أعلاه</li>
                            <li>التقط صورة للإيصاد</li>
                            <li>ارفع صورة الإيصاد</li>
                            <li>انتظر موافقة الإدارة</li>
                        </ol>
                    </div>

                    <div class="upload-receipt" id="uploadReceiptSection" style="display: none;">
                        <h5><i class="fas fa-receipt"></i> رفع صورة الإيصاد</h5>
                        <input type="file" 
                               id="receiptFile" 
                               accept="image/*" 
                               class="form-control">
                        <button class="btn btn-primary mt-2" id="uploadReceiptBtn">
                            <i class="fas fa-upload"></i> رفع الإيصاد
                        </button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal('depositModal')">إلغاء</button>
                    <button class="btn btn-primary" id="startDepositBtn" onclick="startDepositProcess()">
                        بدء عملية الشحن
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    loadWalletInfo();
}

// Load Wallet Info
async function loadWalletInfo() {
    try {
        const response = await fetch('/api/payment/wallet-info', {
    headers: {
        'Authorization': `Bearer ${authToken}`
    }
});
        
        const data = await response.json();
        if (data.success) {
            document.getElementById('walletNumber').textContent = data.walletInfo.number;
        }
    } catch (error) {
        console.error('Error loading wallet info:', error);
    }
}

// Start Deposit Process
async function startDepositProcess() {
    const amount = parseFloat(document.getElementById('depositAmount').value);
    
    if (amount < 1 || amount > 1000) {
        showNotification('المبلغ يجب أن يكون بين 1 و 1000 دولار', 'error');
        return;
    }

    try {
        const response = await fetch('/api/payment/deposit', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ amount })
});

        const data = await response.json();
        
        if (data.success) {
            // Hide start button and show upload section
            document.getElementById('startDepositBtn').style.display = 'none';
            document.getElementById('uploadReceiptSection').style.display = 'block';
            
            // Store transaction ID
            window.currentDepositId = data.transactionId;
            
            showNotification('تم إنشاء طلب الشحن. يرجى رفع صورة الإيصاد', 'success');
        } else {
            showNotification(data.message || 'فشل إنشاء طلب الشحن', 'error');
        }
    } catch (error) {
        console.error('Deposit error:', error);
        showNotification('حدث خطأ أثناء إنشاء طلب الشحن', 'error');
    }
}

// Upload Receipt
async function uploadReceipt() {
    const fileInput = document.getElementById('receiptFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showNotification('يرجى اختيار صورة الإيصاد', 'error');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showNotification('يرجى اختيار ملف صورة', 'error');
        return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
        showNotification('حجم الصورة يجب ألا يتجاوز 5 ميجابايت', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('receipt', file);
    formData.append('transactionId', window.currentDepositId);

    try {
        const response = await fetch('/api/payment/upload-receipt', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${authToken}`
    },
    body: formData
});

        const data = await response.json();
        
        if (data.success) {
            showNotification('تم رفع الإيصاد بنجاح. سيتم المراجعة خلال 24 ساعة', 'success');
            setTimeout(() => {
                closeModal('depositModal');
                loadUserData(); // Refresh balance
            }, 2000);
        } else {
            showNotification(data.message || 'فشل رفع الإيصاد', 'error');
        }
    } catch (error) {
        console.error('Upload receipt error:', error);
        showNotification('حدث خطأ أثناء رفع الإيصاد', 'error');
    }
}

// Show Notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;

    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.remove();
    }
}

function copyWalletNumber() {
    const walletNumber = document.getElementById('walletNumber').textContent;
    navigator.clipboard.writeText(walletNumber)
        .then(() => showNotification('تم نسخ رقم المحفظة', 'success'))
        .catch(() => showNotification('فشل نسخ رقم المحفظة', 'error'));
}

// More functions would be added for:
// - Withdrawal
// - Gift sending
// - Battle joining
// - Profile management
// - Admin features
// - Real-time updates

// Export for use in HTML
window.copyWalletNumber = copyWalletNumber;
window.closeModal = closeModal;
window.openImageModal = function(imageUrl) {
    // Open image in modal for viewing
};
