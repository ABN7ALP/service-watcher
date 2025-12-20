// محتوى ملف public/js/register.js

document.addEventListener('DOMContentLoaded', function() {
    const registerForm = document.getElementById('registerForm');
    if (!registerForm) {
        console.error('Register form not found!');
        return;
    }

    registerForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const registerBtn = document.getElementById('registerBtn');
        const spinner = document.getElementById('registerSpinner');

        // جمع البيانات من النموذج
        const formData = new FormData(registerForm);
        const data = Object.fromEntries(formData.entries());

        // التحقق من كلمة المرور
        if (data.password !== data.confirmPassword) {
            showNotification('كلمتا المرور غير متطابقتين', 'error');
            return;
        }

        // التحقق من الموافقة على الشروط
        if (!data.agreedToTerms) {
            showNotification('يجب الموافقة على شروط الاستخدام', 'error');
            return;
        }

        // إظهار التحميل
        registerBtn.disabled = true;
        if(spinner) spinner.style.display = 'inline-block';

        try {
            // إرسال الطلب إلى الخادم
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                showNotification('تم التسجيل بنجاح! سيتم توجيهك لتسجيل الدخول.', 'success');
                // إعادة التوجيه إلى صفحة تسجيل الدخول بعد 3 ثوانٍ
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 3000);
            } else {
                showNotification(result.message || 'فشل التسجيل، يرجى المحاولة مرة أخرى.', 'error');
            }

        } catch (error) {
            console.error('Registration error:', error);
            showNotification('حدث خطأ غير متوقع أثناء التسجيل.', 'error');
        } finally {
            // إخفاء التحميل
            registerBtn.disabled = false;
            if(spinner) spinner.style.display = 'none';
        }
    });
});

// دالة لإظهار الإشعارات
function showNotification(message, type = 'info') {
    // إزالة أي إشعارات قديمة
    document.querySelectorAll('.notification').forEach(n => n.remove());

    const notification = document.createElement('div');
    // أضفنا style بسيط هنا ليعمل بدون ملف CSS مخصص للإشعارات
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.padding = '15px 25px';
    notification.style.borderRadius = '10px';
    notification.style.color = '#fff';
    notification.style.zIndex = '10000';
    notification.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';
    
    if (type === 'success') {
        notification.style.backgroundColor = '#28a745';
    } else if (type === 'error') {
        notification.style.backgroundColor = '#dc3545';
    } else {
        notification.style.backgroundColor = '#17a2b8';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);

    // إزالة الإشعار بعد 5 ثوانٍ
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}
