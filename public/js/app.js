// --- المرحلة 1: تعريف المتغيرات العامة والعناصر الأساسية ---
let token = null;
let user = null;
let socket = null;

const elements = {
    loadingScreen: document.getElementById('loading-screen'),
    appContainer: document.getElementById('app-container'),
    username: document.getElementById('username'),
    balance: document.getElementById('balance'),
    coins: document.getElementById('coins'),
    userLevel: document.getElementById('userLevel'),
    profileImage: document.getElementById('profileImage'),
    logoutBtn: document.getElementById('logoutBtn'),
    voiceGrid: document.getElementById('voice-chat-grid'),
    chatMessages: document.getElementById('chat-messages'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    battlesContainer: document.getElementById('battle-rooms-container'),
    battlesLoading: document.getElementById('battles-loading-state'),
    battlesEmpty: document.getElementById('battles-empty-state'),
    createBattleBtn: document.getElementById('create-battle-btn'),
    notificationContainer: document.getElementById('notification-container'),
};

// --- المرحلة 2: نقطة بداية التطبيق ---
document.addEventListener('DOMContentLoaded', main);

async function main() {
    // 1. التحقق من المصادقة
    if (!checkAuth()) return;

    // 2. تهيئة الواجهة الأساسية
    initializeUI();

    // 3. جلب البيانات الأولية من الخادم
    await Promise.all([
        loadUserData(),
        loadChatHistory(),
        loadAvailableBattles()
    ]);

    // 4. تهيئة الاتصال الفوري (Socket.IO)
    initializeSocket();

    // 5. ربط جميع أحداث المستخدم (النقرات، الإرسال، إلخ)
    setupEventListeners();
}

// --- المرحلة 3: الدوال الأساسية ---

function checkAuth() {
    token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (!token || !userData) {
        window.location.href = '/login.html';
        return false;
    }
    user = JSON.parse(userData);
    return true;
}

function initializeUI() {
    elements.loadingScreen.classList.add('hidden');
    elements.appContainer.classList.remove('hidden');

    updateUserUI(user);

    for (let i = 4; i <= 27; i++) {
        const seat = document.createElement('div');
        seat.className = 'voice-seat user-seat';
        seat.dataset.seat = i;
        seat.textContent = i;
        elements.voiceGrid.appendChild(seat);
    }
}

async function loadUserData() {
    try {
        const response = await fetch('/api/auth/profile', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) throw new Error('Failed to fetch user profile');
        const result = await response.json();
        if (result.status === 'success') {
            localStorage.setItem('user', JSON.stringify(result.data.user));
            user = result.data.user;
            updateUserUI(user);
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        logout();
    }
}

function updateUserUI(userData) {
    if (!userData) return;
    elements.username.textContent = userData.username;
    elements.balance.textContent = (userData.balance || 0).toFixed(2);
    elements.coins.textContent = userData.coins || 0;
    elements.userLevel.textContent = `المستوى: ${userData.level || 1}`;
    elements.profileImage.src = userData.profileImage;
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

// --- المرحلة 4: دوال الدردشة ---

async function loadChatHistory() {
    try {
        const response = await fetch('/api/messages/public-room', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        if (response.ok && result.status === 'success') {
            elements.chatMessages.innerHTML = '';
            result.data.messages.forEach(displayMessage);
        }
    } catch (error) {
        console.error('Failed to load chat history:', error);
    }
}

function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (message && socket) {
        socket.emit('sendMessage', { message });
        elements.messageInput.value = '';
    }
}

function displayMessage(message) {
    const isMyMessage = message.sender.id === user.id;
    const messageElement = document.createElement('div');
    messageElement.className = `p-2 rounded-lg mb-2 flex items-start gap-2 ${isMyMessage ? 'bg-purple-800' : 'bg-gray-700'}`;
    messageElement.innerHTML = `
        <img src="${message.sender.profileImage}" alt="${message.sender.username}" class="w-8 h-8 rounded-full">
        <div>
            <p class="font-bold text-sm ${isMyMessage ? 'text-yellow-300' : 'text-purple-300'}">${message.sender.username}</p>
            <p class="text-white text-sm">${message.message || message.content}</p>
        </div>
    `;
    elements.chatMessages.appendChild(messageElement);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// --- المرحلة 5: دوال التحديات ---

async function loadAvailableBattles() {
    elements.battlesLoading.classList.remove('hidden');
    elements.battlesEmpty.classList.add('hidden');
    elements.battlesContainer.querySelectorAll('.battle-card').forEach(card => card.remove());

    try {
        const response = await fetch('/api/battles', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        elements.battlesLoading.classList.add('hidden');
        if (response.ok && result.status === 'success') {
            if (result.data.battles.length === 0) {
                elements.battlesEmpty.classList.remove('hidden');
            } else {
                result.data.battles.forEach(displayBattleCard);
            }
        } else {
            elements.battlesEmpty.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Failed to load battles:', error);
        elements.battlesLoading.classList.add('hidden');
        elements.battlesEmpty.classList.remove('hidden');
    }
}

function displayBattleCard(battle) {
    elements.battlesEmpty.classList.add('hidden');
    const card = document.createElement('div');
    card.className = 'battle-card bg-gray-700/50 p-3 rounded-lg flex justify-between items-center animate-pulse';
    card.dataset.battleId = battle._id;
    const maxPlayers = battle.type === '1v1' ? 2 : battle.type === '2v2' ? 4 : 8;
    card.innerHTML = `
        <div class="flex items-center gap-3">
            <span class="font-bold text-purple-300">${battle.type}</span>
            <div class="flex items-center gap-1 text-yellow-400"><i class="fas fa-coins"></i><span>${battle.betAmount}</span></div>
            <div class="flex -space-x-2">${battle.players.map(p => `<img src="${p.profileImage}" alt="${p.username}" class="w-8 h-8 rounded-full border-2 border-gray-600">`).join('')}</div>
        </div>
        <div class="flex items-center gap-3">
            <span class="text-sm text-gray-400">${battle.players.length} / ${maxPlayers}</span>
            <button class="join-battle-btn bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1 px-3 rounded-full">انضم</button>
        </div>
    `;
    elements.battlesContainer.appendChild(card);
    setTimeout(() => card.classList.remove('animate-pulse'), 100);
}

function showCreateBattleModal() {
    const modal = document.createElement('div');
    modal.id = 'create-battle-modal';
    modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h3 class="text-lg font-bold mb-4">إنشاء تحدي جديد</h3>
            <form id="create-battle-form" class="space-y-4">
                <div>
                    <label class="text-sm">نوع التحدي</label>
                    <select name="type" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 mt-1">
                        <option value="1v1">1 ضد 1</option>
                        <option value="2v2">2 ضد 2</option>
                        <option value="4v4">4 ضد 4</option>
                    </select>
                </div>
                <div>
                    <label class="text-sm">مبلغ الرهان ($)</label>
                    <input type="number" name="betAmount" value="1" min="1" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 mt-1">
                </div>
                <div class="flex items-center">
                    <input type="checkbox" id="isPrivate" name="isPrivate" class="w-4 h-4 rounded">
                    <label for="isPrivate" class="mr-2 text-sm">تحدي خاص</label>
                </div>
                <div id="password-field" class="hidden">
                    <label class="text-sm">كلمة المرور</label>
                    <input type="password" name="password" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 mt-1">
                </div>
                <div class="flex justify-end gap-3 pt-4">
                    <button type="button" id="cancel-create-battle" class="bg-gray-600 hover:bg-gray-700 py-2 px-4 rounded-lg">إلغاء</button>
                    <button type="submit" class="bg-purple-600 hover:bg-purple-700 py-2 px-4 rounded-lg">تأكيد</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('isPrivate').addEventListener('change', (e) => {
        document.getElementById('password-field').classList.toggle('hidden', !e.target.checked);
    });
    document.getElementById('cancel-create-battle').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target.id === 'create-battle-modal') modal.remove(); });
    
    document.getElementById('create-battle-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.betAmount = parseFloat(data.betAmount);
        data.isPrivate = data.isPrivate === 'on';

        if (!data.type || !data.betAmount || data.betAmount <= 0) {
            showNotification('يرجى إدخال مبلغ رهان صالح.', 'error');
            return;
        }
        if (data.isPrivate && !data.password) {
            showNotification('يرجى إدخال كلمة مرور للتحدي الخاص.', 'error');
            return;
        }

        try {
            const response = await fetch('/api/battles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (response.ok && result.status === 'success') {
                showNotification('تم إنشاء التحدي بنجاح!', 'success');
                modal.remove();
            } else {
                showNotification(result.message || 'فشل إنشاء التحدي', 'error');
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
        }
    });
}

// --- المرحلة 6: ربط الأحداث و Socket.IO ---

function setupEventListeners() {
    elements.logoutBtn.addEventListener('click', logout);
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
    elements.createBattleBtn.addEventListener('click', showCreateBattleModal);

    elements.battlesContainer.addEventListener('click', async (e) => {
        if (e.target && e.target.classList.contains('join-battle-btn')) {
            const battleCard = e.target.closest('.battle-card');
            const battleId = battleCard.dataset.battleId;
            e.target.disabled = true;
            e.target.textContent = 'جاري...';
            try {
                const response = await fetch(`/api/battles/${battleId}/join`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
                const result = await response.json();
                if (!response.ok) {
                    showNotification(result.message || 'فشل الانضمام', 'error');
                    e.target.disabled = false;
                    e.target.textContent = 'انضم';
                }
            } catch (error) {
                showNotification('خطأ في الاتصال بالخادم', 'error');
                e.target.disabled = false;
                e.target.textContent = 'انضم';
            }
        }
    });
}

function initializeSocket() {
    socket = io({ auth: { token } });

    socket.on('connect_error', (err) => {
        console.error('Socket Connection Error:', err.message);
        if (err.message.includes('Authentication error')) logout();
    });

    socket.on('newMessage', displayMessage);

    socket.on('balanceUpdate', ({ newBalance }) => {
        updateUserUI({ ...user, balance: newBalance });
        showNotification('تم تحديث رصيدك', 'info');
    });

    socket.on('newBattle', (battle) => {
        elements.battlesEmpty.classList.add('hidden');
        displayBattleCard(battle);
        showNotification(`تم إنشاء تحدي ${battle.type} جديد!`, 'info');
    });

    socket.on('battleUpdate', (updatedBattle) => {
        const cardToUpdate = document.querySelector(`.battle-card[data-battle-id="${updatedBattle._id}"]`);
        if (cardToUpdate) {
            if (updatedBattle.status !== 'waiting') {
                cardToUpdate.remove();
                if (elements.battlesContainer.querySelectorAll('.battle-card').length === 0) {
                    elements.battlesEmpty.classList.remove('hidden');
                }
            } else {
                const oldCardHTML = cardToUpdate.innerHTML;
                const tempDiv = document.createElement('div');
                displayBattleCard(updatedBattle);
                const newCardHTML = elements.battlesContainer.lastChild.innerHTML;
                elements.battlesContainer.lastChild.remove();
                cardToUpdate.innerHTML = newCardHTML;
                if (oldCardHTML !== newCardHTML) {
                    showNotification(`تم تحديث تحدي ${updatedBattle.type}`, 'info');
                }
            }
        }
    });
}

// --- المرحلة 7: دوال مساعدة ---

function showNotification(message, type = 'info') {
    const container = elements.notificationContainer;
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
    };
    const icon = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
    };

    const notification = document.createElement('div');
    notification.className = `flex items-center p-4 mb-4 text-sm text-white rounded-lg shadow-lg ${colors[type]} animate-pulse`;
    notification.innerHTML = `
        <i class="fas ${icon[type]} mr-3"></i>
        <span>${message}</span>
    `;
    container.appendChild(notification);

    setTimeout(() => notification.classList.remove('animate-pulse'), 100);
    setTimeout(() => notification.remove(), 5000);
}
