
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
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    const loadingScreen = document.getElementById('loading-screen');
    const appContainer = document.getElementById('app-container');



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
// --- ✅ استبدل دالة showSettingsView بالكامل بهذه النسخة النظيفة ---
async function showSettingsView() {
    const localUser = JSON.parse(localStorage.getItem('user'));
    mainContent.innerHTML = `
        <div class="p-4">
            <h2 class="text-2xl font-bold mb-6"><i class="fas fa-cog mr-2"></i>الإعدادات</h2>
            
            <!-- باقي أقسام الإعدادات (تبقى كما هي) -->
            <div class="bg-white/30 dark:bg-gray-800/50 p-6 rounded-xl mb-6 text-center">
                <h3 class="text-lg font-bold mb-4">تغيير الصورة الشخصية</h3>
                <img id="settings-profile-image" src="${localUser.profileImage}" class="w-32 h-32 rounded-full mx-auto border-4 border-purple-500 mb-4 object-cover">
                <form id="image-upload-form">
                    <input type="file" id="image-file-input" name="profileImage" class="hidden" accept="image/*">
                    <div class="flex justify-center items-center gap-4 mt-4">
                        <button type="button" id="select-image-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">اختيار صورة...</button>
                        <button type="submit" id="upload-image-btn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg hidden"><i class="fas fa-upload mr-2"></i>رفع وحفظ</button>
                    </div>
                </form>
            </div>
            <div class="bg-white/30 dark:bg-gray-800/50 p-6 rounded-xl mb-6">
                <h3 class="text-lg font-bold mb-4">تغيير اسم المستخدم</h3>
                <form id="username-update-form" class="flex flex-col sm:flex-row items-center gap-4">
                    <input type="text" id="username-input" value="${localUser.username}" class="w-full sm:flex-grow bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2">
                    <button type="submit" class="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">حفظ</button>
                </form>
            </div>
            <div class="bg-white/30 dark:bg-gray-800/50 p-6 rounded-xl">
                <h3 class="text-lg font-bold mb-4">تغيير كلمة المرور</h3>
                <form id="password-update-form" class="space-y-4">
                    <div><label for="current-password" class="block text-sm font-medium mb-1">كلمة المرور الحالية</label><input type="password" id="current-password" required class="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2"></div>
                    <div><label for="new-password" class="block text-sm font-medium mb-1">كلمة المرور الجديدة</label><input type="password" id="new-password" required class="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2"></div>
                    <div><label for="new-password-confirm" class="block text-sm font-medium mb-1">تأكيد كلمة المرور الجديدة</label><input type="password" id="new-password-confirm" required class="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2"></div>
                    <div class="pt-2"><button type="submit" class="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">تحديث كلمة المرور</button></div>
                </form>
            </div>
        </div>
    `;

    // إعادة ربط الأحداث الخاصة بالإعدادات فقط
    document.getElementById('select-image-btn').addEventListener('click', () => document.getElementById('image-file-input').click());
    document.getElementById('image-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => { document.getElementById('settings-profile-image').src = event.target.result; };
            reader.readAsDataURL(file);
            document.getElementById('upload-image-btn').classList.remove('hidden');
        }
    });
    document.getElementById('image-upload-form').addEventListener('submit', handleImageUpload);
    document.getElementById('username-update-form').addEventListener('submit', handleUsernameUpdate);
    document.getElementById('password-update-form').addEventListener('submit', handlePasswordUpdate);
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
// --- ✅ استبدل قسم تهيئة واجهة المستخدم بهذا ---
// دالة لتحديث واجهة المستخدم ببيانات المستخدم
function updateUIWithUserData(userData) {
    document.getElementById('username').textContent = userData.username;
    document.getElementById('balance').textContent = userData.balance.toFixed(2);
    document.getElementById('coins').textContent = userData.coins;
    document.getElementById('userLevel').textContent = userData.level;
    document.getElementById('profileImage').src = userData.profileImage;

    // تحديث عدد الأصدقاء
    const friendsCount = userData.friends ? userData.friends.length : 0;
    document.getElementById('friends-count').textContent = `(${friendsCount})`;

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
    ${createLevelProgressHTML(user)} 
`;

profileContainer.insertAdjacentHTML('beforeend', detailsHTML);

// ربط الأحداث
document.getElementById('user-id-container').addEventListener('click', () => {
    navigator.clipboard.writeText(user.customId).then(() => showNotification('تم نسخ الـ ID بنجاح!', 'info'));
});

document.getElementById('perks-toggle-btn').addEventListener('click', (e) => {
    const perksList = document.getElementById('perks-list');
    const icon = e.currentTarget.querySelector('i');
    perksList.classList.toggle('hidden');
    icon.classList.toggle('fa-chevron-down');
    icon.classList.toggle('fa-chevron-up');
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

    // --- الجزء الثاني: التعامل مع أزرار الملف الشخصي المصغر ---
    const miniProfileActionBtn = e.target.closest('.action-btn');
    if (miniProfileActionBtn && miniProfileActionBtn.dataset.action) {
        // ... (هذا الجزء يبقى كما هو بالضبط من الكود السابق)
        const action = miniProfileActionBtn.dataset.action;
        const userId = miniProfileActionBtn.dataset.userId;
        
        const performMiniProfileAction = async () => {
            let url = '';
            let method = 'POST';
            let successMessage = '';
            let icon = 'fa-check-circle';
            let color = 'bg-green-500';

            const originalButtonHTML = miniProfileActionBtn.innerHTML;
            miniProfileActionBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
            miniProfileActionBtn.disabled = true;

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
                    url = `/api/friends/remove-friend/${userId}`;
                    method = 'DELETE';
                    successMessage = 'تم حذف الصديق';
                    icon = 'fa-trash';
                    color = 'bg-red-500';
                    break;
                default:
                    return;
            }

            try {
                const response = await fetch(url, { method, headers: { 'Authorization': `Bearer ${token}` } });
                if (!response.ok) {
                    const result = await response.json();
                    throw new Error(result.message || 'Action failed');
                }
                showFloatingAlert(successMessage, icon, color);
                showMiniProfileModal(userId);

            } catch (error) {
                showNotification(error.message || 'حدث خطأ ما', 'error');
                miniProfileActionBtn.innerHTML = originalButtonHTML;
                miniProfileActionBtn.disabled = false;
            }
        };

        if (action === 'remove-friend' || action === 'cancel-request') {
            const message = action === 'remove-friend' ? 'هل أنت متأكد من حذف هذا الصديق؟' : 'هل أنت متأكد من إلغاء طلب الصداقة؟';
            showConfirmationModal(message, performMiniProfileAction);
        } else {
            performMiniProfileAction();
        }
        return;
    }

    // --- الجزء الثالث: التعامل مع أزرار نوافذ الأصدقاء ---
    const friendListActionBtn = e.target.closest('.friend-action-btn');
    if (friendListActionBtn) {
        // ... (هذا الجزء يبقى كما هو بالضبط من الكود السابق)
        const action = friendListActionBtn.dataset.action;
        const userId = friendListActionBtn.dataset.userId;
        const card = friendListActionBtn.closest('.flex.items-center.justify-between');

        const performListAction = async () => {
            let url = '';
            let method = 'POST';

            switch (action) {
                case 'accept-request': url = `/api/friends/accept-request/${userId}`; break;
                case 'reject-request': url = `/api/friends/reject-request/${userId}`; break;
                case 'remove-friend': url = `/api/friends/remove-friend/${userId}`; method = 'DELETE'; break;
                default: return;
            }

            if (card) card.style.display = 'none';

            try {
                const response = await fetch(url, { method, headers: { 'Authorization': `Bearer ${token}` } });
                if (!response.ok) throw new Error('Action failed');
                showNotification('تم تنفيذ الإجراء بنجاح', 'success');
            } catch (error) {
                if (card) card.style.display = 'flex';
                showNotification('فشل تنفيذ الإجراء', 'error');
            }
        };

        if (action === 'remove-friend' || action === 'reject-request') {
            const message = action === 'remove-friend' ? 'هل أنت متأكد من حذف هذا الصديق؟' : 'هل أنت متأكد من رفض هذا الطلب؟';
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
// --- استبدل دالة showMiniProfileModal بالكامل ---
async function showMiniProfileModal(userId) {
    try {
        const response = await fetch(`/api/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('User not found');
        const result = await response.json();
        const profileUser = result.data.user;

        const socialInfo = getSocialStatus(profileUser.socialStatus);
        const educationInfo = getEducationStatus(profileUser.educationStatus);
        const genderInfo = profileUser.gender === 'male' 
            ? { text: 'ذكر', icon: 'fa-mars', color: 'text-blue-400' }
            : { text: 'أنثى', icon: 'fa-venus', color: 'text-pink-400' };

        // --- ✅ الزر الديناميكي يتم إنشاؤه هنا ---
        const friendButtonHTML = getFriendButtonHTML(profileUser);

        const modalHTML = `
            <div id="mini-profile-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4">
                <div class="bg-gray-800 border-2 border-purple-500 rounded-2xl shadow-2xl w-full max-w-sm text-white transform scale-95 transition-transform duration-300">
                    <div class="h-24 bg-cover bg-center rounded-t-xl" style="background-image: url('https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=400&q=80')"></div>
                    <div class="flex flex-col items-center -mt-16">
                        <img src="${profileUser.profileImage}" class="w-24 h-24 rounded-full border-4 border-gray-800 object-cover">
                        <h2 class="text-xl font-bold mt-2">${profileUser.username}</h2>
                        <div class="text-xs text-gray-400 mt-1 cursor-pointer" title="نسخ الـ ID" onclick="navigator.clipboard.writeText('${profileUser.customId}')">ID: ${profileUser.customId}</div>
                    </div>
                    <div class="flex justify-around items-center text-center p-4">
                        <div><p class="font-bold text-lg text-yellow-400">LVL ${profileUser.level}</p><p class="text-xs text-gray-400">المستوى</p></div>
                        <div><p class="font-bold text-lg">${profileUser.friends.length}</p><p class="text-xs text-gray-400">الأصدقاء</p></div>
                    </div>
                    <div class="grid grid-cols-2 gap-4 px-6 pb-6 text-sm">
                        <div class="flex items-center gap-2"><i class="fas ${genderInfo.icon} w-4 text-center ${genderInfo.color}"></i> ${genderInfo.text}</div>
                        <div class="flex items-center gap-2"><i class="fas fa-birthday-cake w-4 text-center text-pink-400"></i> ${profileUser.age} سنة</div>
                        <div class="flex items-center gap-2"><i class="fas ${socialInfo.icon} w-4 text-center text-red-400"></i> ${socialInfo.text}</div>
                        <div class="flex items-center gap-2"><i class="fas ${educationInfo.icon} w-4 text-center text-blue-400"></i> ${educationInfo.text}</div>
                    </div>
                    <div id="profile-action-buttons" class="grid grid-cols-4 gap-2 border-t border-gray-700 p-2">
                        ${friendButtonHTML}
                        <button class="action-btn"><i class="fas fa-comment-dots"></i><span>رسالة</span></button>
                        <button class="action-btn"><i class="fas fa-microphone-slash"></i><span>كتم</span></button>
                        <button class="action-btn"><i class="fas fa-ban"></i><span>حظر</span></button>
                    </div>
                </div>
            </div>
        `;

        const container = document.getElementById('game-container');
        container.innerHTML = modalHTML;
        const modal = container.querySelector('#mini-profile-modal');
        setTimeout(() => modal.querySelector('.transform').classList.remove('scale-95'), 50);
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'mini-profile-modal') modal.remove();
        });

    } catch (error) {
        console.error("Error showing mini profile:", error);
        showNotification('لا يمكن عرض ملف المستخدم حاليًا.', 'error');
    }
}

