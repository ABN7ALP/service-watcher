const app = {
    // --- الحالة (State) ---
    token: null,
    user: null,
    theWheel: null,
    wheelSpinning: false,
    apiBaseUrl: '/api',

    // --- التهيئة عند بدء التشغيل ---
    init() {
        this.token = localStorage.getItem('authToken');
        if (this.token) {
            this.getAccountDetails();
        } else {
            this.showScreen('auth-screen');
        }
    },

    // --- إدارة الشاشات والواجهة ---
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    },
    showAlert(message, isError = false) {
        const container = document.getElementById('alert-container');
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert ${isError ? 'error' : 'success'}`;
        alertDiv.textContent = message;
        container.appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 4000);
    },
    updateBalanceDisplay() {
        if (!this.user) return;
        document.getElementById('balance-display').textContent = this.user.balance.available.toFixed(2);
        const pendingDisplay = document.getElementById('pending-balance-display');
        if (this.user.balance.pending > 0) {
            pendingDisplay.querySelector('strong').textContent = this.user.balance.pending.toFixed(2);
            pendingDisplay.classList.remove('hidden');
        } else {
            pendingDisplay.classList.add('hidden');
        }
    },

    // --- المصادقة (Authentication) ---
    async register() {
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        const response = await this.apiRequest('POST', '/auth/register', { username, password });
        if (response) {
            this.showAlert('تم التسجيل بنجاح! يمكنك الآن تسجيل الدخول.');
        }
    },
    async login() {
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        const response = await this.apiRequest('POST', '/auth/login', { username, password });
        if (response && response.token) {
            this.token = response.token;
            localStorage.setItem('authToken', this.token);
            this.showAlert('تم تسجيل الدخول بنجاح.');
            await this.getAccountDetails();
        }
    },
    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('authToken');
        this.showScreen('auth-screen');
    },
    async getAccountDetails() {
        const data = await this.apiRequest('GET', '/auth/me'); // هذه نقطة النهاية غير موجودة بعد
        if (data) {
            this.user = data;
            document.getElementById('username-display').textContent = this.user.username;
            this.updateBalanceDisplay();
            this.showScreen('game-screen');
            if (!this.theWheel) this.createWheel();
        } else {
            this.logout();
        }
    },

    // --- اللعبة (Game Logic) ---
    createWheel() {
        this.theWheel = new Winwheel({
            'canvasId': 'canvas',
            'numSegments': 6,
            'outerRadius': 180,
            'textFontSize': 16,
            'responsive': true,
            'segments': [
                { 'fillStyle': '#7de6ef', 'text': '0.00$' },
                { 'fillStyle': '#89f26e', 'text': '0.10$' },
                { 'fillStyle': '#eae56f', 'text': '0.25$' },
                { 'fillStyle': '#e7706f', 'text': '0.50$' },
                { 'fillStyle': '#c770e7', 'text': '1.00$' },
                { 'fillStyle': '#ffd700', 'text': '5.00$' }
            ],
            'animation': {
                'type': 'spinToStop',
                'duration': 8,
                'spins': 10,
                'easing': 'Power4.easeOut',
                'callbackFinished': this.onSpinFinished.bind(this)
            }
        });
    },
    async spinWheel() {
        if (this.wheelSpinning) return;

        this.wheelSpinning = true;
        document.getElementById('spin-button').disabled = true;

        const response = await this.apiRequest('POST', '/game/spin');

        if (response && response.prize) {
            const prizeValue = response.prize.value;
            const segments = this.theWheel.segments.filter(s => s);
            const targetSegment = segments.find(s => s.text === `${prizeValue.toFixed(2)}$`);
            
            if (targetSegment) {
                const stopAt = this.theWheel.getRandomForSegment(targetSegment.segmentAngle);
                this.theWheel.animation.stopAngle = stopAt;
                this.theWheel.startAnimation();
            }
            
            this.user.balance.available = response.newBalance;
            this.updateBalanceDisplay();
        } else {
            this.wheelSpinning = false;
            document.getElementById('spin-button').disabled = false;
        }
    },
    onSpinFinished(indicatedSegment) {
        this.showAlert(`🎉 تهانينا! لقد ربحت ${indicatedSegment.text}`);
        this.wheelSpinning = false;
        document.getElementById('spin-button').disabled = false;
        this.theWheel.rotationAngle = this.theWheel.rotationAngle % 360;
    },

    // --- المحفظة (Wallet) ---
    async requestDeposit() {
        const amount = document.getElementById('deposit-amount').value;
        const transactionId = document.getElementById('deposit-tid').value;
        const response = await this.apiRequest('POST', '/wallet/deposit', { amount, transactionId });
        if (response) {
            this.showAlert('تم استلام طلب الإيداع. سيتم تحديث رصيدك بعد المراجعة.');
            await this.getAccountDetails(); // تحديث الواجهة لإظهار الرصيد المعلق
        }
    },

    // --- أداة التواصل مع الـ API ---
    async apiRequest(method, endpoint, body = null) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.token) {
                headers['x-auth-token'] = this.token;
            }
            const options = { method, headers, body: body ? JSON.stringify(body) : null };
            const response = await fetch(this.apiBaseUrl + endpoint, options);
            const data = await response.json();

            if (!response.ok) {
                this.showAlert(data.message || 'حدث خطأ ما.', true);
                return null;
            }
            return data;
        } catch (error) {
            this.showAlert('فشل الاتصال بالسيرفر.', true);
            return null;
        }
    }
};

// بدء تشغيل التطبيق
window.onload = () => app.init();
