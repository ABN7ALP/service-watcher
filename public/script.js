// المتغيرات العامة
let currentUser = null;
let isSpinning = false;
const wheelSegments = [0.5, 0.75, 1, 2, 3, 4, 5, 7, 9, 10];

// تهيئة التطبيق
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    drawWheel();
});

// تهيئة التطبيق
async function initializeApp() {
    // التحقق من وجود مستخدم مسجل الدخول
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const response = await fetch('/api/auth/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const user = await response.json();
                currentUser = user;
                showMainContent();
                updateUserInfo();
                loadTransactions();
                loadRecentWins();
            } else {
                showLoginModal();
            }
        } catch (error) {
            console.error('Error verifying token:', error);
            showLoginModal();
        }
    } else {
        showLoginModal();
    }
}

// إعداد مستمعي الأحداث
function setupEventListeners() {
    // أزرار التنقل
    document.getElementById('depositBtn').addEventListener('click', () => {
        switchTab('deposit');
    });
    
    document.getElementById('withdrawBtn').addEventListener('click', () => {
        switchTab('withdraw');
        document.getElementById('availableBalance').textContent = 
            `$${currentUser?.balance?.toFixed(2) || '0.00'}`;
    });
    
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // زر إدارة العجلة
    document.getElementById('spinBtn').addEventListener('click', spinWheel);
    
    // تبديل التبويبات
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.dataset.tab;
            switchTab(tab);
        });
    });
    
    // نموذج شحن الرصيد
    document.getElementById('depositForm').addEventListener('submit', handleDeposit);
    
    // معاينة صورة الإيصال
    document.getElementById('receipt').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const preview = document.getElementById('receiptPreview');
                preview.innerHTML = `<img src="${e.target.result}" alt="Receipt Preview">`;
            };
            reader.readAsDataURL(file);
        }
    });
    
    // نموذج سحب الأرباح
    document.getElementById('withdrawForm').addEventListener('submit', handleWithdraw);
    
    // نموذج تسجيل الدخول
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('showRegister').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('loginModal').classList.remove('active');
        document.getElementById('registerModal').classList.add('active');
    });
    
    // نموذج التسجيل
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('showLogin').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('registerModal').classList.remove('active');
        document.getElementById('loginModal').classList.add('active');
    });
    
    // إغلاق نافذة النتيجة
    document.getElementById('closeResult').addEventListener('click', closeResultModal);
    document.querySelector('#resultModal .close').addEventListener('click', closeResultModal);
    
    // تصفية سجل المعاملات
    document.getElementById('filterType').addEventListener('change', loadTransactions);
    document.getElementById('filterDate').addEventListener('change', loadTransactions);
}