// --- ✅ دالة جديدة لتوليد HTML زر الصداقة الملون ---
function getFriendButtonHTML(profileUser) {
    const selfUser = JSON.parse(localStorage.getItem('user'));
    let friendButtonHTML = '';

    if (selfUser.friends.includes(profileUser._id)) {
        friendButtonHTML = `<button class="action-btn friend-btn" data-action="remove-friend" data-user-id="${profileUser._id}"><i class="fas fa-user-check"></i><span>صديق</span></button>`;
    } else if (selfUser.friendRequestsSent.includes(profileUser._id)) {
        friendButtonHTML = `<button class="action-btn sent-btn" data-action="cancel-request" data-user-id="${profileUser._id}"><i class="fas fa-user-clock"></i><span>مُرسَل</span></button>`;
    } else if (selfUser.friendRequestsReceived.includes(profileUser._id)) {
        friendButtonHTML = `<button class="action-btn received-btn" data-action="accept-request" data-user-id="${profileUser._id}"><i class="fas fa-user-check"></i><span>قبول</span></button>`;
    } else {
        friendButtonHTML = `<button class="action-btn add-btn" data-action="send-request" data-user-id="${profileUser._id}"><i class="fas fa-user-plus"></i><span>إضافة</span></button>`;
    }
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

    async function loadChatHistory() {
        try {
            const response = await fetch('/api/messages/public-room', { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            if (response.ok && result.status === 'success') {
                chatMessages.innerHTML = '';
                result.data.messages.forEach(displayMessage);
            }
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    }
    loadChatHistory();



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




        // استقبال تحديثات حالة الصداقة
socket.on('friendStatusUpdate', (data) => {
    console.log('تحديث حالة صداقة:', data);
    
    // تحديث البروفايل المصغر
    const profileCard = document.querySelector(`[data-user-id="${data.friendId || data.userId}"]`);
    
    if (profileCard) {
        // ✅ تحديث الزر بناءً على الحالة
        const actionButton = profileCard.querySelector('.friend-action-btn');
        
        if (data.isFriend) {
            actionButton.textContent = 'صديق ✓';
            actionButton.classList. add('is-friend');
            actionButton.classList.remove('request-sent');
        } else if (data.action === 'request_sent') {
            actionButton.textContent = 'إضافة قيد الانتظار... ';
            actionButton.classList. add('request-sent');
            actionButton.classList.remove('is-friend');
        } else {
            actionButton.textContent = 'إضافة صديق';
            actionButton.classList.remove('is-friend', 'request-sent');
        }
        
        // تحديث عدد الأصدقاء
        const friendsCountEl = profileCard.querySelector('.friends-count');
        if (friendsCountEl && data.friendsCount !== undefined) {
            friendsCountEl. textContent = data.friendsCount;
        }
    }
});

        

// --- ✅ أضف هذا الكود لربط الأيقونات الجديدة ---
document.getElementById('friends-list-btn').addEventListener('click', showFriendsListModal);
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
  

}); // نهاية document.addEventListener
