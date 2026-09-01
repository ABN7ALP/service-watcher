
// --- دوال مساعدة لنظام اللفلات ---
const calculateRequiredXp = (level) => {
    return level * 1500;
};
 
// دالة لإنشاء HTML الخاص بشريط التقدم
const createLevelProgressHTML = (user) => {
    const requiredXp = calculateRequiredXp(user.level);
    const progressPercentage = (user.experience / requiredXp) * 100;

    return `
        <div class="mt-4" id="level-container">
            <div class="flex justify-between items-center text-xs mb-1">
                <span class="font-bold text-yellow-400">LVL ${user.level}</span>
                <span class="text-gray-400">${Math.floor(user.experience)} / ${requiredXp} XP</span>
            </div>
            <div class="w-full bg-gray-700 rounded-full h-2.5">
                <div id="xp-bar" class="bg-yellow-400 h-2.5 rounded-full" style="width: ${progressPercentage}%"></div>
            </div>
            <div id="level-perks-container" class="mt-2 text-center">
                <button id="perks-toggle-btn" class="text-xs text-purple-400 hover:underline">
                    مميزات المستوى التالي <i class="fas fa-chevron-down text-xs ml-1"></i>
                </button>
                <div id="perks-list" class="hidden text-left bg-gray-800/50 p-2 rounded-md mt-1 text-xs space-y-1">
                    <p><i class="fas fa-check-circle text-green-400 mr-1"></i> ميزة 1 (مثال)</p>
                    <p><i class="fas fa-check-circle text-green-400 mr-1"></i> ميزة 2 (مثال)</p>
                </div>
            </div>
        </div>
    `;
};



    document.addEventListener('DOMContentLoaded', () => {
    let token = localStorage.getItem('token');  // تغيير const إلى let
    const user = JSON.parse(localStorage.getItem('user'));
    const loadingScreen = document.getElementById('loading-screen');
    const appContainer = document.getElementById('app-container');


// ============================================
// CSS ديناميكي للدردشة الخاصة
// ============================================
const chatStyles = `
    /* أنيميشن للرسائل الجديدة */
    @keyframes messageSlideIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    .new-message {
        animation: messageSlideIn 0.3s ease-out;
    }
    
    /* تخصيص scrollbar للدردشة */
    #private-chat-messages::-webkit-scrollbar {
        width: 6px;
    }
    
    #private-chat-messages::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 10px;
    }
    
    #private-chat-messages::-webkit-scrollbar-thumb {
        background: rgba(139, 92, 246, 0.5);
        border-radius: 10px;
    }
    
    /* تأثيرات الأزرار */
    .chat-action-btn {
        padding: 0.5rem;
        border-radius: 9999px;
        transition: background-color 0.2s;
    }
    
    .chat-action-btn:hover {
        background-color: #374151;
    }
    
    .chat-media-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 0.75rem;
        border-radius: 0.75rem;
        transition: all 0.2s;
        transform: scale(1);
    }
    
    .chat-media-btn:hover {
        background-color: rgba(55, 65, 81, 0.5);
        transform: scale(1.05);
    }
    
    /* مؤشر التسجيل الصوتي */
    @keyframes pulseRecording {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
    
    .recording-active {
        animation: pulseRecording 1s infinite;
        background-color: #dc2626 !important;
    }
/* =========================================== */
/* أنيميشن وستايلات للتسجيل الصوتي الجديد */
/* =========================================== */

/* مؤشر التسجيل النابض */
@keyframes recordingPulse {
    0% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.1); }
    100% { opacity: 1; transform: scale(1); }
}

.animate-pulse {
    animation: recordingPulse 1s infinite;
}

/* واجهة التسجيل */
#voice-recording-ui {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border: 2px solid #4f46e5; /* purple-600 */
    transition: all 0.3s ease;
}

#voice-recording-ui:hover {
    border-color: #7c3aed; /* purple-700 */
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

/* زر الإلغاء */
#cancel-recording {
    transition: all 0.2s ease;
    padding: 8px;
    border-radius: 50%;
}

#cancel-recording:hover {
    background-color: rgba(220, 38, 38, 0.2); /* red-600 with opacity */
    transform: scale(1.1);
}

/* رسائل السحب */
#slide-hint {
    animation: fadeInOut 2s infinite alternate;
}

@keyframes fadeInOut {
    0% { opacity: 0.5; }
    100% { opacity: 1; }
}

/* زر الإرسال الديناميكي */
.dynamic-send-btn {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.dynamic-send-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
}

/* حالة الزر عند التسجيل */
.dynamic-send-btn[data-mode="voice"]:active {
    transform: scale(0.95);
    background-color: #dc2626; /* red-600 */
}

.dynamic-send-btn[data-mode="text"]:active {
    transform: scale(0.95);
    background-color: #7c3aed; /* purple-700 */
}

/* زر الإرسال المعطل */
#send-private-message:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: #6b7280 !important; /* gray-500 */
}

/* مؤشر التحميل */
.uploading-indicator {
    animation: pulse 1.5s infinite;
}

@keyframes pulse {
    0% { opacity: 0.6; }
    50% { opacity: 1; }
    100% { opacity: 0.6; }
}

/* زر إعادة المحاولة */
.retry-voice-btn {
    transition: all 0.2s ease;
}

.retry-voice-btn:hover {
    transform: scale(1.05);
    background-color: rgba(59, 130, 246, 0.2); /* blue-500 with opacity */
}
    
`;

// إضافة الـ styles إلى الـ head مرة واحدة
document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('#chat-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'chat-styles';
        styleEl.textContent = chatStyles;
        document.head.appendChild(styleEl);
    }
});



        
// ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐
// 📍 أضف هذه الدالة هنا (دالة عامة)
// ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐

async function performMiniProfileAction(modalElement, action, userId, miniProfileActionBtn = null) {
    let url = '';
    let method = 'POST';
    let successMessage = '';
    let icon = 'fa-check-circle';
    let color = 'bg-green-500';

    // إذا كان هناك زر، حفظ حالته الأصلية
    let originalButtonHTML = '';
    if (miniProfileActionBtn) {
        originalButtonHTML = miniProfileActionBtn.innerHTML;
        miniProfileActionBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
        miniProfileActionBtn.disabled = true;
    }

    switch (action) {
        case 'send-request':
            url = `/api/friends/send-request/${userId}`;
            successMessage = 'تم إرسال الطلب';
            break;
        case 'accept-request':
            url = `/api/friends/accept-request/${userId}`;
            successMessage = 'أصبحتما أصدقاء الآن';
            break;
        case 'cancel-request':
        case 'reject-request':
            url = `/api/friends/reject-request/${userId}`;
            successMessage = 'تم إلغاء الطلب';
            icon = 'fa-info-circle';
            color = 'bg-blue-500';
            break;
        case 'remove-friend':
            // ⭐⭐ الحل الجديد ⭐⭐
            optimisticallyRemoveFriend(userId);
            
            if (socket && socket.connected) {
                socket.emit('removeFriendRequest', {
                    friendId: userId,
                    timestamp: new Date().toISOString()
                });
            }
            
            showFloatingAlert('تم حذف الصديق', 'fa-trash', 'bg-red-500');
            
            setTimeout(() => {
                if (modalElement) {
                    modalElement.remove();
                }
            }, 500);
            
            setTimeout(async () => {
                await refreshUserData();
            }, 1000);
            
            // إعادة تعيين الزر (إذا كان موجوداً)
            if (miniProfileActionBtn) {
                miniProfileActionBtn.innerHTML = originalButtonHTML;
                miniProfileActionBtn.disabled = false;
            }
            
            return; // خروج مبكر
            
        default:
            // إعادة تعيين الزر (إذا كان موجوداً)
            if (miniProfileActionBtn) {
                miniProfileActionBtn.innerHTML = originalButtonHTML;
                miniProfileActionBtn.disabled = false;
            }
            return;
    }

    // ⭐ هذا الجزء للـ actions الأخرى
    try {
        const response = await fetch(url, { 
            method, 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.message || 'Action failed');
        }
        
        showFloatingAlert(successMessage, icon, color);
        const refreshSuccess = await refreshUserData();
        
        if (refreshSuccess) {
            // إعادة فتح نافذة البروفايل بعد تأخير
            setTimeout(() => {
                showMiniProfileModal(userId);
            }, 300);
        }
        
    } catch (error) {
        showNotification(error.message || 'حدث خطأ ما', 'error');
    } finally {
        // إعادة تعيين الزر (إذا كان موجوداً)
        if (miniProfileActionBtn) {
            miniProfileActionBtn.innerHTML = originalButtonHTML;
            miniProfileActionBtn.disabled = false;
        }
    }
}

    // --- استبدل قسم "منطق الوضع الداكن/الفاتح" بالكامل بهذا ---

const themeToggleBtn = document.createElement('button');
themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
themeToggleBtn.className = 'fixed bottom-4 left-4 bg-gray-200 dark:bg-gray-700 w-12 h-12 rounded-full text-yellow-400 text-xl flex items-center justify-center shadow-lg z-20 transition-colors duration-300';
document.body.appendChild(themeToggleBtn);

// دالة لتطبيق الثيم بناءً على الحالة الحالية
const applyTheme = () => {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
        themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
    } else {
        themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
    }
};

// دالة لتبديل الثيم
const toggleTheme = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    applyTheme();
};

// عند تحميل الصفحة، تحقق من الثيم المحفوظ أو ثيم النظام
(() => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    applyTheme();
})();

themeToggleBtn.addEventListener('click', toggleTheme);



    // --- أضف هذا الكود بعد تعريف appContainer ---
// --- منطق التنقل في الشريط الجانبي ---
const navItems = document.querySelectorAll('.nav-item');
const mainContent = document.querySelector('main'); // استهداف المنطقة الرئيسية

// دالة لتنشيط زر "الرئيسية" افتراضيًا
function activateHomeButton() {
    navItems.forEach(i => i.classList.remove('bg-purple-600', 'text-white'));
    const homeButton = document.querySelector('a[href="#arena"]');
    if (homeButton) {
        homeButton.classList.add('bg-purple-600', 'text-white');
    }
}

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();

        navItems.forEach(i => i.classList.remove('bg-purple-600', 'text-white'));
        item.classList.add('bg-purple-600', 'text-white');

        const targetId = item.getAttribute('href').substring(1);
        
        if (targetId === 'settings') {
            showSettingsView();
        } else if (targetId === 'messages') {
            showMessagesView();
        } else if (targetId === 'leaderboard') {
            showLeaderboardView();
        } else {
            showArenaView();
        }
    });
});



        // =================================================
// ============ قسم الرسائل (Messages) =============
// =================================================

let allChatsCache = [];

// دالة تنسيق الوقت النسبي بشكل أنيق
function formatChatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} د`;
    if (diffHours < 24) return `منذ ${diffHours} س`;
    if (diffDays === 1) return 'أمس';
    if (diffDays < 7) return `منذ ${diffDays} أيام`;
    return date.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' });
}

// دالة توليد معاينة ذكية لآخر رسالة حسب نوعها
function getLastMessagePreview(chat, currentUserId) {
    const details = chat.lastMessageDetails;

    // إذا ما في أي رسالة بعد
    if (!details && !chat.lastMessage) {
        return { icon: '', text: 'ابدأ محادثة جديدة' };
    }

    // ✅ الإصلاح: نعتمد على النوع الحقيقي (type) من كائن الرسالة الكامل
    // بدل تخمين النوع من نص، هذا أدق وأذكى ولا ينهار مهما كان شكل النص
    const isMine = details && details.sender && details.sender._id
        ? details.sender._id.toString() === currentUserId.toString()
        : false;
    const prefix = isMine ? 'أنت: ' : '';

    const type = details ? details.type : 'text';

    switch (type) {
        case 'image':
            return { icon: '<i class="fas fa-image text-green-400"></i>', text: `${prefix}صورة` };
        case 'voice':
            return { icon: '<i class="fas fa-microphone text-purple-400"></i>', text: `${prefix}رسالة صوتية` };
        case 'video':
            return { icon: '<i class="fas fa-video text-blue-400"></i>', text: `${prefix}فيديو` };
        default: {
            const textContent = (details && details.content) ? details.content : (chat.lastMessage || 'رسالة');
            return { icon: '', text: `${prefix}${textContent}` };
        }
    }
}

// دالة رئيسية: عرض قسم الرسائل بالكامل
async function showMessagesView() {
    mainContent.innerHTML = `
        <div class="flex flex-col h-full">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold flex items-center gap-2">
                    <i class="fas fa-envelope text-purple-400"></i>
                    <span>الرسائل</span>
                </h2>
                <button id="refresh-messages-btn" class="text-gray-400 hover:text-purple-400 transition p-2 rounded-full hover:bg-gray-700/50" title="تحديث">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </div>

            <div class="relative mb-4">
                <input type="text" id="messages-search-input" placeholder="ابحث عن محادثة..." 
                       class="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-full py-2 pr-4 pl-10 text-sm focus:ring-purple-500 focus:border-purple-500 transition-colors duration-300">
                <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            </div>

            <div id="messages-list-container" class="flex-grow overflow-y-auto space-y-2 pr-1">
                <div class="text-center text-gray-400 py-16">
                    <i class="fas fa-spinner fa-spin text-3xl mb-3"></i>
                    <p class="text-sm">جاري تحميل المحادثات...</p>
                </div>
            </div>
        </div>
    `;

    const refreshBtn = document.getElementById('refresh-messages-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshBtn.querySelector('i').classList.add('fa-spin');
            loadMessagesList().finally(() => {
                setTimeout(() => refreshBtn.querySelector('i').classList.remove('fa-spin'), 300);
            });
        });
    }

    const searchInput = document.getElementById('messages-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterMessagesList(e.target.value.trim());
        });
    }

    await loadMessagesList();
}

// جلب قائمة المحادثات من الخادم
async function loadMessagesList() {
    const container = document.getElementById('messages-list-container');
    if (!container) return;

    try {
        const response = await fetch('/api/private-chat/chats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (response.ok && result.status === 'success') {
            allChatsCache = result.data.chats || [];
            renderMessagesList(allChatsCache);
            refreshMessagesNavBadge(allChatsCache);
        } else {
            container.innerHTML = `
                <div class="text-center text-red-400 py-16">
                    <i class="fas fa-exclamation-circle text-3xl mb-3"></i>
                    <p class="text-sm">فشل تحميل المحادثات</p>
                </div>`;
        }
    } catch (error) {
        console.error('[MESSAGES] Error loading chat list:', error);
        container.innerHTML = `
            <div class="text-center text-red-400 py-16">
                <i class="fas fa-exclamation-circle text-3xl mb-3"></i>
                <p class="text-sm">خطأ في الاتصال بالخادم</p>
            </div>`;
    }
}

// رسم قائمة المحادثات بشكل أنيق
function renderMessagesList(chats) {
    const container = document.getElementById('messages-list-container');
    if (!container) return;

    const currentUserId = JSON.parse(localStorage.getItem('user'))._id;

    if (!chats || chats.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-400 py-16">
                <i class="fas fa-comment-slash text-4xl mb-4"></i>
                <p>لا توجد محادثات بعد</p>
                <p class="text-xs text-gray-500 mt-1">ابدأ محادثة من الملف الشخصي لأي مستخدم</p>
            </div>`;
        return;
    }

    container.innerHTML = chats.map(chat => {
        const other = chat.otherParticipant;
        if (!other) return '';

        const isBlocked = chat.isBlockedByMe;
        const preview = isBlocked
            ? { icon: '<i class="fas fa-ban text-red-400"></i>', text: 'لقد قمت بحظر هذا المستخدم' }
            : getLastMessagePreview(chat, currentUserId);

        const hasUnread = chat.unreadCount > 0 && !isBlocked;
        const timeText = chat.lastMessageAt ? formatChatTime(chat.lastMessageAt) : '';

        return `
            <div class="message-item flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all hover:bg-gray-700/40 ${hasUnread ? 'bg-purple-900/20 border border-purple-500/20' : 'bg-gray-800/20'} ${isBlocked ? 'opacity-70' : ''}" 
                 data-user-id="${other._id}" data-username="${other.username}">
                                <div class="relative flex-shrink-0">
                    <img src="${other.profileImage}" class="w-12 h-12 rounded-full object-cover border-2 ${isBlocked ? 'border-red-500 grayscale' : hasUnread ? 'border-purple-500' : 'border-gray-600'} ${other.activeFrameClass || ''}">
                    ${hasUnread ? `<span class="absolute -top-1 -right-1 bg-purple-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">${chat.unreadCount > 9 ? '9+' : chat.unreadCount}</span>` : ''}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center gap-2">
                        <span class="font-bold text-sm truncate flex items-center gap-1 ${hasUnread ? 'text-white' : 'text-gray-300'}">${other.username} ${getAgentBadgeIconHTML(other.isAgent)}</span>
                        ${isBlocked ? '<span class="text-[10px] bg-red-900/40 text-red-300 px-2 py-0.5 rounded-full flex-shrink-0">محظور</span>' : `<span class="text-xs flex-shrink-0 ${hasUnread ? 'text-purple-400 font-bold' : 'text-gray-500'}">${timeText}</span>`}
                    </div>
                    <div class="flex items-center gap-1 text-xs truncate mt-0.5 ${isBlocked ? 'text-red-400' : hasUnread ? 'text-gray-200' : 'text-gray-400'}">
                        ${preview.icon}
                        <span class="truncate">${preview.text}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.message-item').forEach(item => {
        item.addEventListener('click', () => {
            const userId = item.dataset.userId;
            const username = item.dataset.username;
            openPrivateChat(userId, username);
        });
    });
}

// فلترة القائمة أثناء الكتابة في البحث
function filterMessagesList(query) {
    if (!query) {
        renderMessagesList(allChatsCache);
        return;
    }

    const filtered = allChatsCache.filter(chat =>
        chat.otherParticipant && chat.otherParticipant.username.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0) {
        const container = document.getElementById('messages-list-container');
        if (container) {
            container.innerHTML = `
                <div class="text-center text-gray-400 py-16">
                    <i class="fas fa-search text-3xl mb-3"></i>
                    <p class="text-sm">لا توجد نتائج مطابقة لـ "${query}"</p>
                </div>`;
        }
        return;
    }

    renderMessagesList(filtered);
}

// تحديث شارة عدد الرسائل غير المقروءة في الشريط الجانبي
async function refreshMessagesNavBadge(cachedChats = null) {
    try {
        let chats = cachedChats;
        if (!chats) {
            const response = await fetch('/api/private-chat/chats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok || result.status !== 'success') return;
            chats = result.data.chats || [];
        }

        const totalUnread = chats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0);
        const badge = document.getElementById('messages-nav-badge');
        if (badge) {
            if (totalUnread > 0) {
                badge.textContent = totalUnread > 9 ? '9+' : totalUnread;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (error) {
        console.error('[MESSAGES BADGE] Error:', error);
    }
}

// --- ✅ استبدل دالة showSettingsView بالكامل ---
async function showSettingsView() {
    const localUser = JSON.parse(localStorage.getItem('user'));

    let blockedUsers = [];
    let blockedCount = 0;
    let frameShopData = { frames: [], activeFrame: null, coins: 0 };
    let bubbleShopData = { skins: [], activeClass: null, coins: 0 };

    const [blockedResult, frameResult, bubbleResult] = await Promise.allSettled([
        fetch('/api/blocks/blocked-list', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
        fetch('/api/frames/shop', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
        fetch('/api/bubble-skins/shop', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.ok ? r.json() : null)
    ]);

    if (blockedResult.status === 'fulfilled' && blockedResult.value) {
        blockedUsers = blockedResult.value.data.blockedUsers || [];
        blockedCount = blockedUsers.length;
    }
    if (frameResult.status === 'fulfilled' && frameResult.value) {
        frameShopData = frameResult.value.data;
    }
    if (bubbleResult.status === 'fulfilled' && bubbleResult.value) {
        bubbleShopData = bubbleResult.value.data;
    }

    
   mainContent.innerHTML = `
        <div class="p-4">
            <h2 class="text-2xl font-bold mb-6"><i class="fas fa-cog mr-2"></i>الإعدادات</h2>
            
            <!-- =========================================== -->
            <!-- 1. قسم الصورة الشخصية (قابل للطي) -->
            <!-- =========================================== -->
            <div class="mb-4">
                <div class="collapsible-header bg-white/30 dark:bg-gray-800/50 p-4 rounded-xl cursor-pointer flex justify-between items-center" data-target="profile-image-section">
                    <h3 class="text-lg font-bold">
                        <i class="fas fa-user-circle mr-2"></i>الصورة الشخصية
                    </h3>
                    <i class="fas fa-chevron-down transition-transform duration-300"></i>
                </div>
                
                <div id="profile-image-section" class="collapsible-content hidden bg-gray-800/30 p-6 rounded-b-xl">
                    <div class="text-center">
                        <img id="settings-profile-image" src="${localUser.profileImage}" 
                             class="w-32 h-32 rounded-full mx-auto border-4 border-purple-500 mb-4 object-cover shadow-lg">
                        
                        <form id="image-upload-form">
                            <input type="file" id="image-file-input" name="profileImage" class="hidden" accept="image/*">
                            <div class="flex flex-col sm:flex-row justify-center items-center gap-4 mt-4">
                                <button type="button" id="select-image-btn" 
                                        class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg w-full sm:w-auto">
                                    <i class="fas fa-image mr-2"></i>اختيار صورة جديدة
                                </button>
                                
                                <button type="submit" id="upload-image-btn" 
                                        class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg w-full sm:w-auto hidden">
                                    <i class="fas fa-upload mr-2"></i>حفظ التغيير
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>


            
            
            <!-- =========================================== -->
            <!-- 2. قسم اسم المستخدم (قابل للطي) -->
            <!-- =========================================== -->
            <div class="mb-4">
                <div class="collapsible-header bg-white/30 dark:bg-gray-800/50 p-4 rounded-xl cursor-pointer flex justify-between items-center" data-target="username-section">
                    <h3 class="text-lg font-bold">
                        <i class="fas fa-user-edit mr-2"></i>اسم المستخدم
                    </h3>
                    <i class="fas fa-chevron-down transition-transform duration-300"></i>
                </div>
                
                <div id="username-section" class="collapsible-content hidden bg-gray-800/30 p-6 rounded-b-xl">
                    <form id="username-update-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium mb-2">الاسم الحالي</label>
                            <input type="text" value="${localUser.username}" 
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 cursor-not-allowed" 
                                   disabled>
                        </div>
                        
                        <div>
                            <label for="username-input" class="block text-sm font-medium mb-2">الاسم الجديد</label>
                            <input type="text" id="username-input" 
                                   class="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-3"
                                   placeholder="أدخل اسم المستخدم الجديد">
                        </div>
                        
                        <button type="submit" 
                                class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg">
                            <i class="fas fa-save mr-2"></i>حفظ التغيير
                        </button>
                    </form>
                </div>
            </div>
            
            <!-- =========================================== -->
            <!-- 3. قسم كلمة المرور (قابل للطي) -->
            <!-- =========================================== -->
            <div class="mb-4">
                <div class="collapsible-header bg-white/30 dark:bg-gray-800/50 p-4 rounded-xl cursor-pointer flex justify-between items-center" data-target="password-section">
                    <h3 class="text-lg font-bold">
                        <i class="fas fa-lock mr-2"></i>كلمة المرور
                    </h3>
                    <i class="fas fa-chevron-down transition-transform duration-300"></i>
                </div>
                
                <div id="password-section" class="collapsible-content hidden bg-gray-800/30 p-6 rounded-b-xl">
                    <form id="password-update-form" class="space-y-4">
                        <div>
                            <label for="current-password" class="block text-sm font-medium mb-2">كلمة المرور الحالية</label>
                            <input type="password" id="current-password" required 
                                   class="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-3"
                                   placeholder="••••••••">
                        </div>
                        
                        <div>
                            <label for="new-password" class="block text-sm font-medium mb-2">كلمة المرور الجديدة</label>
                            <input type="password" id="new-password" required 
                                   class="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-3"
                                   placeholder="•••••••• (6 أحرف على الأقل)">
                        </div>
                        
                        <div>
                            <label for="new-password-confirm" class="block text-sm font-medium mb-2">تأكيد كلمة المرور الجديدة</label>
                            <input type="password" id="new-password-confirm" required 
                                   class="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-3"
                                   placeholder="••••••••">
                        </div>
                        
                        <button type="submit" 
                                class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg">
                            <i class="fas fa-key mr-2"></i>تغيير كلمة المرور
                        </button>
                    </form>
                </div>
            </div>

            <!-- =========================================== -->
            <!-- 5. قسم متجر الإطارات (الجديد) -->
            <!-- =========================================== -->
            <div class="mb-4">
                <div class="collapsible-header bg-white/30 dark:bg-gray-800/50 p-4 rounded-xl cursor-pointer flex justify-between items-center" data-target="frames-shop-section">
                    <h3 class="text-lg font-bold">
                        <i class="fas fa-crown mr-2"></i>متجر الإطارات
                    </h3>
                    <i class="fas fa-chevron-down transition-transform duration-300"></i>
                </div>
                
                <div id="frames-shop-section" class="collapsible-content hidden bg-gray-800/30 p-6 rounded-b-xl">
                    <div class="flex items-center justify-between mb-4 bg-gray-900/50 rounded-xl p-3">
                        <span class="text-sm text-gray-400">رصيدك الحالي</span>
                        <span class="font-bold text-yellow-400 flex items-center gap-1">
                            <i class="fas fa-coins"></i> ${frameShopData.coins}
                        </span>
                    </div>

                       <div class="grid grid-cols-2 gap-3">
                        ${frameShopData.frames.filter(f => f.name !== 'إطار الترحيب').map(f => {
                            const owned = f.ownedInstance;
                            const isActive = frameShopData.activeFrame && frameShopData.activeFrame.toString() === f._id.toString();
                            const isExpired = owned && owned.expiresAt && new Date(owned.expiresAt) < new Date();

                            return `
                            <div class="bg-gray-900/40 rounded-xl p-3 text-center border ${isActive ? 'border-yellow-400' : 'border-gray-700'}">
                                <div class="w-16 h-16 mx-auto rounded-full ${f.cssClass} bg-gray-700 mb-2"></div>
                                <p class="text-sm font-bold mb-1">${f.name}</p>
                                
                                ${owned && !isExpired ? `
                                    ${owned.activatedAt ? `<p class="text-[10px] text-gray-400 mb-2">ينتهي: ${new Date(owned.expiresAt).toLocaleDateString('ar-SA')}</p>` : `<p class="text-[10px] text-green-400 mb-2">بحوزتك (لم يُفعّل بعد)</p>`}
                                    <button class="equip-frame-btn w-full text-xs py-1.5 rounded-full ${isActive ? 'bg-gray-600 text-gray-300' : 'bg-purple-600 hover:bg-purple-700 text-white'}" 
                                            data-frame-id="${f._id}" ${isActive ? 'disabled' : ''}>
                                        ${isActive ? 'مُفعّل حالياً' : 'تفعيل'}
                                    </button>
                                ` : `
                                    <select class="frame-duration-select w-full text-xs bg-gray-700 rounded p-1.5 mb-2" data-frame-id="${f._id}">
                                        <option value="7">7 أيام - ${f.prices.days7} كوينز</option>
                                        <option value="30">30 يوم - ${f.prices.days30} كوينز</option>
                                        <option value="365">سنة كاملة - ${f.prices.days365} كوينز</option>
                                    </select>
                                    <button class="purchase-frame-btn w-full text-xs py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white" data-frame-id="${f._id}">
                                        شراء
                                    </button>
                                `}
                            </div>
                        `}).join('')}
                    </div>
                </div>
            </div>

            <!-- =========================================== -->
            <!-- 7. قسم إطارات دردشة الشات العام (الجديد) -->
            <!-- =========================================== -->
            <div class="mb-4">
                <div class="collapsible-header bg-white/30 dark:bg-gray-800/50 p-4 rounded-xl cursor-pointer flex justify-between items-center" data-target="bubble-shop-section">
                    <h3 class="text-lg font-bold"><i class="fas fa-comment-dots mr-2"></i>إطارات رسائل الشات العام</h3>
                    <i class="fas fa-chevron-down transition-transform duration-300"></i>
                </div>
                <div id="bubble-shop-section" class="collapsible-content hidden bg-gray-800/30 p-6 rounded-b-xl">
                    <div class="flex items-center justify-between mb-4 bg-gray-900/50 rounded-xl p-3">
                        <span class="text-sm text-gray-400">رصيدك الحالي</span>
                        <span class="font-bold text-yellow-400"><i class="fas fa-coins"></i> ${bubbleShopData.coins}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        ${bubbleShopData.skins.map(s => {
                            const isActive = bubbleShopData.activeClass === s.cssClass;
                            return `
                            <div class="rounded-xl p-3 text-center border ${isActive ? 'border-yellow-400' : 'border-gray-700'} ${s.cssClass}">
                                <p class="text-sm font-bold mb-1">${s.name}</p>
                                <p class="text-xs text-yellow-300 mb-2"><i class="fas fa-coins"></i> ${s.price}</p>
                                ${s.owned ? `
                                    <button class="equip-bubble-btn w-full text-xs py-1.5 rounded-full ${isActive ? 'bg-gray-600 text-gray-300' : 'bg-purple-600 hover:bg-purple-700 text-white'}" 
                                            data-skin-id="${s._id}" ${isActive ? 'disabled' : ''}>
                                        ${isActive ? 'مُفعّل حالياً' : 'تفعيل'}
                                    </button>
                                ` : `
                                    <button class="purchase-bubble-btn w-full text-xs py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white" data-skin-id="${s._id}">
                                        شراء
                                    </button>
                                `}
                            </div>
                        `}).join('')}
                    </div>
                </div>
            </div>


            <!-- =========================================== -->
            <!-- 6. قسم الهدايا المستلمة (الجديد) -->
            <!-- =========================================== -->
            <div class="mb-4">
                <div class="collapsible-header bg-white/30 dark:bg-gray-800/50 p-4 rounded-xl cursor-pointer flex justify-between items-center" data-target="gifts-received-section">
                    <h3 class="text-lg font-bold">
                        <i class="fas fa-gift mr-2"></i>هداياي المستلمة
                    </h3>
                    <i class="fas fa-chevron-down transition-transform duration-300"></i>
                </div>
                <div id="gifts-received-section" class="collapsible-content hidden bg-gray-800/30 p-6 rounded-b-xl">
                    <div id="gifts-received-body" class="text-center text-gray-400 py-6">
                        <i class="fas fa-spinner fa-spin"></i>
                    </div>
                </div>
            </div>
            
            <!-- =========================================== -->
            <!-- 4. قسم المحظورين (الجديد) -->
            <!-- =========================================== -->
            <div class="mb-4">
                <div class="collapsible-header bg-white/30 dark:bg-gray-800/50 p-4 rounded-xl cursor-pointer flex justify-between items-center" data-target="blocked-users-section">
                    <h3 class="text-lg font-bold">
                        <i class="fas fa-ban mr-2"></i>المستخدمين المحظورين
                        <span class="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-1 ml-2">${blockedCount}</span>
                    </h3>
                    <i class="fas fa-chevron-down transition-transform duration-300"></i>
                </div>
                
                <div id="blocked-users-section" class="collapsible-content hidden bg-gray-800/30 p-6 rounded-b-xl">
                    ${blockedCount === 0 ? 
                        `<div class="text-center py-8">
                            <i class="fas fa-user-check text-4xl text-gray-500 mb-4"></i>
                            <p class="text-gray-400">لا يوجد مستخدمين محظورين</p>
                        </div>` 
                        : 
                        `<div class="space-y-3 max-h-80 overflow-y-auto pr-2">
                            ${blockedUsers.map(user => `
                                <div class="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg" data-user-id="${user._id}">
                                    <div class="flex items-center gap-3">
                                        <img src="${user.profileImage}" 
                                             class="w-10 h-10 rounded-full border-2 border-red-500">
                                        <div>
                                            <p class="font-medium">${user.username}</p>
                                            <p class="text-xs text-gray-400">ID: ${user.customId}</p>
                                        </div>
                                    </div>

                                    <button class="unblock-user-btn bg-gray-600 hover:bg-gray-700 text-white text-xs py-1 px-3 rounded-full" 
                                            data-user-id="${user._id}">
                                        <i class="fas fa-unlock mr-1"></i>رفع الحظر
                                    </button>
                                </div>
                            `).join('')}
                        </div>`
                    }
                </div>
            </div>
        </div>
    `;
    
    // ⭐ إعادة ربط الأحداث (دالة واحدة فقط)
    setupSettingsEvents();
    loadGiftsReceivedSummary();
}


async function reloadFrameShopSection() {
    try {
        const frameResponse = await fetch('/api/frames/shop', { headers: { 'Authorization': `Bearer ${token}` } });
        const frameResult = await frameResponse.json();
        if (!frameResponse.ok) throw new Error();
        const frameShopData = frameResult.data;

        const section = document.getElementById('frames-shop-section');
        if (!section) return;

        section.innerHTML = `
            <div class="flex items-center justify-between mb-4 bg-gray-900/50 rounded-xl p-3">
                <span class="text-sm text-gray-400">رصيدك الحالي</span>
                <span class="font-bold text-yellow-400 flex items-center gap-1">
                    <i class="fas fa-coins"></i> ${frameShopData.coins}
                </span>
            </div>
            <div class="grid grid-cols-2 gap-3">
                ${frameShopData.frames.filter(f => f.name !== 'إطار الترحيب').map(f => {
                    const owned = f.ownedInstance;
                    const isActive = frameShopData.activeFrame && frameShopData.activeFrame.toString() === f._id.toString();
                    const isExpired = owned && owned.expiresAt && new Date(owned.expiresAt) < new Date();
                    return `
                    <div class="bg-gray-900/40 rounded-xl p-3 text-center border ${isActive ? 'border-yellow-400' : 'border-gray-700'}">
                        <div class="w-16 h-16 mx-auto rounded-full ${f.cssClass} bg-gray-700 mb-2"></div>
                        <p class="text-sm font-bold mb-1">${f.name}</p>
                        ${owned && !isExpired ? `
                            ${owned.activatedAt ? `<p class="text-[10px] text-gray-400 mb-2">ينتهي: ${new Date(owned.expiresAt).toLocaleDateString('ar-SA')}</p>` : `<p class="text-[10px] text-green-400 mb-2">بحوزتك (لم يُفعّل بعد)</p>`}
                            <button class="equip-frame-btn w-full text-xs py-1.5 rounded-full ${isActive ? 'bg-gray-600 text-gray-300' : 'bg-purple-600 hover:bg-purple-700 text-white'}"
                                    data-frame-id="${f._id}" ${isActive ? 'disabled' : ''}>
                                ${isActive ? 'مُفعّل حالياً' : 'تفعيل'}
                            </button>
                        ` : `
                            <select class="frame-duration-select w-full text-xs bg-gray-700 rounded p-1.5 mb-2" data-frame-id="${f._id}">
                                <option value="7">7 أيام - ${f.prices.days7} كوينز</option>
                                <option value="30">30 يوم - ${f.prices.days30} كوينز</option>
                                <option value="365">سنة كاملة - ${f.prices.days365} كوينز</option>
                            </select>
                            <button class="purchase-frame-btn w-full text-xs py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white" data-frame-id="${f._id}">
                                شراء
                            </button>
                        `}
                    </div>
                `}).join('')}
            </div>
        `;
        bindFrameShopButtons();
    } catch (error) {
        console.error('Failed to reload frame shop:', error);
    }
}

function bindFrameShopButtons() {
    document.querySelectorAll('.purchase-frame-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const frameId = this.dataset.frameId;
            const durationSelect = document.querySelector(`.frame-duration-select[data-frame-id="${frameId}"]`);
            const duration = durationSelect ? durationSelect.value : '7';
            this.disabled = true;
            this.textContent = '...';
            try {
                const response = await fetch('/api/frames/purchase', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ frameId, duration })
                });
                const result = await response.json();
                if (response.ok) {
                    showNotification(result.message, 'success');
                    await refreshUserData();
                    await reloadFrameShopSection();
                } else {
                    showNotification(result.message || 'فشل الشراء', 'error');
                    this.disabled = false;
                    this.textContent = 'شراء';
                }
            } catch (error) {
                showNotification('خطأ في الاتصال بالخادم', 'error');
                this.disabled = false;
                this.textContent = 'شراء';
            }
        });
    });

    document.querySelectorAll('.equip-frame-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const frameId = this.dataset.frameId;
            this.disabled = true;
            try {
                const response = await fetch('/api/frames/equip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ frameId })
                });
                const result = await response.json();
                if (response.ok) {
                    showNotification(result.message, 'success');
                    await refreshUserData();
                    await reloadFrameShopSection();
                } else {
                    showNotification(result.message || 'فشل التفعيل', 'error');
                    this.disabled = false;
                }
            } catch (error) {
                showNotification('خطأ في الاتصال بالخادم', 'error');
                this.disabled = false;
            }
        });
    });
}

async function reloadBubbleShopSection() {
    try {
        const bubbleResponse = await fetch('/api/bubble-skins/shop', { headers: { 'Authorization': `Bearer ${token}` } });
        const bubbleResult = await bubbleResponse.json();
        if (!bubbleResponse.ok) throw new Error();
        const bubbleShopData = bubbleResult.data;

        const section = document.getElementById('bubble-shop-section');
        if (!section) return;

        section.innerHTML = `
            <div class="flex items-center justify-between mb-4 bg-gray-900/50 rounded-xl p-3">
                <span class="text-sm text-gray-400">رصيدك الحالي</span>
                <span class="font-bold text-yellow-400"><i class="fas fa-coins"></i> ${bubbleShopData.coins}</span>
            </div>
            <div class="grid grid-cols-2 gap-3">
                ${bubbleShopData.skins.map(s => {
                    const isActive = bubbleShopData.activeClass === s.cssClass;
                    return `
                    <div class="rounded-xl p-3 text-center border ${isActive ? 'border-yellow-400' : 'border-gray-700'} ${s.cssClass}">
                        <p class="text-sm font-bold mb-1">${s.name}</p>
                        <p class="text-xs text-yellow-300 mb-2"><i class="fas fa-coins"></i> ${s.price}</p>
                        ${s.owned ? `
                            <button class="equip-bubble-btn w-full text-xs py-1.5 rounded-full ${isActive ? 'bg-gray-600 text-gray-300' : 'bg-purple-600 hover:bg-purple-700 text-white'}"
                                    data-skin-id="${s._id}" ${isActive ? 'disabled' : ''}>
                                ${isActive ? 'مُفعّل حالياً' : 'تفعيل'}
                            </button>
                        ` : `
                            <button class="purchase-bubble-btn w-full text-xs py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white" data-skin-id="${s._id}">
                                شراء
                            </button>
                        `}
                    </div>
                `}).join('')}
            </div>
        `;
        bindBubbleShopButtons();
    } catch (error) {
        console.error('Failed to reload bubble shop:', error);
    }
}

function bindBubbleShopButtons() {
    document.querySelectorAll('.purchase-bubble-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const skinId = this.dataset.skinId;
            this.disabled = true;
            try {
                const response = await fetch('/api/bubble-skins/purchase', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ skinId })
                });
                const result = await response.json();
                if (response.ok) {
                    showNotification(result.message, 'success');
                    await refreshUserData();
                    await reloadBubbleShopSection();
                } else {
                    showNotification(result.message || 'فشل الشراء', 'error');
                    this.disabled = false;
                }
            } catch (error) {
                showNotification('خطأ في الاتصال بالخادم', 'error');
                this.disabled = false;
            }
        });
    });

    document.querySelectorAll('.equip-bubble-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const skinId = this.dataset.skinId;
            this.disabled = true;
            try {
                const response = await fetch('/api/bubble-skins/equip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ skinId })
                });
                const result = await response.json();
                if (response.ok) {
                    showNotification(result.message, 'success');
                    await refreshUserData();
                    await reloadBubbleShopSection();
                } else {
                    showNotification(result.message || 'فشل التفعيل', 'error');
                    this.disabled = false;
                }
            } catch (error) {
                showNotification('خطأ في الاتصال بالخادم', 'error');
                this.disabled = false;
            }
        });
    });
}


        

// 📍 أضف هذه الدالة بعد showSettingsView
function setupSettingsEvents() {
    // 1. الأقسام القابلة للطي
    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const content = document.getElementById(targetId);
            const icon = this.querySelector('i.fa-chevron-down');
            
            if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                icon.style.transform = 'rotate(180deg)';
            } else {
                content.classList.add('hidden');
                icon.style.transform = 'rotate(0deg)';
            }
        });
    });



     bindFrameShopButtons();
    bindBubbleShopButtons();
    
    // 2. تحديث الصورة الشخصية
    document.getElementById('select-image-btn').addEventListener('click', () => {
        document.getElementById('image-file-input').click();
    });
    
    document.getElementById('image-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('settings-profile-image').src = event.target.result;
            };
            reader.readAsDataURL(file);
            document.getElementById('upload-image-btn').classList.remove('hidden');
        }
    });
    
    document.getElementById('image-upload-form').addEventListener('submit', handleImageUpload);
    document.getElementById('username-update-form').addEventListener('submit', handleUsernameUpdate);
    document.getElementById('password-update-form').addEventListener('submit', handlePasswordUpdate);
    
    // 3. رفع الحظر
document.querySelectorAll('.unblock-user-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
        const userId = this.dataset.userId;
        const userCard = this.closest('[data-user-id]');
        const username = userCard?.querySelector('p.font-medium')?.textContent || 'المستخدم';
        
        if (userCard) userCard.style.opacity = '0.5';
        
        try {
            const response = await fetch(`/api/blocks/unblock/${userId}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            
            // ⭐ جلب الـ response كـ JSON
            const result = await response.json();
            
            if (response.ok) {
                // ⭐⭐ تحديث localStorage فوراً ⭐⭐
                if (result.data?.updatedUser) {
                    // 1. جلب المستخدم الحالي
                    const currentUser = JSON.parse(localStorage.getItem('user'));
                    
                    // 2. دمج البيانات القديمة مع الجديدة
                    const mergedUser = {
                        ...currentUser,
                        ...result.data.updatedUser,
                        _id: currentUser._id,
                        customId: currentUser.customId,
                        email: currentUser.email,
                        password: currentUser.password,
                        gender: currentUser.gender,
                        birthDate: currentUser.birthDate,
                        socialStatus: currentUser.socialStatus,
                        educationStatus: currentUser.educationStatus
                    };
                    
                    // 3. حفظ في localStorage
                    localStorage.setItem('user', JSON.stringify(mergedUser));
                    
                    // 4. تحديث الواجهة مباشرة
                    updateUIWithUserData(mergedUser);
                    
                    console.log('✅ [SETTINGS] localStorage updated from unblock API');
                }
                
                // ⭐ إشعار فوري
                showNotification(`تم رفع الحظر عن ${username}`, 'success');
                
                // ⭐ تحديث العدد
                const blockedCountElement = document.querySelector('.collapsible-header h3 span');
                if (blockedCountElement) {
                    const currentCount = parseInt(blockedCountElement.textContent) || 0;
                    blockedCountElement.textContent = Math.max(0, currentCount - 1);
                }
                
                // ⭐ إخفاء العنصر بتأنق
                if (userCard) {
                    userCard.style.transition = 'all 0.3s ease';
                    userCard.style.opacity = '0';
                    userCard.style.height = '0';
                    userCard.style.padding = '0';
                    userCard.style.margin = '0';
                    userCard.style.overflow = 'hidden';
                    
                    setTimeout(() => {
                        userCard.style.display = 'none';
                        
                        // ⭐ إذا لم يبق أحد، عرض رسالة "لا يوجد محظورين"
                        const blockedSection = document.getElementById('blocked-users-section');
                        const blockedItems = blockedSection.querySelectorAll('[data-user-id]');
                        const visibleItems = Array.from(blockedItems).filter(item => 
                            item.style.display !== 'none' && 
                            item.style.opacity !== '0'
                        );
                        
                        if (visibleItems.length === 0) {
                            blockedSection.innerHTML = `
                                <div class="text-center py-8">
                                    <i class="fas fa-user-check text-4xl text-gray-500 mb-4"></i>
                                    <p class="text-gray-400">لا يوجد مستخدمين محظورين</p>
                                </div>
                            `;
                        }
                    }, 300);
                }
                
                // ⭐ إرسال إشعار Socket لتحديث البروفايل المصغر
                if (socket && socket.connected) {
                    socket.emit('unblockAction', {
                        unblockedUserId: userId,
                        unblockedUsername: username,
                        timestamp: new Date().toISOString()
                    });
                }
                
            } else {
                showNotification(result.message || 'فشل رفع الحظر', 'error');
                if (userCard) userCard.style.opacity = '1';
            }
            
        } catch (error) {
            console.error('Error unblocking user:', error);
            showNotification('خطأ في الاتصال', 'error');
            if (userCard) userCard.style.opacity = '1';
        }
    });
});
 }

