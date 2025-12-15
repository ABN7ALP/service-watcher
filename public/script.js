// المكان: public/script.js (استبدل كل المحتوى بهذا الكود)

document.addEventListener('DOMContentLoaded', () => {
    // --- تعريف المتغيرات العامة ---
    let currentUser = null;
    let isSpinning = false;
    const wheelSegments = [0.5, 0.75, 1, 2, 3, 4, 5, 7, 9, 10];
    const segmentColors = ['#FF6B6B', '#4ECDC4', '#FFD166', '#06D6A0', '#118AB2', '#073B4C', '#EF476F', '#FFD166', '#06D6A0', '#118AB2'];
    const segmentAngle = 360 / wheelSegments.length;
    let currentRotation = 0;
    let animationFrameId;

    // --- المؤثرات الصوتية ---
    const tickSound = new Audio('wheel-tick.mp3');
    const spinSound = new Audio('spin-sound.mp3');
    const winSound = new Audio('win-sound.mp3');
    tickSound.volume = 0.3;

    // --- عناصر الواجهة ---
    const wheelCanvas = document.getElementById('wheelCanvas');
    const spinBtn = document.getElementById('spinBtn');
    const ctx = wheelCanvas.getContext('2d');

    // --- الدوال الرئيسية ---

    /**
     * تهيئة التطبيق عند تحميل الصفحة
     */
    async function initializeApp() {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const response = await fetch('/api/auth/verify', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    currentUser = await response.json();
                    showMainContent();
                    updateUserInfo();
                    loadTransactions();
                    loadRecentWins();
                } else {
                    logout(); // التوكن غير صالح أو منتهي الصلاحية
                }
            } catch (error) {
                console.error('Error verifying token:', error);
                showLoginModal();
            }
        } else {
            showLoginModal();
        }
        drawWheel();
    }

    /**
     * إعداد مستمعي الأحداث لجميع الأزرار والنماذج
     */
    function setupEventListeners() {
        document.getElementById('depositBtn').addEventListener('click', () => switchTab('deposit'));
        document.getElementById('withdrawBtn').addEventListener('click', () => {
            switchTab('withdraw');
            document.getElementById('availableBalance').textContent = `$${currentUser?.balance?.toFixed(2) || '0.00'}`;
        });
        document.getElementById('logoutBtn').addEventListener('click', logout);
        spinBtn.addEventListener('click', handleSpinRequest);
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
        });
        document.getElementById('depositForm').addEventListener('submit', handleDeposit);
        document.getElementById('receipt').addEventListener('change', previewReceipt);
        document.getElementById('withdrawForm').addEventListener('submit', handleWithdraw);
        document.getElementById('loginForm').addEventListener('submit', handleLogin);
        document.getElementById('showRegister').addEventListener('click', (e) => { e.preventDefault(); showRegisterModal(); });
        document.getElementById('registerForm').addEventListener('submit', handleRegister);
        document.getElementById('showLogin').addEventListener('click', (e) => { e.preventDefault(); showLoginModal(); });
        document.getElementById('closeResult').addEventListener('click', closeResultModal);
        document.querySelector('#resultModal .close').addEventListener('click', closeResultModal);
        document.getElementById('filterType').addEventListener('change', loadTransactions);
        document.getElementById('filterDate').addEventListener('change', loadTransactions);
    }

    // ===================================================================
    // --- بداية منطق العجلة الاحترافي الجديد ---
    // ===================================================================

    /**
     * رسم العجلة بزاوية دوران محددة
     * @param {number} rotation - زاوية الدوران بالدرجات
     */
    function drawWheel(rotation = 0) {
        const centerX = wheelCanvas.width / 2;
        const centerY = wheelCanvas.height / 2;
        const radius = Math.min(centerX, centerY) - 20;

        ctx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(rotation * Math.PI / 180); // تحويل الدرجات إلى راديان
        ctx.translate(-centerX, -centerY);

        wheelSegments.forEach((segment, i) => {
            const startAngle = (i * segmentAngle) * Math.PI / 180;
            const endAngle = ((i + 1) * segmentAngle) * Math.PI / 180;

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = segmentColors[i];
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(startAngle + (segmentAngle / 2) * Math.PI / 180);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 24px Cairo';
            ctx.fillText(`$${segment}`, radius - 30, 10);
            ctx.restore();
        });
        ctx.restore();
        drawCenterAndPointer();
    }

    /**
     * رسم مركز العجلة والمؤشر الثابت
     */
    function drawCenterAndPointer() {
        const centerX = wheelCanvas.width / 2;
        // رسم المركز
        ctx.beginPath();
        ctx.arc(centerX, centerX, 30, 0, 2 * Math.PI);
        ctx.fillStyle = '#2D3748';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.stroke();
        // رسم المؤشر
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(centerX - 20, 0);
        ctx.lineTo(centerX + 20, 0);
        ctx.lineTo(centerX, 40);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * دالة التباطؤ (Easing Function) - تمنح الحركة شعوراً طبيعياً
     * @param {number} t - التقدم الزمني (قيمة بين 0 و 1)
     * @returns {number} - التقدم المعدل
     */
    function easeOutQuint(t) {
        return 1 - Math.pow(1 - t, 5);
    }

    
    /**
     * بدء عملية الدوران بعد الحصول على النتيجة من الخادم
     * @param {number} winningAmount - المبلغ الفائز الذي حدده الخادم
     */
    function startSpinAnimation(winningAmount, newBalance) {
    const winningSegmentIndex = wheelSegments.indexOf(winningAmount);

    if (winningSegmentIndex === -1) {
        console.error("Winning amount not found in segments!", winningAmount);
        isSpinning = false;
        spinBtn.disabled = false;
        spinBtn.innerHTML = '<i class="fas fa-redo"></i> إدارة العجلة ($1)';
        return;
    }

    // زاوية منتصف الشريحة الفائزة
    const winningSegmentCenterAngle =
        (winningSegmentIndex * segmentAngle) + (segmentAngle / 2);

    // لأن المؤشر بالأعلى
    const POINTER_OFFSET = 90;

    // زاوية التوقف النهائية
    const targetAngle =
        360 - winningSegmentCenterAngle - POINTER_OFFSET;

    // لفات كاملة
    const fullSpins = 7 + Math.floor(Math.random() * 4);
    const totalRotation = (fullSpins * 360) + targetAngle;

    // انحراف آمن
    const finalJitter =
        (Math.random() - 0.5) * (segmentAngle * 0.1);

    const finalTargetRotation = totalRotation + finalJitter;

    // === المهم ===
    const startRotation = currentRotation;
    const duration = 7000;
    const startTime = performance.now();

    let lastTickSegment = null;

    spinSound.currentTime = 0;
    spinSound.play();

    function animate(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutQuint(progress);

        const newRotation =
            startRotation + (finalTargetRotation * eased);

        drawWheel(newRotation);

        // صوت التكة
        const adjustedAngle = (newRotation + 90 + 360) % 360;
        const currentSegment =
            Math.floor(adjustedAngle / segmentAngle);

        if (currentSegment !== lastTickSegment) {
            tickSound.currentTime = 0;
            tickSound.play();
            lastTickSegment = currentSegment;
        }

        if (progress < 1) {
            animationFrameId = requestAnimationFrame(animate);
        } else {
            currentRotation = newRotation % 360;
            isSpinning = false;
            spinBtn.disabled = false;
            spinBtn.innerHTML = '<i class="fas fa-redo"></i> إدارة العجلة ($1)';

            // تحديث الرصيد بعد التوقف
            currentUser.balance = newBalance;

            setTimeout(() => {
                winSound.play();
                showResultModal(winningAmount);
                updateUserInfo();
                loadRecentWins();
                loadTransactions();
            }, 400);
        }
    }

    cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(animate);
}

    /**
     * التعامل مع طلب الدوران وإرساله للخادم
     */
    async function handleSpinRequest() {
        if (isSpinning) return;
        if (!currentUser || currentUser.balance < 1) {
            showNotification('رصيدك غير كافٍ', 'error');
            return;
        }

        isSpinning = true;
        spinBtn.disabled = true;
        spinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> انتظر...';

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
               // currentUser.balance = result.newBalance; // تحديث الرصيد فوراً
                updateUserInfo(); // تحديث الواجهة بالرصيد المخصوم
                startSpinAnimation(result.amount); // بدء الأنيميشن بالنتيجة من الخادم
            } else {
                const error = await response.json();
                showNotification(error.message || 'حدث خطأ', 'error');
                isSpinning = false;
                spinBtn.disabled = false;
                spinBtn.innerHTML = '<i class="fas fa-redo"></i> إدارة العجلة ($1)';
            }
        } catch (error) {
            console.error('Spin request error:', error);
            showNotification('خطأ في الاتصال بالخادم', 'error');
            isSpinning = false;
            spinBtn.disabled = false;
            spinBtn.innerHTML = '<i class="fas fa-redo"></i> إدارة العجلة ($1)';
        }
    }

    // ===================================================================
    // --- نهاية منطق العجلة الاحترافي الجديد ---
    // ===================================================================


    // --- دوال الواجهة والمساعدة (تم إعادة تنظيمها) ---

    function switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    function previewReceipt(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('receiptPreview').innerHTML = `<img src="${e.target.result}" alt="Receipt Preview">`;
            };
            reader.readAsDataURL(file);
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
            showNotification('خطأ في الاتصال بالخادم', 'error');
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('registerUsername').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const phone = document.getElementById('registerPhone').value;
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, phone })
            });
            if (response.ok) {
                showNotification('تم إنشاء الحساب بنجاح! يمكنك تسجيل الدخول الآن', 'success');
                showLoginModal();
                document.getElementById('registerForm').reset();
            } else {
                const error = await response.json();
                showNotification(error.message || 'فشل إنشاء الحساب', 'error');
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
        }
    }

    async function handleDeposit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        if (!formData.get('receipt').name) {
            showNotification('يرجى رفع صورة الإيصال', 'error');
            return;
        }
        try {
            const response = await fetch('/api/payment/deposit', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: formData
            });
            if (response.ok) {
                showNotification('تم إرسال طلب الشحن بنجاح', 'success');
                e.target.reset();
                document.getElementById('receiptPreview').innerHTML = '';
                loadTransactions();
            } else {
                const error = await response.json();
                showNotification(error.message || 'فشل إرسال الطلب', 'error');
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
        }
    }

    async function handleWithdraw(e) {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('withdrawAmount').value);
        if (amount > (currentUser?.balance || 0)) {
            showNotification('رصيدك غير كافٍ للسحب', 'error');
            return;
        }
        const body = {
            fullName: document.getElementById('withdrawName').value,
            shamCashNumber: document.getElementById('shamCashNumber').value,
            amount
        };
        try {
            const response = await fetch('/api/payment/withdraw', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(body)
            });
            if (response.ok) {
                showNotification('تم إرسال طلب السحب بنجاح', 'success');
                e.target.reset();
                updateUserInfo(); // تحديث الرصيد بعد إرسال الطلب
                loadTransactions();
            } else {
                const error = await response.json();
                showNotification(error.message || 'فشل إرسال الطلب', 'error');
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
        }
    }

    async function updateUserInfo() {
        if (!currentUser) return;
        // تحديث الواجهة فوراً من المتغير المحلي
        document.getElementById('username').textContent = currentUser.username;
        document.getElementById('balance').textContent = `الرصيد: $${currentUser.balance.toFixed(2)}`;
        document.getElementById('currentBalance').textContent = `$${currentUser.balance.toFixed(2)}`;
        
        // جلب الإحصائيات من الخادم
        try {
            const statsResponse = await fetch('/api/spin/stats', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (statsResponse.ok) {
                const stats = await statsResponse.json();
                document.getElementById('todayWins').textContent = `$${stats.todayWins.toFixed(2)}`;
                document.getElementById('todaySpins').textContent = stats.todaySpins;
            }
        } catch (error) {
            console.error("Could not fetch stats", error);
        }
    }

    async function loadTransactions() {
        const type = document.getElementById('filterType').value;
        const date = document.getElementById('filterDate').value;
        let url = `/api/transactions?type=${type}&date=${date}`;
        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (response.ok) {
                const transactions = await response.json();
                const listElement = document.getElementById('transactionsList');
                listElement.innerHTML = transactions.length === 0 ? '<p class="no-transactions">لا توجد معاملات</p>' :
                    transactions.map(t => `
                        <div class="transaction-item ${t.type} ${t.status}">
                            <div class="transaction-details">
                                <div class="transaction-type">${getTransactionTypeText(t)}</div>
                                <div class="transaction-date">${new Date(t.createdAt).toLocaleString('ar-EG')}</div>
                                ${t.note ? `<div class="transaction-note">${t.note}</div>` : ''}
                            </div>
                            <div class="transaction-amount ${t.type === 'deposit' || t.status === 'win' ? 'positive' : 'negative'}">
                                ${t.type === 'deposit' || t.status === 'win' ? '+' : '-'}$${Math.abs(t.amount).toFixed(2)}
                            </div>
                        </div>
                    `).join('');
            }
        } catch (error) {
            console.error('Error loading transactions:', error);
        }
    }
    
    function getTransactionTypeText(t) {
        if (t.type === 'deposit') return 'شحن رصيد';
        if (t.type === 'withdraw') return 'سحب أرباح';
        if (t.type === 'spin') return t.status === 'win' ? 'ربح من العجلة' : 'دوران العجلة';
        return t.type;
    }

    async function loadRecentWins() {
        try {
            const response = await fetch('/api/spin/recent-wins', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (response.ok) {
                const wins = await response.json();
                document.getElementById('recentWins').innerHTML = wins.map(win => 
                    `<div class="win-item">$${win.amount.toFixed(2)}</div>`
                ).join('');
            }
        } catch (error) {
            console.error('Error loading recent wins:', error);
        }
    }

    function showResultModal(amount) {
        document.getElementById('resultTitle').textContent = amount > 0 ? 'مبروك! 🎉' : 'حاول مرة أخرى!';
        document.getElementById('resultMessage').innerHTML = amount > 0 ? `لقد ربحت <span class="prize-amount">$${amount.toFixed(2)}</span>` : 'لم تربح هذه المرة، حظاً أوفر!';
        document.getElementById('resultModal').style.display = 'flex';
    }

    function closeResultModal() {
        document.getElementById('resultModal').style.display = 'none';
    }

    function logout() {
        localStorage.removeItem('token');
        currentUser = null;
        showLoginModal();
        showNotification('تم تسجيل الخروج بنجاح', 'success');
    }

    function showLoginModal() {
        hideMainContent();
        document.getElementById('loginModal').classList.add('active');
        document.getElementById('registerModal').classList.remove('active');
    }
    
    function showRegisterModal() {
        hideMainContent();
        document.getElementById('loginModal').classList.remove('active');
        document.getElementById('registerModal').classList.add('active');
    }

    function showMainContent() {
        document.getElementById('loginModal').classList.remove('active');
        document.getElementById('registerModal').classList.remove('active');
        document.querySelector('.main-content').style.display = 'block';
        document.querySelector('.navbar').style.display = 'flex';
    }

    function hideMainContent() {
        document.querySelector('.main-content').style.display = 'none';
        document.querySelector('.navbar').style.display = 'none';
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i><span>${message}</span>`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }

    // --- بدء تشغيل التطبيق ---
    initializeApp();
    setupEventListeners();
});
