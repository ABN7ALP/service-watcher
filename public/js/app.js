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
        } else {
            showArenaView();
        }
    });
});

// --- ✅ استبدل دالة showSettingsView بالكامل ---
async function showSettingsView() {
    const localUser = JSON.parse(localStorage.getItem('user'));
    
    // جلب قائمة المحظورين
    let blockedUsers = [];
    let blockedCount = 0;
    
    try {
        const response = await fetch('/api/blocks/blocked-list', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const result = await response.json();
            blockedUsers = result.data.blockedUsers || [];
            blockedCount = blockedUsers.length;
        }
    } catch (error) {
        console.error('Failed to load blocked users:', error);
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
    document.getElementById('username').textContent = userData.username;
    document.getElementById('balance').textContent = userData.balance.toFixed(2);
    document.getElementById('coins').textContent = userData.coins;
    document.getElementById('userLevel').textContent = userData.level;
    document.getElementById('profileImage').src = userData.profileImage;
    
    // ✅ تحديث الحالة النصية (جديد)
    document.getElementById('user-status-text').textContent = userData.status || '🚀 جاهز للتحديات!';
    
    // ✅ تحديث شريط XP (جديد)
    const requiredXP = calculateRequiredXp(userData.level);
    document.getElementById('currentXP').textContent = Math.floor(userData.experience);
    document.getElementById('requiredXP').textContent = requiredXP;
    
    // حساب نسبة التقدم
    const progressPercentage = (userData.experience / requiredXP) * 100;
    document.getElementById('xp-bar').style.width = `${progressPercentage}%`;
    
    // تحديث عدد الأصدقاء
    const friendsCount = userData.friends ? userData.friends.length : 0;
    document.getElementById('friends-count').textContent = friendsCount;
    
    // ✅ تحديث صور الأصدقاء المصغرة (جديد - سنضيفها لاحقاً)
    updateFriendsAvatars(userData.friends);
    
    // تحديث شارة طلبات الصداقة
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
        
        if (!response.ok) throw new Error('Failed to refresh user data');
        
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
            // 1. إشعار جميل
            showFloatingAlert('تم الحظر', 'fa-ban', 'bg-red-500');
            
            // 2. تحديث البيانات فوراً
            await refreshUserData();
            
            // 3. ✅ إرسال socket event لتحديث cache
            if (socket && socket.connected) {
                socket.emit('forceClearBlockCache', {
                    blockedBy: userId,
                    forceAll: true
                });
                
                socket.emit('refreshBlockData');
                
                console.log('[CLIENT] Sent socket events for cache refresh');
            }
            
            // 4. تحديث الأرقام مباشرة
            const user = JSON.parse(localStorage.getItem('user'));
            if (user && user.friends !== undefined) {
                document.getElementById('friends-count').textContent = user.friends.length;
                
                if (typeof updateFriendsAvatars === 'function') {
                    updateFriendsAvatars(user.friends);
                }
            }
            
            // 5. إغلاق النافذة فقط
            if (modalElement) {
                modalElement.remove();
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
        console.log(`[CLIENT BLOCK] Blocking user ${userId}`);
        
        const response = await fetch(`/api/blocks/unblock/${userId}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            }
        });
        
        const result = await response.json();
 
        if (response.ok) {
            // 1. إشعار جميل
            showFloatingAlert('تم رفع حظر', 'fa-ban', 'bg-red-500');
            
            // 2. تحديث البيانات فوراً
            await refreshUserData();

            // 3. ✅ إرسال socket event لتحديث cache
            if (socket && socket.connected) {
                socket.emit('forceClearBlockCache', {
                    blockedBy: userId,
                    forceAll: true
                });
                
                socket.emit('refreshBlockData');
                
                console.log('[CLIENT] Sent socket events for cache refresh');
            }
            
            // 4. تحديث الأرقام مباشرة
            const user = JSON.parse(localStorage.getItem('user'));
            if (user && user.friends !== undefined) {
                document.getElementById('friends-count').textContent = user.friends.length;
                
                if (typeof updateFriendsAvatars === 'function') {
                    updateFriendsAvatars(user.friends);
                }
            }
            
            // 5. إغلاق النافذة فقط
            if (modalElement) {
                modalElement.remove();
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

    // تحديث واجهة المستخدم بالبيانات الجديدة
    const levelText = document.querySelector('#level-container .font-bold');
    const xpText = document.querySelector('#level-container .text-gray-400');
    const xpBar = document.getElementById('xp-bar');

    if (levelText) levelText.textContent = `LVL ${level}`;
    if (xpText) xpText.textContent = `${Math.floor(experience)} / ${requiredXp} XP`;
    if (xpBar) xpBar.style.width = `${(experience / requiredXp) * 100}%`;

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


   // --- ✅ دالة جديدة لنافذة التأكيد ---
// --- ✅ استبدل دالة showConfirmationModal بالكامل ---
function showConfirmationModal(message, onConfirm) {
    const oldModal = document.getElementById('confirmation-modal');
    if (oldModal) oldModal.remove();

    const modalHTML = `
        <div id="confirmation-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[300] p-4">
            <div class="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm text-white p-6 text-center">
                <p class="mb-6">${message}</p>
                <div class="flex justify-center gap-4">
                    <button id="confirm-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg">تأكيد</button>
                    <button id="cancel-btn" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-lg">إلغاء</button>
                </div>
            </div>
        </div>
    `;
    const container = document.getElementById('game-container');
    container.innerHTML += modalHTML;

    const modal = document.getElementById('confirmation-modal');
    const confirmBtn = document.getElementById('confirm-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    // --- ✅ الإصلاح يبدأ هنا ---
    const closeModal = () => {
        modal.remove();
        // بعد إغلاق نافذة التأكيد، أعد ربط حدث الإغلاق لأي نافذة ملف شخصي قد تكون مفتوحة
        const miniProfileModal = document.getElementById('mini-profile-modal');
        if (miniProfileModal) {
            // نزيل أي مستمعات قديمة لضمان عدم تكرارها
            const newModal = miniProfileModal.cloneNode(true);
            miniProfileModal.parentNode.replaceChild(newModal, miniProfileModal);
            
            // نضيف المستمع من جديد
            newModal.addEventListener('click', (e) => {
                if (e.target.id === 'mini-profile-modal') {
                    newModal.remove();
                }
            });
        }
    };
    // --- نهاية الإصلاح ---

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
    alertElement.className = `floating-alert fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${color}/80 text-white font-bold px-4 py-2 rounded-full shadow-lg z-[300]`;
    
    document.body.appendChild(alertElement);

    setTimeout(() => {
        alertElement.remove();
    }, 1900);
}
     

        // --- ✅ دالة جديدة لعرض الملف الشخصي المصغر ---
async function showMiniProfileModal(userId) {
    try {
        // ✅ أولاً: التحقق من حالة الحظر المتبادل
        const blockCheckResponse = await fetch(`/api/blocks/mutual-status/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!blockCheckResponse.ok) {
            throw new Error('Failed to check block status');
        }
        
        const blockResult = await blockCheckResponse.json();
        const blockData = blockResult.data;
        
        // ✅ السيناريو 1: إذا كان المستخدم قد حظرني
        if (blockData.blockStatus.heBlockedMe) {
            showBlockedProfileModal(userId, blockData);
            return;
        }
        
        // ✅ السيناريو 2: إذا لم يحظرني، جلب بياناته
        const userResponse = await fetch(`/api/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!userResponse.ok) throw new Error('User not found');
        
        const userResult = await userResponse.json();
        const profileUser = userResult.data.user;
        
        // ✅ جلب بيانات المستخدم الحالي المحدثة
        const selfUserData = JSON.parse(localStorage.getItem('user'));
        if (!selfUserData) {
            showNotification('يجب تسجيل الدخول أولاً', 'error');
            return;
        }
        
        // ✅ تحضير البيانات
        const socialInfo = getSocialStatus(profileUser.socialStatus);
        const educationInfo = getEducationStatus(profileUser.educationStatus);
        const genderInfo = profileUser.gender === 'male' 
            ? { text: 'ذكر', icon: 'fa-mars', color: 'text-blue-400' }
            : { text: 'أنثى', icon: 'fa-venus', color: 'text-pink-400' };
        
        // ✅ زر الصداقة الديناميكي
        const friendButtonHTML = getFriendButtonHTML(profileUser, selfUserData);
        
        // ✅ زر الحظر/فك الحظر الديناميكي
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
        
        // ✅ HTML النافذة
        const modalHTML = `
            <div id="mini-profile-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4">
                <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-sm text-white transform scale-95 transition-transform duration-300 border-2 border-purple-500/30">
                    
                    <!-- الصورة والمعلومات الأساسية -->
                    <div class="flex flex-col items-center px-4 pt-6">
                        <!-- الصورة الشخصية -->
                        <img src="${profileUser.profileImage}" 
                             class="w-28 h-28 rounded-full border-4 border-purple-500 object-cover shadow-lg">
                        
                        <!-- الاسم والـ ID -->
                        <h2 class="text-xl font-bold mt-4">${profileUser.username}</h2>
                        <div class="text-xs text-gray-400 mt-1 cursor-pointer flex items-center gap-2 copy-id-btn">
                           <i class="fas fa-id-card"></i>
                           <span>ID: ${profileUser.customId}</span>
                           <i class="fas fa-copy text-xs"></i>
                        </div>
                        
                        <!-- ✅ الحالة النصية -->
                        <div class="mt-3 w-full">
                            <p id="profile-user-status" class="text-sm text-gray-300 italic text-center px-4 py-2 bg-gray-800/50 rounded-lg border border-gray-700">
                                ${profileUser.status || '🚀 جاهز للتحديات!'}
                            </p>
                        </div>
                        
                        <!-- ✅ شارة "محظور من قبلك" -->
                        ${isBlockedByMe ? `
                            <div class="mt-2 bg-red-900/30 border border-red-700 rounded-full px-3 py-1">
                                <span class="text-xs text-red-300">
                                    <i class="fas fa-ban mr-1"></i> محظور من قبلك
                                </span>
                            </div>
                        ` : ''}
                    </div>
                    
                    <!-- الإحصائيات (مستوى وأصدقاء) -->
                    <div class="grid grid-cols-2 gap-4 p-6">
                        <!-- المستوى -->
                        <div class="bg-gray-800/50 p-4 rounded-xl text-center hover:bg-gray-700/50 transition group">
                            <div class="text-3xl font-bold text-yellow-400 mb-1">${profileUser.level}</div>
                            <div class="text-xs text-gray-400">المستوى</div>
                            <div class="text-xs text-gray-500 mt-2 opacity-0 group-hover:opacity-100 transition">
                                ${profileUser.experience} XP
                            </div>
                        </div>
                        
                        <!-- الأصدقاء -->
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
                    
                    <!-- المعلومات الشخصية -->
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
                    
                    <!-- أزرار الإجراءات -->
                    <div id="profile-action-buttons" class="grid grid-cols-4 gap-2 border-t border-gray-700/50 p-4">
                        ${friendButtonHTML}
                        <button class="action-btn message-btn" data-user-id="${profileUser._id}">
                              <i class="fas fa-comment-dots"></i>
                           <span class="text-xs mt-1">رسالة</span>
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

        const container = document.getElementById('game-container');
        container.innerHTML = modalHTML;
        const modal = container.querySelector('#mini-profile-modal');
        
        // تأثير الظهور
        setTimeout(() => {
            modal.querySelector('.transform').classList.remove('scale-95');
        }, 50);
        
        // --- ✅ event delegation للأزرار داخل النافذة ---
        modal.addEventListener('click', (e) => {
            // 1. إغلاق بالنقر على الخلفية
            if (e.target.id === 'mini-profile-modal') {
                modal.remove();
                return;
            }
            // 6. أزرار الصداقة (مثل إضافة، حذف، إلخ)
const friendActionBtn = e.target.closest('.action-btn[data-action]');
if (friendActionBtn) {
    const action = friendActionBtn.dataset.action;
    const userId = friendActionBtn.dataset.userId;
    
    // معالجة إجراءات الصداقة المختلفة
    handleFriendAction(action, userId, modal);
    return;
}
            
            // 2. زر نسخ الـ ID
            if (e.target.closest('.copy-id-btn')) {
                const idToCopy = profileUser.customId;
                
                navigator.clipboard.writeText(idToCopy)
                    .then(() => {
                        // إشعار عائم جميل
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


            // 3. زر الرسالة
if (e.target.closest('.message-btn')) {
    const userId = e.target.closest('.message-btn').dataset.userId;
    const username = e.target.closest('.message-btn').closest('#mini-profile-modal')?.querySelector('h2')?.textContent || 'المستخدم';
    
    openPrivateChat(userId, username);
    return;
}
            
            // 3. زر الحظر
            if (e.target.closest('.block-action-btn')) {
                const userIdToBlock = e.target.closest('.block-action-btn').dataset.userId;
                blockUser(userIdToBlock, modal);
                return;
            }
            
            // 4. زر فك الحظر
            if (e.target.closest('.unblock-action-btn')) {
                const userIdToUnblock = e.target.closest('.unblock-action-btn').dataset.userId;
                unblockUser(userIdToUnblock, modal);
                return;
            }
            
            // 5. زر الإغلاق
            if (e.target.closest('.close-mini-profile-btn')) {
                modal.remove();
                return;
            }
        });

    } catch (error) {
        console.error("Error showing mini profile:", error);
        showNotification('لا يمكن عرض ملف المستخدم حاليًا.', 'error');
    }
}


        
// --- 📨 دالة فتح الدردشة الخاصة ---
async function openPrivateChat(targetUserId, targetUsername = 'المستخدم') {
    console.log(`[CHAT] Opening private chat with: ${targetUserId} (${targetUsername})`);
    
    // 1. إغلاق نافذة البروفايل المصغر إذا كانت مفتوحة
    const profileModal = document.getElementById('mini-profile-modal');
    if (profileModal) profileModal.remove();
    
    // 2. التحقق من الحظر المتبادل
    try {
        const blockResponse = await fetch(`/api/blocks/mutual-status/${targetUserId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (blockResponse.ok) {
            const blockResult = await blockResponse.json();
            if (blockResult.data.blockStatus.heBlockedMe) {
                showNotification('لا يمكنك مراسلة مستخدم حظرك', 'error');
                return;
            }
        }
    } catch (error) {
        console.error('[CHAT] Error checking block status:', error);
    }
    
    // 3. إنشاء HTML نافذة الدردشة
    const chatHTML = `
        <div id="private-chat-modal" data-target-user-id="${targetUserId}" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[300] p-2 md:p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl h-[85vh] md:h-[80vh] flex flex-col overflow-hidden border-2 border-purple-500/30">
                
                <!-- 🔹 رأس الدردشة -->
                <div class="flex items-center justify-between p-4 bg-gray-900/80 border-b border-gray-700">
                    <div class="flex items-center gap-3">
                        <button id="close-private-chat" class="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700">
                            <i class="fas fa-arrow-right text-lg"></i>
                        </button>
                        <img id="chat-user-avatar" src="" alt="${targetUsername}" 
                             class="w-10 h-10 rounded-full border-2 border-purple-500 object-cover">
                        <div>
                            <h3 id="chat-user-name" class="font-bold text-white">${targetUsername}</h3>
                            <p id="chat-user-status" class="text-xs text-gray-400">
                                <i class="fas fa-circle text-green-500 mr-1"></i> متصل الآن
                            </p>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-2">
                        <!-- أزرار الإجراءات -->
                        <button class="chat-action-btn" title="إجراءات">
                            <i class="fas fa-ellipsis-v text-gray-400 hover:text-white"></i>
                        </button>
                        <button class="chat-action-btn" title="مكالمة صوتية">
                            <i class="fas fa-phone-alt text-gray-400 hover:text-blue-400"></i>
                        </button>
                        <button class="chat-action-btn" title="معلومات">
                            <i class="fas fa-info-circle text-gray-400 hover:text-purple-400"></i>
                        </button>
                    </div>
                </div>
                
                <!-- 🔹 منطقة الرسائل -->
                <div id="private-chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-900 to-gray-800">
                    <!-- الرسائل ستضاف هنا بالجافاسكريبت -->
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-comments text-3xl mb-3"></i>
                        <p>ابدأ محادثة جديدة مع ${targetUsername}</p>
                        <p class="text-sm text-gray-600 mt-1">لا توجد رسائل سابقة</p>
                    </div>
                </div>
                
                <!-- 🔹 شريط الإرسال -->
                <div class="p-3 border-t border-gray-700 bg-gray-900/50">
                    
                    <!-- شريط الخيارات (مخفي افتراضيًا) -->
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
                    
                    <!-- شريط الإدخال الأساسي -->
                    <div class="flex items-center gap-2">
                        <!-- زر فتح الخيارات -->
                        <button id="toggle-chat-options" class="bg-gray-700 hover:bg-gray-600 w-10 h-10 rounded-full flex items-center justify-center">
                            <i class="fas fa-plus text-gray-300"></i>
                        </button>
                        
                        <!-- حقل إدخال النص -->
                        <div class="flex-1 relative">
                            <input type="text" id="private-message-input" 
                                   placeholder="اكتب رسالتك هنا..." 
                                   maxlength="200"
                                   class="w-full bg-gray-700 border border-gray-600 rounded-full py-3 px-5 pr-12 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                            <div id="private-char-count" class="absolute top-1/2 right-4 transform -translate-y-1/2 text-xs text-gray-500">0/200</div>
                        </div>
                        
                        <!-- زر الإرسال -->
                        <button id="send-private-message" 
        class="dynamic-send-btn bg-purple-600 hover:bg-purple-700 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300"
        data-mode="voice">
    <i class="fas fa-microphone text-white"></i>
</button>
                    </div>
                    
                    <!-- شريط معلومات (للملفات) -->
                    <div id="file-upload-info" class="hidden mt-3 p-2 bg-gray-800 rounded-lg">
                        <div class="flex items-center justify-between">
                            <span class="text-sm text-gray-300">جاري رفع صورة...</span>
                            <div class="flex items-center gap-2">
                                <span class="text-xs text-gray-400">75%</span>
                                <button class="text-red-400 hover:text-red-300">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // 4. إضافة النافذة إلى الـ DOM
    document.getElementById('game-container').innerHTML += chatHTML;
    
    // 5. تحميل صورة المستخدم وبياناته
    loadChatUserData(targetUserId);
    
    // 6. ربط الأحداث
    setupPrivateChatEvents(targetUserId);
    
    // 7. جلب تاريخ المحادثة (إن وجد)
   await loadChatHistoryFromServer(targetUserId);
}


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
            // إزالة رسالة "ابدأ محادثة جديدة"
            const emptyState = messagesContainer.querySelector('.text-center');
            if (emptyState) emptyState.remove();
            
            // عرض الرسائل
            result.data.messages.forEach(message => {
                const isMyMessage = message.sender._id === JSON.parse(localStorage.getItem('user'))._id;
                displayPrivateMessage(message, isMyMessage);
            });
            
            // تحديث بيانات المستخدم في رأس الدردشة
            updateChatHeader(result.data.chat);
            
            console.log(`✅ [CHAT] Loaded ${result.data.messages.length} messages`);
            
            // تحديث حالة الرسائل غير المقروءة
            if (result.data.unreadCount > 0) {
                markMessagesAsDelivered(result.data.messages);
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
                
                // تحديث الصورة والاسم
                const avatar = document.getElementById('chat-user-avatar');
                const name = document.getElementById('chat-user-name');
                
                if (avatar) avatar.src = user.profileImage;
                if (name) name.textContent = user.username;
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
    
    // 4. زر الإرسال
    // 4. زر الإرسال (ديناميكي)
const sendBtn = document.getElementById('send-private-message');
if (sendBtn && messageInput) {
    // إزالة المستمع القديم أولاً إذا كان موجوداً
    sendBtn.removeEventListener('click', sendBtn.clickHandler);
    
    // تعريف دالة جديدة
    sendBtn.clickHandler = () => {
        if (sendBtn.dataset.mode === 'voice') {
            // بدء تسجيل صوتي
            startWhatsAppStyleRecording(targetUserId);
        } else {
            // إرسال نص
            sendPrivateMessage(targetUserId, messageInput.value.trim());
            messageInput.value = '';
            if (charCounter) charCounter.textContent = '0/200';
            updateSendButton(); // تحديث الزر بعد الإرسال
        }
    };
    
    // إضافة المستمع الجديد
    sendBtn.addEventListener('click', sendBtn.clickHandler);
}
    
    // 5. إرسال بـ Enter
if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (sendBtn.dataset.mode === 'text') {
                sendPrivateMessage(targetUserId, messageInput.value.trim());
                messageInput.value = '';
                if (charCounter) charCounter.textContent = '0/200';
                updateSendButton(); // تحديث الزر بعد الإرسال
            }
            // إذا كان mode = voice، لا نفعل شيئاً عند Enter
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
    
    // 7. أزرار الوسائط
    document.querySelectorAll('.chat-media-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.dataset.type;
            handleMediaButtonClick(type, targetUserId);
        });
    });
}
// --- 🎮 دالة معالجة أزرار الوسائط ---
function handleMediaButtonClick(type, targetUserId) {
    console.log(`[CHAT] Media button clicked: ${type} for user ${targetUserId}`);
    
    switch(type) {
        case 'image':
            showImageUploadModal(targetUserId);
            break;
        case 'video':
            showNotification('إرسال الفيديو قريباً...', 'info');
            // showVideoUploadModal(targetUserId); // لاحقاً
            break;
        case 'voice':
           startWhatsAppStyleRecording(targetUserId);
            break;
        case 'file':
            showNotification('إرسال الملفات قريباً...', 'info');
            // showFileUploadModal(targetUserId); // لاحقاً
            break;
    }
}



    
    
        // =================================================
// 🎤 دالة تسجيل الصوت بنظام مبسط (بدون سحب)
// =================================================
function startWhatsAppStyleRecording(targetUserId) {
    console.log(`[VOICE] Starting simplified recording for: ${targetUserId}`);
    
    // منع تسجيل جديد إذا كان هناك تسجيل قيد التشغيل
    if (window.isRecordingActive) {
        console.log('[VOICE] Recording already in progress');
        return;
    }
    
    const chatModal = document.getElementById('private-chat-modal');
    if (!chatModal) {
        console.error('[VOICE] Chat modal not found');
        return;
    }
    
    // حفظ العناصر الأصلية
    const originalInput = document.getElementById('private-message-input');
    const originalSendBtn = document.getElementById('send-private-message');
    const originalCharCounter = document.getElementById('private-char-count');
    
    if (!originalInput || !originalSendBtn) {
        console.error('[VOICE] Required elements not found');
        return;
    }
    
    // وضع علامة أن هناك تسجيل قيد التشغيل
    window.isRecordingActive = true;
    
    // إخفاء العناصر الأصلية
    originalInput.style.display = 'none';
    if (originalCharCounter) originalCharCounter.style.display = 'none';
    
    // إنشاء واجهة التسجيل المبسطة
    const recordingUI = document.createElement('div');
    recordingUI.id = 'voice-recording-ui';
    recordingUI.className = 'flex items-center justify-between w-full bg-gray-800 rounded-full px-6 py-4 shadow-lg border-2 border-purple-600';
    recordingUI.innerHTML = `
        <div class="flex items-center gap-4">
            <!-- مؤشر التسجيل -->
            <div id="recording-indicator" class="relative">
                <div class="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                    <i class="fas fa-microphone text-white"></i>
                </div>
                <!-- نقطة حمراء -->
                <div class="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full border-2 border-gray-800"></div>
            </div>
            
            <!-- معلومات التسجيل -->
            <div class="flex flex-col">
                <p id="recording-status" class="text-sm font-bold text-white">جاري التسجيل...</p>
                <p id="recording-timer" class="text-xs text-gray-300">00:00</p>
                <p class="text-xs text-gray-400 mt-1">الحد الأقصى: 15 ثانية</p>
            </div>
        </div>
        
        <!-- أزرار التحكم -->
        <div class="flex items-center gap-4">
            <!-- زر الإلغاء -->
            <button id="cancel-recording" 
                    class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-red-600 text-white rounded-full transition-all duration-300">
                <i class="fas fa-times"></i>
                <span class="text-sm">إلغاء</span>
            </button>
            
            <!-- زر الإرسال -->
            <button id="send-recording" 
                    class="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-full transition-all duration-300 hidden">
                <i class="fas fa-paper-plane"></i>
                <span class="text-sm">إرسال</span>
            </button>
            
            <!-- زر التوقف/الاستئناف (يظهر أثناء التسجيل) -->
            <button id="stop-recording" 
                    class="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full transition-all duration-300">
                <i class="fas fa-stop"></i>
                <span class="text-sm">توقف</span>
            </button>
        </div>
    `;
    
    // وضع واجهة التسجيل مكان حقل النص
    originalInput.parentNode.insertBefore(recordingUI, originalInput.nextSibling);
    
    // متغيرات التسجيل
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = true;
    let recordingStartTime = null;
    let recordingTimer = null;
    let recordingDuration = 0;
    
    // عناصر الواجهة
    const recordingIndicator = document.getElementById('recording-indicator');
    const recordingTimerElement = document.getElementById('recording-timer');
    const recordingStatus = document.getElementById('recording-status');
    const cancelBtn = document.getElementById('cancel-recording');
    const sendBtn = document.getElementById('send-recording');
    const stopBtn = document.getElementById('stop-recording');
    
    // بدء التسجيل
    startRecording();
    
    // دالة بدء التسجيل
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = async () => {
                // لا نفعل شيئاً هنا، ننتظر زر الإرسال
                console.log('[VOICE] Recording stopped, waiting for send/cancel');
            };
            
            // بدء التسجيل
            mediaRecorder.start();
            recordingStartTime = Date.now();
            
            // بدء المؤقت
            startTimer();
            
        } catch (error) {
            console.error('[VOICE] Error starting recording:', error);
            showNotification('فشل الوصول إلى الميكروفون', 'error');
            cleanupRecordingUI();
        }
    }
    
    // دالة بدء المؤقت
    function startTimer() {
        recordingTimer = setInterval(() => {
            recordingDuration = Math.floor((Date.now() - recordingStartTime) / 1000);
            
            // تحديث العرض
            const minutes = Math.floor(recordingDuration / 60).toString().padStart(2, '0');
            const seconds = (recordingDuration % 60).toString().padStart(2, '0');
            recordingTimerElement.textContent = `${minutes}:${seconds}`;
            
            // تغيير اللون عند الاقتراب من النهاية
            if (recordingDuration >= 13) {
                recordingTimerElement.classList.add('text-red-400', 'font-bold');
            }
            
            // إيقاف تلقائي عند 15 ثانية
            if (recordingDuration >= 15) {
                stopRecording();
                showNotification('تم الوصول للحد الأقصى (15 ثانية)', 'info');
            }
            
        }, 1000);
    }
    
    // دالة إيقاف التسجيل
    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            
            // إيقاف المؤقت
            if (recordingTimer) {
                clearInterval(recordingTimer);
                recordingTimer = null;
            }
            
            // تحديث الواجهة
            recordingIndicator.classList.remove('animate-pulse');
            recordingStatus.textContent = 'تم التسجيل ✓';
            recordingStatus.classList.add('text-green-400');
            
            // تبديل الأزرار
            stopBtn.classList.add('hidden');
            sendBtn.classList.remove('hidden');
        }
    }
    
    // دالة إلغاء التسجيل
    function cancelRecording() {
        if (mediaRecorder) {
            mediaRecorder.stop();
            isRecording = false;
            
            // إيقاف المؤقت
            if (recordingTimer) {
                clearInterval(recordingTimer);
                recordingTimer = null;
            }
            
            showNotification('تم إلغاء التسجيل', 'info');
            cleanupRecordingUI();
        }
    }
    
    // دالة إرسال التسجيل
    async function sendRecording() {
        if (audioChunks.length === 0) {
            showNotification('لا يوجد تسجيل لإرساله', 'error');
            return;
        }
        
        // تحويل إلى Blob
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        
        // إرسال الصوت
        await sendVoiceMessage(audioBlob, recordingDuration, targetUserId);
        
        // تنظيف
        cleanupRecordingUI();
    }
    
    // دالة تنظيف واجهة التسجيل
    // دالة تنظيف واجهة التسجيل
function cleanupRecordingUI() {
    console.log('[VOICE] Cleaning up recording UI');
    
    // 1. إزالة واجهة التسجيل
    if (recordingUI && recordingUI.parentNode) {
        recordingUI.remove();
    }
    
    // 2. إعادة إظهار العناصر الأصلية
    if (originalInput) {
        originalInput.style.display = '';
        originalInput.value = ''; // تفريغ الحقل
        originalInput.focus();
    }
    
    if (originalCharCounter) {
        originalCharCounter.style.display = '';
        originalCharCounter.textContent = '0/200';
    }
    
    // 3. تحديث زر الإرسال
    if (originalSendBtn) {
        // إعادة تعيين الزر لحالة الميكروفون
        originalSendBtn.innerHTML = '<i class="fas fa-microphone text-white"></i>';
        originalSendBtn.dataset.mode = 'voice';
        originalSendBtn.title = 'تسجيل صوتي (اضغط مع الاستمرار)';
        
        // إزالة أي classes إضافية
        originalSendBtn.classList.remove('bg-red-600', 'bg-green-600');
        originalSendBtn.classList.add('bg-purple-600');
    }
    
    // 4. إزالة علامة التسجيل النشط (مهم جداً!)
    window.isRecordingActive = false;
    console.log('[VOICE] isRecordingActive set to false');
    
    // 5. إزالة أي أحداث موصولة بالزر
    if (originalSendBtn && originalSendBtn.clickHandler) {
        originalSendBtn.removeEventListener('click', originalSendBtn.clickHandler);
        delete originalSendBtn.clickHandler;
    }
}
    
    // أحداث الأزرار
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelRecording);
    }
    
    if (sendBtn) {
        sendBtn.addEventListener('click', sendRecording);
    }
    
    if (stopBtn) {
        stopBtn.addEventListener('click', stopRecording);
    }
    
    // إغلاق عند النقر خارج الواجهة (اختياري)
    document.addEventListener('click', function outsideClickHandler(e) {
        if (!recordingUI.contains(e.target) && e.target !== originalSendBtn) {
            // لا نغلق تلقائياً، نترك المستخدم يقرر
        }
    });
}
        

   // --- 🖼️ دالة عرض نافذة رفع الصور ---