// دالة لإعادة عرض ساحة التحديات
function showArenaView() {
    mainContent.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold"><i class="fas fa-gamepad"></i> ساحة التحديات</h2>
            <button id="create-battle-btn" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2">
                <i class="fas fa-plus"></i>
                <span>إنشاء تحدي</span>
            </button>
        </div>
        <div id="battle-rooms-container" class="flex-grow overflow-y-auto space-y-3 pr-2">
            <div id="battles-empty-state" class="text-center text-gray-400 py-10 hidden">
                <i class="fas fa-ghost text-4xl mb-4"></i>
                <p>لا توجد تحديات متاحة حالياً. كن أول من يبدأ!</p>
            </div>
            <div id="battles-loading-state" class="text-center text-gray-400 py-10">
                <i class="fas fa-spinner fa-spin text-4xl mb-4"></i>
                <p>جاري تحميل التحديات...</p>
            </div>
        </div>
        <div class="mt-4 pt-4 border-t border-gray-700">
            <h3 class="font-bold mb-3">🎤 غرفة الصوت</h3>
            <div id="voice-chat-grid" class="grid grid-cols-9 gap-3">
            </div>
        </div>
    `;
    // إعادة ربط الأحداث وتحميل البيانات
    document.getElementById('create-battle-btn').addEventListener('click', showCreateBattleModal);
    loadAvailableBattles();
    // إعادة إنشاء مقاعد الصوت
    const voiceGrid = document.getElementById('voice-chat-grid');
    for (let i = 1; i <= 27; i++) {
        const seat = document.createElement('div');
        if (i <= 3) {
            seat.className = 'voice-seat admin-seat';
            seat.innerHTML = '<i class="fas fa-crown"></i>';
        } else {
            seat.className = 'voice-seat user-seat';
            seat.textContent = i;
        }
        seat.dataset.seat = i;
        voiceGrid.appendChild(seat);
    }
    // إعادة تنشيط زر الرئيسية
    activateHomeButton();
}

// دالة جديدة لمعالجة رفع الصورة
async function handleImageUpload(e) {
    e.preventDefault();
    const fileInput = document.getElementById('image-file-input');
    if (!fileInput.files || fileInput.files.length === 0) {
        showNotification('الرجاء اختيار صورة أولاً.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('profileImage', fileInput.files[0]);

    const uploadBtn = document.getElementById('upload-image-btn');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>جاري الرفع...';

    try {
        const response = await fetch('/api/users/updateProfilePicture', {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const result = await response.json();
        if (response.ok) {
            showNotification('تم تحديث الصورة بنجاح!', 'success');
            const localUser = JSON.parse(localStorage.getItem('user'));
            localUser.profileImage = result.data.user.profileImage;
            localStorage.setItem('user', JSON.stringify(localUser));
            document.getElementById('profileImage').src = localUser.profileImage; // تحديث الصورة في الشريط العلوي
            uploadBtn.classList.add('hidden');
        } else {
            showNotification(result.message || 'فشل رفع الصورة', 'error');
        }
    } catch (error) {
        showNotification('خطأ في الاتصال بالخادم', 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="fas fa-upload mr-2"></i>رفع وحفظ';
    }
}

// دالة جديدة لمعالجة تحديث اسم المستخدم
async function handleUsernameUpdate(e) {
    e.preventDefault();
    const newUsername = document.getElementById('username-input').value;
    try {
        const response = await fetch('/api/users/updateUsername', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ username: newUsername })
        });
        const result = await response.json();
        if (response.ok) {
            showNotification('تم تحديث اسم المستخدم بنجاح!', 'success');
            const localUser = JSON.parse(localStorage.getItem('user'));
            localUser.username = result.data.user.username;
            localStorage.setItem('user', JSON.stringify(localUser));
            document.getElementById('username').textContent = localUser.username; // تحديث الاسم في الشريط العلوي
        } else {
            showNotification(result.message || 'فشل تحديث اسم المستخدم', 'error');
        }
    } catch (error) {
        showNotification('خطأ في الاتصال بالخادم', 'error');
    }
}


    // --- أضف هذا المتغير في بداية الملف ---
    let replyingToMessage = null;
    
    // --- 1. التحقق من المصادقة ---
    if (!token || !user) {
        window.location.href = '/login.html';
        return;
    }

    // --- 2. إظهار التطبيق وإخفاء شاشة التحميل ---
    loadingScreen.classList.add('hidden');
    appContainer.classList.remove('hidden');

    // --- 3. تهيئة واجهة المستخدم ببيانات المستخدم ---
function updateUIWithUserData(userData) {
    const usernameEl = document.getElementById('username');
    if (usernameEl) usernameEl.innerHTML = `${userData.username} ${getAgentBadgeHTML(userData.isAgent)}`;

    document.getElementById('balance').textContent = userData.balance.toFixed(2);
    document.getElementById('coins').textContent = userData.coins;
    document.getElementById('userLevel').textContent = userData.level;

    const profileImgEl = document.getElementById('profileImage');
    if (profileImgEl) {
        profileImgEl.src = userData.profileImage;
        applyFrameToAvatar(profileImgEl, userData.activeFrameClass);
    }
    
    document.getElementById('user-status-text').textContent = userData.status || '🚀 جاهز للتحديات!';
    
    const requiredXP = calculateRequiredXp(userData.level);
    document.getElementById('currentXP').textContent = Math.floor(userData.experience);
    document.getElementById('requiredXP').textContent = requiredXP;
    
    const progressPercentage = (userData.experience / requiredXP) * 100;
    document.getElementById('xp-bar').style.width = `${progressPercentage}%`;
    
    const friendsCount = userData.friends ? userData.friends.length : 0;
    document.getElementById('friends-count').textContent = friendsCount;
    
    updateFriendsAvatars(userData.friends);
    
    const requestsBadge = document.getElementById('friend-requests-badge');
    const requestsCount = userData.friendRequestsReceived ? userData.friendRequestsReceived.length : 0;
    if (requestsCount > 0) {
        requestsBadge.textContent = requestsCount;
        requestsBadge.classList.remove('hidden');
    } else {
        requestsBadge.classList.add('hidden');
    }
}
        

// --- ✅ الدالة الجديدة: تحديث بيانات المستخدم من الخادم ---
async function refreshUserData() {
    try {
        console.log('[DEBUG] Refreshing user data from server...');
        
        const response = await fetch('/api/users/me/details', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            if (response.status === 403 && errBody.code === 'ACCOUNT_BANNED') {
                showBannedModal(errBody.banReason, errBody.banExpires, errBody.isPermanent);
                return false;
            }
            throw new Error('Failed to refresh user data');
        }
        
        const result = await response.json();
        
        if (result.status === 'success') {
    // تحديث localStorage
    localStorage.setItem('user', JSON.stringify(result.data.user));
    
    // تحديث واجهة المستخدم
    updateUIWithUserData(result.data.user);
    
    console.log('[DEBUG] User data refreshed successfully');
    
    // ✅ هذا السطر يجب أن يكون هنا
    console.log('[DEBUG] Updated user data:', {
        friends: result.data.user.friends ? result.data.user.friends.length : 0,
        sentRequests: result.data.user.friendRequestsSent ? result.data.user.friendRequestsSent.length : 0,
        receivedRequests: result.data.user.friendRequestsReceived ? result.data.user.friendRequestsReceived.length : 0
    });
    
    return true;
}
        
    } catch (error) {
        console.error('[ERROR] Failed to refresh user data:', error);
        return false;
    }
}

// 📍 أضف هذه الدالة بعد async function refreshUserData() {

function optimisticallyRemoveFriend(friendId) {
    console.log(`[OPTIMISTIC] Removing friend ${friendId} from UI immediately`);
    
    // 1. تحديث localStorage
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.friends) {
        // تحويل كل الأصدقاء إلى string للمقارنة
        user.friends = user.friends.filter(friend => {
            const friendIdStr = typeof friend === 'object' ? friend._id.toString() : friend.toString();
            return friendIdStr !== friendId.toString();
        });
        localStorage.setItem('user', JSON.stringify(user));
    }
    
    // 2. تحديث العدد في الشريط الجانبي
    const friendsCountElement = document.getElementById('friends-count');
    if (friendsCountElement && user && user.friends !== undefined) {
        friendsCountElement.textContent = user.friends.length;
    }
    
    // 3. تحديث صور الأصدقاء المصغرة
    if (typeof updateFriendsAvatars === 'function' && user && user.friends) {
        updateFriendsAvatars(user.friends);
    }
    
    return user;
}

        
   // --- ✅ دالة حظر مستخدم ---
async function blockUser(userId, modalElement) {
    try {
        console.log(`[CLIENT BLOCK] Blocking user ${userId}`);
        
        const response = await fetch(`/api/blocks/block/${userId}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        const result = await response.json();
 
        if (response.ok) {
            showFloatingAlert('تم الحظر', 'fa-ban', 'bg-red-500');
            
            await refreshUserData();
            
            if (socket && socket.connected) {
                socket.emit('forceClearBlockCache', {
                    blockedBy: userId,
                    forceAll: true
                });
                socket.emit('refreshBlockData');
            }
            
            const user = JSON.parse(localStorage.getItem('user'));
            if (user && user.friends !== undefined) {
                document.getElementById('friends-count').textContent = user.friends.length;
                if (typeof updateFriendsAvatars === 'function') {
                    updateFriendsAvatars(user.friends);
                }
            }
            
            if (modalElement) {
                modalElement.remove();
            }

            // ✅ الإصلاح: قفل نافذة الدردشة فوراً في مكانها إذا كانت مفتوحة مع نفس الشخص
            // بدل الحاجة لإغلاقها وإعادة فتحها لرؤية التغيير
            const openChatModal = document.getElementById('private-chat-modal');
            if (openChatModal && openChatModal.dataset.targetUserId === userId.toString()) {
                const chatUserName = document.getElementById('chat-user-name')?.textContent || 'المستخدم';
                lockChatForBlockedUser(userId, chatUserName);
            }

            // ✅ تحديث قسم الرسائل فوراً إذا كان مفتوحاً (لإظهار شارة "محظور")
            if (document.getElementById('messages-list-container')) {
                loadMessagesList();
            }
            
            return true;
        } else {
            showNotification(result.message || 'فشل حظر المستخدم', 'error');
            return false;
        }
        
    } catch (error) {
        console.error('Error blocking user:', error);
        showNotification('خطأ في الاتصال بالخادم', 'error');
        return false;
    }
}


