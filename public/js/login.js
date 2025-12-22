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