// تبديل التبويبات
function switchTab(tabName) {
    // إزالة النشاط من جميع الأزرار
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // إخفاء جميع المحتويات
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // تفعيل التبويب المحدد
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

// رسم عجلة الحظ
function drawWheel() {
    const canvas = document.getElementById('wheelCanvas');
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    
    // الألوان للشرائح
    const colors = [
        '#FF6B6B', '#4ECDC4', '#FFD166', '#06D6A0', 
        '#118AB2', '#073B4C', '#EF476F', '#FFD166',
        '#06D6A0', '#118AB2'
    ];
    
    // مسح اللوحة
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // رسم كل شريحة
    const anglePerSegment = (2 * Math.PI) / wheelSegments.length;
    
    wheelSegments.forEach((segment, i) => {
        const startAngle = i * anglePerSegment;
        const endAngle = (i + 1) * anglePerSegment;
        
        // رسم الشريحة
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();
        
        ctx.fillStyle = colors[i];
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // كتابة النص (المبلغ)
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(startAngle + anglePerSegment / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Cairo';
        ctx.fillText(`$${segment}`, radius - 30, 10);
        ctx.restore();
    });
    
    // رسم المركز
    ctx.beginPath();
    ctx.arc(centerX, centerY, 30, 0, 2 * Math.PI);
    ctx.fillStyle = '#2D3748';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.stroke();
    
    // كتابة العنوان في المركز
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Cairo';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('عجلة الحظ', centerX, centerY);
}

// إدارة العجلة
async function spinWheel() {
    if (isSpinning || !currentUser || currentUser.balance < 1) {
        showNotification('رصيدك غير كافٍ أو العجلة قيد الدوران', 'error');
        return;
    }
    
    isSpinning = true;
    const spinBtn = document.getElementById('spinBtn');
    spinBtn.disabled = true;
    spinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> العجلة تدور...';
    
    try {
        const response = await fetch('/api/spin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // محاكاة دوران العجلة
            const canvas = document.getElementById('wheelCanvas');
            const ctx = canvas.getContext('2d');
            const spins = 5 + Math.random() * 3; // 5-8 دورات
            const totalRotation = spins * 2 * Math.PI;
            const segmentAngle = (2 * Math.PI) / wheelSegments.length;
            const winningSegment = wheelSegments.indexOf(result.amount);
            const targetAngle = (winningSegment * segmentAngle) + (Math.random() * segmentAngle);
            
            let currentRotation = 0;
            const duration = 4000; // 4 ثواني
            const startTime = Date.now();
            
            function animate() {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // تسارع ثم تباطؤ
                const easeProgress = easeOutCubic(progress);
                currentRotation = totalRotation + (targetAngle * easeProgress);
                
                // رسم العجلة مع الدوران
                drawRotatedWheel(currentRotation);
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // إظهار النتيجة
                    setTimeout(() => {
                        showResultModal(result.amount);
                        updateUserInfo();
                        loadRecentWins();
                        loadTransactions();
                        isSpinning = false;
                        spinBtn.disabled = false;
                        spinBtn.innerHTML = '<i class="fas fa-redo"></i> إدارة العجلة ($1)';
                    }, 500);
                }
            }
            
            animate();
        } else {
            const error = await response.json();
            showNotification(error.message || 'حدث خطأ أثناء الدوران', 'error');
            isSpinning = false;
            spinBtn.disabled = false;
            spinBtn.innerHTML = '<i class="fas fa-redo"></i> إدارة العجلة ($1)';
        }
    } catch (error) {
        console.error('Error spinning wheel:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
        isSpinning = false;
        spinBtn.disabled = false;
        spinBtn.innerHTML = '<i class="fas fa-redo"></i> إدارة العجلة ($1)';
    }
}

// رسم العجلة مع الدوران
function drawRotatedWheel(rotation) {
    const canvas = document.getElementById('wheelCanvas');
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.translate(-centerX, -centerY);
    
    // إعادة استخدام دالة الرسم مع تعديلات
    const colors = [
        '#FF6B6B', '#4ECDC4', '#FFD166', '#06D6A0', 
        '#118AB2', '#073B4C', '#EF476F', '#FFD166',
        '#06D6A0', '#118AB2'
    ];
    
    const anglePerSegment = (2 * Math.PI) / wheelSegments.length;
    
    wheelSegments.forEach((segment, i) => {
        const startAngle = i * anglePerSegment;
        const endAngle = (i + 1) * anglePerSegment;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();
        
        ctx.fillStyle = colors[i];
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(startAngle + anglePerSegment / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Cairo';
        ctx.fillText(`$${segment}`, radius - 30, 10);
        ctx.restore();
    });
    
    ctx.restore();
    
    // رسم المركز (بدون دوران)
    ctx.beginPath();
    ctx.arc(centerX, centerY, 30, 0, 2 * Math.PI);
    ctx.fillStyle = '#2D3748';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.stroke();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Cairo';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('عجلة الحظ', centerX, centerY);
}

// دالة التباطؤ
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

// تسجيل الدخول
async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            showMainContent();
            updateUserInfo();
            loadTransactions();
            loadRecentWins();
            document.getElementById('loginModal').classList.remove('active');
            showNotification('تم تسجيل الدخول بنجاح', 'success');
        } else {
            const error = await response.json();
            showNotification(error.message || 'فشل تسجيل الدخول', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// التسجيل
async function handleRegister(e) {
    e.preventDefault();
    
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const phone = document.getElementById('registerPhone').value;
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password, phone })
        });
        
        if (response.ok) {
            const data = await response.json();
            showNotification('تم إنشاء الحساب بنجاح! يمكنك تسجيل الدخول الآن', 'success');
            document.getElementById('registerModal').classList.remove('active');
            document.getElementById('loginModal').classList.add('active');
            document.getElementById('registerForm').reset();
        } else {
            const error = await response.json();
            showNotification(error.message || 'فشل إنشاء الحساب', 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// شحن الرصيد
async function handleDeposit(e) {
    e.preventDefault();
    
    const fullName = document.getElementById('fullName').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const receiptFile = document.getElementById('receipt').files[0];
    
    if (!receiptFile) {
        showNotification('يرجى رفع صورة الإيصال', 'error');
        return;
    }
    
    // إنشاء FormData لإرسال الملف
    const formData = new FormData();
    formData.append('fullName', fullName);
    formData.append('amount', amount);
    formData.append('receipt', receiptFile);
    
    try {
        const response = await fetch('/api/payment/deposit', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            showNotification('تم إرسال طلب الشحن بنجاح، يرجى انتظار الموافقة من الإدارة', 'success');
            document.getElementById('depositForm').reset();
            document.getElementById('receiptPreview').innerHTML = '';
            loadTransactions();
        } else {
            const error = await response.json();
            showNotification(error.message || 'فشل إرسال طلب الشحن', 'error');
        }
    } catch (error) {
        console.error('Deposit error:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// سحب الأرباح
async function handleWithdraw(e) {
    e.preventDefault();
    
    const fullName = document.getElementById('withdrawName').value;
    const shamCashNumber = document.getElementById('shamCashNumber').value;
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    
    if (amount < 5) {
        showNotification('الحد الأدنى للسحب هو $5', 'error');
        return;
    }
    
    if (amount > (currentUser?.balance || 0)) {
        showNotification('رصيدك غير كافٍ للسحب', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/payment/withdraw', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                fullName,
                shamCashNumber,
                amount
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            showNotification('تم إرسال طلب السحب بنجاح، سيتم معالجته خلال 24 ساعة', 'success');
            document.getElementById('withdrawForm').reset();
            updateUserInfo();
            loadTransactions();
        } else {
            const error = await response.json();
            showNotification(error.message || 'فشل إرسال طلب السحب', 'error');
        }
    } catch (error) {
        console.error('Withdraw error:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// تحديث معلومات المستخدم
async function updateUserInfo() {
    if (!currentUser) return;
    
    try {
        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            const user = await response.json();
            currentUser = user;
            
            document.getElementById('username').textContent = user.username;
            document.getElementById('balance').textContent = `الرصيد: $${user.balance.toFixed(2)}`;
            document.getElementById('currentBalance').textContent = `$${user.balance.toFixed(2)}`;
            
            // تحديث إحصائيات اليوم
            const statsResponse = await fetch('/api/spin/stats', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (statsResponse.ok) {
                const stats = await statsResponse.json();
                document.getElementById('todayWins').textContent = `$${stats.todayWins.toFixed(2)}`;
                document.getElementById('todaySpins').textContent = stats.todaySpins;
            }
        }
    } catch (error) {
        console.error('Error updating user info:', error);
    }
}

// تحميل سجل المعاملات
async function loadTransactions() {
    const filterType = document.getElementById('filterType').value;
    const filterDate = document.getElementById('filterDate').value;
    
    let url = '/api/transactions?';
    if (filterType !== 'all') url += `type=${filterType}&`;
    if (filterDate) url += `date=${filterDate}`;
    
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            const transactions = await response.json();
            const listElement = document.getElementById('transactionsList');
            listElement.innerHTML = '';
            
            if (transactions.length === 0) {
                listElement.innerHTML = '<p class="no-transactions">لا توجد معاملات</p>';
                return;
            }
            
            transactions.forEach(transaction => {
                const transactionElement = document.createElement('div');
                transactionElement.className = `transaction-item ${transaction.type}`;
                
                const date = new Date(transaction.createdAt).toLocaleDateString('ar-EG');
                const time = new Date(transaction.createdAt).toLocaleTimeString('ar-EG');
                
                let typeText = '';
                let amountClass = '';
                
                switch(transaction.type) {
                    case 'deposit':
                        typeText = 'شحن رصيد';
                        amountClass = 'positive';
                        break;
                    case 'withdraw':
                        typeText = 'سحب أرباح';
                        amountClass = 'negative';
                        break;
                    case 'spin':
                        typeText = transaction.status === 'win' ? 'ربح من عجلة الحظ' : 'دوران عجلة الحظ';
                        amountClass = transaction.status === 'win' ? 'positive' : 'negative';
                        break;
                }
                
                transactionElement.innerHTML = `
                    <div class="transaction-details">
                        <div class="transaction-type">${typeText}</div>
                        <div class="transaction-date">${date} ${time}</div>
                        ${transaction.note ? `<div class="transaction-note">${transaction.note}</div>` : ''}
                    </div>
                    <div class="transaction-amount ${amountClass}">
                        ${transaction.type === 'deposit' || transaction.status === 'win' ? '+' : '-'}$${Math.abs(transaction.amount).toFixed(2)}
                    </div>
                `;
                
                listElement.appendChild(transactionElement);
            });
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

// تحميل آخر الجوائز
async function loadRecentWins() {
    try {
        const response = await fetch('/api/spin/recent-wins', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            const wins = await response.json();
            const winsElement = document.getElementById('recentWins');
            winsElement.innerHTML = '';
            
            wins.forEach(win => {
                const winElement = document.createElement('div');
                winElement.className = 'win-item';
                winElement.textContent = `$${win.amount.toFixed(2)}`;
                winsElement.appendChild(winElement);
            });
        }
    } catch (error) {
        console.error('Error loading recent wins:', error);
    }
}

// إظهار نافذة النتيجة
function showResultModal(amount) {
    const modal = document.getElementById('resultModal');
    const title = document.getElementById('resultTitle');
    const message = document.getElementById('resultMessage');
    
    title.textContent = amount > 0 ? 'مبروك! 🎉' : 'حاول مرة أخرى!';
    message.innerHTML = amount > 0 ? 
        `لقد ربحت <span class="prize-amount">$${amount.toFixed(2)}</span>` :
        'لم تربح هذه المرة، حاول مرة أخرى!';
    
    modal.style.display = 'flex';
}

// إغلاق نافذة النتيجة
function closeResultModal() {
    document.getElementById('resultModal').style.display = 'none';
}

// تسجيل الخروج
function logout() {
    localStorage.removeItem('token');
    currentUser = null;
    showLoginModal();
    showNotification('تم تسجيل الخروج بنجاح', 'success');
}

// إظهار نافذة تسجيل الدخول
function showLoginModal() {
    hideMainContent();
    document.getElementById('loginModal').classList.add('active');
    document.getElementById('registerModal').classList.remove('active');
}

// إظهار المحتوى الرئيسي
function showMainContent() {
    document.getElementById('loginModal').classList.remove('active');
    document.getElementById('registerModal').classList.remove('active');
    document.querySelector('.main-content').style.display = 'block';
    document.querySelector('.navbar').style.display = 'flex';
}

// إخفاء المحتوى الرئيسي
function hideMainContent() {
    document.querySelector('.main-content').style.display = 'none';
    document.querySelector('.navbar').style.display = 'none';
}

// إظهار الإشعارات
function showNotification(message, type = 'info') {
    // إنشاء عنصر الإشعار
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    // إضافة الأنماط
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideIn 0.3s ease;
        ${type === 'success' ? 'background: #10b981;' : 
          type === 'error' ? 'background: #ef4444;' : 
          'background: #3b82f6;'}
    `;
    
    document.body.appendChild(notification);
    
    // إخفاء الإشعار بعد 5 ثواني
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 5000);
    
    // إضافة أنيميشن
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(-100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(-100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}