// --- ✅ دالة فك حظر مستخدم ---
async function unblockUser(userId, modalElement) {
    try {
        console.log(`[CLIENT BLOCK] Unblocking user ${userId}`);
        
        const response = await fetch(`/api/blocks/unblock/${userId}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            }
        });
        
        const result = await response.json();
 
        if (response.ok) {
            showFloatingAlert('تم رفع حظر', 'fa-ban', 'bg-red-500');
            
            await refreshUserData();

            if (socket && socket.connected) {
                socket.emit('forceClearBlockCache', {
                    blockedBy: userId,
                    forceAll: true
                });
                socket.emit('refreshBlockData');
            }
            
            const user = JSON.parse(localStorage.getItem('user'));
            if (user && user.friends !== undefined) {
                document.getElementById('friends-count').textContent = user.friends.length;
                if (typeof updateFriendsAvatars === 'function') {
                    updateFriendsAvatars(user.friends);
                }
            }
            
            if (modalElement) {
                modalElement.remove();
            }

            // ✅ الإصلاح: إعادة شريط الإدخال الطبيعي فوراً بمكانه، دون إغلاق النافذة وإعادة فتحها
            const openChatModal = document.getElementById('private-chat-modal');
            if (openChatModal && openChatModal.dataset.targetUserId === userId.toString()) {
                restoreChatInputArea(userId);
            }

            if (document.getElementById('messages-list-container')) {
                loadMessagesList();
            }
            
            return true;
        } else {
            showNotification(result.message || 'فشل رفع الحظر', 'error');
            return false;
        }
        
    } catch (error) {
        console.error('Error unblocking user:', error);
        showNotification('خطأ في الاتصال بالخادم', 'error');
        return false;
    }
}


   // --- ✅ دالة معالجة إجراءات الصداقة ---
async function handleFriendAction(action, userId, modalElement) {
    let url = '';
    let method = 'POST';
    let successMessage = '';
    
    switch (action) {
        case 'send-request':
            url = `/api/friends/send-request/${userId}`;
            successMessage = 'تم إرسال طلب الصداقة';
            break;
        case 'cancel-request':
        case 'reject-request':
            url = `/api/friends/reject-request/${userId}`;
            successMessage = 'تم إلغاء الطلب';
            break;
        case 'accept-request':
            url = `/api/friends/accept-request/${userId}`;
            successMessage = 'أصبحتما أصدقاء';
            break;
        case 'remove-friend':
            url = `/api/friends/remove-friend/${userId}`;
            method = 'DELETE';
            successMessage = 'تم حذف الصديق';
            break;
        case 'unblock-friend':
            // هذا سيتعامل معه unblockUser مباشرة
            await unblockUser(userId, modalElement);
            return;
        default:
            return;
    }
    
    try {
        const response = await fetch(url, { 
            method, 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        
        if (response.ok) {
            // تحديث البيانات
            await refreshUserData();
            
            // إعادة فتح النافذة
            setTimeout(() => {
                if (modalElement) modalElement.remove();
                showMiniProfileModal(userId);
            }, 300);
        }
    } catch (error) {
        console.error('Error handling friend action:', error);
    }
}     
        
// استدعاء الدالة عند تحميل الصفحة
updateUIWithUserData(user);

        // ✅ جلب أحدث بيانات المستخدم من الخادم فور فتح الموقع
// هذا يضمن ظهور طلبات الصداقة/الإشعارات التي وصلت أثناء إغلاق الموقع
(async () => {
    const refreshed = await refreshUserData();
    if (refreshed) {
        const freshUser = JSON.parse(localStorage.getItem('user'));
        const pendingRequests = freshUser.friendRequestsReceived ? freshUser.friendRequestsReceived.length : 0;
        if (pendingRequests > 0) {
            showNotification(`لديك ${pendingRequests} طلب صداقة بانتظارك`, 'info');
        }
    }

    // ✅ التحقق من الرسائل الخاصة غير المقروءة
    try {
        const chatsResponse = await fetch('/api/private-chat/chats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (chatsResponse.ok) {
            const chatsResult = await chatsResponse.json();
            if (chatsResult.status === 'success') {
                const totalUnread = chatsResult.data.chats.reduce(
                    (sum, chat) => sum + (chat.unreadCount || 0), 0
                );
                if (totalUnread > 0) {
                    showNotification(`لديك ${totalUnread} رسالة خاصة غير مقروءة`, 'info');
                }
                refreshMessagesNavBadge(chatsResult.data.chats);
            }
        }
    } catch (error) {
        console.error('[STARTUP] فشل التحقق من الرسائل غير المقروءة:', error);
    }
})();


// --- ✅ إضافة عرض البيانات الجديدة ---
// --- ✅ إضافة عرض البيانات الجديدة (النسخة المحسّنة) ---
const profileContainer = document.querySelector('.user-profile');

// --- دوال مساعدة لترجمة البيانات إلى نصوص عربية وأيقونات ---
const getSocialStatus = (status) => {
    const map = {
        single: { text: 'أعزب', icon: 'fa-user' },
        in_relationship: { text: 'في علاقة', icon: 'fa-heart' },
        engaged: { text: 'مخطوب', icon: 'fa-ring' },
        married: { text: 'متزوج', icon: 'fa-users' },
        divorced: { text: 'مطلق', icon: 'fa-user-slash' },
        searching: { text: 'يبحث عن حب', icon: 'fa-search' }
    };
    return map[status] || { text: status, icon: 'fa-question-circle' };
};

const getEducationStatus = (status) => {
    const map = {
        studying: { text: 'طالب', icon: 'fa-book-open' },
        graduated: { text: 'خريج', icon: 'fa-graduation-cap' },
        primary: { text: 'ابتدائي', icon: 'fa-child' },
        high_school: { text: 'ثانوي', icon: 'fa-school' },
        university: { text: 'جامعي', icon: 'fa-university' }
    };
    return map[status] || { text: status, icon: 'fa-question-circle' };
};


const socialInfo = getSocialStatus(user.socialStatus);
const educationInfo = getEducationStatus(user.educationStatus);

const detailsHTML = `
    <div class="mt-3 space-y-2 text-sm text-gray-300 dark:text-gray-400">
        <div class="flex justify-center items-center gap-4">
            <div class="text-xs flex items-center gap-2 cursor-pointer" id="user-id-container" title="نسخ الـ ID">
                <i class="fas fa-id-card-alt text-purple-400"></i> <span>${user.customId}</span>
            </div>
            <div class="text-xs flex items-center gap-2">
                <i class="fas fa-birthday-cake text-pink-400"></i> <span>${user.age} سنة</span>
            </div>
        </div>
        <div class="flex justify-center items-center gap-4 pt-1">
            <div class="text-xs flex items-center gap-2" title="${socialInfo.text}">
                <i class="fas ${socialInfo.icon} text-red-400"></i> <span>${socialInfo.text}</span>
            </div>
            <div class="text-xs flex items-center gap-2" title="${educationInfo.text}">
                <i class="fas ${educationInfo.icon} text-blue-400"></i> <span>${educationInfo.text}</span>
            </div>
        </div>
    </div>
`;

profileContainer.insertAdjacentHTML('beforeend', detailsHTML);

// ربط الأحداث
document.getElementById('user-id-container').addEventListener('click', () => {
    navigator.clipboard.writeText(user.customId).then(() => showNotification('تم نسخ الـ ID بنجاح!', 'info'));
});



    // --- 4. إنشاء مقاعد الصوت ---
    const voiceGrid = document.getElementById('voice-chat-grid');
    for (let i = 4; i <= 27; i++) {
        const seat = document.createElement('div');
        seat.className = 'voice-seat user-seat';
        seat.dataset.seat = i;
        seat.textContent = i;
        voiceGrid.appendChild(seat);
    }
    const buyCoinsBtn = document.getElementById('buy-coins-btn');
    if (buyCoinsBtn) {
        buyCoinsBtn.addEventListener('click', showBuyCoinsModal);
    }
          const withdrawBtn = document.getElementById('withdraw-balance-btn');
    if (withdrawBtn) withdrawBtn.addEventListener('click', showWithdrawModal);

    const depositBalanceBtn = document.getElementById('deposit-balance-btn');
    if (depositBalanceBtn) depositBalanceBtn.addEventListener('click', showDepositModal);

    // --- 5. ربط زر تسجيل الخروج ---
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    });

    // --- 6. تهيئة Socket.IO ---
    const socket = io({
        auth: {
            token: token
        }
    });

      // --- ✅ أضف هذا المستمع الجديد لأزرار إدارة الأصدقاء ---
mainContent.addEventListener('click', async (e) => {
    const button = e.target.closest('.friend-action-btn');
    if (!button) return;

    const action = button.dataset.action;
    const userId = button.dataset.userId;
    const card = button.closest('.flex.items-center.justify-between');

    const performAction = async () => {
        let url = '';
        let method = 'POST';

        switch (action) {
            case 'accept-request':
                url = `/api/friends/accept-request/${userId}`;
                break;
            case 'reject-request':
                url = `/api/friends/reject-request/${userId}`;
                break;
            case 'remove-friend':
                url = `/api/friends/remove-friend/${userId}`;
                method = 'DELETE';
                break;
            default:
                return;
        }

        // التحديث المتفائل
        card.style.opacity = '0.5';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Action failed');

            // إعادة تحميل قسم الإعدادات بالكامل لعرض البيانات المحدثة
            showSettingsView();
            showNotification('تم تنفيذ الإجراء بنجاح', 'success');

        } catch (error) {
            card.style.opacity = '1';
            showNotification('فشل تنفيذ الإجراء', 'error');
        }
    };

    if (action === 'remove-friend' || action === 'reject-request') {
        const message = action === 'remove-friend' ? 'هل أنت متأكد من حذف هذا الصديق؟' : 'هل أنت متأكد من رفض هذا الطلب؟';
        showConfirmationModal(message, performAction);
    } else {
        performAction();
    }
});

// --- ✅ أضف هذا المستمع لفتح الملف الشخصي المصغر من قسم الإعدادات ---


// --- ✅ استبدل مستمع mainContent بالكامل بهذا ---
// --- ✅✅✅ استبدل كلا المستمعين القديمين بهذا الكود المدمج والنهائي ---
// --- ✅✅✅ استبدل المستمع المدمج بالكامل بهذه النسخة النهائية ---
document.body.addEventListener('click', async (e) => {
    // --- الجزء الأول: إغلاق النوافذ المنبثقة عند النقر على الخلفية ---
    const modalBackdrop = e.target.closest('.modal-backdrop');
    if (modalBackdrop && e.target === modalBackdrop) {
        modalBackdrop.remove();
        return; // أوقف التنفيذ هنا
    }

    // --- الجزء الثاني: التعامل مع أزرار الملف الشخصي المصغر --
const miniProfileActionBtn = e.target.closest('.action-btn');
if (miniProfileActionBtn && miniProfileActionBtn.dataset.action) {
    const action = miniProfileActionBtn.dataset.action;
    const userId = miniProfileActionBtn.dataset.userId;
    const modalElement = document.getElementById('mini-profile-modal');
    
    if (action === 'remove-friend' || action === 'cancel-request') {
        const message = action === 'remove-friend' 
            ? 'هل أنت متأكد من حذف هذا الصديق؟' 
            : 'هل أنت متأكد من إلغاء طلب الصداقة؟';
        
        showConfirmationModal(message, () => {
            // ⭐ استدعاء الدالة العامة
            performMiniProfileAction(modalElement, action, userId, miniProfileActionBtn);
        });
    } else {
        // ⭐ استدعاء الدالة العامة
        performMiniProfileAction(modalElement, action, userId, miniProfileActionBtn);
    }
    return;
}

    // --- الجزء الثالث: التعامل مع أزرار نوافذ الأصدقاء ---
    const friendListActionBtn = e.target.closest('.friend-action-btn');
if (friendListActionBtn) {
    const action = friendListActionBtn.dataset.action;
    const userId = friendListActionBtn.dataset.userId;
    const card = friendListActionBtn.closest('.flex.items-center.justify-between');
    
    const performListAction = async () => {
        let url = '';
        let method = 'POST';
        
        switch (action) {
            case 'accept-request': 
                url = `/api/friends/accept-request/${userId}`; 
                break;
            case 'reject-request': 
                url = `/api/friends/reject-request/${userId}`; 
                break;
            case 'remove-friend': 
                url = `/api/friends/remove-friend/${userId}`; 
                method = 'DELETE';
                break;
            default: 
                return;
        }
        
        // ⭐ التحديث المتفائل: إخفاء العنصر فوراً
        if (card) card.style.display = 'none';
        
        try {
            const response = await fetch(url, { 
                method, 
                headers: { 'Authorization': `Bearer ${token}` } 
            });
            
            if (!response.ok) throw new Error('Action failed');
            
            showNotification('تم تنفيذ الإجراء بنجاح', 'success');
            await refreshUserData();  // تحديث البيانات
            
        } catch (error) {
            // ⭐ إذا فشل، أعد عرض العنصر
            if (card) card.style.display = 'flex';
            showNotification('فشل تنفيذ الإجراء', 'error');
        }
    };
    
    // ⭐ إضافة تأكيد للحذف أو الرفض
    if (action === 'remove-friend' || action === 'reject-request') {
        const message = action === 'remove-friend' 
            ? 'هل أنت متأكد من حذف هذا الصديق؟' 
            : 'هل أنت متأكد من رفض هذا الطلب؟';
        
        showConfirmationModal(message, performListAction);
    } else {
        performListAction();
    }
    
    return;
   }
});     

// --- ✅ دالة جديدة لأنيميشن اكتساب الخبرة ---
function showXpGainAnimation(amount) {
    if (amount <= 0) return;

    const xpElement = document.createElement('div');
    xpElement.textContent = `+${amount} XP`;
    xpElement.className = 'xp-gain-animation fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-yellow-500/80 text-white font-bold px-4 py-2 rounded-full shadow-lg z-[300]';
    
    document.body.appendChild(xpElement);

    // إزالة العنصر بعد انتهاء الأنيميشن
    setTimeout(() => {
        xpElement.remove();
    }, 1900); // يجب أن تكون المدة أقل بقليل من مدة الأنيميشن في CSS
}

        
    // =================================================
    // =========== قسم عام وأحداث السوكيت =============
    // =================================================

    function showNotification(message, type = 'info') {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        // --- ✅ التعديل هنا: من top-5 إلى bottom-5 ---
        container.className = 'fixed bottom-5 right-5 z-50 space-y-2';
        document.body.appendChild(container);
    }
        const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
        const icon = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
        const notification = document.createElement('div');
        notification.className = `flex items-center p-4 mb-4 text-sm text-white rounded-lg shadow-lg ${colors[type]} animate-pulse`;
        notification.innerHTML = `<i class="fas ${icon[type]} mr-3"></i><span>${message}</span>`;
        container.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }
        
    // ✅ نافذة الحظر داخل التطبيق (لمستخدم كان متصلاً ثم حُظر لحظياً، أو رفض الخادم طلباً بسبب الحظر)
    function showBannedModal(reason, banExpires, isPermanent) {
        if (document.getElementById('app-banned-modal')) return;
        const expiryText = isPermanent
            ? 'حظر دائم'
            : `ينتهي في: ${new Date(banExpires).toLocaleString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

        const modalHTML = `
            <div id="app-banned-modal" class="fixed inset-0 bg-black/85 flex items-center justify-center z-[999] p-4">
                <div class="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm text-white border-2 border-red-500/40 overflow-hidden">
                    <div class="bg-gradient-to-r from-red-700 to-red-900 p-6 text-center">
                        <i class="fas fa-user-lock text-4xl mb-2"></i>
                        <h2 class="text-xl font-bold">تم حظر حسابك</h2>
                    </div>
                    <div class="p-6 text-center">
                        <p class="text-gray-300 text-sm mb-1">السبب:</p>
                        <p class="font-bold mb-4">${reason || 'مخالفة لشروط الاستخدام'}</p>
                        <p class="text-xs px-3 py-1.5 rounded-full inline-block ${isPermanent ? 'bg-red-900/40 text-red-300' : 'bg-yellow-900/40 text-yellow-300'}">
                            <i class="fas fa-clock mr-1"></i> ${expiryText}
                        </p>
                        <p class="text-gray-400 text-xs mt-4">إذا كنت تعتقد أن هذا خطأ، تواصل مع فريق الدعم.</p>
                        <a href="mailto:support@example.com" class="mt-4 w-full inline-block bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-lg text-sm">
                            <i class="fas fa-headset mr-1"></i> تواصل مع الدعم
                        </a>
                        <button id="forceLogoutBannedBtn" class="mt-2 w-full bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-lg text-sm">تسجيل الخروج</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        document.getElementById('forceLogoutBannedBtn').addEventListener('click', () => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login.html';
        });
    }

    socket.on('balanceUpdate', ({ newBalance }) => {
        const balanceElement = document.getElementById('balance');
        if (balanceElement) {
            balanceElement.textContent = newBalance.toFixed(2);
        }
        const localUser = JSON.parse(localStorage.getItem('user'));
        if (localUser) {
            localUser.balance = newBalance;
            localStorage.setItem('user', JSON.stringify(localUser));
        }
        showNotification('تم تحديث رصيدك', 'info');
    });

        socket.on('connect_error', (err) => {
        console.error('Socket Connection Error:', err.message);
        if (err.message === 'Authentication error') {
            logoutBtn.click();
        }
    });

    // ✅ حظر لحظي: إذا حظرك الأدمن الآن وأنت متصل، تظهر النافذة فوراً بدل انتظار أي طلب لاحق
    socket.on('account-banned', ({ reason, banExpires, isPermanent }) => {
        showBannedModal(reason, banExpires, isPermanent);
    });

socket.on('publicGiftAnnouncement', (data) => {
    const existing = document.querySelectorAll('.public-gift-toast');
    // ✅ حد أقصى 2 إشعارات متراكبة بنفس اللحظة لتفادي الفوضى البصرية عند إرسال سريع متتالي
    if (existing.length >= 2) existing[0].remove();

    const giftVisual = data.giftImage
        ? `<img src="${data.giftImage}" class="w-6 h-6 object-contain" onerror="this.style.display='none'">`
        : `<span class="text-lg">${data.giftIcon || '🎁'}</span>`;

    const toast = document.createElement('div');
    toast.className = 'public-gift-toast fixed left-1/2 -translate-x-1/2 z-[350] pointer-events-none';
    toast.style.top = `${80 + existing.length * 50}px`;
    toast.innerHTML = `
        <div class="flex items-center gap-2 bg-gradient-to-r from-pink-600/90 to-purple-600/90 border border-pink-400/40 rounded-full px-4 py-2 text-xs shadow-lg backdrop-blur-sm">
            <img src="${data.senderProfileImage}" class="w-5 h-5 rounded-full">
            ${giftVisual}
            <span><b>${data.senderUsername}</b> أرسل ${data.giftName} 🎉 ${data.audienceText}</span>
        </div>
    `;
    document.body.appendChild(toast);

    // ✅ يختفي تلقائياً بعد 4 ثوانٍ بتأثير انسيابي
    setTimeout(() => {
        toast.style.transition = 'opacity 0.6s, transform 0.6s';
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -15px)';
        setTimeout(() => toast.remove(), 600);
    }, 4000);
});

        socket.on('chatFullyDeleted', (data) => {
    const openChat = document.getElementById('private-chat-modal');
    if (openChat && openChat.dataset.targetUserId === data.byUserId) {
        openChat.remove();
        showNotification('تم حذف هذه المحادثة من الطرف الآخر', 'info');
    }
    if (document.getElementById('messages-list-container')) {
        loadMessagesList();
    }
});

        socket.on('privateMessageDeleted', ({ messageId }) => {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) el.remove();
});

socket.on('privateMessageEdited', ({ messageId, newContent }) => {
    const el = document.querySelector(`[data-message-id="${messageId}"] .message-content p`);
    if (el) el.innerHTML = `${newContent} <span class="text-[10px] text-gray-400">(معدّلة)</span>`;
});
  
        
    // 📍 أضف هذا المستمع بعد socket.on('forceRefreshUserData', ...)

// 5️⃣ تحديث البروفايل المصغر عند رفع الحظر
socket.on('profileNeedsRefresh', async (data) => {
    console.log('[SOCKET] Profile needs refresh:', data);
    
    // 1. تحديث بيانات المستخدم
    await refreshUserData();
    
    // 2. إذا كانت نافذة البروفايل المصغر مفتوحة لهذا المستخدم
    const modal = document.getElementById('mini-profile-modal');
    if (modal) {
        const currentUserId = modal.dataset.userId;
        
        // إذا كانت النافذة مفتوحة لنفس المستخدم الذي تم رفع الحظر عنه
        if (currentUserId && currentUserId === data.userId) {
            console.log(`[PROFILE REFRESH] Refreshing profile for user ${data.userId}`);
            
            // إغلاق النافذة الحالية
            modal.remove();
            
            // فتح نافذة جديدة بالمعلومات المحدثة (بعد تأخير)
            setTimeout(() => {
                showMiniProfileModal(data.userId);
            }, 300);
        }
    }
});

// 6️⃣ حدث خاص لرفع الحظر من الإعدادات
socket.on('unblockedFromSettings', (data) => {
    console.log('[SOCKET] Unblocked from settings:', data);
    
    // إشعار فوري
    showNotification(`تم رفع الحظر عن ${data.unblockedUsername}`, 'success');
    
    // تحديث البيانات
    setTimeout(() => {
        refreshUserData();
        
        // إذا كان البروفايل مفتوحاً، أعد تحميله
        const profileModal = document.getElementById('mini-profile-modal');
        if (profileModal && profileModal.dataset.userId === data.unblockedId) {
            const userId = profileModal.dataset.userId;
            profileModal.remove();
            setTimeout(() => showMiniProfileModal(userId), 400);
        }
    }, 500);
});    
        
        // --- أضف هذه المستمعات الجديدة ---

// --- استبدل مستمع experienceUpdate بهذا ---
socket.on('experienceUpdate', ({ level, experience, requiredXp, xpGained }) => {
    // عرض أنيميشن اكتساب الخبرة
    showXpGainAnimation(xpGained);

    // ✅ الإصلاح: هذه هي العناصر الحقيقية الموجودة في index.html
    // (لم يكن هناك عنصر بمعرف #level-container أصلاً، لذا لم تتحدث الأرقام إلا بعد تحديث الصفحة)
    const levelSpan = document.getElementById('userLevel');
    const currentXpSpan = document.getElementById('currentXP');
    const requiredXpSpan = document.getElementById('requiredXP');
    const xpBar = document.getElementById('xp-bar');

    if (levelSpan) levelSpan.textContent = level;
    if (currentXpSpan) currentXpSpan.textContent = Math.floor(experience);
    if (requiredXpSpan) requiredXpSpan.textContent = requiredXp;
    if (xpBar) xpBar.style.width = `${Math.min((experience / requiredXp) * 100, 100)}%`;

    // تحديث بيانات المستخدم في localStorage
    const localUser = JSON.parse(localStorage.getItem('user'));
    if (localUser) {
        localUser.level = level;
        localUser.experience = experience;
        localStorage.setItem('user', JSON.stringify(localUser));
    }
});

socket.on('levelUp', ({ newLevel }) => {
    // عرض إشعار مميز عند رفع المستوى
    showNotification(`🎉 تهانينا! لقد وصلت إلى المستوى ${newLevel}!`, 'success');
    
    // يمكنك إضافة أنيميشن أو تأثيرات خاصة هنا
    const profileImage = document.getElementById('profileImage');
    if (profileImage) {
        profileImage.classList.add('animate-bounce');
        setTimeout(() => profileImage.classList.remove('animate-bounce'), 2000);
    }
});

        socket.on('coinsUpdated', ({ newCoins }) => {
    const coinsEl = document.getElementById('coins');
    if (coinsEl) coinsEl.textContent = newCoins;
    const localUser = JSON.parse(localStorage.getItem('user'));
    if (localUser) {
        localUser.coins = newCoins;
        localStorage.setItem('user', JSON.stringify(localUser));
    }
    showNotification('تم إيداع رصيدك بنجاح 🎉', 'success');
});

     socket.on('giftReceived', (data) => {
    // ✅ الإصلاح: الأنيميشن العائمة الضخمة تظهر فقط إذا كانت الهدية أُرسلت من الدردشة الخاصة
    // وأنت فعلياً فاتح نفس محادثة المُرسِل في تلك اللحظة. للهدايا العامة إشعارها الخاص أصلاً
    // (publicGiftAnnouncement) فلا داعي لتكرارها بأنيميشن كبيرة تقاطع كل شاشة.
    const chatModal = document.getElementById('private-chat-modal');
    const isViewingThatChat = chatModal && chatModal.dataset.targetUserId === data.fromUserId;

    if (data.context === 'private_chat' && isViewingThatChat) {
        showGiftFloatingAnimation(data.giftImage, data.giftName, data.fromUsername, data.quantity);
    } else if (data.context === 'private_chat') {
        showNotification(`🎁 ${data.fromUsername} أرسل لك ${data.giftName}`, 'info');
    }

    refreshUserData();
});

// =================================================
// ✅ مستمعات لتحديث البيانات تلقائياً عند الحظر
// =================================================

// 1️⃣ تحديث عند استلام إشعار حظر
socket.on('friendshipUpdate', async (data) => {
    console.log('[SOCKET] Friendship update received:', data);
    
    // ⭐ الحالة 1: إذا كان الحدث متعلقاً برفع الحظر
    if (data.action === 'user_unblocked' || data.action === 'unblocked_by_user') {
        // تحديث البيانات فوراً
        await refreshUserData();
        
        // إذا كانت نافذة البروفايل مفتوحة، أعد تحميلها
        const modal = document.getElementById('mini-profile-modal');
        const userIdInModal = modal?.dataset.userId;
        
        if (modal && userIdInModal) {
            if (userIdInModal === data.unblockedId || userIdInModal === data.unblockerId) {
                setTimeout(() => {
                    showMiniProfileModal(userIdInModal);
                }, 500);
            }
        }
        
        // إشعار للمستخدم
        showNotification(data.message || 'تم رفع الحظر', 'success');
    }
    
    // ⭐ الحالة 2: إذا كان الحدث متعلقاً بالحظر
    else if (data.action && data.action.includes('block')) {
        // تحديث البيانات فوراً
        await refreshUserData();
        
        // إشعار للمستخدم
        if (data.forUser === 'blocker') {
            showNotification(`تم حظر ${data.blockedUsername}`, 'info');
        } else if (data.forUser === 'blocked') {
            showNotification(`قام ${data.blockerUsername} بحظرك`, 'error');
        }
    }
    
    // ⭐ الحالة 3: إذا كان الحدث متعلقاً بالصداقة
    else if (data.action && (data.action.includes('friend') || data.action.includes('request'))) {
        // تحديث البيانات للصداقة
        await refreshUserData();
        
        // إشعار عام
        if (data.message) {
            showNotification(data.message, 'info');
        }
    }
});

// 2️⃣ حدث خاص لتحديث البيانات القسري
socket.on('forceRefreshUserData', async (data) => {
    console.log('[SOCKET] Force refreshing user data:', data);
    
    // تأخير بسيط لضمان تحديث الخادم أولاً
    setTimeout(async () => {
        try {
            // تحديث البيانات من الخادم
            const success = await refreshUserData();
            
            if (success) {
                console.log('[SOCKET] User data refreshed after block');
                
                // جلب البيانات المحدثة مباشرة
                const user = JSON.parse(localStorage.getItem('user'));
                if (user && user.friends !== undefined) {
                    
                    // تحديث عدد الأصدقاء في الشريط الجانبي
                    const friendsCountElement = document.getElementById('friends-count');
                    if (friendsCountElement) {
                        friendsCountElement.textContent = user.friends.length;
                        console.log(`[SOCKET] Updated friends count to: ${user.friends.length}`);
                    }
                    
                    // تحديث صور الأصدقاء المصغرة
                    if (typeof updateFriendsAvatars === 'function') {
                        updateFriendsAvatars(user.friends);
                    }
                }
            }
        } catch (error) {
            console.error('[SOCKET] Error in forceRefreshUserData:', error);
        }
    }, 800); // انتظر 0.8 ثانية
});

// 3️⃣ الاحتفاظ بالمستمع القديم للتوافق
socket.on('blockStatusChanged', async (data) => {
    console.log('[SOCKET] Block status changed (legacy):', data);
    await refreshUserData();
});

// 4️⃣ مستمع عام لتنظيف cache (إبقائه)
socket.on('clearBlockCache', (data) => {
    console.log('[SOCKET] Clearing block cache for:', data);
    // لا تحتاج لعمل شيء هنا، الخادم يعتني بالcache
});

// ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐
// 📍 5️⃣ مستمع جديد لحدث رفع الحظر (أضف هذا)
// ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐
socket.on('userUnblocked', async (data) => {
    console.log('[SOCKET] User unblocked event:', data);
    
    // 1. إشعار فوري
    if (data.forUser === 'unblocker') {
        showNotification(`تم رفع الحظر عن ${data.unblockedUsername}`, 'success');
    } else if (data.forUser === 'unblocked') {
        showNotification(`${data.unblockerUsername} رفع الحظر عنك`, 'info');
    }
    
    // 2. تحديث البيانات من الخادم بعد تأخير بسيط
    setTimeout(async () => {
        await refreshUserData();
        
        // 3. إذا كانت نافذة البروفايل مفتوحة للمستخدم، أعد تحميلها
        const modal = document.getElementById('mini-profile-modal');
        if (modal) {
            const userIdInModal = modal.dataset.userId;
            if (userIdInModal && (userIdInModal === data.unblockedId || userIdInModal === data.unblockerId)) {
                setTimeout(() => {
                    showMiniProfileModal(userIdInModal);
                }, 300);
            }
        }
        
        // 4. إذا كانت نافذة الإعدادات مفتوحة، تحديث قائمة المحظورين
        const settingsView = document.querySelector('[class*="settings"]');
        if (settingsView) {
            const currentView = mainContent.innerHTML;
            if (currentView.includes('المستخدمين المحظورين')) {
                setTimeout(() => {
                    showSettingsView();
                }, 400);
            }
        }
        
    }, 500);
});
// ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐
// 📍 نهاية المستمع الجديد
// ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐

// --- أضف هذا الكود في قسم أحداث السوكيت العام ---
socket.on('chatCleanup', ({ idsToDelete }) => {
    console.log(`[CHAT CLIENT] Received 'chatCleanup' event. Deleting ${idsToDelete.length} message elements.`);
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    // حول كل الرسائل الموجودة إلى مصفوفة
    const messageElements = Array.from(chatMessages.children);

    // احذف كل عنصر رسالة يتطابق الـ ID الخاص به مع قائمة الحذف
    messageElements.forEach(element => {
        // نفترض أن كل عنصر رسالة له data-message-id
        if (idsToDelete.includes(element.dataset.messageId)) {
            element.remove();
        }
    });
});


        socket.on('withdrawalStatusUpdated', (data) => {
    if (data.status === 'completed') {
        showNotification('تمت الموافقة على طلب سحبك بنجاح ✅', 'success');
    } else if (data.status === 'rejected') {
        showNotification(`تم رفض طلب السحب. السبب: ${data.reason}`, 'error');
        refreshUserData();
    }
});


   // --- ✅ دالة جديدة لنافذة التأكيد ---
function showConfirmationModal(message, onConfirm) {
    const oldModal = document.getElementById('confirmation-modal');
    if (oldModal) oldModal.remove();

    const modalHTML = `
        <div id="confirmation-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[500] p-4">
            <div class="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm text-white p-6 text-center">
                <p class="mb-6">${message}</p>
                <div class="flex justify-center gap-4">
                    <button id="confirm-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg">تأكيد</button>
                    <button id="cancel-btn" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-lg">إلغاء</button>
                </div>
            </div>
        </div>
    `;
    
    // ✅ الإصلاح الجذري: insertAdjacentHTML لا يهدم أي نافذة أخرى مفتوحة (دردشة، شحن، سحب...)
    // بعكس innerHTML += التي كانت تعيد بناء كل عناصر game-container وتفقدها كل مستمعات الأحداث
    document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('confirmation-modal');
    const confirmBtn = document.getElementById('confirm-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    const closeModal = () => modal.remove();

    confirmBtn.addEventListener('click', () => {
        onConfirm();
        closeModal();
    });
    cancelBtn.addEventListener('click', closeModal);
    
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'confirmation-modal') closeModal();
    });
}


// --- ✅ دالة جديدة للإشعار العائم ---
function showFloatingAlert(message, icon = 'fa-check-circle', color = 'bg-green-500') {
    const alertElement = document.createElement('div');
    alertElement.innerHTML = `<i class="fas ${icon} mr-2"></i> ${message}`;
    alertElement.className = `floating-alert fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${color}/80 text-white font-bold px-4 py-2 rounded-full shadow-lg z-[600]`;
    
    document.body.appendChild(alertElement);

    setTimeout(() => {
        alertElement.remove();
    }, 1900);
}
     

        // --- ✅ دالة جديدة لعرض الملف الشخصي المصغر ---
async function showMiniProfileModal(userId) {
    // إزالة أي نافذة ملف شخصي مصغر سابقة أولاً
    const existingModal = document.getElementById('mini-profile-modal');
    if (existingModal) existingModal.remove();

    // ✅ الإصلاح 1 (السرعة): نعرض هيكل تحميل فوري بدل انتظار الطلبات
    const loadingShellHTML = `
        <div id="mini-profile-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-sm text-white p-10 text-center border-2 border-purple-500/30">
                <i class="fas fa-spinner fa-spin text-3xl text-purple-400 mb-3"></i>
                <p class="text-sm text-gray-400">جاري تحميل الملف الشخصي...</p>
            </div>
        </div>
    `;

    document.getElementById('game-container').insertAdjacentHTML('beforeend', loadingShellHTML);

    try {
        // ✅ الإصلاح 2 (السرعة): فحص الحظر + جلب بيانات المستخدم بالتوازي بدل التسلسل
        const [blockCheckResult, userResult] = await Promise.all([
            fetch(`/api/blocks/mutual-status/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json()),
            fetch(`/api/users/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json())
        ]);

        const blockData = blockCheckResult.data;

        const loadingShell = document.getElementById('mini-profile-modal');
        if (loadingShell) loadingShell.remove();

        if (blockData.blockStatus.heBlockedMe) {
            showBlockedProfileModal(userId, blockData);
            return;
        }

        const profileUser = userResult.data.user;

        const selfUserData = JSON.parse(localStorage.getItem('user'));
        if (!selfUserData) {
            showNotification('يجب تسجيل الدخول أولاً', 'error');
            return;
        }

        const socialInfo = getSocialStatus(profileUser.socialStatus);
        const educationInfo = getEducationStatus(profileUser.educationStatus);
        const genderInfo = profileUser.gender === 'male' 
            ? { text: 'ذكر', icon: 'fa-mars', color: 'text-blue-400' }
            : { text: 'أنثى', icon: 'fa-venus', color: 'text-pink-400' };

        const friendButtonHTML = getFriendButtonHTML(profileUser, selfUserData);

        const blockedUsersIds = (selfUserData.blockedUsers || []).map(item => 
            item._id ? item._id.toString() : item.toString()
        );
        const profileUserIdStr = profileUser._id.toString();
        const isBlockedByMe = blockedUsersIds.includes(profileUserIdStr);

        const blockButtonHTML = isBlockedByMe ? 
            `<button class="action-btn unblock-action-btn" data-user-id="${profileUser._id}">
                <i class="fas fa-unlock"></i>
                <span class="text-xs mt-1">رفع الحظر</span>
            </button>` : 
            `<button class="action-btn block-action-btn" data-user-id="${profileUser._id}">
                <i class="fas fa-ban"></i>
                <span class="text-xs mt-1">حظر</span>
            </button>`;

        const modalHTML = `
         <div id="mini-profile-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[310] p-4">
                <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-sm text-white transform scale-95 transition-transform duration-300 border-2 border-purple-500/30">
                    
                    <div class="flex flex-col items-center px-4 pt-6">
                              <img src="${profileUser.profileImage}" 
                             class="w-28 h-28 rounded-full border-4 border-purple-500 object-cover shadow-lg ${profileUser.activeFrameClass || ''}">
                        
                        <h2 class="text-xl font-bold mt-4">${profileUser.username} ${getAgentBadgeHTML(profileUser.isAgent)}</h2>
                        <div class="text-xs text-gray-400 mt-1 cursor-pointer flex items-center gap-2 copy-id-btn">
                           <i class="fas fa-id-card"></i>
                           <span>ID: ${profileUser.customId}</span>
                           <i class="fas fa-copy text-xs"></i>
                        </div>
                        
                        <div class="mt-3 w-full">
                            <p id="profile-user-status" class="text-sm text-gray-300 italic text-center px-4 py-2 bg-gray-800/50 rounded-lg border border-gray-700">
                                ${profileUser.status || '🚀 جاهز للتحديات!'}
                            </p>
                        </div>
                        
                        ${isBlockedByMe ? `
                            <div class="mt-2 bg-red-900/30 border border-red-700 rounded-full px-3 py-1">
                                <span class="text-xs text-red-300">
                                    <i class="fas fa-ban mr-1"></i> محظور من قبلك
                                </span>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4 p-6">
                        <div class="bg-gray-800/50 p-4 rounded-xl text-center hover:bg-gray-700/50 transition group">
                            <div class="text-3xl font-bold text-yellow-400 mb-1">${profileUser.level}</div>
                            <div class="text-xs text-gray-400">المستوى</div>
                            <div class="text-xs text-gray-500 mt-2 opacity-0 group-hover:opacity-100 transition">
                                ${profileUser.experience} XP
                            </div>
                        </div>
                        
                        <div class="bg-gray-800/50 p-4 rounded-xl text-center hover:bg-gray-700/50 transition group">
                            <div class="text-3xl font-bold text-purple-400 mb-1">${profileUser.friends ? profileUser.friends.length : 0}</div>
                            <div class="text-xs text-gray-400">الأصدقاء</div>
                            <div class="text-xs text-gray-500 mt-2 opacity-0 group-hover:opacity-100 transition">
                                ${profileUser.friends && profileUser.friends.length > 0 ? 
                                    `${profileUser.friends.length} صديق` : 
                                    'لا توجد أصدقاء'}
                            </div>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3 px-6 pb-6 text-sm">
                        <div class="flex items-center gap-3 p-2 bg-gray-800/30 rounded-lg">
                            <i class="fas ${genderInfo.icon} w-4 text-center ${genderInfo.color}"></i>
                            <span>${genderInfo.text}</span>
                        </div>
                        <div class="flex items-center gap-3 p-2 bg-gray-800/30 rounded-lg">
                            <i class="fas fa-birthday-cake w-4 text-center text-pink-400"></i>
                            <span>${profileUser.age} سنة</span>
                        </div>
                        <div class="flex items-center gap-3 p-2 bg-gray-800/30 rounded-lg">
                            <i class="fas ${socialInfo.icon} w-4 text-center text-red-400"></i>
                            <span>${socialInfo.text}</span>
                        </div>
                        <div class="flex items-center gap-3 p-2 bg-gray-800/30 rounded-lg">
                            <i class="fas ${educationInfo.icon} w-4 text-center text-blue-400"></i>
                            <span>${educationInfo.text}</span>
                        </div>
                    </div>
                    
                         <div id="profile-action-buttons" class="grid grid-cols-5 gap-2 border-t border-gray-700/50 p-4">
                        ${friendButtonHTML}
                        <button class="action-btn message-btn" data-user-id="${profileUser._id}">
                              <i class="fas fa-comment-dots"></i>
                           <span class="text-xs mt-1">رسالة</span>
                         </button>
                        <button class="action-btn gift-action-btn text-pink-400 hover:bg-pink-900" data-user-id="${profileUser._id}">
                            <i class="fas fa-gift"></i>
                            <span class="text-xs mt-1">هدية</span>
                        </button>
                        ${blockButtonHTML}
                        <button class="action-btn close-mini-profile-btn">
                            <i class="fas fa-times"></i>
                            <span class="text-xs mt-1">إغلاق</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('mini-profile-modal');
        
        setTimeout(() => {
            modal.querySelector('.transform').classList.remove('scale-95');
        }, 50);
        
        // ✅ الإصلاح 3 (الوميض): تم حذف معالج زر الصداقة المكرر من هنا نهائياً.
        // المعالج العام في document.body يتكفل به وحده الآن، فلا يوجد استدعاء مزدوج بعد اليوم
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'mini-profile-modal') {
                modal.remove();
                return;
            }
            
            if (e.target.closest('.copy-id-btn')) {
                const idToCopy = profileUser.customId;
                
                navigator.clipboard.writeText(idToCopy)
                    .then(() => {
                        const copyNotification = document.createElement('div');
                        copyNotification.innerHTML = `
                            <div class="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                                        bg-green-500/90 text-white px-6 py-3 rounded-full shadow-2xl 
                                        flex items-center gap-3 z-[300] animate-pulse">
                                <i class="fas fa-check-circle text-xl"></i>
                                <span class="font-bold">تم نسخ الـ ID!</span>
                            </div>
                        `;
                        document.body.appendChild(copyNotification);
                        
                        setTimeout(() => {
                            copyNotification.remove();
                        }, 2000);
                    })
                    .catch(err => {
                        console.error('Failed to copy ID:', err);
                        showNotification('فشل نسخ الـ ID', 'error');
                    });
                return;
            }

                       if (e.target.closest('.message-btn')) {
                const clickedUserId = e.target.closest('.message-btn').dataset.userId;
                const username = e.target.closest('.message-btn').closest('#mini-profile-modal')?.querySelector('h2')?.textContent || 'المستخدم';
                
                // ✅ الإصلاح: إذا كانت نفس المحادثة مفتوحة أصلاً خلف البروفايل، نغلق البروفايل فقط
                // بدل فتح نافذة دردشة مكررة فوقها
                const existingChatModal = document.getElementById('private-chat-modal');
                if (existingChatModal && existingChatModal.dataset.targetUserId === clickedUserId) {
                    modal.remove();
                } else {
                    modal.remove();
                    openPrivateChat(clickedUserId, username);
                }
                return;
            }

            // زر إرسال هدية
            if (e.target.closest('.gift-action-btn')) {
                const giftTargetId = e.target.closest('.gift-action-btn').dataset.userId;
                const giftUsername = modal.querySelector('h2')?.textContent || 'المستخدم';
                showGiftStoreModal(giftTargetId, giftUsername);
                return;
            }
            
            if (e.target.closest('.block-action-btn')) {
                const userIdToBlock = e.target.closest('.block-action-btn').dataset.userId;
                blockUser(userIdToBlock, modal);
                return;
            }
            
            if (e.target.closest('.unblock-action-btn')) {
                const userIdToUnblock = e.target.closest('.unblock-action-btn').dataset.userId;
                unblockUser(userIdToUnblock, modal);
                return;
            }
            
            if (e.target.closest('.close-mini-profile-btn')) {
                modal.remove();
                return;
            }
        });

    } catch (error) {
        console.error("Error showing mini profile:", error);
        const loadingShell = document.getElementById('mini-profile-modal');
        if (loadingShell) loadingShell.remove();
        showNotification('لا يمكن عرض ملف المستخدم حاليًا.', 'error');
    }
}


        // --- 🧩 دالة مساعدة: تُرجع HTML شريط إدخال الدردشة الخاصة (نص مرة واحدة، تُستخدم بأكثر من مكان) ---
function getChatInputAreaHTML() {
    return `
        <div id="chat-options-bar" class="hidden mb-3 p-3 bg-gray-800/50 rounded-xl">
            <div class="grid grid-cols-3 gap-3 text-center">
                <button class="chat-media-btn" data-type="image">
                    <i class="fas fa-image text-2xl text-green-400 mb-1"></i>
                    <span class="text-xs">صورة</span>
                </button>
                <button class="chat-media-btn" data-type="video">
                    <i class="fas fa-video text-2xl text-blue-400 mb-1"></i>
                    <span class="text-xs">فيديو</span>
                </button>
                <button class="chat-media-btn" data-type="file">
                    <i class="fas fa-file text-2xl text-yellow-400 mb-1"></i>
                    <span class="text-xs">ملف</span>
                </button>
            </div>
        </div>
        
        <div class="flex items-center gap-2">
            <button id="toggle-chat-options" class="bg-gray-700 hover:bg-gray-600 w-10 h-10 rounded-full flex items-center justify-center">
                <i class="fas fa-plus text-gray-300"></i>
            </button>

            <button id="open-inline-gift-btn" class="bg-pink-600/80 hover:bg-pink-600 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" title="إرسال هدية">
                <i class="fas fa-gift text-white"></i>
            </button>
            
            <div class="flex-1 relative">
                <input type="text" id="private-message-input" 
                       placeholder="اكتب رسالتك هنا..." 
                       maxlength="200"
                       class="w-full bg-gray-700 border border-gray-600 rounded-full py-3 px-5 pr-12 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                <div id="private-char-count" class="absolute top-1/2 right-4 transform -translate-y-1/2 text-xs text-gray-500">0/200</div>
            </div>
            
            <button id="send-private-message" 
    class="dynamic-send-btn bg-purple-600 hover:bg-purple-700 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300"
    data-mode="voice">
<i class="fas fa-microphone text-white"></i>
</button>
        </div>
    `;
}

// --- 🔓 إعادة شريط الإدخال الطبيعي فوراً بعد رفع الحظر، دون إغلاق وإعادة فتح النافذة بالكامل ---
function restoreChatInputArea(targetUserId) {
    const inputArea = document.getElementById('private-chat-input-area');
    if (!inputArea) return;

    inputArea.innerHTML = getChatInputAreaHTML();
    setupPrivateChatEvents(targetUserId);
}

        
// --- 📨 دالة فتح الدردشة الخاصة ---
async function openPrivateChat(targetUserId, targetUsername = 'المستخدم') {
    console.log(`[CHAT] Opening private chat with: ${targetUserId} (${targetUsername})`);
    
    const profileModal = document.getElementById('mini-profile-modal');
    if (profileModal) profileModal.remove();

    // ✅ منع تكرار نوافذ الدردشة: إذا فيه نافذة مفتوحة لشخص آخر، نغلقها أولاً
    const existingChatModal = document.getElementById('private-chat-modal');
    if (existingChatModal) existingChatModal.remove();
    
    const chatHTML = `
        <div id="private-chat-modal" data-target-user-id="${targetUserId}" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[300] p-2 md:p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl h-[85vh] md:h-[80vh] flex flex-col overflow-hidden border-2 border-purple-500/30">
                
                <div class="flex items-center justify-between p-4 bg-gray-900/80 border-b border-gray-700">
                    <div class="flex items-center gap-3">
                        <button id="close-private-chat" class="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700">
                            <i class="fas fa-arrow-right text-lg"></i>
                        </button>
                        <img id="chat-user-avatar" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%234b5563'/%3E%3C/svg%3E" alt="${targetUsername}" 
                             class="w-10 h-10 rounded-full border-2 border-purple-500 object-cover">
                        <div>
                            <h3 id="chat-user-name" class="font-bold text-white">${targetUsername}</h3>
                            <p id="chat-user-status" class="text-xs text-gray-400">
                                <i class="fas fa-circle text-green-500 mr-1"></i> متصل الآن
                            </p>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-2">
                        <button id="chat-actions-btn" class="chat-action-btn" title="إجراءات">
                            <i class="fas fa-ellipsis-v text-gray-400 hover:text-white"></i>
                        </button>
                        <button id="chat-call-btn" class="chat-action-btn" title="مكالمة صوتية">
                            <i class="fas fa-phone-alt text-gray-400 hover:text-blue-400"></i>
                        </button>
                        <button id="chat-info-btn" class="chat-action-btn" title="معلومات">
                            <i class="fas fa-info-circle text-gray-400 hover:text-purple-400"></i>
                        </button>
                    </div>
                </div>
                
                <div id="private-chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-900 to-gray-800">
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-spinner fa-spin text-2xl mb-3"></i>
                        <p class="text-sm">جاري تحميل المحادثة...</p>
                    </div>
                </div>
                
                                <div id="private-chat-input-area" class="p-3 border-t border-gray-700 bg-gray-900/50">
                    ${getChatInputAreaHTML()}
                </div>
    `;
    
    document.getElementById('game-container').insertAdjacentHTML('beforeend', chatHTML);
    
    setupPrivateChatEvents(targetUserId);

    const [blockCheckResult] = await Promise.allSettled([
        fetch(`/api/blocks/mutual-status/${targetUserId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()),
        loadChatUserData(targetUserId),
        loadChatHistoryFromServer(targetUserId)
    ]);

        if (blockCheckResult.status === 'fulfilled') {
        const blockResult = blockCheckResult.value;
        const status = blockResult?.data?.blockStatus;

        // ✅ الإصلاح: لا نمنع الشخص المحظور من فتح الدردشة أو الكتابة إطلاقاً
        // رسائله تُرسل من ناحيته بشكل طبيعي تماماً، دون أي إشارة تكشف له أنه محظور

        if (status?.iBlockedHim) {
            lockChatForBlockedUser(targetUserId, targetUsername);
        }
    }
}

// --- 🔒 قفل شريط الإدخال عند وجود حظر من طرفي أنا للمستخدم الآخر ---
function lockChatForBlockedUser(targetUserId, targetUsername) {
    const inputArea = document.getElementById('private-chat-input-area');
    if (!inputArea) return;

    inputArea.innerHTML = `
        <div class="text-center">
            <p class="text-sm text-red-400 mb-3">
                <i class="fas fa-ban mr-1"></i> لقد قمت بحظر ${targetUsername}، لا يمكنك مراسلته
            </p>
            <div class="flex gap-2">
                <button id="locked-chat-unblock-btn" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg text-sm font-bold">
                    <i class="fas fa-unlock mr-1"></i> رفع الحظر
                </button>
                <button id="locked-chat-delete-btn" class="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-bold">
                    <i class="fas fa-trash mr-1"></i> حذف المحادثة
                </button>
            </div>
        </div>
    `;

        document.getElementById('locked-chat-unblock-btn').addEventListener('click', () => {
        unblockUser(targetUserId, null);
    });

    document.getElementById('locked-chat-delete-btn').addEventListener('click', () => {
        showConfirmationModal('هل أنت متأكد من حذف هذه المحادثة من قائمتك؟', async () => {
            try {
                const response = await fetch(`/api/private-chat/chat/${targetUserId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    showNotification('تم حذف المحادثة', 'success');
                    const modal = document.getElementById('private-chat-modal');
                    if (modal) modal.remove();
                    if (document.getElementById('messages-list-container')) loadMessagesList();
                } else {
                    showNotification('فشل حذف المحادثة', 'error');
                }
            } catch (error) {
                console.error('[DELETE CHAT] Error:', error);
                showNotification('خطأ في الاتصال بالخادم', 'error');
            }
        });
    });
}

// شارة كاملة (للأماكن الواسعة: البروفايل المصغر، الشريط الجانبي)
function getAgentBadgeHTML(isAgent) {
    if (!isAgent) return '';
    return `<span class="inline-flex items-center gap-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full align-middle" title="وكيل شحن معتمد"><i class="fas fa-shield-halved"></i> وكيل موثّق</span>`;
}

// أيقونة مصغرة (للأماكن الضيقة: قائمة الرسائل، رأس الدردشة)
function getAgentBadgeIconHTML(isAgent) {
    if (!isAgent) return '';
    return `<i class="fas fa-shield-halved text-green-400 text-xs" title="وكيل شحن معتمد"></i>`;
}

// تطبيق إطار الصورة الشخصية (كلاس CSS ثابت، وليس Tailwind ديناميكي)
function applyFrameToAvatar(imgEl, activeFrameClass) {
    if (!imgEl) return;
    imgEl.classList.forEach(cls => {
        if (cls.startsWith('profile-frame-')) imgEl.classList.remove(cls);
    });
    if (activeFrameClass) {
        imgEl.classList.add(activeFrameClass);
    }
}
        

// =================================================
// ============ نظام الهدايا (Gifts) ================
// =================================================

async function showGiftStoreModal(targetUserId, targetUsername) {
    const existing = document.getElementById('gift-store-modal');
    if (existing) existing.remove();

    const shellHTML = `
        <div id="gift-store-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[320] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-lg text-white border border-gray-700 max-h-[85vh] flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-gift text-pink-400"></i> إرسال هدية لـ ${targetUsername}</h3>
                    <button id="close-gift-store" class="text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                </div>
                <div id="gift-store-body" class="p-4 overflow-y-auto flex-1">
                    <div class="text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin text-2xl"></i></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('game-container').insertAdjacentHTML('beforeend', shellHTML);
    const modal = document.getElementById('gift-store-modal');

    // ✅ إغلاق مباشر بدون تأكيد — إرسال هدية ليس عملية بيانات طويلة يخشى فقدانها
    document.getElementById('close-gift-store').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target.id === 'gift-store-modal') modal.remove(); });

    try {
        const response = await fetch('/api/gifts/shop', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') throw new Error('فشل تحميل المتجر');

        const gifts = result.data.gifts;
        const currentUser = JSON.parse(localStorage.getItem('user'));
        const body = document.getElementById('gift-store-body');
        if (!body) return;

        body.innerHTML = `
            <div class="flex items-center justify-between mb-4 bg-gray-900/50 rounded-xl p-3">
                <span class="text-sm text-gray-400">رصيدك الحالي</span>
                <span class="font-bold text-yellow-400 flex items-center gap-1"><i class="fas fa-coins"></i> <span id="gift-store-balance">${currentUser.coins || 0}</span></span>
            </div>
            <div id="gift-cards-grid" class="grid grid-cols-3 gap-2">
                ${gifts.map(g => renderGiftCardHTML(g)).join('')}
            </div>
        `;

        wireGiftImageFallbacks(body);

        body.querySelectorAll('.gift-card-wrapper').forEach(card => {
            const toggleBtn = card.querySelector('.gift-card-toggle');

            toggleBtn.addEventListener('click', () => {
                const isExpanded = card.classList.contains('gift-expanded');
                body.querySelectorAll('.gift-card-wrapper').forEach(c => c.classList.remove('gift-expanded'));
                if (isExpanded) return;

                card.classList.add('gift-expanded');

                const giftData = {
                    id: card.dataset.giftId,
                    name: card.dataset.giftName,
                    price: parseFloat(card.dataset.giftPrice),
                    icon: card.dataset.giftIcon,
                    imageUrl: card.dataset.giftImage
                };

                const sendBtn = card.querySelector('.inline-send-btn');
                const counterEl = card.querySelector('.inline-send-counter');

                setupRapidGiftButton(targetUserId, () => giftData, sendBtn, counterEl);
            });
        });

    } catch (error) {
        console.error('[GIFT STORE] Error:', error);
        const body = document.getElementById('gift-store-body');
        if (body) body.innerHTML = `<div class="text-center text-red-400 py-10">فشل تحميل المتجر</div>`;
    }
}

// ✅ دالة موحّدة لبناء كارد الهدية (تُستخدم بالخاصة والعامة)
// ✅ دالة موحّدة لبناء كارد الهدية — الصورة الحقيقية أولاً، واحتياطي أنيق فقط عند الفشل الفعلي
// onerror يُربط عبر JavaScript بعد الإدراج (لا inline) حتى لا يخالف سياسة الأمان CSP
function renderGiftCardHTML(g) {
    return `
        <div class="gift-card-wrapper bg-gray-800/50 border border-gray-700 rounded-xl p-2 transition-all"
             data-gift-id="${g._id}" data-gift-name="${g.name}" data-gift-price="${g.discountedPrice || g.price}" data-gift-icon="${g.icon || '🎁'}" data-gift-image="${g.imageUrl || ''}">
            <button class="gift-card-toggle w-full flex flex-col items-center">
                <div class="gift-visual-slot w-10 h-10 flex items-center justify-center mx-auto">
                    ${g.imageUrl ? `<img src="${g.imageUrl}" class="gift-visual-img w-10 h-10 object-contain">` : `<span class="text-3xl">${g.icon || '🎁'}</span>`}
                </div>
                <span class="text-[11px] font-bold text-center truncate w-full mt-1">${g.name}</span>
                <span class="text-[10px] text-yellow-400"><i class="fas fa-coins"></i> ${g.discountedPrice || g.price}</span>
            </button>
            <div class="gift-card-inline-send hidden mt-2">
                <button class="inline-send-btn w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white text-xs py-2 rounded-lg font-bold flex items-center justify-center gap-1 select-none active:scale-95 transition-transform">
                    <i class="fas fa-paper-plane"></i> إرسال
                </button>
                <p class="inline-send-counter text-[10px] text-gray-400 text-center mt-1 hidden"></p>
            </div>
        </div>
    `;
}

// ✅ يُستدعى بعد إدراج أي مجموعة كروت هدايا بالصفحة، يربط احتياطي الصورة عبر JS (متوافق مع CSP)
function wireGiftImageFallbacks(containerEl) {
    containerEl.querySelectorAll('.gift-visual-img').forEach(img => {
        img.addEventListener('error', function() {
            const icon = this.closest('.gift-card-wrapper')?.dataset.giftIcon || '🎁';
            const slot = this.closest('.gift-visual-slot');
            if (slot) slot.innerHTML = `<span class="text-3xl">${icon}</span>`;
        }, { once: true });
    });
}
// --- ⚡ محرك الإرسال المتسارع (نسخة سريعة وآمنة): إرسال متراكب بدون انتظار كل رد، مع تحديث متفائل فوري ---
// --- ⚡ محرك الإرسال المتسارع (نسخة ذكية بتسارع مستمر وسلس) ---
function setupRapidGiftButton(targetUserId, getSelectedGift, btn, counterLabel) {
    if (!btn) return;

    let sentCount = 0;
    let inFlight = 0;
    const MAX_CONCURRENT = 4; // آمن الآن لأن الخصم في السيرفر أصبح ذرياً (atomic)
    let active = false;
    let rampTimeout = null;
    let intervalMs = 260;      // نقطة الانطلاق
    const MIN_INTERVAL = 60;   // أقصى سرعة ممكنة (يمنع إغراق الخادم)
    const ACCEL_FACTOR = 0.88; // كل نبضة أسرع من سابقتها بنسبة 12%

    async function fireOneGift() {
        const gift = getSelectedGift();
        if (!gift || !active) return;

        const localUser = JSON.parse(localStorage.getItem('user'));
        if (!localUser || localUser.coins < gift.price) {
            stopRapidSending();
            showFloatingAlert('رصيد الكوينز غير كافٍ للإرسال', 'fa-coins', 'bg-red-500');
            return;
        }

        // ✅ تحديث متفائل فوري: نخصم محلياً قبل رد الخادم لإحساس فوري بالسرعة
        localUser.coins -= gift.price;
        localStorage.setItem('user', JSON.stringify(localUser));
        const coinsEl = document.getElementById('coins');
        if (coinsEl) coinsEl.textContent = localUser.coins;
        const balanceEl = document.getElementById('gift-store-balance');
        if (balanceEl) balanceEl.textContent = localUser.coins;

        sentCount++;
        if (counterLabel) {
            counterLabel.textContent = `أُرسل ×${sentCount}`;
            counterLabel.classList.remove('hidden');
        }
        showGiftFloatingAnimation(gift.imageUrl, gift.name, 'أنت', sentCount);

        inFlight++;
        try {
            const response = await fetch('/api/gifts/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ receiverId: targetUserId, giftId: gift.id, quantity: 1, context: 'private_chat' })
            });
            const result = await response.json();

            if (response.ok) {
                const syncedUser = JSON.parse(localStorage.getItem('user'));
                if (syncedUser) {
                    syncedUser.coins = result.data.newSenderCoins;
                    localStorage.setItem('user', JSON.stringify(syncedUser));
                }
                if (coinsEl) coinsEl.textContent = result.data.newSenderCoins;
                if (balanceEl) balanceEl.textContent = result.data.newSenderCoins;
                if (result.data.message) displayPrivateMessage(result.data.message, true);
            } else {
                // ✅ فشل: نعيد الرصيد المخصوم تفاؤلياً ونوقف السلسلة
                const revertUser = JSON.parse(localStorage.getItem('user'));
                if (revertUser) {
                    revertUser.coins += gift.price;
                    localStorage.setItem('user', JSON.stringify(revertUser));
                    if (coinsEl) coinsEl.textContent = revertUser.coins;
                    if (balanceEl) balanceEl.textContent = revertUser.coins;
                }
                stopRapidSending();
                showFloatingAlert(result.message || 'فشل إرسال الهدية', 'fa-exclamation-circle', 'bg-red-500');
            }
        } catch (error) {
            console.error('[RAPID GIFT] Error:', error);
        } finally {
            inFlight--;
        }
    }

    function scheduleNext() {
        if (!active) return;
        rampTimeout = setTimeout(() => {
            if (!active) return;
            if (inFlight < MAX_CONCURRENT) fireOneGift();
            intervalMs = Math.max(MIN_INTERVAL, Math.round(intervalMs * ACCEL_FACTOR));
            scheduleNext();
        }, intervalMs);
    }

    function startRapidSending() {
        if (active) return;
        active = true;
        intervalMs = 260;
        fireOneGift(); // إرسال فوري عند أول لمسة
        scheduleNext();
    }

    function stopRapidSending() {
        active = false;
        clearTimeout(rampTimeout);
        rampTimeout = null;
    }

    btn.addEventListener('mousedown', startRapidSending);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); startRapidSending(); }, { passive: false });
    btn.addEventListener('mouseup', stopRapidSending);
    btn.addEventListener('mouseleave', stopRapidSending);
    btn.addEventListener('touchend', stopRapidSending);
}

// --- 🎊 تأثير عائم احترافي عند استقبال/إرسال هدية ---
function showGiftFloatingAnimation(giftImage, giftName, fromUsername, quantity = 1) {
    const container = document.createElement('div');
    container.className = 'gift-float-container';
    container.innerHTML = `
        <div class="gift-float-card">
            <img src="${giftImage || ''}" class="gift-float-image">
            <div class="gift-float-text">
                <span class="gift-float-sender">${fromUsername}</span>
                <span class="gift-float-name">أرسل ${giftName}${quantity > 1 ? ' × ' + quantity : ''} 🎁</span>
            </div>
        </div>
        <div class="gift-float-sparkles">
            ${'✨'.repeat(5).split('').map((s, i) => `<span style="--i:${i}">${s}</span>`).join('')}
        </div>
    `;
    document.body.appendChild(container);

    // ✅ ربط احتياطي عبر JS بدل onerror الممنوع بسياسة CSP
    const imgEl = container.querySelector('.gift-float-image');
    if (imgEl) {
        imgEl.addEventListener('error', function () {
            const fallback = document.createElement('span');
            fallback.textContent = '🎁';
            fallback.style.fontSize = '2rem';
            this.replaceWith(fallback);
        }, { once: true });
    }

    setTimeout(() => container.remove(), 3500);
}

        

 // =================================================
// ============ نظام شراء الكوينزات =================
// =================================================

let buyCoinsInfoCache = null;

async function showBuyCoinsModal() {
    const existing = document.getElementById('buy-coins-modal');
    if (existing) existing.remove();

    const shellHTML = `
        <div id="buy-coins-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[320] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white border border-gray-700 max-h-[88vh] flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 class="text-lg font-bold flex items-center gap-2">
                        <i class="fas fa-coins text-yellow-400"></i> شحن الكوينزات
                    </h3>
                    <button id="close-buy-coins" class="text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                </div>
                <div id="buy-coins-body" class="p-4 overflow-y-auto flex-1">
                    <div class="text-center text-gray-400 py-10">
                        <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                        <p class="text-sm">جاري التحميل...</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('game-container').insertAdjacentHTML('beforeend', shellHTML);
        const modal = document.getElementById('buy-coins-modal');
    attachCloseConfirmation(modal, '#close-buy-coins');

    try {
        const [infoRes, pendingRes] = await Promise.all([
            fetch('/api/coin-purchase/info', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
            fetch('/api/coin-purchase/my-pending', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json())
        ]);

        if (infoRes.status !== 'success') throw new Error('فشل تحميل بيانات الدفع');

        buyCoinsInfoCache = infoRes.data;
        const pendingPurchases = pendingRes.status === 'success' ? pendingRes.data.purchases : [];

        renderBuyCoinsHome(pendingPurchases);

    } catch (error) {
        console.error('[BUY COINS] Error:', error);
        const body = document.getElementById('buy-coins-body');
        if (body) body.innerHTML = `<div class="text-center text-red-400 py-10"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><p class="text-sm">فشل تحميل بيانات الدفع</p></div>`;
    }
}

function renderBuyCoinsHome(pendingPurchases) {
    const body = document.getElementById('buy-coins-body');
    if (!body) return;

    const pendingHTML = (pendingPurchases && pendingPurchases.length > 0) ? `
        <div class="bg-yellow-900/20 border border-yellow-600/30 rounded-xl p-3 mb-4">
            <p class="text-xs text-yellow-300 mb-2"><i class="fas fa-info-circle mr-1"></i> لديك طلبات شحن سابقة لم تكتمل:</p>
            <div class="space-y-2">
                ${pendingPurchases.map(p => `
                    <div class="flex items-center justify-between bg-black/20 rounded-lg p-2">
                        <span class="text-xs">${p.amountUSD}$ (${p.coinsAmount} كوينز) - ${p.method === 'sham_cash' ? 'شام كاش' : 'فيزا'}</span>
                        <button class="resume-purchase-btn text-xs bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded-full" data-purchase-id="${p._id}" data-method="${p.method}">استكمال</button>
                    </div>
                `).join('')}
            </div>
        </div>
    ` : '';

    body.innerHTML = `
        ${pendingHTML}
        <p class="text-sm text-gray-400 mb-3">اختر طريقة الدفع المناسبة لك:</p>
        <div class="space-y-3">
            <button class="payment-method-btn w-full flex items-center gap-3 bg-gray-800/50 hover:bg-gray-700/60 border border-gray-700 rounded-xl p-4 transition" data-method="sham_cash">
                <div class="w-12 h-12 bg-blue-600/20 rounded-full flex items-center justify-center"><i class="fas fa-wallet text-blue-400 text-xl"></i></div>
                <div class="text-right flex-1">
                    <p class="font-bold text-sm">شام كاش</p>
                    <p class="text-xs text-gray-400">تحويل فوري عبر QR</p>
                </div>
                <i class="fas fa-chevron-left text-gray-500"></i>
            </button>
            <button class="payment-method-btn w-full flex items-center gap-3 bg-gray-800/50 hover:bg-gray-700/60 border border-gray-700 rounded-xl p-4 transition" data-method="visa">
                <div class="w-12 h-12 bg-purple-600/20 rounded-full flex items-center justify-center"><i class="fas fa-credit-card text-purple-400 text-xl"></i></div>
                <div class="text-right flex-1">
                    <p class="font-bold text-sm">فيزا / بطاقة بنكية</p>
                    <p class="text-xs text-gray-400">تحويل عبر تطبيق البنك</p>
                </div>
                <i class="fas fa-chevron-left text-gray-500"></i>
            </button>
            <button class="payment-method-btn w-full flex items-center gap-3 bg-gray-800/50 hover:bg-gray-700/60 border border-gray-700 rounded-xl p-4 transition" data-method="agent">
                <div class="w-12 h-12 bg-green-600/20 rounded-full flex items-center justify-center"><i class="fas fa-user-tie text-green-400 text-xl"></i></div>
                <div class="text-right flex-1">
                    <p class="font-bold text-sm">عبر وكيل</p>
                    <p class="text-xs text-gray-400">تواصل مباشر مع وكيل شحن</p>
                </div>
                <i class="fas fa-chevron-left text-gray-500"></i>
            </button>
        </div>
    `;

    body.querySelectorAll('.payment-method-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const method = btn.dataset.method;
            if (method === 'agent') {
                renderAgentList();
            } else {
                renderAmountEntry(method);
            }
        });
    });

    body.querySelectorAll('.resume-purchase-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            renderReceiptUpload(btn.dataset.purchaseId);
        });
    });
}

function renderAmountEntry(method) {
    const body = document.getElementById('buy-coins-body');
    if (!body) return;

    const info = buyCoinsInfoCache;
    const methodLabel = method === 'sham_cash' ? 'شام كاش' : 'فيزا / بطاقة بنكية';

    body.innerHTML = `
        <button id="back-to-methods" class="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1">
            <i class="fas fa-arrow-right"></i> رجوع
        </button>
        <h4 class="font-bold mb-3">${methodLabel} - حدد المبلغ</h4>
        <div class="mb-4">
            <label class="text-xs text-gray-400 mb-1 block">المبلغ بالدولار ($)</label>
            <input type="number" id="purchase-amount-input" min="${info.minUSD}" max="${info.maxUSD}" value="${info.minUSD}"
                   class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white">
            <p class="text-xs text-gray-500 mt-1">الحد الأدنى ${info.minUSD}$ - الحد الأقصى ${info.maxUSD}$</p>
        </div>
        <div class="bg-gray-900/50 rounded-xl p-3 mb-4 flex justify-between items-center">
            <span class="text-sm text-gray-400">ستحصل على</span>
            <span id="calculated-coins" class="font-bold text-yellow-400">${info.minUSD * info.coinRate} <i class="fas fa-coins"></i></span>
        </div>
        <button id="continue-purchase-btn" class="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg font-bold">
            متابعة
        </button>
    `;

    document.getElementById('back-to-methods').addEventListener('click', () => renderBuyCoinsHome([]));

    const amountInput = document.getElementById('purchase-amount-input');
    amountInput.addEventListener('input', () => {
        const val = parseFloat(amountInput.value) || 0;
        document.getElementById('calculated-coins').innerHTML = `${Math.round(val * info.coinRate)} <i class="fas fa-coins"></i>`;
    });

    document.getElementById('continue-purchase-btn').addEventListener('click', async () => {
        const amount = parseFloat(amountInput.value);
        if (!amount || amount < info.minUSD || amount > info.maxUSD) {
            showNotification(`المبلغ يجب أن يكون بين ${info.minUSD}$ و ${info.maxUSD}$`, 'error');
            return;
        }

        const continueBtn = document.getElementById('continue-purchase-btn');
        continueBtn.disabled = true;
        continueBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const response = await fetch('/api/coin-purchase/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ method, amountUSD: amount })
            });
            const result = await response.json();

            if (response.ok) {
                renderPaymentDetails(result.data.purchase, method);
            } else {
                showNotification(result.message || 'فشل إنشاء طلب الشراء', 'error');
                continueBtn.disabled = false;
                continueBtn.textContent = 'متابعة';
            }
        } catch (error) {
            console.error('[PURCHASE CREATE] Error:', error);
            showNotification('خطأ في الاتصال بالخادم', 'error');
            continueBtn.disabled = false;
            continueBtn.textContent = 'متابعة';
        }
    });
}

function renderPaymentDetails(purchase, method) {
    const body = document.getElementById('buy-coins-body');
    if (!body) return;

    const info = buyCoinsInfoCache;

    let detailsHTML = '';
    if (method === 'sham_cash') {
        detailsHTML = `
            <div class="text-center mb-4">
                <img src="${info.shamCash.qrImageUrl}" class="w-40 h-40 mx-auto rounded-xl border border-gray-700 object-contain bg-white p-2" onerror="this.style.display='none'">
            </div>
            <div class="bg-gray-900/50 rounded-xl p-3 mb-3">
                <p class="text-xs text-gray-400 mb-1">رقم المحفظة</p>
                <div class="flex items-center justify-between">
                    <span id="wallet-number-text" class="font-bold text-sm">${info.shamCash.walletNumber}</span>
                    <button id="copy-wallet-btn" class="text-purple-400 hover:text-purple-300"><i class="fas fa-copy"></i></button>
                </div>
            </div>
            <div class="bg-gray-900/50 rounded-xl p-3 mb-4">
                <p class="text-xs text-gray-400 mb-1">اسم صاحب الحساب</p>
                <span class="font-bold text-sm">${info.shamCash.accountHolderName}</span>
            </div>
        `;
    } else {
        detailsHTML = `
            <div class="bg-gray-900/50 rounded-xl p-3 mb-3">
                <p class="text-xs text-gray-400 mb-1">رقم البطاقة</p>
                <div class="flex items-center justify-between">
                    <span id="wallet-number-text" class="font-bold text-sm">${info.visa.cardNumber}</span>
                    <button id="copy-wallet-btn" class="text-purple-400 hover:text-purple-300"><i class="fas fa-copy"></i></button>
                </div>
            </div>
            <div class="bg-gray-900/50 rounded-xl p-3 mb-3">
                <p class="text-xs text-gray-400 mb-1">اسم صاحب البطاقة</p>
                <span class="font-bold text-sm">${info.visa.accountHolderName}</span>
            </div>
            <p class="text-xs text-gray-500 mb-4">${info.visa.instructions}</p>
        `;
    }

    body.innerHTML = `
        <div class="text-center mb-4">
            <p class="text-sm text-gray-400">المبلغ المطلوب تحويله</p>
            <p class="text-2xl font-bold text-yellow-400">${purchase.amountUSD}$</p>
            <p class="text-xs text-gray-500">= ${purchase.coinsAmount} كوينز</p>
        </div>
        ${detailsHTML}
        <button id="i-transferred-btn" class="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-bold">
            <i class="fas fa-check mr-1"></i> لقد قمت بالتحويل
        </button>
    `;

    const copyBtn = document.getElementById('copy-wallet-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const text = document.getElementById('wallet-number-text').textContent;
            navigator.clipboard.writeText(text).then(() => showNotification('تم النسخ', 'success'));
        });
    }

    document.getElementById('i-transferred-btn').addEventListener('click', () => {
        renderReceiptUpload(purchase._id);
    });
}

// ✅ هذه الشاشة تُستخدم أيضاً عند الضغط على "استكمال" لطلب سابق بعد إعادة تحميل الصفحة
function renderReceiptUpload(purchaseId) {
    const body = document.getElementById('buy-coins-body');
    if (!body) return;

    body.innerHTML = `
        <div class="text-center mb-4">
            <i class="fas fa-receipt text-3xl text-purple-400 mb-2"></i>
            <p class="text-sm font-bold">أرفق صورة إشعار التحويل</p>
            <p class="text-xs text-gray-500 mt-1">سيتم مراجعة طلبك وإيداع الرصيد خلال 5 إلى 10 دقائق كحد أقصى</p>
        </div>
        <div id="receipt-drop-zone" class="border-2 border-dashed border-gray-600 rounded-xl p-4 text-center cursor-pointer hover:border-purple-500 transition-colors bg-gray-900/50 mb-4">
            <div id="receipt-upload-content">
                <i class="fas fa-cloud-upload-alt text-3xl text-gray-500 mb-2"></i>
                <p class="text-sm">اضغط لاختيار صورة الإشعار</p>
            </div>
            <img id="receipt-preview-img" class="hidden max-h-40 mx-auto rounded-lg mt-2">
            <input type="file" id="receipt-file-input" class="hidden" accept="image/*">
        </div>
        <button id="submit-receipt-btn" class="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg font-bold disabled:opacity-50" disabled>
            إرسال الطلب
        </button>
    `;

    let selectedFile = null;
    const dropZone = document.getElementById('receipt-drop-zone');
    const fileInput = document.getElementById('receipt-file-input');
    const submitBtn = document.getElementById('submit-receipt-btn');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedFile = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                document.getElementById('receipt-upload-content').classList.add('hidden');
                const previewImg = document.getElementById('receipt-preview-img');
                previewImg.src = ev.target.result;
                previewImg.classList.remove('hidden');
            };
            reader.readAsDataURL(selectedFile);
            submitBtn.disabled = false;
        }
    });

    submitBtn.addEventListener('click', async () => {
        if (!selectedFile) return;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const response = await fetch(`/api/coin-purchase/${purchaseId}/receipt`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const result = await response.json();

            if (response.ok) {
                renderPurchaseSuccess();
            } else {
                showNotification(result.message || 'فشل إرسال الإشعار', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'إرسال الطلب';
            }
        } catch (error) {
            console.error('[RECEIPT UPLOAD] Error:', error);
            showNotification('خطأ في الاتصال بالخادم', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'إرسال الطلب';
        }
    });
}

function renderPurchaseSuccess() {
    const body = document.getElementById('buy-coins-body');
    if (!body) return;

    body.innerHTML = `
        <div class="text-center py-8">
            <i class="fas fa-check-circle text-5xl text-green-400 mb-4"></i>
            <p class="font-bold mb-2">تم استلام طلبك بنجاح</p>
            <p class="text-sm text-gray-400 mb-6">سيتم إيداع الرصيد في حسابك خلال 5 إلى 10 دقائق كحد أقصى</p>
            <button id="close-success-btn" class="bg-purple-600 hover:bg-purple-700 text-white py-2.5 px-6 rounded-lg font-bold">حسناً</button>
        </div>
    `;

    document.getElementById('close-success-btn').addEventListener('click', () => {
        const modal = document.getElementById('buy-coins-modal');
        if (modal) modal.remove();
    });
}

function renderAgentList() {
    const body = document.getElementById('buy-coins-body');
    if (!body) return;

    const info = buyCoinsInfoCache;
    const agents = info.agents || [];

    body.innerHTML = `
        <button id="back-to-methods" class="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1">
            <i class="fas fa-arrow-right"></i> رجوع
        </button>
        <h4 class="font-bold mb-3">تواصل مع وكيل شحن</h4>
        ${agents.length === 0 ? `
            <div class="text-center text-gray-400 py-10">
                <i class="fas fa-user-slash text-3xl mb-3"></i>
                <p class="text-sm">لا يوجد وكلاء متاحين حالياً</p>
            </div>
        ` : agents.map(agent => `
            <div class="flex items-center gap-3 bg-gray-800/50 rounded-xl p-3 mb-3">
                <img src="${agent.profileImage}" class="w-12 h-12 rounded-full object-cover border-2 ${agent.isOnline ? 'border-green-500' : 'border-gray-600'}">
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-sm truncate">${agent.username}</p>
                    <p class="text-xs ${agent.isOnline ? 'text-green-400' : 'text-gray-500'}">${agent.isOnline ? 'متصل الآن' : 'غير متصل'}</p>
                </div>
                <div class="flex gap-2">
                    ${agent.whatsapp ? `
                        <a href="https://wa.me/${agent.whatsapp}" target="_blank" class="w-9 h-9 bg-green-600 hover:bg-green-700 rounded-full flex items-center justify-center">
                            <i class="fab fa-whatsapp text-white"></i>
                        </a>
                    ` : ''}
                    <button class="agent-chat-btn w-9 h-9 bg-purple-600 hover:bg-purple-700 rounded-full flex items-center justify-center" data-agent-id="${agent.id}" data-agent-name="${agent.username}">
                        <i class="fas fa-comment-dots text-white"></i>
                    </button>
                </div>
            </div>
        `).join('')}
    `;

    document.getElementById('back-to-methods').addEventListener('click', () => renderBuyCoinsHome([]));

        body.querySelectorAll('.agent-chat-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const agentId = btn.dataset.agentId;
            const agentName = btn.dataset.agentName;

            await openPrivateChat(agentId, agentName);
            // ✅ رسالة تلقائية تنبه الوكيل بطلب الشحن — تستفيد من نظام الإشعارات الموجود أصلاً بالمحادثة الخاصة
            setTimeout(() => {
                sendPrivateMessage(agentId, 'مرحباً 👋 أرغب بشحن رصيد كوينز، الرجاء المساعدة 💰');
            }, 600);
        });
    });
}

// ✅ يُستخدم لأي نافذة "عملية جارية" حتى لا يُفقد تقدم المستخدم بضغطة إغلاق عرضية
function attachCloseConfirmation(modalEl, closeButtonSelector) {
    function requestClose() {
        showConfirmationModal('هل أنت متأكد أنك تريد الخروج؟ سيتم إلغاء العملية الحالية.', () => {
            modalEl.remove();
        });
    }
    const closeBtn = modalEl.querySelector(closeButtonSelector);
    if (closeBtn) {
        const newBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newBtn, closeBtn);
        newBtn.addEventListener('click', requestClose);
    }
    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) requestClose();
    });
}

        

// =================================================
// ============ نظام سحب الرصيد ======================
// =================================================

async function showWithdrawModal() {
    const existing = document.getElementById('withdraw-modal');
    if (existing) existing.remove();

    const shellHTML = `
        <div id="withdraw-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[320] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white border border-gray-700 max-h-[88vh] flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-money-bill-wave text-green-400"></i> سحب الرصيد</h3>
                    <button id="close-withdraw" class="text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                </div>
                <div id="withdraw-body" class="p-4 overflow-y-auto flex-1"></div>
            </div>
        </div>
    `;

        document.getElementById('game-container').insertAdjacentHTML('beforeend', shellHTML);
    const modal = document.getElementById('withdraw-modal');
    attachCloseConfirmation(modal, '#close-withdraw');

    renderWithdrawHome();
}

async function renderWithdrawHome() {
    const body = document.getElementById('withdraw-body');
    const user = JSON.parse(localStorage.getItem('user'));

    let myWithdrawals = [];
    try {
        const res = await fetch('/api/withdrawals/my-withdrawals', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await res.json();
        if (res.ok) myWithdrawals = result.data.withdrawals;
    } catch (e) { console.error(e); }

    const statusLabel = { pending: ['قيد المراجعة', 'text-yellow-400'], completed: ['تم القبول ✓', 'text-green-400'], rejected: ['مرفوض', 'text-red-400'] };

    body.innerHTML = `
        <div class="bg-gray-900/50 rounded-xl p-3 mb-4 flex justify-between items-center">
            <span class="text-sm text-gray-400">رصيدك المتاح</span>
            <span class="font-bold text-green-400">${user.balance.toFixed(2)}$</span>
        </div>
        <div class="space-y-3 mb-4">
            <button class="withdraw-method-btn w-full flex items-center gap-3 bg-gray-800/50 hover:bg-gray-700/60 border border-gray-700 rounded-xl p-4" data-method="sham_cash">
                <i class="fas fa-wallet text-blue-400 text-xl"></i>
                <div class="text-right flex-1"><p class="font-bold text-sm">سحب عبر شام كاش</p><p class="text-xs text-gray-400">خلال ساعة إلى 3 ساعات</p></div>
                <i class="fas fa-chevron-left text-gray-500"></i>
            </button>
            <button class="withdraw-method-btn w-full flex items-center gap-3 bg-gray-800/50 hover:bg-gray-700/60 border border-gray-700 rounded-xl p-4" data-method="office">
                <i class="fas fa-building text-orange-400 text-xl"></i>
                <div class="text-right flex-1"><p class="font-bold text-sm">سحب عبر مكتب</p><p class="text-xs text-gray-400">خلال يوم إلى 3 أيام</p></div>
                <i class="fas fa-chevron-left text-gray-500"></i>
            </button>
        </div>
        ${myWithdrawals.length > 0 ? `
            <p class="text-xs text-gray-400 mb-2">طلباتك السابقة</p>
            <div class="space-y-2">
                ${myWithdrawals.slice(0, 5).map(w => `
                    <div class="bg-gray-900/40 rounded-lg p-2.5 flex justify-between items-center text-xs">
                        <span>${w.amount}$ - ${w.method === 'sham_cash' ? 'شام كاش' : 'مكتب'}</span>
                        <span class="${statusLabel[w.status][1]} font-bold">${statusLabel[w.status][0]}</span>
                    </div>
                    ${w.status === 'rejected' && w.rejectionReason ? `<p class="text-[11px] text-red-400 px-2">السبب: ${w.rejectionReason}</p>` : ''}
                `).join('')}
            </div>
        ` : ''}
    `;

    body.querySelectorAll('.withdraw-method-btn').forEach(btn => {
        btn.addEventListener('click', () => renderWithdrawForm(btn.dataset.method));
    });
}

function renderWithdrawForm(method) {
    const body = document.getElementById('withdraw-body');
    const user = JSON.parse(localStorage.getItem('user'));

    const fieldsHTML = method === 'sham_cash' ? `
        <div class="mb-3">
            <label class="text-xs text-gray-400 mb-1 block">رابط محفظة شام كاش</label>
            <input type="text" id="w-wallet" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm" placeholder="رابط المحفظة">
        </div>
    ` : `
        <div class="grid grid-cols-2 gap-2 mb-3">
            <div><label class="text-xs text-gray-400 mb-1 block">البلد</label><input type="text" id="w-country" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm"></div>
            <div><label class="text-xs text-gray-400 mb-1 block">المحافظة</label><input type="text" id="w-governorate" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm"></div>
        </div>
        <div class="mb-3"><label class="text-xs text-gray-400 mb-1 block">المنطقة</label><input type="text" id="w-area" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm"></div>
        <div class="mb-3"><label class="text-xs text-gray-400 mb-1 block">رقم الهاتف</label><input type="text" id="w-phone" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm"></div>
    `;

    body.innerHTML = `
        <button id="back-to-withdraw-home" class="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1"><i class="fas fa-arrow-right"></i> رجوع</button>
        <div class="mb-3"><label class="text-xs text-gray-400 mb-1 block">الاسم الكامل</label><input type="text" id="w-fullname" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm"></div>
        ${fieldsHTML}
        <div class="mb-4">
            <label class="text-xs text-gray-400 mb-1 block">المبلغ المراد سحبه ($)</label>
            <input type="number" id="w-amount" min="5" max="${user.balance}" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm">
            <p class="text-xs text-gray-500 mt-1">رصيدك المتاح: ${user.balance.toFixed(2)}$ — الحد الأدنى 5$</p>
        </div>
        <button id="submit-withdraw-btn" class="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-bold">إرسال طلب السحب</button>
    `;

    document.getElementById('back-to-withdraw-home').addEventListener('click', renderWithdrawHome);

    document.getElementById('submit-withdraw-btn').addEventListener('click', async () => {
        const fullName = document.getElementById('w-fullname').value.trim();
        const amount = parseFloat(document.getElementById('w-amount').value);

        if (!fullName) { showNotification('يرجى إدخال الاسم الكامل', 'error'); return; }
        if (!amount || amount < 5) { showNotification('الحد الأدنى للسحب 5$', 'error'); return; }
        if (amount > user.balance) { showNotification('المبلغ يتجاوز رصيدك المتاح', 'error'); return; }

        const payload = { method, amount, fullName };
        if (method === 'sham_cash') {
            const wallet = document.getElementById('w-wallet').value.trim();
            if (!wallet) { showNotification('يرجى إدخال رابط المحفظة', 'error'); return; }
            payload.walletNumber = wallet;
        } else {
            const country = document.getElementById('w-country').value.trim();
            const governorate = document.getElementById('w-governorate').value.trim();
            const area = document.getElementById('w-area').value.trim();
            const phone = document.getElementById('w-phone').value.trim();
            if (!country || !governorate || !area || !phone) { showNotification('يرجى إكمال كل بيانات المكتب', 'error'); return; }
            payload.officeInfo = { country, governorate, area, phone };
        }

        const btn = document.getElementById('submit-withdraw-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const response = await fetch('/api/withdrawals/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

                 if (response.ok) {
                // ✅ الإصلاح: تحديث فوري وحقيقي من الخادم بدل تعديل يدوي محلي فقط
                await refreshUserData();

                const modal = document.getElementById('withdraw-modal');
                if (modal) modal.remove();
            } else {
                showNotification(result.message || 'فشل إرسال الطلب', 'error');
                btn.disabled = false;
                btn.textContent = 'إرسال طلب السحب';
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
            btn.disabled = false;
            btn.textContent = 'إرسال طلب السحب';
        }
    });
}


        // =================================================
// ============ نظام شحن الرصيد (USD) ================
// =================================================

async function showDepositModal() {
    const existing = document.getElementById('deposit-modal');
    if (existing) existing.remove();

    const shellHTML = `
        <div id="deposit-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[320] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white border border-gray-700 max-h-[88vh] flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-wallet text-blue-400"></i> شحن الرصيد</h3>
                    <button id="close-deposit" class="text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                </div>
                <div id="deposit-body" class="p-4 overflow-y-auto flex-1">
                    <div class="text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin text-2xl"></i></div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('game-container').insertAdjacentHTML('beforeend', shellHTML);
    const modal = document.getElementById('deposit-modal');
    attachCloseConfirmation(modal, '#close-deposit');

    try {
        const [infoRes, pendingRes] = await Promise.all([
            fetch('/api/deposits/wallet-info', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
            fetch('/api/deposits/my-deposits', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json())
        ]);

        if (infoRes.status !== 'success') throw new Error();
        window._depositInfoCache = infoRes.data;

        const pendingWithoutReceipt = (pendingRes.data?.deposits || []).find(d => d.status === 'pending' && !d.receiptImage);
        if (pendingWithoutReceipt) {
            renderDepositReceiptUpload(pendingWithoutReceipt._id, pendingWithoutReceipt.amount);
        } else {
            renderDepositAmountEntry();
        }
    } catch (error) {
        document.getElementById('deposit-body').innerHTML = `<div class="text-center text-red-400 py-10">فشل تحميل بيانات الشحن</div>`;
    }
}

function renderDepositAmountEntry() {
    const body = document.getElementById('deposit-body');
    const info = window._depositInfoCache;

    body.innerHTML = `
        <div class="mb-4">
            <label class="text-xs text-gray-400 mb-1 block">المبلغ بالدولار ($)</label>
            <input type="number" id="deposit-amount-input" min="${info.minUSD}" max="${info.maxUSD}" value="${info.minUSD}"
                   class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white">
            <p class="text-xs text-gray-500 mt-1">الحد الأدنى ${info.minUSD}$ - الحد الأقصى ${info.maxUSD}$</p>
        </div>
        <button id="continue-deposit-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-bold">متابعة</button>
    `;

    document.getElementById('continue-deposit-btn').addEventListener('click', async () => {
        const amount = parseFloat(document.getElementById('deposit-amount-input').value);
        if (!amount || amount < info.minUSD || amount > info.maxUSD) {
            showNotification(`المبلغ يجب أن يكون بين ${info.minUSD}$ و ${info.maxUSD}$`, 'error');
            return;
        }
        const btn = document.getElementById('continue-deposit-btn');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const response = await fetch('/api/deposits/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ amount })
            });
            const result = await response.json();
            if (response.ok) {
                renderDepositPaymentDetails(result.data.deposit);
            } else {
                showNotification(result.message || 'فشل إنشاء الطلب', 'error');
                btn.disabled = false; btn.textContent = 'متابعة';
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
            btn.disabled = false; btn.textContent = 'متابعة';
        }
    });
}

function renderDepositPaymentDetails(deposit) {
    const body = document.getElementById('deposit-body');
    const info = window._depositInfoCache;

    body.innerHTML = `
        <div class="text-center mb-4">
            <p class="text-sm text-gray-400">المبلغ المطلوب تحويله</p>
            <p class="text-2xl font-bold text-blue-400">${deposit.amount}$</p>
        </div>
        <div class="bg-gray-900/50 rounded-xl p-3 mb-3">
            <p class="text-xs text-gray-400 mb-1">رقم محفظة شام كاش</p>
            <div class="flex items-center justify-between">
                <span id="deposit-wallet-text" class="font-bold text-sm">${info.shamCash.walletNumber}</span>
                <button id="copy-deposit-wallet" class="text-blue-400 hover:text-blue-300"><i class="fas fa-copy"></i></button>
            </div>
        </div>
        <div class="bg-gray-900/50 rounded-xl p-3 mb-4">
            <p class="text-xs text-gray-400 mb-1">اسم صاحب الحساب</p>
            <span class="font-bold text-sm">${info.shamCash.accountHolderName}</span>
        </div>
        <button id="i-transferred-deposit-btn" class="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-bold">
            <i class="fas fa-check mr-1"></i> لقد قمت بالتحويل
        </button>
    `;

    document.getElementById('copy-deposit-wallet').addEventListener('click', () => {
        navigator.clipboard.writeText(document.getElementById('deposit-wallet-text').textContent)
            .then(() => showNotification('تم النسخ', 'success'));
    });
    document.getElementById('i-transferred-deposit-btn').addEventListener('click', () => {
        renderDepositReceiptUpload(deposit._id, deposit.amount);
    });
}

function renderDepositReceiptUpload(depositId, amount) {
    const body = document.getElementById('deposit-body');
    body.innerHTML = `
        <div class="text-center mb-4">
            <i class="fas fa-receipt text-3xl text-blue-400 mb-2"></i>
            <p class="text-sm font-bold">أرفق صورة إشعار التحويل (${amount}$)</p>
            <p class="text-xs text-gray-500 mt-1">سيتم مراجعة طلبك وإيداع الرصيد من قبل الإدارة</p>
        </div>
        <div id="deposit-drop-zone" class="border-2 border-dashed border-gray-600 rounded-xl p-4 text-center cursor-pointer hover:border-blue-500 transition-colors bg-gray-900/50 mb-4">
            <div id="deposit-upload-content">
                <i class="fas fa-cloud-upload-alt text-3xl text-gray-500 mb-2"></i>
                <p class="text-sm">اضغط لاختيار صورة الإشعار</p>
            </div>
            <img id="deposit-preview-img" class="hidden max-h-40 mx-auto rounded-lg mt-2">
            <input type="file" id="deposit-file-input" class="hidden" accept="image/*">
        </div>
        <button id="submit-deposit-receipt-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-bold disabled:opacity-50" disabled>إرسال الطلب</button>
    `;

    let selectedFile = null;
    const dropZone = document.getElementById('deposit-drop-zone');
    const fileInput = document.getElementById('deposit-file-input');
    const submitBtn = document.getElementById('submit-deposit-receipt-btn');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedFile = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                document.getElementById('deposit-upload-content').classList.add('hidden');
                const previewImg = document.getElementById('deposit-preview-img');
                previewImg.src = ev.target.result;
                previewImg.classList.remove('hidden');
            };
            reader.readAsDataURL(selectedFile);
            submitBtn.disabled = false;
        }
    });

    submitBtn.addEventListener('click', async () => {
        if (!selectedFile) return;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            const response = await fetch(`/api/deposits/${depositId}/receipt`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const result = await response.json();
            if (response.ok) {
                const body = document.getElementById('deposit-body');
                body.innerHTML = `
                    <div class="text-center py-8">
                        <i class="fas fa-check-circle text-5xl text-green-400 mb-4"></i>
                        <p class="font-bold mb-2">تم استلام طلبك بنجاح</p>
                        <p class="text-sm text-gray-400 mb-6">سيتم إيداع الرصيد بعد مراجعة الإدارة</p>
                        <button id="close-deposit-success-btn" class="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-6 rounded-lg font-bold">حسناً</button>
                    </div>
                `;
                document.getElementById('close-deposit-success-btn').addEventListener('click', () => {
                    document.getElementById('deposit-modal')?.remove();
                });
            } else {
                showNotification(result.message || 'فشل إرسال الإشعار', 'error');
                submitBtn.disabled = false; submitBtn.textContent = 'إرسال الطلب';
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
            submitBtn.disabled = false; submitBtn.textContent = 'إرسال الطلب';
        }
    });
}

        

