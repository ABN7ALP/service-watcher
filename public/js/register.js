// --- استبدل محتوى register.js بالكامل بهذا ---

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const registerBtn = document.getElementById('registerBtn');
    const registerSpinner = document.getElementById('registerSpinner');

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // --- ✅✅ الإصلاح: جمع البيانات يدويًا ---
        const data = {
            username: document.getElementById('username').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
            gender: document.querySelector('input[name="gender"]:checked')?.value, // الحصول على قيمة الراديو المحدد
            birthDate: document.getElementById('birthDate').value
        };
        // --- نهاية الإصلاح ---

        // التحقق من أن الحقول ليست فارغة
        if (!data.username || !data.email || !data.password || !data.gender || !data.birthDate) {
            showNotification('يرجى ملء جميع الحقول', 'error');
            return;
        }

        // عرض أيقونة التحميل
        registerBtn.disabled = true;
        registerSpinner.classList.remove('hidden');

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                showNotification('تم إنشاء الحساب بنجاح! جاري توجيهك...', 'success');
                // حفظ التوكن وبيانات المستخدم
                localStorage.setItem('token', result.token);
                localStorage.setItem('user', JSON.stringify(result.data.user));
                // إعادة التوجيه إلى الصفحة الرئيسية بعد ثانيتين
                setTimeout(() => {
                    window.location.href = '/index.html';
                }, 2000);
            } else {
                // عرض رسالة الخطأ من الخادم
                showNotification(result.message || 'حدث خطأ ما', 'error');
            }
        } catch (error) {
            console.error('Register error:', error);
            showNotification('فشل الاتصال بالخادم', 'error');
        } finally {
            // إخفاء أيقونة التحميل
            registerBtn.disabled = false;
            registerSpinner.classList.add('hidden');
        }
    });
});


// دالة عامة لإظهار الإشعارات
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
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

    container.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 5000);
}
