// المكان: public/script.js (النسخة الكاملة والنهائية لتجربة الخريطة العالمية)

document.addEventListener('DOMContentLoaded', () => {
    // ===================================================================
    // القسم 1: المتغيرات العامة والإعدادات
    // ===================================================================
    let currentUser = null;
    let isSpinning = false;
    let socket;
    let audioContext; // سياق الصوت لتوليد النغمات

    // إعدادات الخريطة والمدن (الجوائز)
    const wheelSegments = [
        { city: 'القاهرة', amount: 0.5, lon: 31.23, lat: 30.04 },
        { city: 'روما', amount: 0.75, lon: 12.49, lat: 41.90 },
        { city: 'باريس', amount: 1, lon: 2.35, lat: 48.85 },
        { city: 'لندن', amount: 2, lon: -0.12, lat: 51.50 },
        { city: 'ريو', amount: 3, lon: -43.17, lat: -22.90 },
        { city: 'نيويورك', amount: 4, lon: -74.00, lat: 40.71 },
        { city: 'موسكو', amount: 5, lon: 37.61, lat: 55.75 },
        { city: 'دبي', amount: 7, lon: 55.27, lat: 25.20 },
        { city: 'بكين', amount: 9, lon: 116.40, lat: 39.90 },
        { city: 'طوكيو', amount: 10, lon: 139.69, lat: 35.68 }
    ];
    
    // متغيرات خاصة بمكتبة D3.js لرسم الخريطة
    let projection, path;

    // ===================================================================
    // القسم 2: دوال التهيئة الرئيسية
    // ===================================================================

    initializeApp();
    setupEventListeners();

    /**
     * تهيئة التطبيق عند تحميل الصفحة: التحقق من المستخدم، رسم الخريطة، إلخ.
     */
    async function initializeApp() {
        await drawMap(); // انتظر رسم الخريطة أولاً
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const response = await fetch('/api/auth/verify', { headers: { 'Authorization': `Bearer ${token}` } });
                if (response.ok) {
                    currentUser = await response.json();
                    initializeSocket(currentUser._id);
                    showMainContent();
                    updateUserInfo();
                    loadTransactions();
                    loadRecentWins();
                } else {
                    logout();
                }
            } catch (error) {
                console.error('Error verifying token:', error);
                showLoginModal();
            }
        } else {
            showLoginModal();
        }
    }

    /**
     * إعداد مستمعي الأحداث لجميع الأزرار والنماذج في الصفحة.
     */
    function setupEventListeners() {
        document.getElementById('depositBtn').addEventListener('click', () => switchTab('deposit'));
        document.getElementById('withdrawBtn').addEventListener('click', () => {
            switchTab('withdraw');
            document.getElementById('availableBalance').textContent = `$${currentUser?.balance?.toFixed(2) || '0.00'}`;
        });
        document.getElementById('logoutBtn').addEventListener('click', logout);
        document.getElementById('spinBtn').addEventListener('click', handleSpinRequest);
        document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab)));
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
    // القسم 3: دوال المصادقة والتعامل مع النماذج
    // ===================================================================

    async function handleLogin(e) {
        e.preventDefault();
        initAudio(); // تهيئة الصوت عند أول تفاعل للمستخدم
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
                initializeSocket(currentUser._id);
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
        initAudio(); // تهيئة الصوت عند أول تفاعل للمستخدم
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
        const form = e.target;
        if (!form.receipt.files || form.receipt.files.length === 0) {
            showNotification('يرجى رفع صورة الإيصال أولاً', 'error');
            return;
        }
        const formData = new FormData(form);
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
        try {
            const response = await fetch('/api/payment/deposit', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: formData
            });
            if (response.ok) {
                showNotification('تم إرسال طلب الشحن بنجاح، سيتم مراجعته قريباً.', 'success');
                form.reset();
                document.getElementById('receiptPreview').innerHTML = '';
                loadTransactions();
            } else {
                const error = await response.json();
                showNotification(error.message || 'فشل إرسال طلب الشحن', 'error');
            }
        } catch (error) {
            console.error('Deposit error:', error);
            showNotification('حدث خطأ في الاتصال بالخادم', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال طلب الشحن';
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
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify(body)
            });
            if (response.ok) {
                showNotification('تم إرسال طلب السحب بنجاح', 'success');
                e.target.reset();
                loadTransactions();
            } else {
                const error = await response.json();
                showNotification(error.message || 'فشل إرسال الطلب', 'error');
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
        }
    }

    // ===================================================================
    // القسم 4: دوال الخريطة العالمية (D3.js)
    // ===================================================================

    /**
     * رسم خريطة العالم التفاعلية باستخدام مكتبة D3.js.
     */
    async function drawMap() {
        const container = document.getElementById('world-map');
        const width = 800;
        const height = 450;

        projection = d3.geoMercator().scale(130).translate([width / 2, height / 1.5]);
        path = d3.geoPath().projection(projection);

        const svg = d3.select(container).append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`);

        try {
            const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
            svg.append("g")
                .selectAll("path")
                .data(topojson.feature(world, world.objects.countries).features)
                .enter().append("path")
                .attr("d", path)
                .attr("class", "country");

            const cityGroup = svg.append("g");
            cityGroup.selectAll(".city-marker")
                .data(wheelSegments)
                .enter().append("circle")
                .attr("class", "city-marker")
                .attr("cx", d => projection([d.lon, d.lat])[0])
                .attr("cy", d => projection([d.lon, d.lat])[1])
                .attr("r", 5);

            cityGroup.selectAll(".city-label")
                .data(wheelSegments)
                .enter().append("text")
                .attr("class", "city-label")
                .attr("x", d => projection([d.lon, d.lat])[0] + 8)
                .attr("y", d => projection([d.lon, d.lat])[1] + 4)
                .text(d => d.city);
                
            svg.append("circle").attr("id", "zone").attr("class", "zone").attr("r", 0);
        } catch (error) {
            console.error("Failed to load map data:", error);
            container.textContent = "فشل تحميل الخريطة. يرجى التحقق من اتصالك بالإنترنت.";
        }
    }

    /**
     * بدء أنيميشن "رحلة الحظ العالمية" بعد الحصول على النتيجة من الخادم.
     * @param {object} result - كائن النتيجة من الخادم يحتوي على المبلغ والرصيد الجديد.
     */
    function startSpinAnimation(result) {
        const { amount: winningAmount, newBalance } = result;
        const winningSegment = wheelSegments.find(s => s.amount === winningAmount);
        if (!winningSegment) {
            console.error("Winning segment not found!");
            isSpinning = false;
            document.getElementById('spinBtn').disabled = false;
            return;
        }

        const zone = d3.select("#zone");
        const duration = 7000;
        const [targetX, targetY] = projection([winningSegment.lon, winningSegment.lat]);

        // 1. حركة الزون العشوائية السريعة
        const randomJumps = d3.timer(t => {
            const randomSegment = wheelSegments[Math.floor(Math.random() * wheelSegments.length)];
            const [x, y] = projection([randomSegment.lon, randomSegment.lat]);
            zone.attr("cx", x).attr("cy", y);
            playTickSound();
            if (t > duration * 0.7) randomJumps.stop();
        });

        // 2. حركة التباطؤ نحو الهدف
        zone.transition()
            .delay(duration * 0.7)
            .duration(duration * 0.3)
            .attr("cx", targetX)
            .attr("cy", targetY)
            .ease(d3.easeCubicOut)
            .on("end", () => {
                // 4. عند انتهاء كل الحركات
                isSpinning = false;
                document.getElementById('spinBtn').disabled = false;
                document.getElementById('spinBtn').innerHTML = '<i class="fas fa-plane-departure"></i> ابدأ الرحلة ($1)';
                currentUser.balance = newBalance;
                setTimeout(() => {
                    playWinSound();
                    showResultModal(winningAmount, winningSegment.city);
                    updateUserInfo();
                    loadRecentWins();
                    loadTransactions();
                    zone.attr("r", 0);
                }, 500);
            });

        // 3. أنيميشن حجم الزون
        zone.attr("r", 80)
            .transition()
            .duration(duration)
            .ease(d3.easeCubicOut)
            .attr("r", 25);
    }

    /**
     * التعامل مع طلب بدء الرحلة وإرساله للخادم.
     */
    async function handleSpinRequest() {
        initAudio();
        if (isSpinning) return;
        if (!currentUser || currentUser.balance < 1) {
            showNotification('رصيدك غير كافٍ', 'error');
            return;
        }
        isSpinning = true;
        const spinBtn = document.getElementById('spinBtn');
        spinBtn.disabled = true;
        spinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...جاري تحديد الوجهة';
        try {
            const response = await fetch('/api/spin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (response.ok) {
                const result = await response.json();
                updateUserInfo();
                startSpinAnimation(result);
            } else {
                const error = await response.json();
                showNotification(error.message || 'حدث خطأ', 'error');
                isSpinning = false;
                spinBtn.disabled = false;
                spinBtn.innerHTML = '<i class="fas fa-plane-departure"></i> ابدأ الرحلة ($1)';
            }
        } catch (error) {
            console.error('Spin request error:', error);
            showNotification('خطأ في الاتصال بالخادم', 'error');
            isSpinning = false;
            spinBtn.disabled = false;
            spinBtn.innerHTML = '<i class="fas fa-plane-departure"></i> ابدأ الرحلة ($1)';
        }
    }

    // ===================================================================
    // القسم 5: دوال توليد الصوت (Web Audio API)
    // ===================================================================

    /**
     * تهيئة سياق الصوت. يجب استدعاؤها بعد أول تفاعل من المستخدم مع الصفحة.
     */
    function initAudio() {
        if (audioContext) return;
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error("Web Audio API is not supported in this browser");
        }
    }

    /**
     * توليد وتشغيل صوت "تكة" قصير.
     */
    function playTickSound() {
        if (!audioContext) return;
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
        oscillator.connect(gainNode).connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
    }

    /**
     * توليد وتشغيل نغمة الفوز.
     */
    function playWinSound() {
        if (!audioContext) return;
        const frequencies = [523.25, 659.25, 783.99, 1046.50];
        frequencies.forEach((freq, i) => {
            const osc = audioContext.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.1);
            const gain = audioContext.createGain();
            gain.gain.setValueAtTime(0.3, audioContext.currentTime + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + i * 0.1 + 0.2);
            osc.connect(gain).connect(audioContext.destination);
            osc.start(audioContext.currentTime + i * 0.1);
            osc.stop(audioContext.currentTime + i * 0.1 + 0.2);
        });
    }

    // ===================================================================
    // القسم 6: دوال الواجهة المساعدة والشبكة
    // ===================================================================

    function initializeSocket(userId) {
        socket = io();
        socket.on('connect', () => {
            socket.emit('registerUser', userId);
        });
        socket.on('notification', (payload) => {
            const { type, message, newBalance } = payload;
            showNotification(message, type);
            if (newBalance !== undefined) {
                currentUser.balance = newBalance;
                updateUserInfo();
            }
            loadTransactions();
        });
    }

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

    async function updateUserInfo() {
        if (!currentUser) return;
        document.getElementById('username').textContent = currentUser.username;
        document.getElementById('balance').textContent = `الرصيد: $${currentUser.balance.toFixed(2)}`;
        document.getElementById('currentBalance').textContent = `$${currentUser.balance.toFixed(2)}`;
        try {
            const statsResponse = await fetch('/api/spin/stats', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
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
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
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
            const response = await fetch('/api/spin/recent-wins', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
            if (response.ok) {
                const wins = await response.json();
                document.getElementById('recentWins').innerHTML = wins.map(win => `<div class="win-item">$${win.amount.toFixed(2)}</div>`).join('');
            }
        } catch (error) {
            console.error('Error loading recent wins:', error);
        }
    }

    function showResultModal(amount, city) { // تم التعديل ليقبل اسم المدينة
        document.getElementById('resultTitle').textContent = amount > 0 ? `هبوط محظوظ في ${city}! 🎉` : 'رحلة غير موفقة!';
        document.getElementById('resultMessage').innerHTML = amount > 0 ? `لقد ربحت <span class="prize-amount">$${amount.toFixed(2)}</span>` : 'لم تربح هذه المرة، حظاً أوفر في الرحلة القادمة!';
        document.getElementById('resultModal').style.display = 'flex';
    }

    function closeResultModal() {
        document.getElementById('resultModal').style.display = 'none';
    }

    function logout() {
        localStorage.removeItem('token');
        currentUser = null;
        if (socket) socket.disconnect();
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
});