async function loadGiftsReceivedSummary() {
    const body = document.getElementById('gifts-received-body');
    if (!body) return;

    try {
        const response = await fetch('/api/gift-redemption/summary', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        if (!response.ok) throw new Error();

        const d = result.data;

        body.innerHTML = `
            <div class="bg-gray-900/50 rounded-xl p-4 mb-4 text-center">
                <p class="text-3xl font-bold text-pink-400">${d.totalGiftsCount}</p>
                <p class="text-xs text-gray-400">هدية قابلة للاستبدال (${d.totalCoinsValue} كوينز)</p>
            </div>
            ${d.totalGiftsCount > 0 ? `
                <p class="text-xs text-gray-500 mb-3 text-center">نسبة الاستبدال ${d.redemptionRatePercent}% (خصم منصة بسيط لضمان عدالة النظام)</p>
                <div class="grid grid-cols-2 gap-3">
                    <button id="redeem-to-balance-btn" class="bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg text-sm font-bold">
                        <i class="fas fa-dollar-sign"></i><br>${d.usdIfRedeemed}$
                        <p class="text-[10px] font-normal opacity-80">تحويل لرصيد</p>
                    </button>
                    <button id="redeem-to-coins-btn" class="bg-yellow-600 hover:bg-yellow-700 text-white py-3 rounded-lg text-sm font-bold">
                        <i class="fas fa-coins"></i><br>${d.coinsIfRedeemed}
                        <p class="text-[10px] font-normal opacity-80">تحويل لكوينز</p>
                    </button>
                </div>
            ` : '<p class="text-center text-gray-500 text-sm">لا توجد هدايا جديدة قابلة للاستبدال</p>'}
        `;

        document.getElementById('redeem-to-balance-btn')?.addEventListener('click', () => confirmRedeem('balance'));
        document.getElementById('redeem-to-coins-btn')?.addEventListener('click', () => confirmRedeem('coins'));

    } catch (error) {
        body.innerHTML = '<p class="text-center text-red-400 text-sm">فشل تحميل بيانات الهدايا</p>';
    }
}

function confirmRedeem(redeemTo) {
    const label = redeemTo === 'balance' ? 'رصيد الدولار' : 'الكوينز';
    showConfirmationModal(`هل أنت متأكد من استبدال جميع هداياك القابلة للاستبدال إلى ${label}؟ هذا الإجراء لا يمكن التراجع عنه.`, async () => {
        try {
            const response = await fetch('/api/gift-redemption/redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ redeemTo })
            });
            const result = await response.json();
            if (response.ok) {
                showNotification(result.message, 'success');
                await refreshUserData();
                showSettingsView();
            } else {
                showNotification(result.message || 'فشل الاستبدال', 'error');
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
        }
    });
}


        
   async function showPublicGiftModal() {
    const existing = document.getElementById('public-gift-modal');
    if (existing) existing.remove();

    const shellHTML = `
        <div id="public-gift-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[320] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white border border-gray-700 max-h-[88vh] flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-gift text-pink-400"></i> إرسال هدية بالشات العام</h3>
                    <button id="close-public-gift" class="text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                </div>
                <div id="public-gift-body" class="p-4 overflow-y-auto flex-1">
                    <div class="text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin"></i></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('game-container').insertAdjacentHTML('beforeend', shellHTML);
    const modal = document.getElementById('public-gift-modal');

    document.getElementById('close-public-gift').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target.id === 'public-gift-modal') modal.remove(); });

    try {
        const [onlineRes, shopRes] = await Promise.all([
            fetch('/api/users/online/public-room', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
            fetch('/api/gifts/shop', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json())
        ]);

        const onlineUsers = onlineRes.data.users;
        const gifts = shopRes.data.gifts;
        const localUserSnapshot = JSON.parse(localStorage.getItem('user')) || {};

        let selectedUserIds = new Set();
        let audienceMode = 'selected';

        const body = document.getElementById('public-gift-body');
        body.innerHTML = `
            <div class="flex items-center justify-between mb-3 bg-gray-900/50 rounded-xl p-3">
                <span class="text-sm text-gray-400">رصيدك الحالي</span>
                <span class="font-bold text-yellow-400 flex items-center gap-1"><i class="fas fa-coins"></i> <span id="pg-balance">${localUserSnapshot.coins || 0}</span></span>
            </div>
            <p class="text-xs text-gray-400 mb-2">اختر المستلمين</p>
            <button id="select-all-online-btn" class="w-full bg-purple-600 hover:bg-purple-700 text-xs py-2 rounded-lg font-bold mb-3 transition-all">
                <i class="fas fa-users"></i> إرسال للجميع (${onlineUsers.length})
            </button>
            <div id="public-gift-avatars" class="grid grid-cols-6 sm:grid-cols-8 gap-2 mb-4 max-h-40 overflow-y-auto p-2 bg-gray-900/30 rounded-xl">
                ${onlineUsers.length === 0 ? '<p class="col-span-full text-xs text-gray-500 text-center py-6">لا يوجد أشخاص متصلون حالياً</p>' : onlineUsers.map(u => `
                    <button class="public-gift-avatar-btn relative flex flex-col items-center gap-1 p-1 rounded-lg transition-all" data-user-id="${u._id}" data-username="${u.username}" title="${u.username}">
                        <span class="relative inline-block">
                            <img src="${u.profileImage}" class="w-7 h-7 rounded-full object-cover border-2 border-gray-600 transition-all public-avatar-img ${u.activeFrameClass || ''}">
                            <span class="pg-selected-badge hidden absolute -top-1 -right-1 w-3.5 h-3.5 bg-pink-500 rounded-full border-2 border-gray-900 items-center justify-center">
                                <i class="fas fa-check text-white" style="font-size:6px"></i>
                            </span>
                        </span>
                        <span class="text-[8px] leading-tight truncate w-full text-center">${u.username}</span>
                    </button>
                `).join('')}
            </div>
            <p class="text-xs text-gray-400 mb-2">اختر الهدية (اضغط عليها، واستمر بالضغط على زر الإرسال للإرسال السريع المتتالي)</p>
            <div class="grid grid-cols-3 gap-2">
                ${gifts.map(g => renderGiftCardHTML(g)).join('')}
            </div>
        `;

        wireGiftImageFallbacks(body);

        function markAllSelectedVisual(isAll) {
            const allBtn = document.getElementById('select-all-online-btn');
            if (!allBtn) return;
            if (isAll) allBtn.classList.add('ring-2', 'ring-pink-400', 'bg-purple-700');
            else allBtn.classList.remove('ring-2', 'ring-pink-400', 'bg-purple-700');
        }

        function clearIndividualSelectionVisuals() {
            body.querySelectorAll('.public-gift-avatar-btn').forEach(b => {
                b.querySelector('.public-avatar-img')?.classList.remove('ring-2', 'ring-pink-500');
                b.querySelector('.pg-selected-badge')?.classList.add('hidden');
                b.classList.remove('bg-pink-900/40');
            });
        }

        document.getElementById('select-all-online-btn').addEventListener('click', function() {
            audienceMode = 'all';
            selectedUserIds.clear();
            clearIndividualSelectionVisuals();
            markAllSelectedVisual(true);
        });

        body.querySelectorAll('.public-gift-avatar-btn').forEach(avatarBtn => {
            avatarBtn.addEventListener('click', () => {
                audienceMode = 'selected';
                markAllSelectedVisual(false);
                const uid = avatarBtn.dataset.userId;
                const img = avatarBtn.querySelector('.public-avatar-img');
                const badge = avatarBtn.querySelector('.pg-selected-badge');
                if (selectedUserIds.has(uid)) {
                    selectedUserIds.delete(uid);
                    img.classList.remove('ring-2', 'ring-pink-500');
                    badge.classList.add('hidden');
                    avatarBtn.classList.remove('bg-pink-900/40');
                } else {
                    selectedUserIds.add(uid);
                    img.classList.add('ring-2', 'ring-pink-500');
                    badge.classList.remove('hidden');
                    badge.classList.add('flex');
                    avatarBtn.classList.add('bg-pink-900/40');
                }
            });
        });

        body.querySelectorAll('.gift-card-wrapper').forEach(card => {
            const toggleBtn = card.querySelector('.gift-card-toggle');

            toggleBtn.addEventListener('click', () => {
                const isExpanded = card.classList.contains('gift-expanded');
                body.querySelectorAll('.gift-card-wrapper').forEach(c => c.classList.remove('gift-expanded'));
                if (isExpanded) return;

                card.classList.add('gift-expanded');

                const giftData = {
                    id: card.dataset.giftId,
                    name: card.dataset.giftName,
                    price: parseFloat(card.dataset.giftPrice),
                    icon: card.dataset.giftIcon,
                    imageUrl: card.dataset.giftImage
                };

                const sendBtn = card.querySelector('.inline-send-btn');
                const counterEl = card.querySelector('.inline-send-counter');

                setupRapidPublicGiftButton(
                    () => giftData,
                    () => ({ audienceMode, selectedUserIds, onlineCount: onlineUsers.length }),
                    sendBtn,
                    counterEl
                );
            });
        });

    } catch (error) {
        console.error('[PUBLIC GIFT] Error:', error);
        document.getElementById('public-gift-body').innerHTML = `<div class="text-center text-red-400 py-10">فشل تحميل البيانات</div>`;
    }
}

// --- ⚡ محرك الإرسال المتسارع لهدايا الشات العام: ضغطة = هدية، استمرار الضغط = تسارع تلقائي، بدون إغلاق النافذة ---
// --- ⚡ محرك الإرسال المتسارع لهدايا الشات العام (نفس منطق الدردشة الخاصة تماماً) ---
function setupRapidPublicGiftButton(getSelectedGift, getAudience, btn, counterLabel) {
    if (!btn) return;

    let sentCount = 0;
    let inFlight = 0;
    const MAX_CONCURRENT = 3;
    let active = false;
    let rampTimeout = null;
    let intervalMs = 300;
    const MIN_INTERVAL = 90;
    const ACCEL_FACTOR = 0.87;

    async function fireOnePublicGift() {
        const gift = getSelectedGift();
        const { audienceMode, selectedUserIds, onlineCount } = getAudience();
        if (!gift || !active) return;

        const recipientCount = audienceMode === 'all' ? onlineCount : selectedUserIds.size;
        if (recipientCount === 0) {
            stopRapidSending();
            showFloatingAlert('يجب اختيار شخص أولاً', 'fa-user-plus', 'bg-yellow-500');
            return;
        }

        const localUser = JSON.parse(localStorage.getItem('user'));
        const cost = gift.price * recipientCount;
        if (!localUser || localUser.coins < cost) {
            stopRapidSending();
            showFloatingAlert('رصيد الكوينز غير كافٍ', 'fa-coins', 'bg-red-500');
            return;
        }

        // ✅ تحديث متفائل فوري
        localUser.coins -= cost;
        localStorage.setItem('user', JSON.stringify(localUser));
        const coinsEl = document.getElementById('coins');
        if (coinsEl) coinsEl.textContent = localUser.coins;
        const balanceEl = document.getElementById('pg-balance');
        if (balanceEl) balanceEl.textContent = localUser.coins;

        sentCount++;
        if (counterLabel) {
            counterLabel.textContent = `أُرسل ×${sentCount}`;
            counterLabel.classList.remove('hidden');
        }
        showGiftFloatingAnimation(gift.imageUrl, gift.name, 'أنت', sentCount);

        inFlight++;
        try {
            const payload = {
                giftId: gift.id,
                audience: audienceMode,
                recipientIds: audienceMode === 'selected' ? Array.from(selectedUserIds) : []
            };
            const response = await fetch('/api/gifts/send-public', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (response.ok) {
                const syncedUser = JSON.parse(localStorage.getItem('user'));
                if (syncedUser) {
                    syncedUser.coins = result.data.newCoins;
                    localStorage.setItem('user', JSON.stringify(syncedUser));
                }
                if (coinsEl) coinsEl.textContent = result.data.newCoins;
                if (balanceEl) balanceEl.textContent = result.data.newCoins;
            } else {
                const revertUser = JSON.parse(localStorage.getItem('user'));
                if (revertUser) {
                    revertUser.coins += cost;
                    localStorage.setItem('user', JSON.stringify(revertUser));
                    if (coinsEl) coinsEl.textContent = revertUser.coins;
                    if (balanceEl) balanceEl.textContent = revertUser.coins;
                }
                stopRapidSending();
                showFloatingAlert(result.message || 'فشل إرسال الهدية', 'fa-exclamation-circle', 'bg-red-500');
            }
        } catch (error) {
            console.error('[RAPID PUBLIC GIFT] Error:', error);
        } finally {
            inFlight--;
        }
    }

    function scheduleNext() {
        if (!active) return;
        rampTimeout = setTimeout(() => {
            if (!active) return;
            if (inFlight < MAX_CONCURRENT) fireOnePublicGift();
            intervalMs = Math.max(MIN_INTERVAL, Math.round(intervalMs * ACCEL_FACTOR));
            scheduleNext();
        }, intervalMs);
    }

    function startRapidSending() {
        if (active) return;
        active = true;
        intervalMs = 300;
        fireOnePublicGift();
        scheduleNext();
    }

    function stopRapidSending() {
        active = false;
        clearTimeout(rampTimeout);
        rampTimeout = null;
    }

    btn.addEventListener('mousedown', startRapidSending);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); startRapidSending(); }, { passive: false });
    btn.addEventListener('mouseup', stopRapidSending);
    btn.addEventListener('mouseleave', stopRapidSending);
    btn.addEventListener('touchend', stopRapidSending);
}

        
// =================================================
// ============ قسم المتصدرين (Leaderboard) =========
// =================================================

async function showLeaderboardView() {
    mainContent.innerHTML = `
        <div class="flex flex-col h-full">
            <h2 class="text-xl font-bold mb-3 flex items-center gap-2"><i class="fas fa-trophy text-yellow-400"></i> المتصدرين</h2>
            <div class="flex gap-2 mb-2">
                <button class="lb-range-btn flex-1 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white" data-range="week">هذا الأسبوع</button>
                <button class="lb-range-btn flex-1 py-1.5 rounded-lg text-xs font-bold bg-gray-700 text-gray-300" data-range="month">هذا الشهر</button>
                <button class="lb-range-btn flex-1 py-1.5 rounded-lg text-xs font-bold bg-gray-700 text-gray-300" data-range="year">هذا العام</button>
            </div>
            <div class="flex gap-2 mb-4">
                <button id="lb-tab-senders" class="flex-1 py-2 rounded-lg text-sm font-bold bg-pink-600 text-white"><i class="fas fa-hand-holding-heart mr-1"></i> الأكثر إهداءً</button>
                <button id="lb-tab-receivers" class="flex-1 py-2 rounded-lg text-sm font-bold bg-gray-700 text-gray-300"><i class="fas fa-crown mr-1"></i> الأكثر تلقياً</button>
            </div>
            <div id="leaderboard-list-container" class="flex-grow overflow-y-auto space-y-2 pr-1">
                <div class="text-center text-gray-400 py-16"><i class="fas fa-spinner fa-spin text-3xl"></i></div>
            </div>
        </div>
    `;

    let currentType = 'senders';
    let currentRange = 'week';

    document.querySelectorAll('.lb-range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentRange = btn.dataset.range;
            document.querySelectorAll('.lb-range-btn').forEach(b => { b.classList.remove('bg-purple-600', 'text-white'); b.classList.add('bg-gray-700', 'text-gray-300'); });
            btn.classList.remove('bg-gray-700', 'text-gray-300'); btn.classList.add('bg-purple-600', 'text-white');
            loadLeaderboard(currentType, currentRange);
        });
    });

    document.getElementById('lb-tab-senders').addEventListener('click', function() {
        currentType = 'senders';
        setLeaderboardTab('senders');
        loadLeaderboard(currentType, currentRange);
    });
    document.getElementById('lb-tab-receivers').addEventListener('click', function() {
        currentType = 'receivers';
        setLeaderboardTab('receivers');
        loadLeaderboard(currentType, currentRange);
    });

    await loadLeaderboard(currentType, currentRange);
}


function setLeaderboardTab(type) {
    const sendersBtn = document.getElementById('lb-tab-senders');
    const receiversBtn = document.getElementById('lb-tab-receivers');
    if (!sendersBtn || !receiversBtn) return;

    if (type === 'senders') {
        sendersBtn.classList.add('bg-pink-600', 'text-white');
        sendersBtn.classList.remove('bg-gray-700', 'text-gray-300');
        receiversBtn.classList.add('bg-gray-700', 'text-gray-300');
        receiversBtn.classList.remove('bg-pink-600', 'text-white');
    } else {
        receiversBtn.classList.add('bg-pink-600', 'text-white');
        receiversBtn.classList.remove('bg-gray-700', 'text-gray-300');
        sendersBtn.classList.add('bg-gray-700', 'text-gray-300');
        sendersBtn.classList.remove('bg-pink-600', 'text-white');
    }
}

async function loadLeaderboard(type, range = 'week') {
    const container = document.getElementById('leaderboard-list-container');
    if (!container) return;

    container.innerHTML = `<div class="text-center text-gray-400 py-16"><i class="fas fa-spinner fa-spin text-3xl"></i></div>`;
    const endpoint = type === 'senders' ? '/api/gifts/leaderboard/top-senders' : '/api/gifts/leaderboard/top-receivers';

    try {
        const response = await fetch(`${endpoint}?range=${range}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        if (!response.ok) throw new Error();

        const leaders = result.data.leaders;
        if (!leaders || leaders.length === 0) {
            container.innerHTML = `<div class="text-center text-gray-400 py-16"><i class="fas fa-gift text-4xl mb-4"></i><p>لا توجد بيانات لهذه الفترة</p></div>`;
            return;
        }

        const valueKey = type === 'senders' ? 'totalSpent' : 'totalReceived';
        const rankColors = ['from-yellow-400 to-orange-500', 'from-gray-300 to-gray-500', 'from-orange-600 to-orange-800'];

        container.innerHTML = leaders.map((leader, index) => `
            <div class="flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 hover:bg-gray-700/40 transition">
                <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${index < 3 ? `bg-gradient-to-br ${rankColors[index]} text-white` : 'bg-gray-700 text-gray-300'}">${index + 1}</div>
                <img src="${leader.profileImage}" class="w-11 h-11 rounded-full object-cover border-2 border-gray-600 ${leader.activeFrameClass || ''}">
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-sm truncate">${leader.username}</p>
                    <p class="text-xs text-gray-400">${leader.giftsCount} هدية</p>
                </div>
                <span class="font-bold text-yellow-400 flex items-center gap-1 text-sm"><i class="fas fa-coins"></i> ${leader[valueKey].toLocaleString()}</span>
            </div>
        `).join('');

    } catch (error) {
        container.innerHTML = `<div class="text-center text-red-400 py-16">فشل تحميل المتصدرين</div>`;
    }
}


        


