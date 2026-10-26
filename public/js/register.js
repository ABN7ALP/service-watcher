document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const registerBtn = document.getElementById('registerBtn');
    const registerSpinner = document.getElementById('registerSpinner');

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        registerBtn.disabled = true;
        registerSpinner.classList.remove('hidden');

        try {
            const form = new FormData(registerForm);
            const data = Object.fromEntries(form.entries());

            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (response.ok) {
                showNotification('تم إنشاء الحساب بنجاح!', 'success');
                localStorage.setItem('token', result.token);
                localStorage.setItem('user', JSON.stringify(result.data.user));
                setTimeout(() => { window.location.href = '/index.html'; }, 2000);
            } else {
                throw new Error(result.message || 'حدث خطأ ما');
            }
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            registerBtn.disabled = false;
            registerSpinner.classList.add('hidden');
        }
    });
});

function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
    const icon = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const notification = document.createElement('div');
    notification.className = `flex items-center p-4 mb-4 text-sm text-white rounded-lg shadow-lg ${colors[type]}`;
    notification.innerHTML = `<i class="fas ${icon[type]} mr-3"></i><span>${message}</span>`;
    container.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}
