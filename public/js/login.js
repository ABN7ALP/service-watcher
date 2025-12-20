// الكود الصحيح والنهائي لملف public/js/login.js

document.addEventListener('DOMContentLoaded', function() {
    
    const passwordInput = document.getElementById('password');
    const passwordToggleBtn = document.getElementById('passwordToggleBtn');
    const loginForm = document.getElementById('loginForm');
    const googleLoginBtn = document.getElementById('googleLoginBtn');
        
    let isPasswordVisible = false;

    // 1. حدث تبديل رؤية كلمة المرور
    if (passwordToggleBtn) {
        passwordToggleBtn.addEventListener('click', function() {
            const toggleIcon = passwordToggleBtn.querySelector('i');
            if (isPasswordVisible) {
                passwordInput.type = 'password';
                toggleIcon.className = 'fas fa-eye';
            } else {
                passwordInput.type = 'text';
                toggleIcon.className = 'fas fa-eye-slash';
            }
            isPasswordVisible = !isPasswordVisible;
        });
    }

    // 2. حدث إرسال نموذج تسجيل الدخول
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email').value.trim();
            const password = passwordInput.value;
            const loginBtn = document.getElementById('loginBtn');
            const loginSpinner = document.getElementById('loginSpinner');
            
            if (!email || !password) {
                showNotification('يرجى ملء جميع الحقول', 'error');
                return;
            }
            
            loginBtn.disabled = true;
            loginSpinner.style.display = 'inline-block';
            
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    showNotification('تم تسجيل الدخول بنجاح', 'success');
                    setTimeout(() => { window.location.href = '/'; }, 1000);
                } else {
                    showNotification(data.message || 'فشل تسجيل الدخول', 'error');
                }
            } catch (error) {
                console.error('Login error:', error);
                showNotification('حدث خطأ أثناء تسجيل الدخول', 'error');
            } finally {
                loginBtn.disabled = false;
                loginSpinner.style.display = 'none';
            }
        });
    }

    // 3. حدث تسجيل الدخول بحساب جوجل
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', async function() {
            showNotification('تسجيل الدخول بحساب جوجل قيد التطوير', 'info');
        });
    }

    // 4. دالة إظهار الإشعارات
    function showNotification(message, type = 'info') {
        document.querySelectorAll('.notification').forEach(n => n.remove());
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
        setTimeout(() => { if (notification.parentElement) { notification.remove(); } }, 5000);
    }
});