// --- 📡 دالة تحميل تاريخ المحادثة من الخادم ---
// --- 📡 دالة تحميل تاريخ المحادثة من الخادم ---
async function loadChatHistoryFromServer(targetUserId) {
    const messagesContainer = document.getElementById('private-chat-messages');
    if (!messagesContainer) return;
    
    try {
        console.log(`[CHAT] Loading chat history with ${targetUserId}`);
        
        const response = await fetch(`/api/private-chat/chat/${targetUserId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            const emptyState = messagesContainer.querySelector('.text-center');
            if (emptyState) emptyState.remove();
            
            result.data.messages.forEach(message => {
                const isMyMessage = message.sender._id === JSON.parse(localStorage.getItem('user'))._id;
                displayPrivateMessage(message, isMyMessage);
            });
            
            updateChatHeader(result.data.chat);
            
            console.log(`✅ [CHAT] Loaded ${result.data.messages.length} messages`);
            
            if (result.data.unreadCount > 0) {
                markMessagesAsDelivered(result.data.messages);
            }

            // ✅ جديد: تصفير عداد غير المقروء + تحديث شارة الرسائل والقائمة إن كانت مفتوحة
            try {
                await fetch(`/api/private-chat/chat/${targetUserId}/read`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                refreshMessagesNavBadge();
                if (document.getElementById('messages-list-container')) {
                    loadMessagesList();
                }
            } catch (readError) {
                console.error('[CHAT] Error marking chat as read:', readError);
            }
            
        } else {
            console.warn('[CHAT] No chat history or error:', result.message);
        }
        
    } catch (error) {
        console.error('[CHAT] Error loading chat history:', error);
    }
}

// --- 🔄 دالة تحديث رأس الدردشة ---
function updateChatHeader(chatData) {
    if (!chatData || !chatData.participants) return;
    
    const currentUserId = JSON.parse(localStorage.getItem('user'))._id;
    const otherParticipant = chatData.participants.find(p => p._id.toString() !== currentUserId.toString());
    
    if (otherParticipant) {
        const avatar = document.getElementById('chat-user-avatar');
        const name = document.getElementById('chat-user-name');
        
        if (avatar) avatar.src = otherParticipant.profileImage;
        if (name) name.textContent = otherParticipant.username;
    }
}

// --- 📨 دالة تعليم الرسائل كـ "تم التسليم" ---
async function markMessagesAsDelivered(messages) {
    const currentUserId = JSON.parse(localStorage.getItem('user'))._id;
    
    // تصفية الرسائل المرسلة لي
    const messagesToMark = messages.filter(msg => 
        msg.receiver.toString() === currentUserId && 
        !msg.status.delivered
    );
    
    if (messagesToMark.length === 0) return;
    
    try {
        // تحديث حالة كل رسالة
        for (const message of messagesToMark) {
            const response = await fetch('/api/private-chat/message/status', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    messageId: message._id,
                    status: 'delivered'
                })
            });
            
            if (response.ok) {
                // تحديث الواجهة
                const messageElement = document.querySelector(`[data-message-id="${message._id}"]`);
                if (messageElement) {
                    messageElement.querySelector('.message-status').innerHTML = `
                        <i class="fas fa-check-double text-gray-400 text-xs" title="تم التسليم"></i>
                    `;
                }
            }
        }
        
    } catch (error) {
        console.error('[CHAT] Error marking messages as delivered:', error);
    }
}
        

// --- 📥 دالة تحميل بيانات المستخدم للدردشة ---
async function loadChatUserData(userId) {
    try {
        const response = await fetch(`/api/users/${userId}/mini-profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.status === 'success') {
                const user = result.data;
                
                const avatar = document.getElementById('chat-user-avatar');
                const name = document.getElementById('chat-user-name');
                
                if (avatar) {
                    avatar.src = user.profileImage;
                    applyFrameToAvatar(avatar, user.activeFrameClass);
                }
                if (name) name.innerHTML = `${user.username} ${getAgentBadgeIconHTML(user.isAgent)}`;
            }
        }
    } catch (error) {
        console.error('[CHAT] Error loading user data:', error);
    }
}

// --- 📜 دالة تحميل تاريخ المحادثة ---
async function loadChatHistory(targetUserId) {
    const messagesContainer = document.getElementById('private-chat-messages');
    if (!messagesContainer) return;
    
    // TODO: جلب الرسائل من API
    // سيتم تنفيذها لاحقاً عند بناء الخادم
}

// --- 🎮 دالة إعداد أحداث الدردشة ---
function setupPrivateChatEvents(targetUserId) {
    const chatModal = document.getElementById('private-chat-modal');
    if (!chatModal) return;
    
    // 1. زر الإغلاق
    const closeBtn = document.getElementById('close-private-chat');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            chatModal.remove();
        });
    }
    
    // 2. إغلاق بالنقر على الخلفية
    chatModal.addEventListener('click', (e) => {
        if (e.target.id === 'private-chat-modal') {
            chatModal.remove();
        }
    });
    
    // 3. عداد الأحرف
    const messageInput = document.getElementById('private-message-input');
    const charCounter = document.getElementById('private-char-count');
    
    if (messageInput && charCounter) {
        messageInput.addEventListener('input', () => {
            const length = messageInput.value.length;
            charCounter.textContent = `${length}/200`;
            
            if (length > 180) {
                charCounter.classList.add('text-red-400');
            } else {
                charCounter.classList.remove('text-red-400');
            }
        });
    }


    // تحديث زر الإرسال بناءً على حالة حقل النص
function updateSendButton() {
    const sendBtn = document.getElementById('send-private-message');
    if (messageInput.value.trim() === '') {
        // حالة فارغة: زر تسجيل صوتي
        sendBtn.innerHTML = '<i class="fas fa-microphone text-white"></i>';
        sendBtn.dataset.mode = 'voice';
        sendBtn.title = 'تسجيل صوتي (اضغط مع الاستمرار)';
    } else {
        // حالة بها نص: زر إرسال
        sendBtn.innerHTML = '<i class="fas fa-paper-plane text-white"></i>';
        sendBtn.dataset.mode = 'text';
        sendBtn.title = 'إرسال الرسالة';
    }
}

// استدعاء الدالة عند التحميل أولاً
updateSendButton();

// تحديث الزر عند كتابة/مسح النص
messageInput.addEventListener('input', updateSendButton);
    

// 4. زر الإرسال (ديناميكي)
const sendBtn = document.getElementById('send-private-message');
if (sendBtn && messageInput) {
    sendBtn.removeEventListener('click', sendBtn.clickHandler);

    sendBtn.clickHandler = () => {
        if (sendBtn.dataset.mode === 'voice') {
            startWhatsAppStyleRecording(targetUserId);
        } else {
            // ✅ الإصلاح: تمرير معرف الرسالة المردود عليها
            const replyId = replyingToPrivateMessage ? replyingToPrivateMessage._id : null;
            sendPrivateMessage(targetUserId, messageInput.value.trim(), replyId);
            messageInput.value = '';
            if (charCounter) charCounter.textContent = '0/200';
            updateSendButton();
        }
    };

    sendBtn.addEventListener('click', sendBtn.clickHandler);
}

    // 5. إرسال بـ Enter
if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (sendBtn.dataset.mode === 'text') {
                // ✅ الإصلاح: تمرير معرف الرسالة المردود عليها هنا أيضاً
                const replyId = replyingToPrivateMessage ? replyingToPrivateMessage._id : null;
                sendPrivateMessage(targetUserId, messageInput.value.trim(), replyId);
                messageInput.value = '';
                if (charCounter) charCounter.textContent = '0/200';
                updateSendButton();
            }
        }
    });
}
    
    // 6. زر فتح الخيارات
    const toggleBtn = document.getElementById('toggle-chat-options');
    const optionsBar = document.getElementById('chat-options-bar');
    
    if (toggleBtn && optionsBar) {
        toggleBtn.addEventListener('click', () => {
            optionsBar.classList.toggle('hidden');
            toggleBtn.querySelector('i').classList.toggle('fa-plus');
            toggleBtn.querySelector('i').classList.toggle('fa-times');
        });
    }

    // 8. زر معلومات المستخدم (فتح الملف الشخصي)
    const infoBtn = document.getElementById('chat-info-btn');
    if (infoBtn) {
        infoBtn.addEventListener('click', () => {
            showMiniProfileModal(targetUserId);
        });
    }

    // 9. زر مكالمة صوتية (الميزة غير متوفرة حالياً - نعرض ذلك بصراحة بدل زر بلا وظيفة)
    const callBtn = document.getElementById('chat-call-btn');
    if (callBtn) {
        callBtn.addEventListener('click', () => {
            showNotification('ميزة المكالمات الصوتية غير متوفرة حالياً', 'info');
        });
    }

    // 10. زر الإجراءات (قائمة منسدلة: عرض الملف / حظر / فك حظر)
    const actionsBtn = document.getElementById('chat-actions-btn');
    if (actionsBtn) {
        actionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleChatActionsMenu(actionsBtn, targetUserId);
        });
    }
        // 11. زر الهدايا المدمج بشريط الكتابة
    const inlineGiftBtn = document.getElementById('open-inline-gift-btn');
    if (inlineGiftBtn) {
        inlineGiftBtn.addEventListener('click', () => {
            const chatUserName = document.getElementById('chat-user-name')?.textContent?.trim() || 'المستخدم';
            showGiftStoreModal(targetUserId, chatUserName);
        });
    }
    
    // 7. أزرار الوسائط
    document.querySelectorAll('.chat-media-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.dataset.type;
            handleMediaButtonClick(type, targetUserId);
        });
    });
}


// --- 📋 قائمة إجراءات الدردشة الخاصة (منسدلة) ---
function toggleChatActionsMenu(anchorBtn, targetUserId) {
    const existing = document.getElementById('chat-actions-dropdown');
    if (existing) {
        existing.remove();
        return;
    }

    const selfUserData = JSON.parse(localStorage.getItem('user'));
    const blockedUsersIds = (selfUserData?.blockedUsers || []).map(item => 
        item._id ? item._id.toString() : item.toString()
    );
    const isBlockedByMe = blockedUsersIds.includes(targetUserId.toString());

    const rect = anchorBtn.getBoundingClientRect();

    const menuHTML = `
        <div id="chat-actions-dropdown" class="fixed bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-48 z-[310] overflow-hidden"
             style="top: ${rect.bottom + 8}px; left: ${Math.max(rect.left - 140, 8)}px;">
            <button id="chat-menu-view-profile" class="w-full text-right px-4 py-3 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2">
                <i class="fas fa-user text-purple-400"></i> عرض الملف الشخصي
            </button>
            <button id="chat-menu-block-toggle" class="w-full text-right px-4 py-3 text-sm ${isBlockedByMe ? 'text-green-400' : 'text-red-400'} hover:bg-gray-700 flex items-center gap-2 border-t border-gray-700">
                <i class="fas ${isBlockedByMe ? 'fa-unlock' : 'fa-ban'}"></i> ${isBlockedByMe ? 'فك الحظر' : 'حظر المستخدم'}
            </button>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', menuHTML);
    const menu = document.getElementById('chat-actions-dropdown');

    document.getElementById('chat-menu-view-profile').addEventListener('click', () => {
        menu.remove();
        showMiniProfileModal(targetUserId);
    });

    document.getElementById('chat-menu-block-toggle').addEventListener('click', () => {
        menu.remove();
        if (isBlockedByMe) {
            unblockUser(targetUserId, null);
        } else {
            blockUser(targetUserId, null);
        }
    });

    // إغلاق القائمة عند النقر خارجها
    setTimeout(() => {
        document.addEventListener('click', function closeMenuOnce(e) {
            if (!menu.contains(e.target) && e.target !== anchorBtn) {
                menu.remove();
                document.removeEventListener('click', closeMenuOnce);
            }
        });
    }, 0);
}

        
// --- 🎮 دالة معالجة أزرار الوسائط ---
function handleMediaButtonClick(type, targetUserId) {
    console.log(`[CHAT] Media button clicked: ${type} for user ${targetUserId}`);
    
    switch(type) {
        case 'image':
            showImageUploadModal(targetUserId);
            break;
        case 'video':
            // ✅ الإصلاح: تفعيل نافذة رفع الفيديو الفعلية بدل رسالة "قريباً"
            showVideoUploadModal(targetUserId);
            break;
        case 'voice':
           startWhatsAppStyleRecording(targetUserId);
            break;
        case 'file':
            showNotification('إرسال الملفات قريباً...', 'info');
            break;
    }
}



    
    
 // =================================================
// 🎤 دالة تسجيل الصوت بنظام مبسط (بدون سحب)
// =================================================
function startWhatsAppStyleRecording(targetUserId) {
    console.log(`[VOICE] Starting simplified recording for: ${targetUserId}`);
    
    if (window.isRecordingActive) {
        console.log('[VOICE] Recording already in progress');
        return;
    }
    
    const chatModal = document.getElementById('private-chat-modal');
    if (!chatModal) {
        console.error('[VOICE] Chat modal not found');
        return;
    }
    
    const originalInput = document.getElementById('private-message-input');
    const originalSendBtn = document.getElementById('send-private-message');
    const originalCharCounter = document.getElementById('private-char-count');
    
    if (!originalInput || !originalSendBtn) {
        console.error('[VOICE] Required elements not found');
        return;
    }
    
    window.isRecordingActive = true;
    
    originalInput.style.display = 'none';
    if (originalCharCounter) originalCharCounter.style.display = 'none';
    
    const recordingUI = document.createElement('div');
    recordingUI.id = 'voice-recording-ui';
    recordingUI.className = 'flex items-center justify-between w-full bg-gray-800 rounded-full px-6 py-4 shadow-lg border-2 border-purple-600';
    recordingUI.innerHTML = `
        <div class="flex items-center gap-4">
            <div id="recording-indicator" class="relative">
                <div class="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                    <i class="fas fa-microphone text-white"></i>
                </div>
                <div class="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full border-2 border-gray-800"></div>
            </div>
            
            <div class="flex flex-col">
                <p id="recording-status" class="text-sm font-bold text-white">جاري التسجيل...</p>
                <p id="recording-timer" class="text-xs text-gray-300">00:00</p>
                <p class="text-xs text-gray-400 mt-1">الحد الأقصى: 15 ثانية</p>
            </div>
        </div>
        
        <div class="flex items-center gap-4">
            <button id="cancel-recording" 
                    class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-red-600 text-white rounded-full transition-all duration-300">
                <i class="fas fa-times"></i>
                <span class="text-sm">إلغاء</span>
            </button>
            
            <button id="send-recording" 
                    class="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-full transition-all duration-300 hidden">
                <i class="fas fa-paper-plane"></i>
                <span class="text-sm">إرسال</span>
            </button>
            
            <button id="stop-recording" 
                    class="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full transition-all duration-300">
                <i class="fas fa-stop"></i>
                <span class="text-sm">توقف</span>
            </button>
        </div>
    `;
    
    originalInput.parentNode.insertBefore(recordingUI, originalInput.nextSibling);
    
    let mediaRecorder = null;
    let mediaStream = null; // ✅ جديد: نحتفظ بالـ stream نفسه للتحكم بإطفاء المايك يدوياً
    let audioChunks = [];
    let isRecording = true;
    let recordingStartTime = null;
    let recordingTimer = null;
    let recordingDuration = 0;
    
    const recordingIndicator = document.getElementById('recording-indicator');
    const recordingTimerElement = document.getElementById('recording-timer');
    const recordingStatus = document.getElementById('recording-status');
    const cancelBtn = document.getElementById('cancel-recording');
    const sendBtn = document.getElementById('send-recording');
    const stopBtn = document.getElementById('stop-recording');
    
    startRecording();
    
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            mediaStream = stream; // ✅ نحفظ المرجع
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            mediaRecorder.start();
            recordingStartTime = Date.now();
            startTimer();
            
        } catch (error) {
            console.error('[VOICE] Error starting recording:', error);
            showNotification('فشل الوصول إلى الميكروفون', 'error');
            cleanupRecordingUI();
        }
    }
    
    function startTimer() {
        recordingTimer = setInterval(() => {
            recordingDuration = Math.floor((Date.now() - recordingStartTime) / 1000);
            
            const minutes = Math.floor(recordingDuration / 60).toString().padStart(2, '0');
            const seconds = (recordingDuration % 60).toString().padStart(2, '0');
            recordingTimerElement.textContent = `${minutes}:${seconds}`;
            
            if (recordingDuration >= 13) {
                recordingTimerElement.classList.add('text-red-400', 'font-bold');
            }
            
            if (recordingDuration >= 15) {
                stopRecording();
                showNotification('تم الوصول للحد الأقصى (15 ثانية)', 'info');
            }
            
        }, 1000);
    }
    
    // ✅ الإصلاح الأساسي: إطفاء المايك فوراً عند الضغط على "توقف" — مو بعد الإرسال
    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            
            if (recordingTimer) {
                clearInterval(recordingTimer);
                recordingTimer = null;
            }

            // ✅ إطفاء المايك مباشرة هنا — هذا هو سبب بقاء أيقونة "استخدام المايك" شغالة سابقاً
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
                mediaStream = null;
            }
            
            recordingIndicator.classList.remove('animate-pulse');
            recordingStatus.textContent = 'تم التسجيل ✓';
            recordingStatus.classList.add('text-green-400');
            
            stopBtn.classList.add('hidden');
            sendBtn.classList.remove('hidden');
        }
    }
    
    function cancelRecording() {
        if (mediaRecorder) {
            if (isRecording) mediaRecorder.stop();
            isRecording = false;
            
            if (recordingTimer) {
                clearInterval(recordingTimer);
                recordingTimer = null;
            }

            // ✅ إطفاء المايك عند الإلغاء أيضاً
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
                mediaStream = null;
            }
            
            showNotification('تم إلغاء التسجيل', 'info');
            cleanupRecordingUI();
        }
    }
    
    // ✅ الإصلاح الثاني: نغلق واجهة التسجيل فوراً عند الضغط على إرسال (إحساس سريع)
    // ثم يرفع الصوت بالخلفية ويظهر كفقاعة "جاري الإرسال" داخل الدردشة مباشرة
    function sendRecording() {
        if (audioChunks.length === 0) {
            showNotification('لا يوجد تسجيل لإرساله', 'error');
            return;
        }
        
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const finalDuration = recordingDuration;

        // إغلاق فوري لواجهة التسجيل — لا ننتظر اكتمال الرفع
        cleanupRecordingUI();

        // الرفع والإرسال يحدثان بالخلفية مع فقاعة متفائلة فورية بالدردشة
        sendVoiceMessage(audioBlob, finalDuration, targetUserId);
    }
    
    function cleanupRecordingUI() {
        console.log('[VOICE] Cleaning up recording UI');
        
        if (recordingUI && recordingUI.parentNode) {
            recordingUI.remove();
        }
        
        if (originalInput) {
            originalInput.style.display = '';
            originalInput.value = '';
            originalInput.focus();
        }
        
        if (originalCharCounter) {
            originalCharCounter.style.display = '';
            originalCharCounter.textContent = '0/200';
        }
        
        if (originalSendBtn) {
            originalSendBtn.removeEventListener('click', originalSendBtn.clickHandler);
            originalSendBtn.innerHTML = '<i class="fas fa-microphone text-white"></i>';
            originalSendBtn.dataset.mode = 'voice';
            originalSendBtn.title = 'تسجيل صوتي';
            originalSendBtn.classList.remove('bg-red-600', 'bg-green-600');
            originalSendBtn.classList.add('bg-purple-600');
            originalSendBtn.clickHandler = function() {
                if (this.dataset.mode === 'voice') {
                    startWhatsAppStyleRecording(targetUserId);
                } else {
                    const input = document.getElementById('private-message-input');
                    if (input) {
                        sendPrivateMessage(targetUserId, input.value.trim());
                        input.value = '';
                        const counter = document.getElementById('private-char-count');
                        if (counter) counter.textContent = '0/200';
                        updateSendButton();
                    }
                }
            };
            originalSendBtn.addEventListener('click', originalSendBtn.clickHandler);
        }
        
        window.isRecordingActive = false;
        console.log('[VOICE] isRecordingActive set to false');
    }
    
    if (cancelBtn) cancelBtn.addEventListener('click', cancelRecording);
    if (sendBtn) sendBtn.addEventListener('click', sendRecording);
    if (stopBtn) stopBtn.addEventListener('click', stopRecording);
}
        

   // --- 🖼️ دالة عرض نافذة رفع الصور ---
function showImageUploadModal(targetUserId) {
    console.log(`[IMAGE UPLOAD] Opening for user: ${targetUserId}`);

    const optionsBar = document.getElementById('chat-options-bar');
    if (optionsBar) optionsBar.classList.add('hidden');

    const modalHTML = `
        <div id="image-upload-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[350] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white border border-gray-700">

                <div class="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 class="text-lg font-bold"><i class="fas fa-image mr-2 text-green-400"></i>إرسال صورة</h3>
                    <button class="close-image-modal text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                </div>

                <div class="p-4">
                    <div id="drop-zone" class="border-2 border-dashed border-gray-600 rounded-xl p-4 text-center cursor-pointer hover:border-green-500 transition-colors bg-gray-900/50 mb-4">
                        <div id="upload-area-content">
                            <i class="fas fa-cloud-upload-alt text-3xl text-gray-500 mb-2"></i>
                            <p class="font-medium text-sm mb-1">اسحب وأفلت الصورة هنا</p>
                            <p class="text-xs text-gray-400">(حد أقصى 5MB)</p>
                        </div>
                        <div id="image-preview" class="hidden">
                            <img id="preview-image" class="max-w-full max-h-32 rounded-lg mx-auto">
                            <div class="text-xs text-gray-400 mt-2 flex justify-between">
                                <span id="file-name" class="truncate"></span>
                                <span id="file-size"></span>
                            </div>
                        </div>
                        <div id="upload-progress" class="hidden mt-3">
                            <div class="flex justify-between text-xs mb-1">
                                <span>جاري الرفع...</span>
                                <span id="progress-percent">0%</span>
                            </div>
                            <div class="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                                <div id="progress-bar" class="bg-green-500 h-1.5 rounded-full transition-all" style="width:0%"></div>
                            </div>
                        </div>
                        <input type="file" id="image-file-input" class="hidden" accept="image/*">
                    </div>

                    <div class="bg-gray-900/30 p-3 rounded-xl mb-4">
                        <h4 class="font-bold text-sm mb-2 flex items-center gap-2"><i class="fas fa-shield-alt text-blue-400"></i>خيارات الحماية</h4>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 p-1 rounded">
                                <input type="checkbox" id="view-once" class="w-4 h-4"> مشاهدة مرة واحدة
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 p-1 rounded">
                                <input type="checkbox" id="disable-save" class="w-4 h-4"> منع الحفظ
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 p-1 rounded">
                                <input type="checkbox" id="add-watermark" class="w-4 h-4"> علامة مائية
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 p-1 rounded">
                                <input type="checkbox" id="disable-reply" class="w-4 h-4"> منع الرد
                            </label>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        <button id="cancel-image-upload" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm transition">إلغاء</button>
                        <button id="send-image-button" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm transition disabled:opacity-50" disabled>إرسال</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // ✅ الإصلاح الجوهري: insertAdjacentHTML لا يهدم عناصر الدردشة الخاصة الموجودة أصلاً
    document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);
    setupImageUploadEvents(targetUserId);
}

      function bindPrivateMessageEvents(messageElement, message) {
    const viewBtn = messageElement.querySelector('.view-image-btn');
    if (viewBtn) {
        viewBtn.addEventListener('click', () => {
            showFullImage(viewBtn.dataset.imageUrl, message);
        });
    }

    const viewOnceBtn = messageElement.querySelector('.view-once-image-btn');
    if (viewOnceBtn) {
        viewOnceBtn.addEventListener('click', function() {
            const imgUrl = this.dataset.imageUrl;
            const msgId = this.dataset.messageId;
            openViewOnceImage(msgId, imgUrl, messageElement);
        });
    }

    // ✅ جديد: زر مشاهدة الفيديو مرة واحدة
    const viewOnceVideoBtn = messageElement.querySelector('.view-once-video-btn');
    if (viewOnceVideoBtn) {
        viewOnceVideoBtn.addEventListener('click', function() {
            const videoUrl = this.dataset.videoUrl;
            const msgId = this.dataset.messageId;
            openViewOnceVideo(msgId, videoUrl, messageElement);
        });
    }

    const voiceBtn = messageElement.querySelector('.play-voice-btn');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => {
            playVoiceMessage(voiceBtn.dataset.voiceUrl, messageElement);
        });
    }

    const videoBtn = messageElement.querySelector('.play-video-btn');
    if (videoBtn) {
        videoBtn.addEventListener('click', () => {
            showVideoPlayer(videoBtn.dataset.videoUrl, message);
        });
    }

    const replyBtn = messageElement.querySelector('.reply-private-btn');
    if (replyBtn) {
        replyBtn.addEventListener('click', () => {
            const msgId = replyBtn.dataset.messageId;
            showReplyPrivateBar(msgId, message);
        });
    }
}