function showImageUploadModal(targetUserId) {
    console.log(`[IMAGE UPLOAD] Opening for user: ${targetUserId}`);
    
    // إغلاق شريط الخيارات
    const optionsBar = document.getElementById('chat-options-bar');
    if (optionsBar) optionsBar.classList.add('hidden');
    
    const modalHTML = `
        <div id="image-upload-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[350] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white overflow-hidden border-2 border-purple-500/30">
                
                <!-- رأس النافذة -->
                <div class="flex items-center justify-between p-4 bg-gray-900/80 border-b border-gray-700">
                    <h3 class="text-lg font-bold">
                        <i class="fas fa-image mr-2 text-green-400"></i>
                        إرسال صورة
                    </h3>
                    <button class="close-image-modal text-gray-400 hover:text-white p-2">
                        <i class="fas fa-times text-lg"></i>
                    </button>
                </div>
                
                <!-- منطقة الرفع -->
                <div class="p-6">
                    <!-- منطقة سحب وإسقاط -->
                    <div id="drop-zone" 
                         class="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-green-500 transition-colors duration-300 bg-gray-900/50 mb-6">
                        
                        <div id="upload-area-content">
                            <i class="fas fa-cloud-upload-alt text-4xl text-gray-500 mb-4"></i>
                            <p class="font-medium mb-2">اسحب وأفلت الصورة هنا</p>
                            <p class="text-sm text-gray-400 mb-4">أو انقر للاختيار</p>
                            <p class="text-xs text-gray-500">(حد أقصى 5MB - JPG, PNG, GIF, WebP)</p>
                        </div>
                        
                        <!-- معاينة الصورة -->
                        <div id="image-preview" class="hidden mt-4">
                            <img id="preview-image" class="max-w-full max-h-48 rounded-lg mx-auto">
                            <div class="mt-2 flex items-center justify-between text-sm">
                                <span id="file-name" class="truncate"></span>
                                <span id="file-size" class="text-gray-400"></span>
                            </div>
                        </div>
                        
                        <!-- شريط التقدم -->
                        <div id="upload-progress" class="hidden mt-4">
                            <div class="flex justify-between text-xs mb-1">
                                <span>جاري الرفع...</span>
                                <span id="progress-percent">0%</span>
                            </div>
                            <div class="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                                <div id="progress-bar" class="bg-green-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                            </div>
                        </div>
                        
                        <!-- زر الاختيار المخفي -->
                        <input type="file" id="image-file-input" class="hidden" accept="image/*">
                    </div>
                    
                    <!-- خيارات الحماية -->
                    <div class="bg-gray-900/30 p-4 rounded-xl mb-6">
                        <h4 class="font-bold mb-3 flex items-center gap-2">
                            <i class="fas fa-shield-alt text-blue-400"></i>
                            خيارات الحماية
                        </h4>
                        
                        <div class="space-y-3">
                            <!-- مشاهدة مرة واحدة -->
                            <label class="flex items-center gap-3 cursor-pointer hover:bg-gray-800/50 p-2 rounded-lg transition-colors">
                                <input type="checkbox" id="view-once" class="w-4 h-4 rounded text-green-500">
                                <div class="flex-1">
                                    <span class="font-medium">مشاهدة مرة واحدة</span>
                                    <p class="text-xs text-gray-400">تختفي الصورة بعد مشاهدتها</p>
                                </div>
                                <i class="fas fa-eye text-yellow-400"></i>
                            </label>
                            
                            <!-- منع الحفظ -->
                            <label class="flex items-center gap-3 cursor-pointer hover:bg-gray-800/50 p-2 rounded-lg transition-colors">
                                <input type="checkbox" id="disable-save" class="w-4 h-4 rounded text-green-500">
                                <div class="flex-1">
                                    <span class="font-medium">منع الحفظ</span>
                                    <p class="text-xs text-gray-400">لا يمكن حفظ الصورة</p>
                                </div>
                                <i class="fas fa-download-slash text-red-400"></i>
                            </label>
                            
                            <!-- علامة مائية -->
                            <label class="flex items-center gap-3 cursor-pointer hover:bg-gray-800/50 p-2 rounded-lg transition-colors">
                                <input type="checkbox" id="add-watermark" class="w-4 h-4 rounded text-green-500">
                                <div class="flex-1">
                                    <span class="font-medium">علامة مائية</span>
                                    <p class="text-xs text-gray-400">إضافة شعار المنصة</p>
                                </div>
                                <i class="fas fa-copyright text-blue-400"></i>
                            </label>
                            
                            <!-- منع الرد -->
                            <label class="flex items-center gap-3 cursor-pointer hover:bg-gray-800/50 p-2 rounded-lg transition-colors">
                                <input type="checkbox" id="disable-reply" class="w-4 h-4 rounded text-green-500">
                                <div class="flex-1">
                                    <span class="font-medium">منع الرد</span>
                                    <p class="text-xs text-gray-400">لا يمكن الرد على هذه الصورة</p>
                                </div>
                                <i class="fas fa-reply text-purple-400"></i>
                            </label>
                        </div>
                    </div>
                    
                    <!-- أزرار الإجراء -->
                    <div class="flex gap-3">
                        <button id="cancel-image-upload" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg transition">
                            إلغاء
                        </button>
                        <button id="send-image-button" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                            <i class="fas fa-paper-plane mr-2"></i>
                            إرسال
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // إضافة النافذة إلى الـ DOM
    document.getElementById('game-container').innerHTML += modalHTML;
    
    // ربط الأحداث
    setupImageUploadEvents(targetUserId);
}

// --- 🎮 دالة إعداد أحداث رفع الصور ---
function setupImageUploadEvents(targetUserId) {
    const modal = document.getElementById('image-upload-modal');
    if (!modal) return;
    
    let selectedFile = null;
    let uploadInProgress = false;
    
    // 1. زر الإغلاق
    const closeBtn = modal.querySelector('.close-image-modal');
    const cancelBtn = modal.querySelector('#cancel-image-upload');
    
    const closeModal = () => {
        if (!uploadInProgress) {
            modal.remove();
        } else {
            showNotification('انتظر اكتمال الرفع', 'warning');
        }
    };
    
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    // 2. إغلاق بالنقر على الخلفية
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'image-upload-modal') {
            closeModal();
        }
    });
    
    // 3. اختيار ملف
    const fileInput = modal.querySelector('#image-file-input');
    const dropZone = modal.querySelector('#drop-zone');
    const sendButton = modal.querySelector('#send-image-button');
    
    dropZone.addEventListener('click', () => {
        if (!uploadInProgress) {
            fileInput.click();
        }
    });
    
    // سحب وإسقاط
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!uploadInProgress) {
            dropZone.classList.add('border-green-500', 'bg-gray-800/50');
        }
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
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });
    
    // 4. معالجة اختيار الملف
    function handleFileSelection(file) {
        // التحقق من نوع الملف
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showNotification('نوع الملف غير مدعوم. المسموح: JPG, PNG, GIF, WebP', 'error');
            return;
        }
        
        // التحقق من الحجم (5MB كحد أقصى)
        if (file.size > 5 * 1024 * 1024) {
            showNotification('حجم الصورة يتجاوز 5MB', 'error');
            return;
        }
        
        selectedFile = file;
        
        // عرض المعاينة
        const previewImage = modal.querySelector('#preview-image');
        const fileName = modal.querySelector('#file-name');
        const fileSize = modal.querySelector('#file-size');
        const uploadArea = modal.querySelector('#upload-area-content');
        const imagePreview = modal.querySelector('#image-preview');
        
        if (uploadArea) uploadArea.classList.add('hidden');
        if (imagePreview) imagePreview.classList.remove('hidden');
        
        // قراءة الصورة للمعاينة
        const reader = new FileReader();
        reader.onload = (e) => {
            if (previewImage) previewImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
        
        if (fileName) fileName.textContent = file.name;
        if (fileSize) fileSize.textContent = formatFileSize(file.size);
        
        // تفعيل زر الإرسال
        if (sendButton) {
            sendButton.disabled = false;
            sendButton.classList.remove('disabled:opacity-50', 'disabled:cursor-not-allowed');
        }
    }
    
    // 5. زر الإرسال
    if (sendButton) {
        sendButton.addEventListener('click', async () => {
            if (!selectedFile || uploadInProgress) return;
            
            await uploadAndSendImage(selectedFile, targetUserId, modal);
        });
    }
}


        


    
    

        

// --- 📤 دالة إرسال الرسالة الصوتية (محدثة) ---
async function sendVoiceMessage(audioBlob, duration, targetUserId) {
    console.log(`[VOICE] Sending voice message: ${duration}s, ${audioBlob.size} bytes`);
    
    // التحقق من المدة
    if (duration > 15) {
        showNotification('مدة التسجيل تتجاوز 15 ثانية', 'error');
        return;
    }
    
    if (duration < 1) {
        showNotification('التسجيل قصير جداً', 'error');
        return;
    }
    
    try {
        // 1. تحويل Blob إلى File
        const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, {
            type: 'audio/webm'
        });
        
        // 2. رفع إلى الخادم
        const formData = new FormData();
        formData.append('file', audioFile);
        formData.append('receiverId', targetUserId);
        formData.append('duration', duration.toString());
        
        // إشعار التحميل
        showNotification('جاري إرسال الرسالة الصوتية...', 'info');
        
        const response = await fetch('/api/chat-media/voice', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // 3. إرسال كرسالة صوتية
            const metadata = {
                duration: duration,
                publicId: result.data.publicId,
                fileSize: result.data.bytes,
                format: result.data.format
            };
            
            await sendPrivateMessage(
                targetUserId,
                result.data.url, // رابط الصوت
                null, // replyTo
                'voice',
                metadata
            );
            
            showNotification('تم إرسال الرسالة الصوتية بنجاح', 'success');
            
        } else {
            throw new Error(result.message || 'فشل رفع الرسالة الصوتية');
        }
        
    } catch (error) {
        console.error('[VOICE UPLOAD] Error:', error);
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
    
    // جلب خيارات الحماية
    const viewOnce = modal.querySelector('#view-once').checked;
    const disableSave = modal.querySelector('#disable-save').checked;
    const addWatermark = modal.querySelector('#add-watermark').checked;
    const disableReply = modal.querySelector('#disable-reply').checked;
    
    try {
        // بدء الرفع
        uploadInProgress = true;
        if (sendButton) sendButton.disabled = true;
        if (dropZone) dropZone.style.pointerEvents = 'none';
        if (uploadProgress) uploadProgress.classList.remove('hidden');
        
        // 1. رفع الصورة إلى Cloudinary
        const formData = new FormData();
        formData.append('file', file);
        formData.append('receiverId', targetUserId);
        formData.append('metadata', JSON.stringify({
            viewOnce: viewOnce,
            disableSave: disableSave,
            hasWatermark: addWatermark,
            disableReply: disableReply
        }));
        
        // محاكاة شريط التقدم (ستستبدل بـ upload حقيقي مع progress events)
        simulateUploadProgress(progressBar, progressPercent, 2000);
        
        // إرسال الطلب
        const response = await fetch('/api/chat-media/image', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
                // لا نضيف Content-Type، سيتم تعيينه تلقائياً
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // 2. إرسال الرسالة مع رابط الصورة
            const metadata = {
                thumbnail: result.data.thumbnail,
                publicId: result.data.publicId,
                fileSize: result.data.bytes,
                format: result.data.format,
                dimensions: {
                    width: result.data.width,
                    height: result.data.height
                },
                viewOnce: viewOnce,
                disableSave: disableSave,
                hasWatermark: addWatermark,
                disableReply: disableReply
            };
            
            // إرسال كرسالة وسائط
            await sendPrivateMessage(
                targetUserId,
                result.data.url, // رابط الصورة
                null, // replyTo
                'image',
                metadata
            );
            
            // إغلاق النافذة
            modal.remove();
            showNotification('تم إرسال الصورة بنجاح', 'success');
            
        } else {
            throw new Error(result.message || 'فشل رفع الصورة');
        }
        
    } catch (error) {
        console.error('[IMAGE UPLOAD] Error:', error);
        showNotification(error.message || 'فشل رفع الصورة', 'error');
        
        // إعادة تعيين
        const sendButton = modal.querySelector('#send-image-button');
        const uploadProgress = modal.querySelector('#upload-progress');
        
        if (sendButton) sendButton.disabled = false;
        if (uploadProgress) uploadProgress.classList.add('hidden');
        
    } finally {
        uploadInProgress = false;
        const dropZone = modal.querySelector('#drop-zone');
        if (dropZone) dropZone.style.pointerEvents = 'auto';
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
    if (!message && type === 'text') {
        showNotification('اكتب رسالة أولاً', 'error');
        return;
    }
    
    if (message && message.length > 200) {
        showNotification('الرسالة طويلة جداً (200 حرف كحد أقصى)', 'error');
        return;
    }
    
    console.log(`[CHAT] Sending ${type} message to ${receiverId}`);
    
    // 1. عرض الرسالة فوراً في الواجهة (تحديث تفاؤلي)
    const tempMessageId = Date.now().toString();
    displayPrivateMessage({
        _id: tempMessageId,
        sender: JSON.parse(localStorage.getItem('user'))._id,
        receiver: receiverId,
        type: type,
        content: message,
        metadata: metadata,
        createdAt: new Date().toISOString(),
        status: { sent: true, delivered: false, seen: false }
    }, true);
    
    // 2. إرسال إلى الخادم
    try {
        const response = await fetch('/api/private-chat/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                receiverId: receiverId,
                content: message,
                replyTo: replyTo,
                type: type,
                metadata: metadata
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log('✅ [CHAT] Message sent successfully:', result.data.message._id);
            
            // تحديث الرسالة المؤقتة بالـ ID الحقيقي
            const tempMessageElement = document.querySelector(`[data-message-id="${tempMessageId}"]`);
            if (tempMessageElement) {
                tempMessageElement.dataset.messageId = result.data.message._id;
                tempMessageElement.querySelector('.message-status').innerHTML = `
                    <i class="fas fa-check text-gray-400 text-xs" title="تم الإرسال"></i>
                `;
            }
            
            // تحديث العداد غير المقروء في الدردشة
            updateUnreadCount(receiverId, result.data.unreadCount || 0);
            
        } else {
            // إخفاء الرسالة المؤقتة إذا فشل الإرسال
            const tempMessageElement = document.querySelector(`[data-message-id="${tempMessageId}"]`);
            if (tempMessageElement) {
                tempMessageElement.style.opacity = '0.5';
                tempMessageElement.innerHTML += `
                    <div class="text-xs text-red-400 mt-1">
                        <i class="fas fa-exclamation-circle mr-1"></i>
                        فشل الإرسال
                    </div>
                `;
            }
            
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
    
    // التحقق إذا كانت الرسالة موجودة مسبقاً
    const existingMessage = document.querySelector(`[data-message-id="${message._id}"]`);
    if (existingMessage) {
        // تحديث حالة الرسالة الموجودة
        updateMessageStatus(existingMessage, message.status);
        return;
    }
    
    // إزالة رسالة "ابدأ محادثة جديدة" إذا كانت موجودة
    const emptyState = messagesContainer.querySelector('.text-center');
    if (emptyState) emptyState.remove();
    
    // إنشاء عنصر الرسالة
    const messageElement = document.createElement('div');
    messageElement.className = `flex ${isMyMessage ? 'justify-end' : 'justify-start'} mb-3 new-message`;
    messageElement.dataset.messageId = message._id;
    
    // تحضير المحتوى بناءً على نوع الرسالة
    let messageContent = '';
    let messageMeta = '';
    
    switch(message.type) {
        case 'text':
            messageContent = `<p class="text-white text-sm">${message.content}</p>`;
            break;
            
        case 'image':
            messageContent = `
                <div class="relative">
                    <img src="${message.metadata?.thumbnail || 'https://via.placeholder.com/200x150'}" 
                         class="rounded-lg max-w-full h-auto cursor-pointer view-image-btn"
                         data-image-url="${message.content}"
                         alt="صورة">
                    <div class="absolute bottom-2 right-2 bg-black/50 px-2 py-1 rounded text-xs">
                        <i class="fas fa-image mr-1"></i> صورة
                    </div>
                </div>
            `;
            break;
            
        case 'voice':
    messageContent = `
        <div class="flex items-center gap-3 bg-black/30 p-3 rounded-lg">
            <button class="play-voice-btn w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center hover:bg-purple-600"
                    data-voice-url="${message.content}">
                <i class="fas fa-play text-white"></i>
            </button>
            <div class="flex-1">
                <div class="flex justify-between text-sm">
                    <span>رسالة صوتية</span>
                    <span>${message.metadata?.duration || 0} ثانية</span>
                </div>
                <div class="w-full bg-gray-600 h-2 rounded-full mt-2">
                    <div class="voice-progress bg-purple-400 h-2 rounded-full" style="width: 0%"></div>
                </div>
            </div>
        </div>
    `;
    break;
            
        case 'video':
            messageContent = `
                <div class="relative">
                    <div class="relative rounded-lg overflow-hidden">
                        <img src="${message.metadata?.thumbnail || 'https://via.placeholder.com/200x150'}" 
                             class="w-full h-auto">
                        <button class="absolute inset-0 flex items-center justify-center play-video-btn"
                                data-video-url="${message.content}">
                            <div class="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center">
                                <i class="fas fa-play text-white text-2xl"></i>
                            </div>
                        </button>
                    </div>
                    <div class="absolute bottom-2 right-2 bg-black/50 px-2 py-1 rounded text-xs">
                        <i class="fas fa-video mr-1"></i> فيديو
                    </div>
                </div>
            `;
            break;
            
        default:
            messageContent = `<p class="text-white text-sm">${message.content}</p>`;
    }
    
    // إضافة الرد إذا كان موجوداً
    let replySection = '';
    if (message.replyTo) {
        const replyContent = message.replyTo.content || 'رسالة';
        const replySender = message.replyTo.sender?.username || 'مستخدم';
        replySection = `
            <div class="mb-2 p-2 bg-black/20 rounded-lg border-r-2 border-purple-500">
                <p class="text-xs font-bold text-purple-300">${replySender}</p>
                <p class="text-xs text-gray-300 truncate">${replyContent.substring(0, 50)}${replyContent.length > 50 ? '...' : ''}</p>
            </div>
        `;
    }
    
    // حالة الرسالة
    let statusIcon = '';
    if (isMyMessage) {
        if (message.status?.seen) {
            statusIcon = '<i class="fas fa-check-double text-blue-400 text-xs" title="مقروءة"></i>';
        } else if (message.status?.delivered) {
            statusIcon = '<i class="fas fa-check-double text-gray-400 text-xs" title="تم التسليم"></i>';
        } else {
            statusIcon = '<i class="fas fa-check text-gray-400 text-xs" title="تم الإرسال"></i>';
        }
    }
    
    // وقت الرسالة
    const messageTime = new Date(message.createdAt).toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // بناء HTML النهائي
    messageElement.innerHTML = `
        <div class="max-w-xs md:max-w-md ${isMyMessage ? 'bg-purple-600' : 'bg-gray-700'} rounded-2xl p-3 ${isMyMessage ? 'rounded-tr-none' : 'rounded-tl-none'}">
            ${!isMyMessage ? `
                <div class="flex items-center gap-2 mb-1">
                    <img src="${message.sender?.profileImage || 'https://via.placeholder.com/20'}" 
                         class="w-5 h-5 rounded-full">
                    <span class="text-xs font-bold">${message.sender?.username || 'مستخدم'}</span>
                </div>
            ` : ''}
            
            ${replySection}
            
            <div class="message-content">
                ${messageContent}
            </div>
            
            <div class="flex justify-between items-center mt-2">
                <span class="text-xs opacity-70">${messageTime}</span>
                <div class="message-status flex items-center gap-1">
                    ${statusIcon}
                    ${message.metadata?.viewOnce ? '<i class="fas fa-eye text-yellow-400 text-xs ml-1" title="مشاهدة مرة واحدة"></i>' : ''}
                    ${message.metadata?.hasWatermark ? '<i class="fas fa-copyright text-blue-400 text-xs ml-1" title="علامة مائية"></i>' : ''}
                </div>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // ربط أحداث الوسائط
    bindMediaEvents(messageElement, message);
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
        <div id="blocked-profile-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4">
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
    
    document.getElementById('game-container').innerHTML += modalHTML;
    
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

// --- ✅ دالة نافذة إرسال رسالة واحدة ---
function showOneMessageModal(targetUserId, targetUsername) {
    const modalHTML = `
        <div id="one-message-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[250] p-4">
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
    
    document.getElementById('game-container').innerHTML += modalHTML;
    
    const modal = document.getElementById('one-message-modal');
    const messageInput = document.getElementById('one-message-input');
    const charCount = document.getElementById('message-char-count');
    
    // تأثير الظهور
    setTimeout(() => {
        modal.querySelector('.transform').classList.remove('scale-95');
    }, 50);
    
    // تحديث عداد الأحرف
    messageInput.addEventListener('input', () => {
        charCount.textContent = `${messageInput.value.length}/25`;
    });
    
    // إرسال الرسالة
    document.getElementById('send-one-message').addEventListener('click', async () => {
        const message = messageInput.value.trim();
        
        if (!message) {
            showNotification('اكتب رسالة أولاً', 'error');
            return;
        }
        
        if (message.length > 25) {
            showNotification('الرسالة طويلة جداً (25 حرف كحد أقصى)', 'error');
            return;
        }
        
        // هنا سيكون منطق إرسال الرسالة (سنضيفه لاحقاً)
        showNotification(`سيتم إرسال الرسالة لـ ${targetUsername} قريباً`, 'info');
        modal.remove();
        
        // إغلاق نافذة "المستخدم غير متوفر" أيضاً
        const blockedModal = document.getElementById('blocked-profile-modal');
        if (blockedModal) blockedModal.remove();
    });
    
    // إلغاء
    document.getElementById('cancel-one-message').addEventListener('click', () => {
        modal.remove();
    });
    
    // إغلاق بالنقر على الخلفية
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

    // --- استبدل دالة displayMessage بهذه النسخة ---
// --- استبدل دالة displayMessage بهذه ---
function displayMessage(message) {
    if (!message || !message.sender) return;

    const isMyMessage = message.sender._id === user._id;
    const messageElement = document.createElement('div');
    messageElement.dataset.messageId = message._id;
    messageElement.className = 'message-container p-2 rounded-lg mb-2 flex items-start gap-2 relative group ' + (isMyMessage ? 'bg-purple-800' : 'bg-gray-700');
    
    const messageContent = message.content || message.message;

    // --- ✅ منطق عرض الرد ---
    let replyHTML = '';
    if (message.replyTo && message.replyTo.sender) {
        replyHTML = `
            <div class="reply-snippet bg-black/20 p-2 rounded-md mb-2 border-l-2 border-purple-400">
                <p class="font-bold text-xs text-purple-300">${message.replyTo.sender.username}</p>
                <p class="text-xs text-gray-300 truncate">${message.replyTo.content}</p>
            </div>
        `;
    }

    
    messageElement.innerHTML = `
        <img src="${message.sender.profileImage}" 
             alt="${message.sender.username}" 
             class="w-8 h-8 rounded-full cursor-pointer hover:ring-2 hover:ring-purple-400"
             data-user-id="${message.sender._id}"> 
        
        <div class="w-full">
            ${replyHTML}
            <p class="font-bold text-sm ${isMyMessage ? 'text-yellow-300' : 'text-purple-300'}">${message.sender.username}</p>
            <p class="text-white text-sm">${messageContent}</p>
        </div>
        <button class="reply-btn ...">
            <i class="fas fa-reply"></i>
        </button>
    `;

    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // ربط حدث النقر على زر الرد
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

// --- 🎬 دالة تشغيل الفيديو ---
function showVideoPlayer(videoUrl, message) {
    console.log('[CHAT] Playing video:', videoUrl);
    
    if (message.metadata?.disableSave) {
        showNotification('⚠️ حفظ الفيديو معطل', 'warning');
    }
    
    // TODO: إنشاء مشغل فيديو
    showNotification('تشغيل الفيديو قريباً...', 'info');
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
        
        // تحديث أي عداد للدردشات
        updateChatListBadge();
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
    document.getElementById('game-container').innerHTML += loadingHTML;

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
    document.getElementById('game-container').innerHTML += loadingHTML;

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
    
    document.getElementById('game-container').innerHTML += modalHTML;
    
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
    
    document.getElementById('game-container').innerHTML += modalHTML;
    
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
