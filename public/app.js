// public/app.js

const app = {
    // --- إعدادات ---
    apiBaseUrl: '/api',
    token: null,
    user: null,
    theWheel: null,
    wheelSpinning: false,

    // --- التهيئة ---
    init() {
        this.token = localStorage.getItem('authToken');
        if (this.token) {
            // إذا وجدنا توكن، نحاول جلب بيانات المستخدم
            // (سنحتاج لنقطة نهاية جديدة لهذا الغرض)
            this.showGameSection();
        } else {
            this.showAuthSection();
        }
        this.createWheel();
    },

    // --- إدارة الواجهة ---
    showAuthSection() {
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('game-section').classList.add('hidden');
    },
    showGameSection() {
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('game-section').classList.remove('hidden');
        // هنا يجب أن نجلب بيانات المستخدم (الاسم والرصيد)
    },
    showAlert(message, isError = false) {
        const alertBox = document.getElementById('alert-message');
        alertBox.textContent = message;
        alertBox.className = isError ? 'error' : 'success';
        alertBox.classList.add('show');
        setTimeout(() => alertBox.classList.remove('show'), 3000);
    },

    // --- المصادقة ---
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
            this.showGameSection();
            // TODO: جلب بيانات المستخدم بعد الدخول
        }
    },
    logout() {
        this.token = null;
        localStorage.removeItem('authToken');
        this.showAuthSection();
    },

    // --- اللعبة والإجراءات ---
    createWheel() {
        this.theWheel = new Winwheel({
            'numSegments': 8,
            'outerRadius': 180,
            'segments': [
                { 'fillStyle': '#eae56f', 'text': '0.10$' },
                { 'fillStyle': '#89f26e', 'text': '0.25$' },
                { 'fillStyle': '#7de6ef', 'text': '0.00$' },
                { 'fillStyle': '#e7706f', 'text': '0.50$' },
                { 'fillStyle': '#eae56f', 'text': '0.10$' },
                { 'fillStyle': '#89f26e', 'text': '0.00$' },
                { 'fillStyle': '#7de6ef', 'text': '0.25$' },
                { 'fillStyle': '#e7706f', 'text': '0.00$' },
            ],
            'animation': {
                'type': 'spinToStop',
                'duration': 7,
                'spins': 8,
                'callbackFinished': this.alertPrize.bind(this)
            }
        });
    },
    async spinWheel() {
        if (this.wheelSpinning) return;

        this.wheelSpinning = true;
        document.getElementById('spin-button').disabled = true;
        
        const response = await this.apiRequest('POST', '/game/spin');
        
        if (response && typeof response.prize !== 'undefined') {
            const prizeAmount = response.prize;
            // حساب زاوية التوقف بناءً على الجائزة
            const prizeMap = { 0.50: [4], 0.25: [2, 7], 0.10: [1, 5], 0.00: [3, 6, 8] };
            const targetSegment = prizeMap[prizeAmount][Math.floor(Math.random() * prizeMap[prizeAmount].length)];
            const stopAt = this.theWheel.getRandomForSegment(targetSegment);
            
            this.theWheel.animation.stopAngle = stopAt;
            this.theWheel.startAnimation();
            
            // تحديث الرصيد فوراً
            document.getElementById('balance-display').textContent = response.newBalance.toFixed(2);
        } else {
            // إذا فشل الطلب، أعد تفعيل الزر
            this.wheelSpinning = false;
            document.getElementById('spin-button').disabled = false;
        }
    },
    alertPrize(indicatedSegment) {
        this.showAlert(`تهانينا! لقد ربحت ${indicatedSegment.text}`);
        this.wheelSpinning = false;
        document.getElementById('spin-button').disabled = false;
        this.theWheel.rotationAngle = 0; // إعادة تعيين زاوية العجلة
        this.theWheel.draw();
    },
    async requestDeposit() {
        const amount = document.getElementById('deposit-amount').value;
        const transactionId = document.getElementById('deposit-tid').value;
        const response = await this.apiRequest('POST', '/game/deposit', { amount, transactionId });
        if (response) {
            this.showAlert('تم استلام طلب الإيداع.');
        }
    },
    async requestWithdraw() {
        // TODO: بناء الواجهة الخلفية لطلبات السحب أولاً
        this.showAlert('ميزة السحب قيد التطوير.', true);
    },

    // --- أداة مساعدة لإرسال الطلبات ---
    async apiRequest(method, endpoint, body = null) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.token) {
                headers['x-auth-token'] = this.token;
            }

            const options = {
                method,
                headers,
                body: body ? JSON.stringify(body) : null
            };

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

// بدء تشغيل التطبيق عند تحميل الصفحة
window.onload = () => app.init();