// --- 🎮 دالة إعداد أحداث رفع الصور ---
function setupImageUploadEvents(targetUserId) {
    const modal = document.getElementById('image-upload-modal');
    if (!modal) return;

    let selectedFile = null;
    let uploadInProgress = false;

    // ✅ دالة الإغلاق مع التنظيف الكامل
    function cleanupAndClose() {
        if (uploadInProgress) {
            showNotification('انتظر اكتمال الرفع', 'warning');
            return;
        }
        
        // إزالة النافذة
        if (modal && modal.parentNode) {
            modal.remove();
        }
        
        // إعادة تمكين الدردشة
        const chatInput = document.getElementById('private-message-input');
        if (chatInput) chatInput.disabled = false;
        
        const sendBtn = document.getElementById('send-private-message');
        if (sendBtn) sendBtn.disabled = false;
        
        // إزالة أي ظل أو حظر
        document.body.style.overflow = '';
    }

    // 1. أزرار الإغلاق
    const closeBtn = modal.querySelector('.close-image-modal');
    const cancelBtn = modal.querySelector('#cancel-image-upload');

    if (closeBtn) closeBtn.addEventListener('click', cleanupAndClose);
    if (cancelBtn) cancelBtn.addEventListener('click', cleanupAndClose);

    // 2. إغلاق بالنقر على الخلفية
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'image-upload-modal') {
            cleanupAndClose();
        }
    });

    // 3. اختيار ملف
    const fileInput = modal.querySelector('#image-file-input');
    const dropZone = modal.querySelector('#drop-zone');
    const sendButton = modal.querySelector('#send-image-button');

    if (dropZone) {
        dropZone.addEventListener('click', () => {
            if (!uploadInProgress && fileInput) fileInput.click();
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!uploadInProgress) dropZone.classList.add('border-green-500', 'bg-gray-800/50');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-green-500', 'bg-gray-800/50');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-green-500', 'bg-gray-800/50');
            if (!uploadInProgress && e.dataTransfer.files.length > 0) {
                handleFileSelection(e.dataTransfer.files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelection(e.target.files[0]);
            }
            fileInput.value = '';
        });
    }

    function handleFileSelection(file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showNotification('نوع الملف غير مدعوم', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showNotification('حجم الصورة يتجاوز 5MB', 'error');
            return;
        }

        selectedFile = file;

        const previewImage = modal.querySelector('#preview-image');
        const fileName = modal.querySelector('#file-name');
        const fileSize = modal.querySelector('#file-size');
        const uploadArea = modal.querySelector('#upload-area-content');
        const imagePreview = modal.querySelector('#image-preview');

        if (uploadArea) uploadArea.classList.add('hidden');
        if (imagePreview) imagePreview.classList.remove('hidden');

        const reader = new FileReader();
        reader.onload = (e) => {
            if (previewImage) previewImage.src = e.target.result;
        };
        reader.readAsDataURL(file);

        if (fileName) fileName.textContent = file.name;
        if (fileSize) fileSize.textContent = formatFileSize(file.size);

        if (sendButton) {
            sendButton.disabled = false;
        }
    }

    // 4. زر الإرسال
    if (sendButton) {
        sendButton.addEventListener('click', async () => {
            if (!selectedFile || uploadInProgress) return;
            await uploadAndSendImage(selectedFile, targetUserId, modal);
        });
    }

    // 5. تعطيل الدردشة مؤقتاً أثناء رفع الصورة
    const chatInput = document.getElementById('private-message-input');
    if (chatInput) chatInput.disabled = true;
    
    const sendChatBtn = document.getElementById('send-private-message');
    if (sendChatBtn) sendChatBtn.disabled = true;
}


        


    let replyingToPrivateMessage = null;

function showReplyPrivateBar(messageId, message) {
    replyingToPrivateMessage = message;

    const chatModal = document.getElementById('private-chat-modal');
    if (!chatModal) return;

    let replyBar = document.getElementById('reply-private-bar');
    if (!replyBar) {
        replyBar = document.createElement('div');
        replyBar.id = 'reply-private-bar';
        replyBar.className = 'p-2 bg-gray-600 rounded-t-lg text-sm flex justify-between items-center mx-3';
        // ✅ الإصلاح: نبحث عن شريط الإدخال داخل نافذة الدردشة الخاصة نفسها فقط
        const inputArea = chatModal.querySelector('.p-3.border-t');
        if (inputArea && inputArea.parentNode) {
            inputArea.parentNode.insertBefore(replyBar, inputArea);
        }
    }

    replyBar.innerHTML = `
        <span>الرد على <strong>${message.sender?.username || 'مستخدم'}</strong></span>
        <button id="cancel-private-reply" class="text-red-400 hover:text-red-600">&times;</button>
    `;

    document.getElementById('cancel-private-reply').addEventListener('click', () => {
        replyingToPrivateMessage = null;
        replyBar.remove();
    });
}


        // --- 🎬 دالة عرض نافذة رفع الفيديو ---
function showVideoUploadModal(targetUserId) {
    console.log(`[VIDEO UPLOAD] Opening for user: ${targetUserId}`);

    const optionsBar = document.getElementById('chat-options-bar');
    if (optionsBar) optionsBar.classList.add('hidden');

    const modalHTML = `
        <div id="video-upload-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[350] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white border border-gray-700">

                <div class="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 class="text-lg font-bold"><i class="fas fa-video mr-2 text-blue-400"></i>إرسال فيديو</h3>
                    <button class="close-video-modal text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                </div>

                <div class="p-4">
                    <div id="video-drop-zone" class="border-2 border-dashed border-gray-600 rounded-xl p-4 text-center cursor-pointer hover:border-blue-500 transition-colors bg-gray-900/50 mb-4">
                        <div id="video-upload-area-content">
                            <i class="fas fa-file-video text-3xl text-gray-500 mb-2"></i>
                            <p class="font-medium text-sm mb-1">اسحب وأفلت الفيديو هنا</p>
                            <p class="text-xs text-gray-400">(حد أقصى 30 ثانية - 10MB)</p>
                        </div>
                        <div id="video-preview" class="hidden">
                            <video id="preview-video" class="max-w-full max-h-32 rounded-lg mx-auto" controls></video>
                            <div class="text-xs text-gray-400 mt-2 flex justify-between">
                                <span id="video-file-name" class="truncate"></span>
                                <span id="video-file-size"></span>
                            </div>
                        </div>
                        <div id="video-upload-progress" class="hidden mt-3">
                            <div class="flex justify-between text-xs mb-1">
                                <span>جاري الرفع...</span>
                                <span id="video-progress-percent">0%</span>
                            </div>
                            <div class="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                                <div id="video-progress-bar" class="bg-blue-500 h-1.5 rounded-full transition-all" style="width:0%"></div>
                            </div>
                        </div>
                        <input type="file" id="video-file-input" class="hidden" accept="video/mp4,video/webm">
                    </div>

                    <div class="bg-gray-900/30 p-3 rounded-xl mb-4">
                        <h4 class="font-bold text-sm mb-2 flex items-center gap-2"><i class="fas fa-shield-alt text-blue-400"></i>خيارات الخصوصية</h4>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 p-1 rounded">
                                <input type="checkbox" id="video-view-once" class="w-4 h-4"> مشاهدة مرة واحدة
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 p-1 rounded">
                                <input type="checkbox" id="video-disable-save" class="w-4 h-4"> منع الحفظ
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 p-1 rounded">
                                <input type="checkbox" id="video-add-watermark" class="w-4 h-4"> علامة مائية
                            </label>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        <button id="cancel-video-upload" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm transition">إلغاء</button>
                        <button id="send-video-button" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm transition disabled:opacity-50" disabled>إرسال</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);
    setupVideoUploadEvents(targetUserId);
}

// --- 🎮 دالة إعداد أحداث رفع الفيديو ---
function setupVideoUploadEvents(targetUserId) {
    const modal = document.getElementById('video-upload-modal');
    if (!modal) return;

    let selectedFile = null;
    let uploadInProgress = false;

    function cleanupAndClose() {
        if (uploadInProgress) {
            showNotification('انتظر اكتمال الرفع', 'warning');
            return;
        }
        if (modal && modal.parentNode) modal.remove();

        const chatInput = document.getElementById('private-message-input');
        if (chatInput) chatInput.disabled = false;
        const sendBtn = document.getElementById('send-private-message');
        if (sendBtn) sendBtn.disabled = false;
    }

    const closeBtn = modal.querySelector('.close-video-modal');
    const cancelBtn = modal.querySelector('#cancel-video-upload');
    if (closeBtn) closeBtn.addEventListener('click', cleanupAndClose);
    if (cancelBtn) cancelBtn.addEventListener('click', cleanupAndClose);

    modal.addEventListener('click', (e) => {
        if (e.target.id === 'video-upload-modal') cleanupAndClose();
    });

    const fileInput = modal.querySelector('#video-file-input');
    const dropZone = modal.querySelector('#video-drop-zone');
    const sendButton = modal.querySelector('#send-video-button');

    if (dropZone) {
        dropZone.addEventListener('click', () => {
            if (!uploadInProgress && fileInput) fileInput.click();
        });
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!uploadInProgress) dropZone.classList.add('border-blue-500', 'bg-gray-800/50');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-blue-500', 'bg-gray-800/50');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-blue-500', 'bg-gray-800/50');
            if (!uploadInProgress && e.dataTransfer.files.length > 0) {
                handleVideoSelection(e.dataTransfer.files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleVideoSelection(e.target.files[0]);
            fileInput.value = '';
        });
    }

    function handleVideoSelection(file) {
        const validTypes = ['video/mp4', 'video/webm'];
        if (!validTypes.includes(file.type)) {
            showNotification('نوع الفيديو غير مدعوم (mp4 أو webm فقط)', 'error');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            showNotification('حجم الفيديو يتجاوز 10MB', 'error');
            return;
        }

        // التحقق من المدة قبل الرفع
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.onloadedmetadata = () => {
            window.URL.revokeObjectURL(tempVideo.src);
            if (tempVideo.duration > 30) {
                showNotification('مدة الفيديو تتجاوز 30 ثانية', 'error');
                return;
            }

            selectedFile = file;
            selectedFile._duration = Math.round(tempVideo.duration);

            const previewVideo = modal.querySelector('#preview-video');
            const fileName = modal.querySelector('#video-file-name');
            const fileSize = modal.querySelector('#video-file-size');
            const uploadArea = modal.querySelector('#video-upload-area-content');
            const videoPreview = modal.querySelector('#video-preview');

            if (uploadArea) uploadArea.classList.add('hidden');
            if (videoPreview) videoPreview.classList.remove('hidden');
            if (previewVideo) previewVideo.src = URL.createObjectURL(file);
            if (fileName) fileName.textContent = file.name;
            if (fileSize) fileSize.textContent = formatFileSize(file.size);
            if (sendButton) sendButton.disabled = false;
        };
        tempVideo.src = URL.createObjectURL(file);
    }

    if (sendButton) {
        sendButton.addEventListener('click', async () => {
            if (!selectedFile || uploadInProgress) return;
            await uploadAndSendVideo(selectedFile, targetUserId, modal);
        });
    }

    const chatInput = document.getElementById('private-message-input');
    if (chatInput) chatInput.disabled = true;
    const sendChatBtn = document.getElementById('send-private-message');
    if (sendChatBtn) sendChatBtn.disabled = true;

    // نستخدم متغير uploadInProgress من نطاق الدالة الخارجية عبر uploadAndSendVideo
    modal._setUploadInProgress = (val) => { uploadInProgress = val; };
}

// --- 📤 دالة رفع وإرسال الفيديو ---
async function uploadAndSendVideo(file, targetUserId, modal) {
    const sendButton = modal.querySelector('#send-video-button');
    const progressBar = modal.querySelector('#video-progress-bar');
    const progressPercent = modal.querySelector('#video-progress-percent');
    const uploadProgress = modal.querySelector('#video-upload-progress');
    const dropZone = modal.querySelector('#video-drop-zone');

    const viewOnce = modal.querySelector('#video-view-once').checked;
    const disableSave = modal.querySelector('#video-disable-save').checked;
    const addWatermark = modal.querySelector('#video-add-watermark').checked;

    function reEnablePrivateChat() {
        const chatInput = document.getElementById('private-message-input');
        if (chatInput) chatInput.disabled = false;
        const sendChatBtn = document.getElementById('send-private-message');
        if (sendChatBtn) sendChatBtn.disabled = false;
    }

    try {
        if (modal._setUploadInProgress) modal._setUploadInProgress(true);
        if (sendButton) sendButton.disabled = true;
        if (dropZone) dropZone.style.pointerEvents = 'none';
        if (uploadProgress) uploadProgress.classList.remove('hidden');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('receiverId', targetUserId);
        formData.append('duration', (file._duration || 0).toString());
        formData.append('metadata', JSON.stringify({
            disableSave: disableSave,
            hasWatermark: addWatermark
        }));

        simulateUploadProgress(progressBar, progressPercent, 3000);

        const response = await fetch('/api/chat-media/video', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            const metadata = {
                thumbnail: result.data.thumbnail,
                publicId: result.data.publicId,
                fileSize: result.data.bytes,
                format: result.data.format,
                duration: result.data.duration,
                viewOnce: viewOnce,
                disableSave: disableSave,
                hasWatermark: addWatermark
            };

            await sendPrivateMessage(targetUserId, result.data.url, null, 'video', metadata);

            reEnablePrivateChat();
            modal.remove();
            showNotification('تم إرسال الفيديو بنجاح', 'success');

        } else {
            throw new Error(result.message || 'فشل رفع الفيديو');
        }

    } catch (error) {
        console.error('[VIDEO UPLOAD] Error:', error);
        showNotification(error.message || 'فشل رفع الفيديو', 'error');

        const sendButtonRetry = modal.querySelector('#send-video-button');
        const uploadProgressRetry = modal.querySelector('#video-upload-progress');
        if (sendButtonRetry) sendButtonRetry.disabled = false;
        if (uploadProgressRetry) uploadProgressRetry.classList.add('hidden');

        reEnablePrivateChat();

    } finally {
        if (modal._setUploadInProgress) modal._setUploadInProgress(false);
        const dropZoneRetry = modal.querySelector('#video-drop-zone');
        if (dropZoneRetry) dropZoneRetry.style.pointerEvents = 'auto';
    }
}
    

        

// --- 📤 دالة إرسال الرسالة الصوتية (متفائلة وسريعة) ---
async function sendVoiceMessage(audioBlob, duration, targetUserId) {
    console.log(`[VOICE] Sending voice message: ${duration}s, ${audioBlob.size} bytes`);
    
    if (duration > 15) {
        showNotification('مدة التسجيل تتجاوز 15 ثانية', 'error');
        return;
    }
    
    if (duration < 1) {
        showNotification('التسجيل قصير جداً', 'error');
        return;
    }

    const tempId = 'voice-temp-' + Date.now();
    const currentUserId = JSON.parse(localStorage.getItem('user'))._id;

    // ✅ الإصلاح: نعرض فقاعة "جاري الإرسال" فوراً بمجرد الضغط على إرسال
    // بدل انتظار اكتمال الرفع بالكامل قبل ظهور أي شيء بالمحادثة
    displayPrivateMessage({
        _id: tempId,
        sender: currentUserId,
        receiver: targetUserId,
        type: 'voice',
        content: '',
        metadata: { duration: duration, uploading: true },
        createdAt: new Date().toISOString(),
        status: { sent: false, delivered: false, seen: false }
    }, true);
    
    try {
        const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, {
            type: 'audio/webm'
        });
        
        const formData = new FormData();
        formData.append('file', audioFile);
        formData.append('receiverId', targetUserId);
        formData.append('duration', duration.toString());
        
        const uploadResponse = await fetch('/api/chat-media/voice', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const uploadResult = await uploadResponse.json();

        if (!uploadResponse.ok) {
            throw new Error(uploadResult.message || 'فشل رفع الرسالة الصوتية');
        }

        const metadata = {
            duration: duration,
            publicId: uploadResult.data.publicId,
            fileSize: uploadResult.data.bytes,
            format: uploadResult.data.format
        };

        const sendResponse = await fetch('/api/private-chat/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                receiverId: targetUserId,
                content: uploadResult.data.url,
                type: 'voice',
                metadata: metadata
            })
        });

        const sendResult = await sendResponse.json();
        const tempElement = document.querySelector(`[data-message-id="${tempId}"]`);

        if (sendResponse.ok) {
            // ✅ نستبدل الفقاعة المؤقتة بالفقاعة الحقيقية القابلة للتشغيل
            if (tempElement) tempElement.remove();
            displayPrivateMessage(sendResult.data.message, true);
            updateUnreadCount(targetUserId, sendResult.data.unreadCount || 0);
        } else {
            if (tempElement) tempElement.remove();
            showNotification(sendResult.message || 'فشل إرسال الرسالة الصوتية', 'error');
        }
        
    } catch (error) {
        console.error('[VOICE UPLOAD] Error:', error);
        const tempElement = document.querySelector(`[data-message-id="${tempId}"]`);
        if (tempElement) tempElement.remove();
        showNotification(error.message || 'فشل إرسال الرسالة الصوتية', 'error');
    }
}

  // --- 🔊 دالة تشغيل الرسائل الصوتية ---
async function playVoiceMessage(audioUrl, messageElement) {
    console.log('[CHAT] 🎵 Playing voice message:', audioUrl);
    
    const playBtn = messageElement.querySelector('.play-voice-btn');
    const progressBar = messageElement.querySelector('.voice-progress');
    
    if (!playBtn || !progressBar) {
        console.error('[CHAT] ❌ Play button or progress bar not found');
        return;
    }
    
    try {
        // إذا كان الصوت مشغلاً بالفعل، أوقفه
        if (playBtn.classList.contains('playing')) {
            console.log('[CHAT] ⏸️ Stopping current audio');
            playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
            playBtn.classList.remove('playing');
            progressBar.style.width = '0%';
            
            if (window.currentAudio) {
                window.currentAudio.pause();
                window.currentAudio.currentTime = 0;
                window.currentAudio = null;
            }
            return;
        }
        
        // ✅ إيقاف أي صوت آخر قيد التشغيل
        if (window.currentAudio) {
            console.log('[CHAT] 🛑 Stopping previous audio');
            window.currentAudio.pause();
            window.currentAudio = null;
            
            // إعادة تعيين الأزرار الأخرى
            document.querySelectorAll('.play-voice-btn.playing').forEach(btn => {
                btn.innerHTML = '<i class="fas fa-play text-white"></i>';
                btn.classList.remove('playing');
            });
            document.querySelectorAll('.voice-progress').forEach(bar => {
                bar.style.width = '0%';
            });
        }
        
        // بدء التشغيل
        console.log('[CHAT] ▶️ Starting playback');
        playBtn.innerHTML = '<i class="fas fa-pause text-white"></i>';
        playBtn.classList.add('playing');
        
        // ✅ إنشاء عنصر الصوت مع إعدادات أفضل
        const audio = new Audio();
        audio.src = audioUrl;
        audio.preload = 'auto'; // ⭐ جديد: تحميل الصوت مسبقاً
        audio.volume = 1.0;     // ⭐ جديد: التأكد من مستوى الصوت
        
        window.currentAudio = audio;
        
        // ✅ انتظار تحميل البيانات قبل التشغيل
        audio.addEventListener('loadedmetadata', () => {
            console.log('[CHAT] 📊 Audio loaded, duration:', audio.duration, 'seconds');
        });
        
        // ✅ تحديث شريط التقدم
        audio.addEventListener('timeupdate', () => {
            if (audio.duration) {
                const progress = (audio.currentTime / audio.duration) * 100;
                progressBar.style.width = `${progress}%`;
            }
        });
        
        // ✅ عند الانتهاء
        audio.addEventListener('ended', () => {
            console.log('[CHAT] ✅ Audio playback ended');
            playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
            playBtn.classList.remove('playing');
            progressBar.style.width = '0%';
            window.currentAudio = null;
        });
        
        // ✅ عند الخطأ - تفاصيل أكثر
        audio.addEventListener('error', (e) => {
            console.error('[CHAT] ❌ Audio error:', {
                error: e,
                code: audio.error?.code,
                message: audio.error?.message,
                url: audioUrl
            });
            
            playBtn.innerHTML = '<i class="fas fa-exclamation-triangle text-white"></i>';
            playBtn.classList.remove('playing');
            progressBar.style.width = '0%';
            
            let errorMsg = 'تعذر تشغيل الرسالة الصوتية';
            if (audio.error) {
                switch(audio.error.code) {
                    case 1: errorMsg = 'تم إلغاء تحميل الصوت'; break;
                    case 2: errorMsg = 'خطأ في الشبكة'; break;
                    case 3: errorMsg = 'تعذر فك تشفير الصوت'; break;
                    case 4: errorMsg = 'تنسيق الصوت غير مدعوم'; break;
                }
            }
            
            showNotification(errorMsg, 'error');
            window.currentAudio = null;
        });
        
        // ✅ بدء التشغيل مع معالجة الوعد
        console.log('[CHAT] 🚀 Calling audio.play()');
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log('[CHAT] ✅ Playback started successfully');
                })
                .catch(error => {
                    console.error('[CHAT] ❌ Play failed:', error);
                    playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
                    playBtn.classList.remove('playing');
                    
                    if (error.name === 'NotAllowedError') {
                        showNotification('يجب النقر على الصفحة أولاً لتشغيل الصوت', 'warning');
                    } else {
                        showNotification('فشل تشغيل الصوت: ' + error.message, 'error');
                    }
                });
        }
        
        // ✅ تحديث حالة "تمت المشاهدة" للرسالة
        const messageId = messageElement.dataset.messageId;
        if (messageId) {
            updateMessageViewStatus(messageId);
        }
        
    } catch (error) {
        console.error('[VOICE PLAYBACK] Catch error:', error);
        playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
        playBtn.classList.remove('playing');
        showNotification('خطأ غير متوقع في تشغيل الصوت', 'error');
    }
}

// --- 👁️ دالة تحديث حالة المشاهدة ---
async function updateMessageViewStatus(messageId) {
    try {
        await fetch('/api/private-chat/message/status', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                messageId: messageId,
                status: 'seen'
            })
        });
    } catch (error) {
        console.error('[CHAT] Error updating view status:', error);
    }
}  


        

// --- 📤 دالة رفع وإرسال الصورة ---
async function uploadAndSendImage(file, targetUserId, modal) {
    const sendButton = modal.querySelector('#send-image-button');
    const progressBar = modal.querySelector('#progress-bar');
    const progressPercent = modal.querySelector('#progress-percent');
    const uploadProgress = modal.querySelector('#upload-progress');
    const dropZone = modal.querySelector('#drop-zone');

    const viewOnce = modal.querySelector('#view-once').checked;
    const disableSave = modal.querySelector('#disable-save').checked;
    const addWatermark = modal.querySelector('#add-watermark').checked;
    const disableReply = modal.querySelector('#disable-reply').checked;

    // ✅ دالة مساعدة جديدة: تعيد تفعيل نافذة الدردشة الخاصة دائماً
    function reEnablePrivateChat() {
        const chatInput = document.getElementById('private-message-input');
        if (chatInput) chatInput.disabled = false;
        const sendChatBtn = document.getElementById('send-private-message');
        if (sendChatBtn) sendChatBtn.disabled = false;
    }

    try {
        if (sendButton) sendButton.disabled = true;
        if (dropZone) dropZone.style.pointerEvents = 'none';
        if (uploadProgress) uploadProgress.classList.remove('hidden');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('receiverId', targetUserId);
        formData.append('metadata', JSON.stringify({
            viewOnce: viewOnce,
            disableSave: disableSave,
            hasWatermark: addWatermark,
            disableReply: disableReply
        }));

        simulateUploadProgress(progressBar, progressPercent, 2000);

        const response = await fetch('/api/chat-media/image', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            const metadata = {
                thumbnail: result.data.thumbnail,
                publicId: result.data.publicId,
                fileSize: result.data.bytes,
                format: result.data.format,
                dimensions: { width: result.data.width, height: result.data.height },
                viewOnce: viewOnce,
                disableSave: disableSave,
                hasWatermark: addWatermark,
                disableReply: disableReply
            };

            await sendPrivateMessage(targetUserId, result.data.url, null, 'image', metadata);

            // ✅ الإصلاح الأساسي: إعادة تفعيل الدردشة الخاصة قبل إغلاق نافذة الرفع
            reEnablePrivateChat();

            modal.remove();
            showNotification('تم إرسال الصورة بنجاح', 'success');

        } else {
            throw new Error(result.message || 'فشل رفع الصورة');
        }

    } catch (error) {
        console.error('[IMAGE UPLOAD] Error:', error);
        showNotification(error.message || 'فشل رفع الصورة', 'error');

        const sendButtonRetry = modal.querySelector('#send-image-button');
        const uploadProgressRetry = modal.querySelector('#upload-progress');
        if (sendButtonRetry) sendButtonRetry.disabled = false;
        if (uploadProgressRetry) uploadProgressRetry.classList.add('hidden');

        // ✅ إعادة التفعيل حتى في حالة الفشل
        reEnablePrivateChat();

    } finally {
        const dropZoneRetry = modal.querySelector('#drop-zone');
        if (dropZoneRetry) dropZoneRetry.style.pointerEvents = 'auto';
    }
}

// --- ⏳ دالة محاكاة تقدم الرفع ---
function simulateUploadProgress(progressBar, progressPercent, duration) {
    if (!progressBar || !progressPercent) return;
    
    let progress = 0;
    const interval = 50;
    const totalSteps = duration / interval;
    const increment = 100 / totalSteps;
    
    const timer = setInterval(() => {
        progress += increment;
        if (progress > 95) progress = 95; // توقف عند 95% للانتظار الرفع الحقيقي
        
        progressBar.style.width = `${progress}%`;
        progressPercent.textContent = `${Math.round(progress)}%`;
        
        if (progress >= 95) {
            clearInterval(timer);
        }
    }, interval);
}

// --- 📏 دالة تنسيق حجم الملف ---
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
} 


        

// --- 📤 دالة إرسال رسالة نصية ---
async function sendPrivateMessage(receiverId, message, replyTo = null, type = 'text', metadata = {}) {
    if (type === 'text' && !message) {
        showNotification('اكتب رسالة أولاً', 'error');
        return;
    }

    if (type === 'text' && message && message.length > 200) {
        showNotification('الرسالة طويلة جداً (200 حرف كحد أقصى)', 'error');
        return;
    }

    console.log(`[CHAT] Sending ${type} message to ${receiverId}`, replyTo ? `(reply to ${replyTo})` : '');

    // ✅ الإصلاح: نأخذ بيانات الرسالة الأصلية الكاملة (النوع + المحتوى) من المتغير
    // الذي عبأناه في showReplyPrivateBar، بدل استخدام نص وهمي "..."
    const repliedMessageData = (replyTo && replyingToPrivateMessage && replyingToPrivateMessage._id === replyTo)
        ? replyingToPrivateMessage
        : null;

    const tempId = Date.now().toString();
    displayPrivateMessage({
        _id: tempId,
        sender: JSON.parse(localStorage.getItem('user'))._id,
        receiver: receiverId,
        type: type,
        content: message,
        replyTo: repliedMessageData ? {
            _id: repliedMessageData._id,
            type: repliedMessageData.type,
            content: repliedMessageData.content,
            sender: repliedMessageData.sender
        } : null,
        metadata: metadata,
        createdAt: new Date().toISOString(),
        status: { sent: true, delivered: false, seen: false }
    }, true);

    try {
        const payload = {
            receiverId: receiverId,
            content: message,
            type: type,
            metadata: metadata
        };

        if (replyTo) {
            payload.replyTo = replyTo;
        }

        const response = await fetch('/api/private-chat/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

                if (response.ok) {
            console.log('✅ [CHAT] Message sent successfully:', result.data.message._id);

            // ✅ الإصلاح الجذري: نستبدل الفقاعة المؤقتة (ذات المعرف الوهمي) بفقاعة حقيقية
            // تحمل الـ _id الفعلي القادم من قاعدة البيانات، بدل الاكتفاء بتعديل الـ dataset فقط.
            // هذا يضمن أن أزرار "تعديل" و"حذف" تُرسل دائماً بالمعرف الصحيح للرسالة،
            // وإلا فإن أي محاولة تعديل/حذف لرسالة أُرسلت للتو كانت تفشل بصمت (السبب الجذري للمشكلة).
            const tempElement = document.querySelector(`[data-message-id="${tempId}"]`);
            if (tempElement) tempElement.remove();
            displayPrivateMessage(result.data.message, true);

            updateUnreadCount(receiverId, result.data.unreadCount || 0);

            const replyBar = document.getElementById('reply-private-bar');
            if (replyBar) replyBar.remove();
            replyingToPrivateMessage = null;

        } else {
            showNotification(result.message || 'فشل إرسال الرسالة', 'error');
        }

    } catch (error) {
        console.error('[CHAT] Error sending message:', error);
        showNotification('خطأ في الاتصال بالخادم', 'error');
    }
}



        
// --- 💬 دالة عرض رسالة في الدردشة ---
function displayPrivateMessage(message, isMyMessage = false) {
    const messagesContainer = document.getElementById('private-chat-messages');
    if (!messagesContainer) return;

    if (document.querySelector(`[data-message-id="${message._id}"]`)) return;

    const emptyState = messagesContainer.querySelector('.text-center');
    if (emptyState) emptyState.remove();

    const messageElement = document.createElement('div');
    messageElement.className = `flex ${isMyMessage ? 'justify-end' : 'justify-start'} mb-3 new-message`;
    messageElement.dataset.messageId = message._id;

    let messageContent = '';
    const meta = message.metadata || {};

    switch (message.type) {
        case 'text':
            messageContent = `<p class="text-white text-sm">${message.content}</p>`;
            break;

        case 'image':
    if (meta.viewOnce) {
        const alreadyViewed = meta.deleted || (message.status && message.status.seen);
        if (isMyMessage) {
            messageContent = `
                <div class="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 text-xs">
                    <i class="fas fa-eye${alreadyViewed ? '' : '-slash'} ${alreadyViewed ? 'text-green-400' : 'text-yellow-400'}"></i>
                    <span>صورة (مشاهدة مرة واحدة)</span>
                    <span class="ml-auto ${alreadyViewed ? 'text-green-400' : 'text-gray-400'}" data-view-once-status="${message._id}">
                        ${alreadyViewed ? 'تم فتحها ✓' : 'لم تُفتح بعد'}
                    </span>
                </div>
            `;
        } else if (alreadyViewed) {
            messageContent = `
                <div class="flex items-center gap-2 bg-gray-700/60 rounded-lg px-3 py-2 text-xs text-gray-400">
                    <i class="fas fa-eye-slash"></i>
                    <span>تمت مشاهدة هذه الصورة</span>
                </div>
            `;
        } else {
            messageContent = `
                <button class="view-once-image-btn bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-1.5 text-sm transition flex items-center gap-2" 
                        data-image-url="${message.content}" 
                        data-message-id="${message._id}">
                    <i class="fas fa-eye text-yellow-400"></i>
                    <span>مشاهدة مرة واحدة</span>
                </button>
            `;
        }
    } else {
        const watermarkBadge = meta.hasWatermark ? `<span class="absolute top-2 left-2 bg-black/50 text-xs px-2 py-0.5 rounded-full"><i class="fas fa-copyright"></i> منصة التحديات</span>` : '';
        messageContent = `
            <div class="relative">
                <img src="${message.content}" class="rounded-lg max-w-[250px] max-h-[250px] object-contain cursor-pointer view-image-btn" data-image-url="${message.content}" alt="صورة">
                ${watermarkBadge}
                ${meta.disableSave ? `<span class="absolute bottom-2 left-2 bg-red-500/80 text-xs px-2 py-0.5 rounded-full"><i class="fas fa-download-slash"></i> حفظ معطل</span>` : ''}
            </div>
        `;
    }
    break;

                                        case 'gift':
            messageContent = `
                <div class="flex items-center gap-3 bg-gradient-to-r from-pink-600/30 to-purple-600/30 border border-pink-500/30 p-3 rounded-lg">
                    <div class="gift-msg-img-slot w-10 h-10 flex items-center justify-center flex-shrink-0">
                        ${meta.giftImage ? `<img src="${meta.giftImage}" class="gift-msg-img w-10 h-10 object-contain">` : `<span class="text-2xl">🎁</span>`}
                    </div>
                    <div>
                        <p class="text-sm font-bold">🎁 هدية ${message.content}</p>
                        <p class="text-xs text-gray-300">${meta.giftPrice || 0} كوينز</p>
                    </div>
                </div>
            `;
            break;

                case 'voice':
            if (meta.uploading) {
                // ✅ جديد: شكل مبسط أثناء الرفع (بدون رابط تشغيل بعد لأنه ما وصل بعد)
                messageContent = `
                    <div class="flex items-center gap-3 bg-black/30 p-3 rounded-lg opacity-80">
                        <div class="w-10 h-10 bg-purple-500/60 rounded-full flex items-center justify-center">
                            <i class="fas fa-spinner fa-spin text-white text-sm"></i>
                        </div>
                        <div class="flex-1">
                            <div class="flex justify-between text-sm">
                                <span>جاري الإرسال...</span>
                                <span>${meta.duration || 0} ثانية</span>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                messageContent = `
                    <div class="flex items-center gap-3 bg-black/30 p-3 rounded-lg">
                        <button class="play-voice-btn w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center hover:bg-purple-600" data-voice-url="${message.content}">
                            <i class="fas fa-play text-white"></i>
                        </button>
                        <div class="flex-1">
                            <div class="flex justify-between text-sm">
                                <span>رسالة صوتية</span>
                                <span>${meta.duration || 0} ثانية</span>
                            </div>
                            <div class="w-full bg-gray-600 h-2 rounded-full mt-2">
                                <div class="voice-progress bg-purple-400 h-2 rounded-full" style="width:0%"></div>
                            </div>
                        </div>
                    </div>
                `;
            }
            break;

        case 'video':
    if (meta.viewOnce) {
        const alreadyViewed = meta.deleted || (message.status && message.status.seen);
        if (isMyMessage) {
            messageContent = `
                <div class="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 text-xs">
                    <i class="fas fa-eye${alreadyViewed ? '' : '-slash'} ${alreadyViewed ? 'text-green-400' : 'text-yellow-400'}"></i>
                    <span>فيديو (مشاهدة مرة واحدة)</span>
                    <span class="ml-auto ${alreadyViewed ? 'text-green-400' : 'text-gray-400'}" data-view-once-status="${message._id}">
                        ${alreadyViewed ? 'تم فتحها ✓' : 'لم تُفتح بعد'}
                    </span>
                </div>
            `;
        } else if (alreadyViewed) {
            messageContent = `
                <div class="flex items-center gap-2 bg-gray-700/60 rounded-lg px-3 py-2 text-xs text-gray-400">
                    <i class="fas fa-eye-slash"></i>
                    <span>تمت مشاهدة هذا الفيديو</span>
                </div>
            `;
        } else {
            messageContent = `
                <button class="view-once-video-btn bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-1.5 text-sm transition flex items-center gap-2"
                        data-video-url="${message.content}"
                        data-message-id="${message._id}">
                    <i class="fas fa-eye text-yellow-400"></i>
                    <span>مشاهدة فيديو مرة واحدة</span>
                </button>
            `;
        }
    } else {
        // ✅ الإصلاح: أبعاد صريحة أكبر (250×180) + زر تشغيل أوضح وأكبر بدل الحجم الصغير جداً السابق
        const videoWatermark = meta.hasWatermark ? '<span class="absolute top-2 left-2 bg-black/50 text-xs px-2 py-0.5 rounded-full"><i class="fas fa-copyright"></i> منصة التحديات</span>' : '';
        messageContent = `
            <div class="relative rounded-lg overflow-hidden w-[250px] h-[180px] bg-black">
                <img src="${meta.thumbnail || 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 250 180%27%3E%3Crect width=%27250%27 height=%27180%27 fill=%27%23374151%27/%3E%3C/svg%3E'}" class="w-full h-full object-cover">
                <button class="absolute inset-0 flex items-center justify-center play-video-btn bg-black/20 hover:bg-black/40 transition-colors" data-video-url="${message.content}">
                    <div class="w-14 h-14 bg-purple-600/90 rounded-full flex items-center justify-center shadow-lg">
                        <i class="fas fa-play text-white text-2xl ml-1"></i>
                    </div>
                </button>
                ${videoWatermark}
                <div class="absolute bottom-2 right-2 bg-black/60 px-2 py-0.5 rounded text-xs text-white">
                    <i class="fas fa-video mr-1"></i>${meta.duration ? meta.duration + 'ث' : 'فيديو'}
                </div>
            </div>
        `;
    }
    break;


            

        default:
            messageContent = `<p class="text-white text-sm">${message.content || 'رسالة'}</p>`;
    }

    // ===== الرد (Reply) =====
    let replySection = '';
    if (message.replyTo && !meta.disableReply) {
        const replySender = message.replyTo.sender?.username || 'مستخدم';
        const replyType = message.replyTo.type || 'text';
        let replyIcon = '';
        let replyPreviewText = '';

        // ✅ الإصلاح: نعرض تسمية مناسبة حسب نوع الرسالة المردود عليها
        // بدل عرض الرابط الخام للصورة/الصوت أو نقاط "..." وهمية
        switch (replyType) {
            case 'image':
                replyIcon = '<i class="fas fa-image text-green-400 mr-1"></i>';
                replyPreviewText = 'صورة';
                break;
            case 'voice':
                replyIcon = '<i class="fas fa-microphone text-purple-400 mr-1"></i>';
                replyPreviewText = 'رسالة صوتية';
                break;
            case 'video':
                replyIcon = '<i class="fas fa-video text-blue-400 mr-1"></i>';
                replyPreviewText = 'فيديو';
                break;
            default:
                replyPreviewText = (message.replyTo.content || 'رسالة').substring(0, 50);
        }

        replySection = `
            <div class="mb-2 p-2 bg-black/20 rounded-lg border-r-2 border-purple-500">
                <p class="text-xs font-bold text-purple-300">${replySender}</p>
                <p class="text-xs text-gray-300 truncate flex items-center">${replyIcon}${replyPreviewText}</p>
            </div>
        `;
    }

    // ===== حالة الرسالة =====
    let statusIcon = '';
    if (isMyMessage) {
        if (message.status?.seen) statusIcon = '<i class="fas fa-check-double text-blue-400 text-xs" title="مقروءة"></i>';
        else if (message.status?.delivered) statusIcon = '<i class="fas fa-check-double text-gray-400 text-xs" title="تم التسليم"></i>';
        else statusIcon = '<i class="fas fa-check text-gray-400 text-xs" title="تم الإرسال"></i>';
    }

    // ===== زر الرد (إلا إذا ممنوع) =====
       let replyButton = '';
    if (!meta.disableReply) {
        replyButton = `
            <button class="reply-private-btn text-gray-400 hover:text-purple-400 text-xs ml-2" data-message-id="${message._id}">
                <i class="fas fa-reply"></i> رد
            </button>
        `;
    }

    // ✅ زر ثابت دائماً ظاهر (بدون حاجة لسحب أو تمرير) لفتح قائمة تعديل/حذف
    const optionsButton = `
        <button class="msg-options-btn text-gray-400 hover:text-white text-xs ml-1" data-message-id="${message._id}">
            <i class="fas fa-ellipsis-v"></i>
        </button>
    `;

    messageElement.innerHTML = `
        <div class="max-w-xs md:max-w-md ${isMyMessage ? 'bg-purple-600' : 'bg-gray-700'} rounded-2xl p-3 ${isMyMessage ? 'rounded-tr-none' : 'rounded-tl-none'}">
            ${!isMyMessage ? `
                <div class="flex items-center gap-2 mb-1">
                    <img src="${message.sender?.profileImage || 'https://via.placeholder.com/20'}" class="w-5 h-5 rounded-full">
                    <span class="text-xs font-bold">${message.sender?.username || 'مستخدم'}</span>
                </div>
            ` : ''}

            ${replySection}

            <div class="message-content">
                ${messageContent}
            </div>

            <div class="flex justify-between items-center mt-2">
                <span class="text-xs opacity-70">${new Date(message.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
                    <div class="flex items-center gap-1">
                    ${statusIcon}
                    ${replyButton}
                    ${optionsButton}
                </div>
            </div>
        </div>
    `;

                     messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // ✅ ربط احتياطي (fallback) عبر JavaScript بدل onerror المباشر الممنوع بسياسة CSP
    const giftImgEl = messageElement.querySelector('.gift-msg-img');
    if (giftImgEl) {
        giftImgEl.addEventListener('error', function () {
            const slot = this.closest('.gift-msg-img-slot');
            if (slot) slot.innerHTML = '<span class="text-2xl">🎁</span>';
        }, { once: true });
    }

    attachMessageOptionsMenu(messageElement, message, isMyMessage);
    bindPrivateMessageEvents(messageElement, message);
}

