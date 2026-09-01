document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const loginSpinner = document.getElementById('loginSpinner');

    // التحقق إذا كان المستخدم مسجل دخوله بالفعل
    if (localStorage.getItem('token')) {
        window.location.href = '/index.html';
        return;
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(loginForm);
        const data = Object.fromEntries(formData.entries());

        if (!data.email || !data.password) {
            showNotification('يرجى ملء جميع الحقول', 'error');
            return;
        }

        loginBtn.disabled = true;
        loginSpinner.classList.remove('hidden');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const result = await response.json();

                        if (response.ok && result.status === 'success') {
                showNotification('تم تسجيل الدخول بنجاح!', 'success');
                localStorage.setItem('token', result.token);
                localStorage.setItem('user', JSON.stringify(result.data.user));
                setTimeout(() => {
                    window.location.href = '/index.html';
                }, 1500);
            } else if (result.code === 'ACCOUNT_BANNED') {
                showBannedModal(result.banReason, result.banExpires, result.isPermanent);
            } else {
                showNotification(result.message || 'فشل تسجيل الدخول', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            showNotification('فشل الاتصال بالخادم', 'error');
        } finally {
            loginBtn.disabled = false;
            loginSpinner.classList.add('hidden');
        }
    });
});

// دالة عامة لإظهار الإشعارات
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) {
        // إنشاء الحاوية إذا لم تكن موجودة
        const newContainer = document.createElement('div');
        newContainer.id = 'notification-container';
        newContainer.className = 'fixed top-5 right-5 z-50 space-y-2';
        document.body.appendChild(newContainer);
    }
    
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
    };
    const icon = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
    }

    const notification = document.createElement('div');
    notification.className = `flex items-center p-4 mb-4 text-sm text-white rounded-lg shadow-lg ${colors[type]} animate-pulse`;
    notification.innerHTML = `
        <i class="fas ${icon[type]} mr-3"></i>
        <span>${message}</span>
    `;

    (container || document.getElementById('notification-container')).appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 5000);
}



// ✅ نافذة أنيقة تُعلم المستخدم المحظور بالسبب والمدة، مع طريقة للتواصل مع الدعم
function showBannedModal(reason, banExpires, isPermanent) {
    const existing = document.getElementById('banned-modal');
    if (existing) existing.remove();

    const expiryText = isPermanent
        ? 'حظر دائم'
        : `ينتهي في: ${new Date(banExpires).toLocaleString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

    const modalHTML = `
        <div id="banned-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[999] p-4">
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
                    <p class="text-gray-400 text-xs mt-4">إذا كنت تعتقد أن هذا خطأ، يمكنك التواصل مع فريق الدعم لمراجعة حالتك.</p>
                    <a href="mailto:support@example.com" class="mt-4 w-full inline-block bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-lg text-sm">
                        <i class="fas fa-headset mr-1"></i> تواصل مع الدعم
                    </a>
                    <button id="closeBannedModal" class="mt-2 w-full bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-lg text-sm">حسناً</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.getElementById('closeBannedModal').addEventListener('click', () => {
        document.getElementById('banned-modal').remove();
    });
}
