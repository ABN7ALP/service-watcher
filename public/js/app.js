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



    // --- 14. استخدام تفويض الأحداث لزر "انضمام" ---
    const battlesContainer = document.getElementById('battle-rooms-container');
    battlesContainer.addEventListener('click', async (e) => {
        if (e.target && e.target.classList.contains('join-battle-btn')) {
            const battleCard = e.target.closest('.battle-card');
            const battleId = battleCard.dataset.battleId;
            
            e.target.disabled = true; // تعطيل الزر لمنع النقرات المزدوجة
            e.target.textContent = 'جاري...';

            try {
                const response = await fetch(`/api/battles/${battleId}/join`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const result = await response.json();

                if (!response.ok) {
                    showNotification(result.message || 'فشل الانضمام', 'error');
                    e.target.disabled = false;
                    e.target.textContent = 'انضم';
                }
                // لا نحتاج لفعل شيء عند النجاح، لأن تحديث السوكيت سيتولى الأمر
            } catch (error) {
                showNotification('خطأ في الاتصال بالخادم', 'error');
                e.target.disabled = false;
                e.target.textContent = 'انضم';
            }
        }
    });

    
    
async function loadChatHistory() {
        try {
            const response = await fetch('/api/messages/public-room', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const result = await response.json();

            if (response.ok && result.status === 'success') {
                const chatMessages = document.getElementById('chat-messages');
                chatMessages.innerHTML = ''; // تفريغ الرسائل القديمة
                result.data.messages.forEach(message => {
                    displayMessage(message); // استخدام دالة جديدة لعرض الرسالة
                });
            }
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    }

    // --- دالة جديدة لعرض الرسالة (لتجنب تكرار الكود) ---
    function displayMessage(message) {
        const chatMessages = document.getElementById('chat-messages');
        const messageElement = document.createElement('div');
        messageElement.classList.add('p-2', 'rounded-lg', 'mb-2', 'flex', 'items-start', 'gap-2');

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
                <p class="text-white text-sm">${message.message || message.content}</p>
            </div>
        `;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // --- استدعاء الدالة لجلب السجل ---
    loadChatHistory();


    
// (سيتم إضافة منطق الدردشة والتحديات هنا لاحقاً)
    // --- 6. تهيئة Socket.IO في الواجهة الأمامية ---
const socket = io({
auth: {
token: token // إرسال التوكن للمصادقة
}
});

// ✅ الاستماع لحدث تحديث الرصيد
socket.on('balanceUpdate', ({ newBalance }) => {
    const balanceElement = document.getElementById('balance');
    if (balanceElement) {
        balanceElement.textContent = newBalance.toFixed(2);
    }
    // تحديث الرصيد في الكائن المحلي أيضاً
    if (currentUser) {
        currentUser.balance = newBalance;
    }
    showNotification('تم تحديث رصيدك', 'info');
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
        displayMessage(message);  

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

    // عند إنشاء تحدي جديد
    socket.on('newBattle', (battle) => {
        // إزالة حالة "القائمة فارغة" إذا كانت موجودة
        document.getElementById('battles-empty-state').classList.add('hidden');
        displayBattleCard(battle);
        showNotification(`تم إنشاء تحدي ${battle.type} جديد!`, 'info');
    });

    // عند تحديث تحدي (انضمام لاعب، تغيير حالة، إلخ)
    socket.on('battleUpdate', (updatedBattle) => {
        const cardToUpdate = document.querySelector(`.battle-card[data-battle-id="${updatedBattle._id}"]`);
        if (cardToUpdate) {
            // إذا اكتمل التحدي أو تم إلغاؤه، قم بإزالته من القائمة
            if (updatedBattle.status !== 'waiting') {
                cardToUpdate.remove();
            } else {
                // تحديث البطاقة الحالية (يمكن تحسين هذا لاحقاً)
                cardToUpdate.remove();
                displayBattleCard(updatedBattle);
            }
        }
    });

    

    // --- 10. ربط زر إنشاء التحدي ---
    const createBattleBtn = document.getElementById('create-battle-btn');
    createBattleBtn.addEventListener('click', showCreateBattleModal);

    // --- 11. دالة لجلب وعرض التحديات المتاحة ---
    async function loadAvailableBattles() {
        const container = document.getElementById('battle-rooms-container');
        const loadingState = document.getElementById('battles-loading-state');
        const emptyState = document.getElementById('battles-empty-state');

        // إظهار حالة التحميل
        loadingState.classList.remove('hidden');
        emptyState.classList.add('hidden');
        // حذف التحديات القديمة
        container.querySelectorAll('.battle-card').forEach(card => card.remove());

        try {
            const response = await fetch('/api/battles', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();

            loadingState.classList.add('hidden');

            if (response.ok && result.status === 'success') {
                if (result.data.battles.length === 0) {
                    emptyState.classList.remove('hidden');
                } else {
                    result.data.battles.forEach(battle => {
                        displayBattleCard(battle);
                    });
                }
            } else {
                showNotification('فشل تحميل التحديات', 'error');
                emptyState.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Failed to load battles:', error);
            loadingState.classList.add('hidden');
            emptyState.classList.remove('hidden');
        }
    }

    // --- 12. دالة لعرض بطاقة تحدي واحدة ---
    function displayBattleCard(battle) {
        const container = document.getElementById('battle-rooms-container');
        const card = document.createElement('div');
        card.className = 'battle-card bg-gray-700/50 p-3 rounded-lg flex justify-between items-center';
        card.dataset.battleId = battle._id;

        const maxPlayers = battle.type === '1v1' ? 2 : battle.type === '2v2' ? 4 : 8;

        card.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="font-bold text-purple-300">${battle.type}</span>
                <div class="flex items-center gap-1 text-yellow-400">
                    <i class="fas fa-coins"></i>
                    <span>${battle.betAmount}</span>
                </div>
                <div class="flex -space-x-2">
                    ${battle.players.map(p => `<img src="${p.profileImage}" alt="${p.username}" class="w-8 h-8 rounded-full border-2 border-gray-600">`).join('')}
                </div>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-sm text-gray-400">${battle.players.length} / ${maxPlayers}</span>
                <button class="join-battle-btn bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1 px-3 rounded-full">
                    انضم
                </button>
            </div>
        `;
        container.appendChild(card);
    }

    // --- 13. دالة لإظهار نافذة إنشاء تحدي ---
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

        // ربط أحداث النافذة
        document.getElementById('isPrivate').addEventListener('change', (e) => {
            document.getElementById('password-field').classList.toggle('hidden', !e.target.checked);
        });
        document.getElementById('cancel-create-battle').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target.id === 'create-battle-modal') modal.remove(); });
        
        document.getElementById('create-battle-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    // ✅ --- التعديلات هنا ---
    // 1. تحويل مبلغ الرهان إلى رقم عشري
    data.betAmount = parseFloat(data.betAmount);
    // 2. تحويل قيمة checkbox إلى boolean
    data.isPrivate = data.isPrivate === 'on';

    // 3. التحقق من صحة البيانات قبل الإرسال
    if (!data.type || !data.betAmount || data.betAmount <= 0) {
        showNotification('يرجى إدخال مبلغ رهان صالح.', 'error');
        return;
    }
    if (data.isPrivate && !data.password) {
        showNotification('يرجى إدخال كلمة مرور للتحدي الخاص.', 'error');
        return;
    }
    // --- نهاية التعديلات ---

    try {
        const response = await fetch('/api/battles', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();

        if (response.ok && result.status === 'success') {
            showNotification('تم إنشاء التحدي بنجاح!', 'success');
            document.getElementById('create-battle-modal').remove();
            // لا نحتاج لإعادة تحميل القائمة يدوياً، السوكيت سيتولى الأمر
        } else {
            showNotification(result.message || 'فشل إنشاء التحدي', 'error');
        }
    } catch (error) {
        showNotification('خطأ في الاتصال بالخادم', 'error');
    }
 });
    
}

    // --- استدعاء الدالة لجلب التحديات عند تحميل الصفحة ---
    loadAvailableBattles();

   }); // نهاية document.addEventListener   

// دالة عامة لإظهار الإشعارات (يمكن وضعها في ملف منفصل لاحقاً)
function showNotification(message, type = 'info') {
// ... (نفس دالة الإشعارات من الملفات السابقة)
}