// --- ⋮ قائمة منسدلة صغيرة: تعديل / حذف للجميع / حذف لدي فقط ---
function attachMessageOptionsMenu(messageElement, message, isMyMessage) {
    const btn = messageElement.querySelector('.msg-options-btn');
    if (!btn) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();

        const existing = document.getElementById('msg-options-dropdown');
        if (existing) { existing.remove(); return; }

        const createdAt = new Date(message.createdAt).getTime();
        const ageMs = Date.now() - createdAt;
        const canDelete5Min = ageMs < 5 * 60 * 1000;
        const canEdit = isMyMessage && message.type === 'text' && ageMs < 2 * 60 * 1000;

        const rect = btn.getBoundingClientRect();
        const menuHTML = `
            <div id="msg-options-dropdown" class="fixed bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-44 z-[310] overflow-hidden text-sm"
                 style="top: ${rect.bottom + 6}px; left: ${Math.max(rect.left - 130, 8)}px;">
                ${canEdit ? `<button class="w-full text-right px-4 py-2.5 text-gray-200 hover:bg-gray-700 flex items-center gap-2 msg-menu-edit"><i class="fas fa-pen text-blue-400"></i> تعديل</button>` : ''}
                ${canDelete5Min ? `<button class="w-full text-right px-4 py-2.5 text-red-400 hover:bg-gray-700 flex items-center gap-2 msg-menu-delete-everyone border-t border-gray-700"><i class="fas fa-trash"></i> حذف لدى الجميع</button>` : ''}
                <button class="w-full text-right px-4 py-2.5 text-gray-300 hover:bg-gray-700 flex items-center gap-2 msg-menu-delete-me border-t border-gray-700"><i class="fas fa-eye-slash"></i> حذف لدي فقط</button>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', menuHTML);
        const menu = document.getElementById('msg-options-dropdown');

        menu.querySelector('.msg-menu-edit')?.addEventListener('click', () => {
            menu.remove();
            startInlineEdit(messageElement, message);
        });

        menu.querySelector('.msg-menu-delete-everyone')?.addEventListener('click', () => {
            menu.remove();
            showConfirmationModal('هل تريد حذف هذه الرسالة لدى الطرفين؟', () => deleteMessageRequest(message._id, 'everyone', messageElement));
        });

        menu.querySelector('.msg-menu-delete-me')?.addEventListener('click', () => {
            menu.remove();
            showConfirmationModal('هل تريد حذف هذه الرسالة من عندك فقط؟', () => deleteMessageRequest(message._id, 'me', messageElement));
        });

        setTimeout(() => {
            document.addEventListener('click', function closeOnce(ev) {
                if (!menu.contains(ev.target) && ev.target !== btn) {
                    menu.remove();
                    document.removeEventListener('click', closeOnce);
                }
            });
        }, 0);
    });
}

async function deleteMessageRequest(messageId, scope, messageElement) {
    try {
        const response = await fetch('/api/private-chat/message', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ messageId, scope })
        });
        const result = await response.json();
        if (response.ok) {
            messageElement.remove();
        } else {
            showNotification(result.message || 'فشل حذف الرسالة', 'error');
        }
    } catch (error) {
        showNotification('خطأ في الاتصال بالخادم', 'error');
    }
}

function startInlineEdit(messageElement, message) {
    const contentEl = messageElement.querySelector('.message-content p');
    if (!contentEl) return;

    const currentText = message.content;
    contentEl.innerHTML = `<input type="text" class="edit-msg-input w-full bg-black/30 text-white rounded p-1 text-sm" value="${currentText}" maxlength="200">`;
    const input = contentEl.querySelector('.edit-msg-input');
    input.focus();

    input.addEventListener('keypress', async (e) => {
        if (e.key !== 'Enter') return;
        const newText = input.value.trim();
        if (!newText || newText === currentText) {
            contentEl.innerHTML = `<p class="text-white text-sm">${currentText}</p>`;
            return;
        }
        try {
            const response = await fetch('/api/private-chat/message/edit', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ messageId: message._id, newContent: newText })
            });
            const result = await response.json();
            if (response.ok) {
                contentEl.innerHTML = `<p class="text-white text-sm">${newText} <span class="text-[10px] text-gray-400">(معدّلة)</span></p>`;
                message.content = newText;
            } else {
                showNotification(result.message || 'فشل التعديل', 'error');
                contentEl.innerHTML = `<p class="text-white text-sm">${currentText}</p>`;
            }
        } catch (error) {
            contentEl.innerHTML = `<p class="text-white text-sm">${currentText}</p>`;
        }
    });
}

// --- 🖼️ نافذة عرض صورة عادية ---
function showFullImage(imageUrl, message) {
    const existing = document.getElementById('full-image-viewer');
    if (existing) existing.remove();

    const viewerHTML = `
        <div id="full-image-viewer" class="fixed inset-0 bg-black/90 flex items-center justify-center z-[400] p-4">
            <button id="close-full-image" class="absolute top-4 right-4 text-white text-2xl w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center">
                <i class="fas fa-times"></i>
            </button>
            <img src="${imageUrl}" class="max-w-full max-h-full rounded-lg object-contain">
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', viewerHTML);

    const viewer = document.getElementById('full-image-viewer');
    const close = () => viewer.remove();

    document.getElementById('close-full-image').addEventListener('click', close);
    viewer.addEventListener('click', (e) => {
        if (e.target.id === 'full-image-viewer') close();
    });
}

// --- 👁️ نافذة مشاهدة الصورة لمرة واحدة (تصميم مرتب + إغلاق تلقائي) ---
function openViewOnceImage(messageId, imageUrl, messageElement) {
    const existing = document.getElementById('view-once-viewer');
    if (existing) existing.remove();

    const VIEW_SECONDS = 8; // مدة العرض بالثواني قبل الإغلاق التلقائي
    let remaining = VIEW_SECONDS;

    const viewerHTML = `
        <div id="view-once-viewer" class="fixed inset-0 bg-black/95 flex items-center justify-center z-[400] p-6">
            <div class="relative w-full max-w-xs">
                <div class="flex items-center justify-between mb-2 text-white text-xs">
                    <span class="flex items-center gap-1 text-yellow-400">
                        <i class="fas fa-eye"></i> مشاهدة مرة واحدة
                    </span>
                    <span id="view-once-timer" class="font-mono">00:${VIEW_SECONDS.toString().padStart(2, '0')}</span>
                </div>
                <div class="rounded-xl overflow-hidden border border-yellow-500/30 shadow-2xl">
                    <img src="${imageUrl}" class="w-full max-h-[60vh] object-contain bg-black">
                </div>
                <div class="w-full bg-gray-700 h-1 rounded-full mt-2 overflow-hidden">
                    <div id="view-once-progress" class="bg-yellow-400 h-1" style="width:100%"></div>
                </div>
                <button id="close-view-once" class="mt-4 w-full bg-gray-800 hover:bg-gray-700 text-white text-sm py-2 rounded-lg">
                    <i class="fas fa-times mr-1"></i> إغلاق
                </button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', viewerHTML);

    const viewer = document.getElementById('view-once-viewer');
    const timerEl = document.getElementById('view-once-timer');
    const progressEl = document.getElementById('view-once-progress');
    let countdownInterval = null;

    const closeViewer = () => {
        if (countdownInterval) clearInterval(countdownInterval);
        if (viewer && viewer.parentNode) viewer.remove();
    };

    document.getElementById('close-view-once').addEventListener('click', closeViewer);
    viewer.addEventListener('click', (e) => {
        if (e.target.id === 'view-once-viewer') closeViewer();
    });

    countdownInterval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = `00:${Math.max(remaining, 0).toString().padStart(2, '0')}`;
        if (progressEl) progressEl.style.width = `${(remaining / VIEW_SECONDS) * 100}%`;
        if (remaining <= 0) closeViewer();
    }, 1000);

    // تحديث شكل الرسالة فوراً لدى المُشاهِد
    if (messageElement) {
        const btn = messageElement.querySelector('.view-once-image-btn');
        if (btn) {
            btn.outerHTML = `
                <div class="flex items-center gap-2 bg-gray-700/60 rounded-lg px-3 py-2 text-xs text-gray-400">
                    <i class="fas fa-eye-slash"></i>
                    <span>تمت مشاهدة هذه الصورة</span>
                </div>
            `;
        }
    }

    markMessageAsViewed(messageId);
}

        // --- 👁️ نافذة مشاهدة الفيديو لمرة واحدة (نفس فلسفة الصورة + مشغل فيديو) ---
function openViewOnceVideo(messageId, videoUrl, messageElement) {
    const existing = document.getElementById('view-once-viewer');
    if (existing) existing.remove();

    const VIEW_SECONDS = 20; // مدة أطول قليلاً من الصورة لأن الفيديو يحتاج وقت مشاهدة
    let remaining = VIEW_SECONDS;

    const viewerHTML = `
        <div id="view-once-viewer" class="fixed inset-0 bg-black/95 flex items-center justify-center z-[400] p-6">
            <div class="relative w-full max-w-sm">
                <div class="flex items-center justify-between mb-2 text-white text-xs">
                    <span class="flex items-center gap-1 text-yellow-400">
                        <i class="fas fa-eye"></i> مشاهدة مرة واحدة
                    </span>
                    <span id="view-once-timer" class="font-mono">00:${VIEW_SECONDS.toString().padStart(2, '0')}</span>
                </div>
                <div class="rounded-xl overflow-hidden border border-yellow-500/30 shadow-2xl bg-black">
                    <video id="view-once-video-el" src="${videoUrl}" class="w-full max-h-[55vh] object-contain" controls autoplay></video>
                </div>
                <div class="w-full bg-gray-700 h-1 rounded-full mt-2 overflow-hidden">
                    <div id="view-once-progress" class="bg-yellow-400 h-1" style="width:100%"></div>
                </div>
                <button id="close-view-once" class="mt-4 w-full bg-gray-800 hover:bg-gray-700 text-white text-sm py-2 rounded-lg">
                    <i class="fas fa-times mr-1"></i> إغلاق
                </button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', viewerHTML);

    const viewer = document.getElementById('view-once-viewer');
    const timerEl = document.getElementById('view-once-timer');
    const progressEl = document.getElementById('view-once-progress');
    const videoEl = document.getElementById('view-once-video-el');
    let countdownInterval = null;

    const closeViewer = () => {
        if (countdownInterval) clearInterval(countdownInterval);
        if (videoEl) videoEl.pause();
        if (viewer && viewer.parentNode) viewer.remove();
    };

    document.getElementById('close-view-once').addEventListener('click', closeViewer);
    viewer.addEventListener('click', (e) => {
        if (e.target.id === 'view-once-viewer') closeViewer();
    });

    countdownInterval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = `00:${Math.max(remaining, 0).toString().padStart(2, '0')}`;
        if (progressEl) progressEl.style.width = `${(remaining / VIEW_SECONDS) * 100}%`;
        if (remaining <= 0) closeViewer();
    }, 1000);

    if (messageElement) {
        const btn = messageElement.querySelector('.view-once-video-btn');
        if (btn) {
            btn.outerHTML = `
                <div class="flex items-center gap-2 bg-gray-700/60 rounded-lg px-3 py-2 text-xs text-gray-400">
                    <i class="fas fa-eye-slash"></i>
                    <span>تمت مشاهدة هذا الفيديو</span>
                </div>
            `;
        }
    }

    markMessageAsViewed(messageId);
}

// --- 👁️ تعليم رسالة كـ "تمت مشاهدتها" (يُشعر المرسل عبر Socket تلقائياً) ---
async function markMessageAsViewed(messageId) {
    try {
        const response = await fetch('/api/private-chat/message/status', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ messageId: messageId, status: 'seen' })
        });
        if (!response.ok) console.warn('[VIEW ONCE] فشل تحديث حالة المشاهدة');
    } catch (error) {
        console.error('[VIEW ONCE] خطأ:', error);
    }
}
        

// --- 🎵 دالة ربط أحداث الوسائط ---
function bindMediaEvents(messageElement, message) {
    // صور
    const imageBtn = messageElement.querySelector('.view-image-btn');
    if (imageBtn) {
        imageBtn.addEventListener('click', () => {
            showImageViewer(imageBtn.dataset.imageUrl, message);
        });
    }
    
    // صوت
    const voiceBtn = messageElement.querySelector('.play-voice-btn');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => {
            playVoiceMessage(voiceBtn.dataset.voiceUrl, messageElement);
        });
    }
    
    // فيديو
    const videoBtn = messageElement.querySelector('.play-video-btn');
    if (videoBtn) {
        videoBtn.addEventListener('click', () => {
            showVideoPlayer(videoBtn.dataset.videoUrl, message);
        });
    }
}

// --- 🔄 دالة تحديث حالة الرسالة ---
function updateMessageStatus(messageElement, status) {
    const statusContainer = messageElement.querySelector('.message-status');
    if (!statusContainer) return;
    
    if (status.seen) {
        statusContainer.innerHTML = '<i class="fas fa-check-double text-blue-400 text-xs" title="مقروءة"></i>';
    } else if (status.delivered) {
        statusContainer.innerHTML = '<i class="fas fa-check-double text-gray-400 text-xs" title="تم التسليم"></i>';
    }
}


        
        
        
    // --- ✅ دالة لعرض بروفايل مستخدم حظرك (مصممة بشكل أفضل) ---
function showBlockedProfileModal(userId, blockData) {
    // جلب مستوى المستخدم الحالي
    const user = JSON.parse(localStorage.getItem('user'));
    const userLevel = user ? user.level : 1;
    
    // زر الرسالة (يعمل من المستوى 4)
    const messageButtonHTML = userLevel >= 4 ? 
        `<button id="send-one-message-btn" data-user-id="${userId}" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition mb-4">
            <i class="fas fa-paper-plane mr-2"></i>
            إرسال رسالة واحدة (25 حرف)
        </button>` :
        `<button class="w-full bg-gray-700 text-gray-500 font-bold py-3 rounded-lg mb-4 cursor-not-allowed" disabled>
            <i class="fas fa-lock mr-2"></i>
            إرسال رسالة (تصل عند المستوى ${4})
        </button>`;

    const modalHTML = `
        <div id="blocked-profile-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[310] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-sm text-white transform scale-95 transition-transform duration-300 border-2 border-red-500/30">
                
                <!-- المحتوى البسيط -->
                <div class="flex flex-col items-center p-8">
                    <!-- علامة التعجب مع تأثير hover -->
                    <div class="relative group mb-8">
                        <div class="w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center border-4 border-red-500/50 transition-transform group-hover:scale-110 duration-300">
                            <i class="fas fa-exclamation-triangle text-4xl text-red-400"></i>
                        </div>
                        
                        <!-- النص المنبثق (يظهر عند التمرير) -->
                        <div class="absolute -top-16 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-10">
                            <div class="bg-gray-900 text-sm text-gray-300 px-4 py-3 rounded-lg border border-gray-700 shadow-2xl whitespace-nowrap">
                                <div class="flex items-center gap-2">
                                    <i class="fas fa-info-circle text-blue-400"></i>
                                    <span>هذا المستخدم قد يكون قد حظرك</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- الاسم -->
                    <h2 class="text-xl font-bold text-gray-300 mb-3">${blockData.targetUser.username}</h2>
                    
                    <!-- الرسالة البسيطة -->
                    <p class="text-gray-400 text-center mb-8 leading-relaxed">
                        <span class="block mb-2">لا يمكن عرض الملف الشخصي</span>
                        <span class="text-sm text-gray-500">قد يكون المستخدم قد حظرك أو قام بإخفاء ملفه الشخصي</span>
                    </p>
                    
                    <!-- زر إرسال رسالة (يعمل من المستوى 4) -->
                    ${messageButtonHTML}
                    
                    <!-- زر الإغلاق -->
                    <button class="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-lg transition close-blocked-modal-btn">
                        <i class="fas fa-times mr-2"></i>
                        إغلاق
                    </button>
                </div>
            </div>
        </div>
    `;
    
        document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('blocked-profile-modal');
    
    // تأثير الظهور
    setTimeout(() => {
        modal.querySelector('.transform').classList.remove('scale-95');
    }, 50);
    
    // --- ✅ event delegation للنافذة الجديدة ---
    modal.addEventListener('click', (e) => {
        // 1. إغلاق بالنقر على الخلفية
        if (e.target.id === 'blocked-profile-modal') {
            modal.remove();
            return;
        }
        
        // 2. زر الإغلاق
        if (e.target.closest('.close-blocked-modal-btn')) {
            modal.remove();
            return;
        }
        
        // 3. زر إرسال رسالة (إذا كان المستوى 4 أو أعلى)
        if (e.target.closest('#send-one-message-btn') && userLevel >= 4) {
            const targetUserId = e.target.closest('#send-one-message-btn').dataset.userId;
            showOneMessageModal(targetUserId, blockData.targetUser.username);
            return;
        }
    });
}

async function sendOneTimeMessageRequest(receiverId, content, payExtra) {
    const response = await fetch('/api/private-chat/one-time-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ receiverId, content, payExtra })
    });
    const data = await response.json();
    return { ok: response.ok, data };
}

// ✅ نافذة أنيقة تخبر المستخدم بعدم كفاية الرصيد وتعرض له زر شحن مباشر
function showInsufficientCoinsModal(message) {
    const existing = document.getElementById('insufficient-coins-modal');
    if (existing) existing.remove();

    const html = `
        <div id="insufficient-coins-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[400] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-xs text-white p-6 text-center border border-yellow-600/30">
                <i class="fas fa-coins text-4xl text-yellow-400 mb-3"></i>
                <p class="text-sm mb-5">${message}</p>
                <div class="flex gap-2">
                    <button id="ic-cancel-btn" class="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm">إلغاء</button>
                    <button id="ic-topup-btn" class="flex-1 bg-yellow-600 hover:bg-yellow-700 py-2 rounded-lg text-sm font-bold">شحن كوينزات</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('game-container').insertAdjacentHTML('beforeend', html);
    const modal = document.getElementById('insufficient-coins-modal');

    document.getElementById('ic-cancel-btn').addEventListener('click', () => modal.remove());
    document.getElementById('ic-topup-btn').addEventListener('click', () => {
        modal.remove();
        showBuyCoinsModal();
    });
}

        

// --- ✅ دالة نافذة إرسال رسالة واحدة ---
function showOneMessageModal(targetUserId, targetUsername) {
    const modalHTML = `
                <div id="one-message-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[330] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-blue-900/30 rounded-2xl shadow-2xl w-full max-w-sm text-white transform scale-95 transition-transform duration-300 border-2 border-blue-500/30">
                
                <div class="p-6">
                    <h3 class="text-lg font-bold mb-4 flex items-center gap-3">
                        <i class="fas fa-paper-plane text-blue-400"></i>
                        إرسال رسالة لـ ${targetUsername}
                    </h3>
                    
                    <div class="mb-4">
                        <textarea id="one-message-input" 
                                  class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm h-32"
                                  placeholder="اكتب رسالتك هنا... (حد أقصى 25 حرف)"
                                  maxlength="25"></textarea>
                        <div class="flex justify-between items-center mt-2 text-xs text-gray-400">
                            <span id="message-char-count">0/25</span>
                            <span class="text-blue-400">رسالة واحدة فقط</span>
                        </div>
                    </div>
                    
                    <div class="flex gap-3">
                        <button id="cancel-one-message" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg transition">
                            إلغاء
                        </button>
                        <button id="send-one-message" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition">
                            إرسال
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('one-message-modal');
    const oneMsgInput = document.getElementById('one-message-input'); // ✅ اسم مختلف تماماً يمنع أي تعارض
    const charCount = document.getElementById('message-char-count');
    
    setTimeout(() => {
        modal.querySelector('.transform').classList.remove('scale-95');
    }, 50);
    
    oneMsgInput.addEventListener('input', () => {
        charCount.textContent = `${oneMsgInput.value.length}/25`;
    });
    
    document.getElementById('send-one-message').addEventListener('click', async () => {
        const messageText = oneMsgInput.value.trim(); // ✅ اسم متغير محلي مستقل بالكامل
        
        if (!messageText) {
            showNotification('اكتب رسالة أولاً', 'error');
            return;
        }
        if (messageText.length > 25) {
            showNotification('الرسالة طويلة جداً (25 حرف كحد أقصى)', 'error');
            return;
        }
        
        const sendBtn = document.getElementById('send-one-message');
        sendBtn.disabled = true;
        sendBtn.textContent = 'جاري الإرسال...';

           try {
            const response = await sendOneTimeMessageRequest(targetUserId, messageText, false);

            if (response.ok) {
                showNotification(response.data.message, 'success');
                modal.remove();
                const blockedModal = document.getElementById('blocked-profile-modal');
                if (blockedModal) blockedModal.remove();
                return;
            }

            if (response.data.code === 'PAYMENT_REQUIRED') {
                showConfirmationModal(response.data.message + ' هل تريد المتابعة؟', async () => {
                    const paidResponse = await sendOneTimeMessageRequest(targetUserId, messageText, true);
                    if (paidResponse.ok) {
                        showNotification(paidResponse.data.message, 'success');
                        modal.remove();
                        const blockedModal = document.getElementById('blocked-profile-modal');
                        if (blockedModal) blockedModal.remove();
                        await refreshUserData();
                    } else if (paidResponse.data.code === 'INSUFFICIENT_COINS') {
                        showInsufficientCoinsModal(paidResponse.data.message);
                    } else {
                        showNotification(paidResponse.data.message || 'فشل إرسال الرسالة', 'error');
                    }
                });
                sendBtn.disabled = false;
                sendBtn.textContent = 'إرسال';
                return;
            }

            if (response.data.code === 'INSUFFICIENT_COINS') {
                showInsufficientCoinsModal(response.data.message);
                sendBtn.disabled = false;
                sendBtn.textContent = 'إرسال';
                return;
            }

            showNotification(response.data.message || 'فشل إرسال الرسالة', 'error');
            sendBtn.disabled = false;
            sendBtn.textContent = 'إرسال';

        } catch (error) {
            console.error('[ONE TIME MESSAGE] Error:', error);
            showNotification('خطأ في الاتصال بالخادم', 'error');
            sendBtn.disabled = false;
            sendBtn.textContent = 'إرسال';
        }
    });
    
    document.getElementById('cancel-one-message').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'one-message-modal') {
            modal.remove();
        }
    });
}
        
// --- ✅ دالة جديدة لتوليد HTML زر الصداقة الملون ---
function getFriendButtonHTML(profileUser, selfUser) {
    // ✅ تحويل كل الـ IDs إلى String للمقارنة الصحيحة
    const profileUserIdStr = profileUser._id.toString();
    
    // ✅ استخراج IDs من مصفوفات المستخدم الحالي
    const friendsIds = (selfUser.friends || []).map(item => 
        item._id ? item._id.toString() : item.toString()
    );
    
    const sentRequestsIds = (selfUser.friendRequestsSent || []).map(user => 
        user._id ? user._id.toString() : user.toString()
    );
    
    const receivedRequestsIds = (selfUser.friendRequestsReceived || []).map(user => 
        user._id ? user._id.toString() : user.toString()
    );
    
    // ✅ استخراج IDs من المحظورين
    const blockedUsersIds = (selfUser.blockedUsers || []).map(item => 
        item._id ? item._id.toString() : item.toString()
    );

    let friendButtonHTML = '';

    // ✅ منطق أزرار الصداقة + الحظر
    if (friendsIds.includes(profileUserIdStr)) {
        friendButtonHTML = `<button class="action-btn friend-btn" data-action="remove-friend" data-user-id="${profileUser._id}"><i class="fas fa-user-check"></i><span>صديق</span></button>`;
    } else if (sentRequestsIds.includes(profileUserIdStr)) {
        friendButtonHTML = `<button class="action-btn sent-btn" data-action="cancel-request" data-user-id="${profileUser._id}"><i class="fas fa-user-clock"></i><span>مُرسَل</span></button>`;
    } else if (receivedRequestsIds.includes(profileUserIdStr)) {
        friendButtonHTML = `<button class="action-btn received-btn" data-action="accept-request" data-user-id="${profileUser._id}"><i class="fas fa-user-check"></i><span>قبول</span></button>`;
    } else if (blockedUsersIds.includes(profileUserIdStr)) {
        // ✅ إذا كان محظوراً - زر فك الحظر
        friendButtonHTML = `<button class="action-btn unblock-btn" data-action="unblock" data-user-id="${profileUser._id}"><i class="fas fa-user-lock"></i><span>محظور</span></button>`;
    } else {
        // ✅ إذا لم يكن شيئاً - زر إضافة
        friendButtonHTML = `<button class="action-btn add-btn" data-action="send-request" data-user-id="${profileUser._id}"><i class="fas fa-user-plus"></i><span>إضافة</span></button>`;
    }
    
    console.log('[FIXED] Generated button:', friendButtonHTML);
    return friendButtonHTML;
}


    // =================================================
    // =========== قسم الدردشة (Chat Section) ==========
    // =================================================

    const messageInput = document.getElementById('messageInput');
    // --- أضف هذا الكود لتفعيل عداد الأحرف ---
const charCounter = document.getElementById('char-counter');
messageInput.addEventListener('input', () => {
    const currentLength = messageInput.value.length;
    charCounter.textContent = `${currentLength}/300`;
    // تغيير لون العداد عند الاقتراب من الحد
    if (currentLength > 280) {
        charCounter.classList.add('text-red-400');
    } else {
        charCounter.classList.remove('text-red-400');
    }
});

     
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chat-messages');
        

   // --- ✅ أضف هذا الكود لتفعيل النقر على الصور ---
chatMessages.addEventListener('click', (e) => {
    // تحقق مما إذا كانت النقرة على صورة ولها data-user-id
    if (e.target.tagName === 'IMG' && e.target.dataset.userId) {
        const userId = e.target.dataset.userId;
        // لا تفتح نافذة للمستخدم نفسه
        if (userId === user._id) return;
        
        showMiniProfileModal(userId);
    }
});
    // --- استبدل دالة sendMessage بهذه ---
function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        const messageData = { message: message };
        if (replyingToMessage) {
            messageData.replyTo = replyingToMessage._id;
        }
        socket.emit('sendMessage', messageData);
        messageInput.value = '';
        // إخفاء شريط الرد بعد الإرسال
        const replyBar = document.getElementById('reply-bar');
        if (replyBar) replyBar.remove();
        replyingToMessage = null;
        // إعادة تعيين عداد الأحرف
        document.getElementById('char-counter').textContent = '0/300';
    }
}


    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
        const publicGiftBtn = document.getElementById('public-gift-btn');
    if (publicGiftBtn) {
        publicGiftBtn.addEventListener('click', showPublicGiftModal);
    }

    // --- استبدل دالة displayMessage بهذه النسخة ---
function displayMessage(message) {
    if (!message || !message.sender) return;

    const isMyMessage = message.sender._id === user._id;
    const messageElement = document.createElement('div');
    messageElement.dataset.messageId = message._id;
        const senderBubbleClass = message.sender.activeBubbleSkinClass || '';
    messageElement.className = 'message-container p-2 rounded-lg mb-2 flex items-start gap-2 relative group ' + (senderBubbleClass || (isMyMessage ? 'bg-purple-800' : 'bg-gray-700'));

    let replyHTML = '';
    if (message.replyTo && message.replyTo.sender) {
        replyHTML = `
            <div class="reply-snippet bg-black/20 p-2 rounded-md mb-2 border-l-2 border-purple-400">
                <p class="font-bold text-xs text-purple-300">${message.replyTo.sender.username}</p>
                <p class="text-xs text-gray-300 truncate">${message.replyTo.content || 'رسالة'}</p>
            </div>
        `;
    }

        messageElement.innerHTML = `
        <img src="${message.sender.profileImage}" alt="${message.sender.username}" 
             class="w-8 h-8 rounded-full cursor-pointer hover:ring-2 hover:ring-purple-400 ${message.sender.activeFrameClass || ''}" data-user-id="${message.sender._id}">
        <div class="w-full">
            ${replyHTML}
            <p class="font-bold text-sm ${isMyMessage ? 'text-yellow-300' : 'text-purple-300'}">${message.sender.username}</p>
            <p class="text-white text-sm">${message.content}</p>
        </div>
        <button class="reply-btn text-gray-400 hover:text-purple-400 text-xs">
            <i class="fas fa-reply"></i>
        </button>
    `;

    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    messageElement.querySelector('.reply-btn').addEventListener('click', () => {
        showReplyBar(message);
    });

    // --- ✅ منطق توميض الرسالة المردود عليها ---
    if (message.replyTo) {
        const originalMessageElement = document.querySelector(`[data-message-id="${message.replyTo._id}"]`);
        if (originalMessageElement) {
            originalMessageElement.classList.add('flash-animation');
            // إزالة الكلاس بعد انتهاء الأنيميشن
            setTimeout(() => {
                originalMessageElement.classList.remove('flash-animation');
            }, 1000); // مدة الأنيميشن
        }
    }
}



    socket.on('newMessage', displayMessage);

    // 📍 استبدل دالة loadChatHistory بالكامل بهذا الكود
async function loadChatHistory() {
    try {
        // 1️⃣ جلب بيانات المستخدم الحالي من localStorage
        const user = JSON.parse(localStorage.getItem('user'));
        if (!user || !user.blockedUsers) {
            console.log('[CHAT] No user data or blocked list found');
            return;
        }
        
        // 2️⃣ جلب الرسائل من الخادم
        const response = await fetch('/api/messages/public-room', { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            // 3️⃣ تنظيف الشات أولاً
            chatMessages.innerHTML = '';
            
            // 4️⃣ فلترة إضافية على العميل (للأمان الزائد)
            const blockedUsersIds = user.blockedUsers.map(id => 
                typeof id === 'object' ? id._id.toString() : id.toString()
            );
            
            console.log(`[CHAT FILTER] Blocked IDs:`, blockedUsersIds);
            
            // 5️⃣ عرض الرسائل المفلترة فقط
            result.data.messages.forEach(message => {
                // التحقق إذا كان المرسل محظوراً
                const senderId = message.sender._id.toString();
                const isBlocked = blockedUsersIds.includes(senderId);
                
                if (!isBlocked) {
                    displayMessage(message);
                } else {
                    console.log(`[CHAT FILTER] Client filtered message from: ${message.sender.username}`);
                }
            });
            
            console.log(`[CHAT] Loaded ${result.data.messages.length} messages, displayed after client filter`);
        }
    } catch (error) {
        console.error('Failed to load chat history:', error);
    }
}
    loadChatHistory();

// --- 🔢 دالة تحديث العداد غير المقروء ---
function updateUnreadCount(userId, count) {
    // TODO: تحديث في قائمة الدردشات لاحقاً
    console.log(`[CHAT] Unread count for ${userId}: ${count}`);
}

// --- 📋 دالة تحديث بادج قائمة الدردشات ---
function updateChatListBadge() {
    // TODO: تحديث عندما نضيف قائمة الدردشات
}

// --- 🖼️ دالة عرض الصور ---
function showImageViewer(imageUrl, message) {
    console.log('[CHAT] Showing image:', imageUrl);
    
    if (message.metadata?.viewOnce) {
        showNotification('⚠️ هذه الصورة للعرض مرة واحدة فقط', 'warning');
    }
    
    // TODO: إنشاء نافذة عرض الصور
    showNotification('عرض الصورة قريباً...', 'info');
}

// --- 🎵 دالة تشغيل الصوت (حقيقية - ليست محاكاة) ---
async function playVoiceMessage(voiceUrl, messageElement) {
    console.log('[CHAT] 🎵 Playing voice message:', voiceUrl);
    
    const playBtn = messageElement.querySelector('.play-voice-btn');
    const progressBar = messageElement.querySelector('.voice-progress');
    
    if (!playBtn || !progressBar) {
        console.error('[CHAT] ❌ Play button or progress bar not found');
        return;
    }
    
    try {
        // إذا كان الصوت مشغلاً بالفعل، أوقفه
        if (playBtn.classList.contains('playing')) {
            console.log('[CHAT] ⏸️ Stopping current audio');
            playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
            playBtn.classList.remove('playing');
            progressBar.style.width = '0%';
            
            if (window.currentAudio) {
                window.currentAudio.pause();
                window.currentAudio.currentTime = 0;
                window.currentAudio = null;
            }
            return;
        }
        
        // إيقاف أي صوت آخر قيد التشغيل
        if (window.currentAudio) {
            console.log('[CHAT] 🛑 Stopping previous audio');
            window.currentAudio.pause();
            window.currentAudio = null;
            
            // إعادة تعيين الأزرار الأخرى
            document.querySelectorAll('.play-voice-btn.playing').forEach(btn => {
                btn.innerHTML = '<i class="fas fa-play text-white"></i>';
                btn.classList.remove('playing');
            });
            document.querySelectorAll('.voice-progress').forEach(bar => {
                bar.style.width = '0%';
            });
        }
        
        // بدء التشغيل
        console.log('[CHAT] ▶️ Starting playback');
        playBtn.innerHTML = '<i class="fas fa-pause text-white"></i>';
        playBtn.classList.add('playing');
        
        // إنشاء عنصر الصوت
        const audio = new Audio();
        audio.src = voiceUrl;
        audio.preload = 'auto';
        audio.volume = 1.0;
        
        window.currentAudio = audio;
        
        // عند تحميل البيانات
        audio.addEventListener('loadedmetadata', () => {
            console.log('[CHAT] 📊 Audio loaded, duration:', audio.duration, 'seconds');
        });
        
        // تحديث شريط التقدم
        audio.addEventListener('timeupdate', () => {
            if (audio.duration) {
                const progress = (audio.currentTime / audio.duration) * 100;
                progressBar.style.width = `${progress}%`;
            }
        });
        
        // عند الانتهاء
        audio.addEventListener('ended', () => {
            console.log('[CHAT] ✅ Audio playback ended');
            playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
            playBtn.classList.remove('playing');
            progressBar.style.width = '0%';
            window.currentAudio = null;
        });
        
        // عند الخطأ
        audio.addEventListener('error', (e) => {
            console.error('[CHAT] ❌ Audio error:', {
                error: e,
                code: audio.error?.code,
                message: audio.error?.message,
                url: voiceUrl
            });
            
            playBtn.innerHTML = '<i class="fas fa-exclamation-triangle text-white"></i>';
            playBtn.classList.remove('playing');
            progressBar.style.width = '0%';
            
            let errorMsg = 'تعذر تشغيل الرسالة الصوتية';
            if (audio.error) {
                switch(audio.error.code) {
                    case 1: errorMsg = 'تم إلغاء تحميل الصوت'; break;
                    case 2: errorMsg = 'خطأ في الشبكة'; break;
                    case 3: errorMsg = 'تعذر فك تشفير الصوت'; break;
                    case 4: errorMsg = 'تنسيق الصوت غير مدعوم'; break;
                }
            }
            
            showNotification(errorMsg, 'error');
            window.currentAudio = null;
        });
        
        // بدء التشغيل
        console.log('[CHAT] 🚀 Calling audio.play()');
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log('[CHAT] ✅ Playback started successfully');
                })
                .catch(error => {
                    console.error('[CHAT] ❌ Play failed:', error);
                    playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
                    playBtn.classList.remove('playing');
                    
                    if (error.name === 'NotAllowedError') {
                        showNotification('اضغط في أي مكان بالصفحة أولاً', 'warning');
                    } else {
                        showNotification('فشل تشغيل الصوت', 'error');
                    }
                });
        }
        
    } catch (error) {
        console.error('[VOICE PLAYBACK] Catch error:', error);
        playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
        playBtn.classList.remove('playing');
        showNotification('خطأ في تشغيل الصوت', 'error');
    }
}

// --- 🎬 دالة تشغيل الفيديو الفعلية ---
function showVideoPlayer(videoUrl, message) {
    console.log('[CHAT] Playing video:', videoUrl);

    const existing = document.getElementById('video-player-modal');
    if (existing) existing.remove();

    const meta = message.metadata || {};
    const disableSaveBadge = meta.disableSave
        ? `<span class="absolute top-3 left-3 bg-red-500/80 text-white text-xs px-2 py-1 rounded-full"><i class="fas fa-download-slash mr-1"></i>حفظ معطل</span>`
        : '';

    const viewerHTML = `
        <div id="video-player-modal" class="fixed inset-0 bg-black/95 flex items-center justify-center z-[400] p-4">
            <div class="relative w-full max-w-lg">
                <button id="close-video-player" class="absolute -top-10 right-0 text-white text-2xl w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center">
                    <i class="fas fa-times"></i>
                </button>
                <div class="relative rounded-xl overflow-hidden border border-gray-700">
                    <video src="${videoUrl}" class="w-full max-h-[70vh] bg-black" controls autoplay ${meta.disableSave ? 'controlsList="nodownload"' : ''}></video>
                    ${disableSaveBadge}
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', viewerHTML);

    const viewer = document.getElementById('video-player-modal');
    const close = () => {
        const video = viewer.querySelector('video');
        if (video) video.pause();
        viewer.remove();
    };

    document.getElementById('close-video-player').addEventListener('click', close);
    viewer.addEventListener('click', (e) => {
        if (e.target.id === 'video-player-modal') close();
    });
}

        

   // 📩 مستمع لاستقبال رسائل خاصة
socket.on('privateMessageReceived', async (data) => {
    console.log('[CHAT] Private message received:', data.message?._id);
    
    // التحقق إذا كانت نافذة الدردشة مفتوحة مع هذا المستخدم
    const chatModal = document.getElementById('private-chat-modal');
    const targetUserId = chatModal?.dataset?.targetUserId;
    
    if (chatModal && targetUserId === data.senderId) {
        // عرض الرسالة في الدردشة المفتوحة
        displayPrivateMessage(data.message, false);
        
        // تحديث حالة الرسالة كـ "تم التسليم"
        setTimeout(async () => {
            try {
                const response = await fetch('/api/private-chat/message/status', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        messageId: data.message._id,
                        status: 'delivered'
                    })
                });
            } catch (error) {
                console.error('[CHAT] Error marking as delivered:', error);
            }
        }, 1000);
        
        // إشعار بسيط
        showNotification(`رسالة جديدة من ${data.senderName}`, 'info');
        
    } else {
        // إشعار إذا كانت الدردشة غير مفتوحة
        showNotification(`📩 رسالة جديدة من ${data.senderName}`, 'info');
        
        // ✅ تحديث شارة الرسائل + إعادة تحميل القائمة إن كانت مفتوحة
        refreshMessagesNavBadge();
        if (document.getElementById('messages-list-container')) {
            loadMessagesList();
        }
    }
});

// 🔄 مستمع لتحديث حالة الرسالة
socket.on('messageStatusUpdated', (data) => {
    console.log('[CHAT] Message status updated:', data.messageId, data.status);

    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        const statusContainer = messageElement.querySelector('.message-status');
        if (statusContainer) {
            if (data.status === 'seen') {
                statusContainer.innerHTML = '<i class="fas fa-check-double text-blue-400 text-xs" title="مقروءة"></i>';
            } else if (data.status === 'delivered') {
                statusContainer.innerHTML = '<i class="fas fa-check-double text-gray-400 text-xs" title="تم التسليم"></i>';
            }
        }

        // ✅ تحديث شارة "مشاهدة مرة واحدة" لدى المرسل فور فتح المستقبل لها
        if (data.status === 'seen') {
            const viewOnceStatus = messageElement.querySelector(`[data-view-once-status="${data.messageId}"]`);
            if (viewOnceStatus) {
                viewOnceStatus.textContent = 'تم فتحها ✓';
                viewOnceStatus.classList.remove('text-gray-400');
                viewOnceStatus.classList.add('text-green-400');
                const icon = viewOnceStatus.parentElement.querySelector('i.fas');
                if (icon) {
                    icon.classList.remove('fa-eye-slash', 'text-yellow-400');
                    icon.classList.add('fa-eye', 'text-green-400');
                }
            }
        }
    }
});     


        

// --- ✅ أضف هذا المستمع الجديد ---
// --- ✅ استبدل مستمع friendshipUpdate بهذا ---
socket.on('friendshipUpdate', async () => {
    console.log('[SOCKET] Received friendship update. Refetching self user data.');
    try {
        const selfUserResponse = await fetch(`/api/users/me/details`, { headers: { 'Authorization': `Bearer ${token}` } });
        const selfUserResult = await selfUserResponse.json();
        if (selfUserResponse.ok) {
            const updatedUser = selfUserResult.data.user;
            localStorage.setItem('user', JSON.stringify(updatedUser));
            updateUIWithUserData(updatedUser); // ✅ تحديث الواجهة بالكامل
            
            // (اختياري) إذا كانت نافذة الملف الشخصي مفتوحة، أعد رسمها
            const modal = document.getElementById('mini-profile-modal');
            const userIdInModal = modal?.dataset.userId;
            if (modal && userIdInModal) {
                showMiniProfileModal(userIdInModal);
            }
        }
    } catch (error) {
        console.error('Failed to refetch user data after friendship update:', error);
    }
});

// --- ✅ أضف هذا الكود لربط الأيقونات الجديدة ---
// --- ✅ ربط بطاقة الأصدقاء ---
document.getElementById('friends-card').addEventListener('click', (e) => {
    // منع الفتح عند النقر على العناصر الداخلية
    if (!e.target.closest('#friends-avatars')) {
        showFriendsListModal();
    }
});
document.getElementById('friend-requests-nav-item').addEventListener('click', (e) => {
    e.preventDefault(); // منع السلوك الافتراضي للرابط
    showFriendRequestsModal();
});

    // --- ✅ أضف هاتين الدالتين الجديدتين ---

// دالة لعرض نافذة طلبات الصداقة
// --- ✅ استبدل دالة showFriendRequestsModal بهذه النسخة النظيفة ---
async function showFriendRequestsModal() {
    const modalId = 'friend-requests-modal';
    // --- ❌ تم حذف onclick من هنا ---
    const loadingHTML = `
        <div id="${modalId}" class="modal-backdrop fixed inset-0 bg-black/70 flex items-center justify-center z-[250] p-4">
            <div class="modal-content bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md text-white p-6">
                <h3 class="text-lg font-bold mb-4">طلبات الصداقة</h3>
                <div class="text-center p-6"><i class="fas fa-spinner fa-spin text-3xl"></i></div>
            </div>
        </div>
    `;
    // ... (باقي الكود يبقى كما هو)
        document.getElementById('game-container').insertAdjacentHTML('beforeend', loadingHTML);

    try {
        const response = await fetch('/api/users/me/details', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        if (!response.ok) throw new Error('Failed to load requests');
        
        const requests = result.data.user.friendRequestsReceived;
        let contentHTML = '<p class="text-gray-400">لا توجد طلبات حاليًا.</p>';

        if (requests && requests.length > 0) {
            contentHTML = requests.map(sender => `
                <div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-700/50">
                    <div class="flex items-center gap-3">
                        <img src="${sender.profileImage}" data-user-id="${sender._id}" class="w-10 h-10 rounded-full cursor-pointer user-image">
                        <span>${sender.username}</span>
                    </div>
                    <div class="flex gap-2">
                        <button class="friend-action-btn bg-blue-600 hover:bg-blue-700 text-white text-xs py-1 px-3 rounded-full" data-action="accept-request" data-user-id="${sender._id}">قبول</button>
                        <button class="friend-action-btn bg-gray-600 hover:bg-gray-700 text-white text-xs py-1 px-3 rounded-full" data-action="reject-request" data-user-id="${sender._id}">رفض</button>
                    </div>
                </div>
            `).join('');
        }

        const modalElement = document.getElementById(modalId);
        if (modalElement) {
            modalElement.querySelector('.modal-content').innerHTML = `
                <h3 class="text-lg font-bold mb-4">طلبات الصداقة</h3>
                <div class="space-y-2 max-h-80 overflow-y-auto pr-2">${contentHTML}</div>
            `;
        }

    } catch (error) {
        const modalElement = document.getElementById(modalId);
        if (modalElement) modalElement.querySelector('.modal-content').innerHTML = '<p class="text-red-400">فشل تحميل الطلبات.</p>';
    }
}


// --- ✅ استبدل دالة showFriendsListModal بهذه النسخة النظيفة ---
async function showFriendsListModal() {
    const modalId = 'friends-list-modal';
    // --- ❌ تم حذف onclick من هنا ---
    const loadingHTML = `
        <div id="${modalId}" class="modal-backdrop fixed inset-0 bg-black/70 flex items-center justify-center z-[250] p-4">
            <div class="modal-content bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md text-white p-6">
                <h3 class="text-lg font-bold mb-4">قائمة الأصدقاء</h3>
                <div class="text-center p-6"><i class="fas fa-spinner fa-spin text-3xl"></i></div>
            </div>
        </div>
    `;
    // ... (باقي الكود يبقى كما هو)
        document.getElementById('game-container').insertAdjacentHTML('beforeend', loadingHTML);

    try {
        const response = await fetch('/api/users/me/details', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        if (!response.ok) throw new Error('Failed to load friends');

        const friends = result.data.user.friends;
        let contentHTML = '<p class="text-gray-400">ليس لديك أصدقاء بعد.</p>';

        if (friends && friends.length > 0) {
            contentHTML = friends.map(friend => `
                <div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-700/50">
                    <div class="flex items-center gap-3">
                        <img src="${friend.profileImage}" data-user-id="${friend._id}" class="w-10 h-10 rounded-full cursor-pointer user-image">
                        <span>${friend.username}</span>
                    </div>
                    <button class="friend-action-btn bg-red-600 hover:bg-red-700 text-white text-xs py-1 px-3 rounded-full" data-action="remove-friend" data-user-id="${friend._id}">حذف</button>
                </div>
            `).join('');
        }

        const modalElement = document.getElementById(modalId);
        if (modalElement) {
            modalElement.querySelector('.modal-content').innerHTML = `
                <h3 class="text-lg font-bold mb-4">قائمة الأصدقاء</h3>
                <div class="space-y-2 max-h-80 overflow-y-auto pr-2">${contentHTML}</div>
            `;
        }

    } catch (error) {
        const modalElement = document.getElementById(modalId);
        if (modalElement) modalElement.querySelector('.modal-content').innerHTML = '<p class="text-red-400">فشل تحميل الأصدقاء.</p>';
    }
}

// --- ✅ دالة تحديث صور الأصدقاء المصغرة ---
async function updateFriendsAvatars(friendsList) {
    const friendsAvatars = document.getElementById('friends-avatars');
    if (!friendsAvatars) return;
    
    friendsAvatars.innerHTML = '';
    
    if (!friendsList || friendsList.length === 0) {
        friendsAvatars.innerHTML = '<p class="text-xs text-gray-500">لا توجد أصدقاء بعد</p>';
        return;
    }
    
    // عرض أول 5 أصدقاء فقط
    const displayFriends = friendsList.slice(0, 5);
    
    displayFriends.forEach(friend => {
        const avatar = document.createElement('div');
        avatar.className = 'relative';
        avatar.title = friend.username;
        
        avatar.innerHTML = `
            <img src="${friend.profileImage}" 
                 alt="${friend.username}"
                 class="w-10 h-10 rounded-full border-2 border-gray-600 hover:border-purple-500 cursor-pointer transition-all"
                 data-user-id="${friend._id}">
        `;
        
        friendsAvatars.appendChild(avatar);
    });
    
    // إذا كان هناك أكثر من 5 أصدقاء
    if (friendsList.length > 5) {
        const moreCount = document.createElement('div');
        moreCount.className = 'w-10 h-10 rounded-full bg-gray-700 border-2 border-gray-600 flex items-center justify-center text-xs font-bold';
        moreCount.textContent = `+${friendsList.length - 5}`;
        moreCount.title = `${friendsList.length - 5} صديق إضافي`;
        
        friendsAvatars.appendChild(moreCount);
    }
}

        
    // =================================================
    // ======== قسم التحديات (Battles Section) =========
    // =================================================

    const battlesContainer = document.getElementById('battle-rooms-container');

    function displayBattleCard(battle) {
        const container = document.getElementById('battle-rooms-container');
        const card = document.createElement('div');
        card.className = 'battle-card bg-gray-700/50 p-3 rounded-lg flex justify-between items-center';
        card.dataset.battleId = battle._id;
        card.dataset.isPrivate = battle.isPrivate;

        const maxPlayers = battle.type === '1v1' ? 2 : battle.type === '2v2' ? 4 : 8;
        const privateIcon = battle.isPrivate ? '<i class="fas fa-lock text-yellow-400 ml-2"></i>' : '';

        card.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="font-bold text-purple-300">${battle.type}</span>
                ${privateIcon}
                <div class="flex items-center gap-1 text-yellow-400"><i class="fas fa-coins"></i><span>${battle.betAmount}</span></div>
                <div class="flex -space-x-2">${battle.players.map(p => `<img src="${p.profileImage}" alt="${p.username}" class="w-8 h-8 rounded-full border-2 border-gray-600">`).join('')}</div>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-sm text-gray-400">${battle.players.length} / ${maxPlayers}</span>
                <button class="join-battle-btn bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1 px-3 rounded-full">انضم</button>
            </div>
        `;
        container.appendChild(card);
    }

    async function loadAvailableBattles() {
        const loadingState = document.getElementById('battles-loading-state');
        const emptyState = document.getElementById('battles-empty-state');
        loadingState.classList.remove('hidden');
        emptyState.classList.add('hidden');
        battlesContainer.querySelectorAll('.battle-card').forEach(card => card.remove());

        try {
            const response = await fetch('/api/battles', { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            loadingState.classList.add('hidden');
            if (response.ok && result.status === 'success') {
                if (result.data.battles.length === 0) {
                    emptyState.classList.remove('hidden');
                } else {
                    result.data.battles.forEach(displayBattleCard);
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
    loadAvailableBattles();

    battlesContainer.addEventListener('click', async (e) => {
        if (!e.target.classList.contains('join-battle-btn')) return;

        const battleCard = e.target.closest('.battle-card');
        const battleId = battleCard.dataset.battleId;
        const isPrivate = battleCard.dataset.isPrivate === 'true';

        e.target.disabled = true;
        e.target.textContent = 'جاري...';

        let password = null;
        if (isPrivate) {
            password = prompt("هذا التحدي خاص، يرجى إدخال كلمة المرور:");
            if (password === null) {
                e.target.disabled = false;
                e.target.textContent = 'انضم';
                return;
            }
        }

        try {
            const response = await fetch(`/api/battles/${battleId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ password: password })
            });
            const result = await response.json();
            if (!response.ok) {
                alert(result.message || 'فشل الانضمام');
                e.target.disabled = false;
                e.target.textContent = 'انضم';
            }
        } catch (error) {
            alert('خطأ في الاتصال بالخادم');
            e.target.disabled = false;
            e.target.textContent = 'انضم';
        }
    });

    // --- استبدل دالة showCreateBattleModal بالكامل بهذه النسخة ---

function showCreateBattleModal() {
    const modal = document.createElement('div');
    modal.id = 'create-battle-modal';
    modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';
    
    const modalHTML = `
        <div class="bg-gray-200 dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm text-gray-800 dark:text-white transition-colors duration-300">
            <h3 class="text-lg font-bold mb-4">إنشاء تحدي جديد</h3>
            <form id="create-battle-form" class="space-y-4">
                <div>
                    <label class="text-sm">نوع التحدي</label>
                    <select name="type" class="w-full bg-gray-300 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 rounded-lg p-2 mt-1 transition-colors duration-300">
                        <option value="1v1">1 ضد 1</option>
                        <option value="2v2">2 ضد 2</option>
                        <option value="4v4">4 ضد 4</option>
                    </select>
                </div>
                <div>
                    <label class="text-sm">مبلغ الرهان ($)</label>
                    <input type="number" name="betAmount" value="1" min="1" class="w-full bg-gray-300 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 rounded-lg p-2 mt-1 transition-colors duration-300">
                </div>
                <div class="flex items-center">
                    <input type="checkbox" id="isPrivate" name="isPrivate" class="w-4 h-4 rounded">
                    <label for="isPrivate" class="mr-2 text-sm">تحدي خاص</label>
                </div>
                <div id="password-field" class="hidden">
                    <label class="text-sm">كلمة المرور</label>
                    <input type="password" name="password" class="w-full bg-gray-300 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 rounded-lg p-2 mt-1 transition-colors duration-300">
                </div>
                <div class="flex justify-end gap-3 pt-4">
                    <button type="button" id="cancel-create-battle" class="bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-lg">إلغاء</button>
                    <button type="submit" class="bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg">تأكيد</button>
                </div>
            </form>
        </div>
    `;
    
    modal.innerHTML = modalHTML;
    document.body.appendChild(modal);

    // --- ✅✅ الإصلاح هنا: الكود المحدث لربط الأحداث ---
    // ربط الأحداث بعد إضافة النافذة إلى DOM
    const cancelButton = modal.querySelector('#cancel-create-battle');
    const battleForm = modal.querySelector('#create-battle-form');
    const privateCheckbox = modal.querySelector('#isPrivate');

    if (cancelButton) {
        cancelButton.addEventListener('click', () => modal.remove());
    }
    
    // إغلاق النافذة عند النقر على الخلفية
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'create-battle-modal') {
            modal.remove();
        }
    });

    if (privateCheckbox) {
        privateCheckbox.addEventListener('change', (e) => {
            modal.querySelector('#password-field').classList.toggle('hidden', !e.target.checked);
        });
    }

    if (battleForm) {
        battleForm.addEventListener('submit', async (e) => {
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
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
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
}

    document.getElementById('create-battle-btn').addEventListener('click', showCreateBattleModal);

    socket.on('newBattle', (battle) => {
        document.getElementById('battles-empty-state').classList.add('hidden');
        displayBattleCard(battle);
    });

    socket.on('battleUpdate', (updatedBattle) => {
        const cardToUpdate = document.querySelector(`.battle-card[data-battle-id="${updatedBattle._id}"]`);
        if (cardToUpdate) cardToUpdate.remove();
        if (updatedBattle.status === 'waiting') {
            displayBattleCard(updatedBattle);
        }
        if (battlesContainer.querySelectorAll('.battle-card').length === 0) {
            document.getElementById('battles-empty-state').classList.remove('hidden');
        }
    });

    // =================================================
    // =========== قسم اللعبة (Game Section) ===========
    // =================================================

    function showGameWindow() {
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer) return;
        // --- استبدل متغير modalHTML داخل دالة showGameWindow بهذا ---
const modalHTML = `
    <div id="game-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] p-4">
        <div class="bg-gray-800 border-2 border-purple-500 rounded-2xl shadow-2xl p-4 sm:p-6 w-full max-w-2xl text-white text-center">
            <h2 class="text-xl sm:text-2xl font-bold mb-4">لعبة النقرات الأسرع!</h2>
            <div id="game-status" class="mb-4 sm:mb-6 h-20 sm:h-24 flex items-center justify-center">
                <p class="text-2xl">استعد...</p>
            </div>
            <div class="grid grid-cols-2 gap-2 sm:gap-6 items-center">
                <!-- اللاعب الحالي -->
                <div class="flex flex-col items-center">
                    <p class="text-base sm:text-xl font-bold mb-2">${user.username} (أنت)</p>
                    
                    <!-- ✅ الإصلاح: أزرار متجاوبة -->
                    <button id="click-btn" class="w-32 h-32 sm:w-48 sm:h-48 bg-purple-600 rounded-full text-4xl sm:text-5xl font-bold shadow-lg transform transition hover:scale-105 active:scale-95 focus:outline-none">
                        انقر!
                    </button>
                    
                    <p class="mt-2 sm:mt-4 text-2xl sm:text-3xl">النقاط: <span id="my-score">0</span></p>
                </div>
                <!-- الخصم -->
                <div class="flex flex-col items-center">
                    <p class="text-base sm:text-xl font-bold mb-2">الخصم</p>
                    
                    <!-- ✅ الإصلاح: أزرار متجاوبة -->
                    <div class="w-32 h-32 sm:w-48 sm:h-48 bg-gray-700 rounded-full flex items-center justify-center">
                        <i class="fas fa-user-secret text-5xl sm:text-6xl text-gray-500"></i>
                    </div>
                    
                    <p class="mt-2 sm:mt-4 text-2xl sm:text-3xl">النقاط: <span id="opponent-score">0</span></p>
                </div>
            </div>
        </div>
    </div>
`;

        gameContainer.innerHTML = modalHTML;
        const clickBtn = document.getElementById('click-btn');
        if (clickBtn) {
            clickBtn.addEventListener('click', () => {
                const gameModal = document.getElementById('game-modal');
                const battleId = gameModal.dataset.battleId;
                if (battleId) socket.emit('playerClick', { battleId });
            });
        }
    }

    function updateGameState(gameState) {
        const gameModal = document.getElementById('game-modal');
        if (!gameModal || !gameState || typeof gameState.scores === 'undefined') return;
        const scores = gameState.scores;
        const myScore = scores[user._id] || 0;
        const playerIds = Object.keys(scores);
        const opponentId = playerIds.find(id => id !== user._id);
        const opponentScore = opponentId ? (scores[opponentId] || 0) : 0;
        gameModal.querySelector('#my-score').textContent = myScore;
        gameModal.querySelector('#opponent-score').textContent = opponentScore;
    }

    socket.on('battleCountdown', ({ countdown, battleId }) => {
        let gameModal = document.getElementById('game-modal');
        if (!gameModal) {
            showGameWindow();
            gameModal = document.getElementById('game-modal');
            gameModal.dataset.battleId = battleId;
        }
        const statusDiv = gameModal.querySelector('#game-status');
        if (statusDiv) statusDiv.innerHTML = `<p class="text-6xl font-bold animate-ping">${countdown}</p>`;
    });

    socket.on('gameStarted', ({ gameState }) => {
        const gameModal = document.getElementById('game-modal');
        if (!gameModal) return;
        const statusDiv = gameModal.querySelector('#game-status');
        statusDiv.innerHTML = `<p class="text-6xl font-bold text-green-400">انطلق!</p>`;
        let timer = gameState.timer;
        const timerInterval = setInterval(() => {
            const statusDiv = gameModal.querySelector('#game-status');
            if (statusDiv) statusDiv.innerHTML = `<div class="text-5xl font-mono">${timer}</div>`;
            timer--;
            if (timer < 0) {
                clearInterval(timerInterval);
                const clickBtn = document.getElementById('click-btn');
                if (clickBtn) clickBtn.disabled = true;
            }
        }, 1000);
        updateGameState(gameState);
    });

    socket.on('gameStateUpdate', (gameState) => {
        updateGameState(gameState);
    });

    socket.on('gameEnded', ({ battle, winnerId }) => {
        const gameModal = document.getElementById('game-modal');
        if (!gameModal) return;
        const statusDiv = gameModal.querySelector('#game-status');
        let message = '';
        if (!winnerId) {
            message = '<p class="text-4xl font-bold text-yellow-400">تعادل!</p>';
        } else if (winnerId === user._id) {
            message = '<p class="text-4xl font-bold text-green-400">لقد فزت!</p>';
        } else {
            message = '<p class="text-4xl font-bold text-red-400">لقد خسرت!</p>';
        }
        if (statusDiv) statusDiv.innerHTML = message;
        setTimeout(() => {
            const modal = document.getElementById('game-modal');
            if (modal) modal.remove();
        }, 5000);
    });

    // --- أضف هذه الدالة الجديدة ---
function showReplyBar(message) {
    replyingToMessage = message;
    let replyBar = document.getElementById('reply-bar');
    if (!replyBar) {
        replyBar = document.createElement('div');
        replyBar.id = 'reply-bar';
        replyBar.className = 'p-2 bg-gray-600 rounded-t-lg text-sm flex justify-between items-center';
        // أضف الشريط قبل صندوق إدخال الدردشة
        const chatInputContainer = document.querySelector('.chat-input-container');
        chatInputContainer.parentNode.insertBefore(replyBar, chatInputContainer);
    }
    replyBar.innerHTML = `
        <span>الرد على <strong>${message.sender.username}</strong></span>
        <button id="cancel-reply" class="text-red-400 hover:text-red-600">&times;</button>
    `;
    document.getElementById('cancel-reply').addEventListener('click', () => {
        replyingToMessage = null;
        replyBar.remove();
    });
}


  // --- أضف هذه الدالة الجديدة في نهاية app.js ---
async function handlePasswordUpdate(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const newPasswordConfirm = document.getElementById('new-password-confirm').value;

    if (newPassword.length < 6) {
        showNotification('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.', 'error');
        return;
    }
    if (newPassword !== newPasswordConfirm) {
        showNotification('كلمتا المرور الجديدتان غير متطابقتين.', 'error');
        return;
    }

    const updateBtn = e.target.querySelector('button[type="submit"]');
    updateBtn.disabled = true;
    updateBtn.textContent = 'جاري التحديث...';

    try {
        const response = await fetch('/api/auth/updateMyPassword', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ currentPassword, newPassword, newPasswordConfirm })
        });
        const result = await response.json();
        if (response.ok) {
            showNotification('تم تغيير كلمة المرور بنجاح!', 'success');
            // تحديث التوكن المحلي بالتوكن الجديد
            localStorage.setItem('token', result.token);
            e.target.reset(); // تفريغ الحقول
        } else {
            showNotification(result.message || 'فشل تحديث كلمة المرور', 'error');
        }
    } catch (error) {
        showNotification('خطأ في الاتصال بالخادم', 'error');
    } finally {
        updateBtn.disabled = false;
        updateBtn.textContent = 'تحديث كلمة المرور';
    }
}

// --- ✅ دالة جديدة: تحديث الحالة النصية ---
async function updateUserStatus(newStatus) {
    try {
        const response = await fetch('/api/users/updateStatus', {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('تم تحديث حالتك بنجاح!', 'success');
            
            // تحديث localStorage
            const localUser = JSON.parse(localStorage.getItem('user'));
            localUser.status = newStatus;
            localStorage.setItem('user', JSON.stringify(localUser));
            
            // تحديث الواجهة
            document.getElementById('user-status-text').textContent = newStatus;
            
            
            return true;
        } else {
            showNotification(result.message || 'فشل تحديث الحالة', 'error');
            return false;
        }
        
    } catch (error) {
        showNotification('خطأ في الاتصال بالخادم', 'error');
        return false;
    }
}
        
// --- ✅ ربط أيقونة تعديل الحالة ---
document.getElementById('edit-status-btn').addEventListener('click', () => {
    showStatusEditModal();
});
// --- ✅ ربط زر عرض مميزات المستوى ---
document.getElementById('show-level-perks').addEventListener('click', showLevelPerksModal);
        
// --- ✅ دالة عرض نافذة تعديل الحالة ---
function showStatusEditModal() {
    const currentStatus = document.getElementById('user-status-text').textContent;
    
    const modalHTML = `
        <div id="status-edit-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[250] p-4">
            <div class="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm text-white p-6">
                <h3 class="text-lg font-bold mb-4">✏️ تعديل حالتك</h3>
                <textarea id="status-input" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm" 
                          rows="3" maxlength="100" placeholder="اكتب حالتك هنا...">${currentStatus}</textarea>
                <div class="flex justify-between items-center mt-2 text-xs text-gray-400">
                    <span id="status-char-count">${currentStatus.length}/100</span>
                    <span>يمكنك استخدام إيموجي 🚀</span>
                </div>
                <div class="flex justify-end gap-3 mt-6">
                    <button id="cancel-status-edit" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">إلغاء</button>
                    <button id="save-status" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg">حفظ</button>
                </div>
            </div>
        </div>
    `;
    
        document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('status-edit-modal');
    const statusInput = document.getElementById('status-input');
    const charCount = document.getElementById('status-char-count');
    
    // تحديث عداد الأحرف
    statusInput.addEventListener('input', () => {
        charCount.textContent = `${statusInput.value.length}/100`;
    });
    
    // حفظ الحالة
    document.getElementById('save-status').addEventListener('click', async () => {
        const newStatus = statusInput.value.trim();
        if (newStatus && newStatus.length <= 100) {
            const success = await updateUserStatus(newStatus);
            if (success) {
                modal.remove();
            }
        } else {
            showNotification('الحالة يجب أن تكون بين 1 و100 حرف', 'error');
        }
    });
    
    // إلغاء
    document.getElementById('cancel-status-edit').addEventListener('click', () => {
        modal.remove();
    });
    
    // إغلاق بالنقر على الخلفية
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'status-edit-modal') {
            modal.remove();
        }
    });
}



// --- ✅ دالة عرض مميزات المستوى التالي ---
function showLevelPerksModal() {
    const currentLevel = parseInt(document.getElementById('userLevel').textContent);
    const nextLevel = currentLevel + 1;
    
    const perksByLevel = {
        2: ["🎨 لون اسم مميز في الدردشة", "💬 5 رسائل يومية إضافية"],
        3: ["🖼️ إطارات خاصة للصورة الشخصية", "🎁 هدية 50 عملة"],
        5: ["👑 لقب 'محارب'", "⭐ دخول غرف خاصة"],
        10: ["🏆 لقب 'بطل'", "🚀 سرعة تحميل أسرع", "🎯 مكافأة 500 XP"],
    };
    
    const currentPerks = perksByLevel[currentLevel] || ["🚀 بداية رحلة التحديات!"];
    const nextPerks = perksByLevel[nextLevel] || ["🔜 مزايا قادمة..."];
    
    const modalHTML = `
        <div id="level-perks-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[250] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white p-6 border-2 border-yellow-500/30">
                <div class="text-center mb-6">
                    <div class="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full mb-4">
                        <i class="fas fa-trophy text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold">مميزات المستوى</h3>
                    <p class="text-gray-400 text-sm">المستوى الحالي: <span class="text-yellow-400 font-bold">${currentLevel}</span></p>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- المستوى الحالي -->
                    <div class="bg-gray-800/50 p-4 rounded-xl">
                        <h4 class="font-bold text-green-400 mb-3 flex items-center gap-2">
                            <i class="fas fa-check-circle"></i> مميزاتك الحالية
                        </h4>
                        <ul class="space-y-2 text-sm">
                            ${currentPerks.map(perk => `<li class="flex items-start gap-2"><i class="fas fa-star text-yellow-400 mt-1"></i> ${perk}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <!-- المستوى التالي -->
                    <div class="bg-gray-800/50 p-4 rounded-xl border border-yellow-500/30">
                        <h4 class="font-bold text-yellow-400 mb-3 flex items-center gap-2">
                            <i class="fas fa-arrow-up"></i> المستوى ${nextLevel} القادم
                        </h4>
                        <ul class="space-y-2 text-sm">
                            ${nextPerks.map(perk => `<li class="flex items-start gap-2"><i class="fas fa-gift text-purple-400 mt-1"></i> ${perk}</li>`).join('')}
                        </ul>
                        <div class="mt-4 pt-3 border-t border-gray-700">
                            <p class="text-xs text-gray-400">
                                تحتاج <span class="text-yellow-400 font-bold">${calculateRequiredXp(currentLevel) - parseInt(document.getElementById('currentXP').textContent)}</span> XP إضافية
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="mt-6 pt-4 border-t border-gray-700">
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-400">تقدمك الحالي:</span>
                        <span class="font-bold">${document.getElementById('currentXP').textContent} / ${document.getElementById('requiredXP').textContent} XP</span>
                    </div>
                    <div class="w-full bg-gray-700 rounded-full h-2 mt-2">
                        <div class="bg-gradient-to-r from-yellow-400 to-orange-500 h-2 rounded-full" 
                             style="width: ${(parseInt(document.getElementById('currentXP').textContent) / parseInt(document.getElementById('requiredXP').textContent) * 100)}%"></div>
                    </div>
                </div>
                
                <div class="flex justify-center mt-6">
                    <button id="close-perks-modal" class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg transition">
                        إغلاق
                    </button>
                </div>
            </div>
        </div>
    `;
    
        document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('level-perks-modal');
    
    // إغلاق النافذة
    document.getElementById('close-perks-modal').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'level-perks-modal') {
            modal.remove();
        }
    });
}

// --- ✅ ربط شريط XP لعرض المميزات ---
document.querySelector('.mt-4').addEventListener('click', showLevelPerksModal);
        

}); // نهاية document.addEventListener
