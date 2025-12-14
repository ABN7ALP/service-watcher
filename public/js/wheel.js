// 📁 public/js/wheel.js - الجزء 1
class WheelGame {
    constructor() {
        this.canvas = document.getElementById('wheelCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.spinButton = document.getElementById('spinButton');
        this.userBalance = document.getElementById('userBalance');
        this.username = document.getElementById('username');
        this.resultContainer = document.getElementById('resultContainer');
        
        this.isSpinning = false;
        this.currentRotation = 0;
        this.spinDuration = 4000; // 4 ثواني
        this.prizes = [0.1, 0.3, 0.5, 1, 2.5, 3, 5, 7, 9, 10];
        this.colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#F1948A'
        ];
        
        this.token = localStorage.getItem('token');
        this.user = null;
        this.socket = null;
        
        this.init();
    }
    
    async init() {
        // رسم العجلة الأولى
        this.drawWheel();
        
        // تحميل بيانات المستخدم
        await this.loadUserData();
        
        // إعداد الأحداث
        this.setupEventListeners();
        
        // تحميل إحصائيات العجلة
        await this.loadWheelStats();
        
        // الاتصال بالسوكيت إذا كان مسجل دخول
        if (this.token && this.user) {
            this.connectSocket();
        }
    }
    
    // تحميل بيانات المستخدم
    async loadUserData() {
        if (!this.token) {
            this.showMessage('⚠️ يلزم تسجيل الدخول للعب', 'warning');
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);
            return;
        }
        
        try {
            const response = await fetch('/api/auth/profile', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                this.updateUserUI();
                this.spinButton.disabled = this.user.balance < 1;
            } else {
                localStorage.removeItem('token');
                window.location.href = '/login';
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل بيانات المستخدم:', error);
            this.showMessage('❌ خطأ في الاتصال بالخادم', 'error');
        }
    }
    
    // تحديث واجهة المستخدم
    updateUserUI() {
        if (this.user) {
            this.username.textContent = this.user.username;
            this.userBalance.textContent = `${this.user.balance.toFixed(2)}$`;
            
            // تحديث زر التدوير
            if (this.user.balance >= 1) {
                this.spinButton.disabled = false;
                this.spinButton.innerHTML = '<i class="fas fa-play"></i><span>تدوير العجلة (1$)</span>';
            } else {
                this.spinButton.disabled = true;
                this.spinButton.innerHTML = '<i class="fas fa-lock"></i><span>رصيد غير كافي</span>';
            }
        }
    }
    
    // تحميل إحصائيات العجلة
    async loadWheelStats() {
        try {
            const response = await fetch('/api/wheel/stats');
            if (response.ok) {
                const data = await response.json();
                this.displayPrizes(data.stats.probabilities);
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل الإحصائيات:', error);
        }
    }
    
    // عرض الجوائز
    displayPrizes(probabilities) {
        const prizesList = document.getElementById('prizesList');
        const probabilitiesDiv = document.getElementById('probabilities');
        
        prizesList.innerHTML = '';
        probabilitiesDiv.innerHTML = '';
        
        probabilities.forEach((prob, index) => {
            // قائمة الجوائز
            const prizeItem = document.createElement('div');
            prizeItem.className = 'prize-item';
            prizeItem.innerHTML = `
                <span class="prize-amount ${this.getPrizeClass(prob.prize)}">${prob.prize}$</span>
                <span class="prize-probability">${prob.percentage}</span>
            `;
            prizesList.appendChild(prizeItem);
            
            // احتمالات الفوز
            const probItem = document.createElement('div');
            probItem.className = 'probability-item';
            probItem.innerHTML = `
                <span>${prob.prize}$</span>
                <span>${prob.percentage}</span>
            `;
            probabilitiesDiv.appendChild(probItem);
        });
    }
    
    // تصنيف الجائزة حسب قيمتها
    getPrizeClass(prize) {
        if (prize < 1) return 'small';
        if (prize < 3) return 'medium';
        if (prize < 7) return 'large';
        return 'huge';
    }
    
    // إعداد مستمعي الأحداث
    setupEventListeners() {
        // زر تدوير العجلة
        this.spinButton.addEventListener('click', () => {
            this.spinWheel();
        });
        
        // زر التدوير مرة أخرى
        document.getElementById('spinAgainBtn').addEventListener('click', () => {
            this.resultContainer.style.display = 'none';
        });
        
        // زر الإيداع
        document.getElementById('depositBtn').addEventListener('click', () => {
            this.showDepositModal();
        });
        
        // خيارات الإيداع
        document.querySelectorAll('.deposit-option').forEach(option => {
            option.addEventListener('click', (e) => {
                document.querySelectorAll('.deposit-option').forEach(opt => {
                    opt.classList.remove('active');
                });
                e.currentTarget.classList.add('active');
            });
        });
        
        // زر بدء الإيداع
        document.getElementById('startDepositBtn').addEventListener('click', () => {
            this.startDeposit();
        });
        
        // إغلاق النوافذ
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').style.display = 'none';
            });
        });
    }
    
    // رسم العجلة
    drawWheel() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 20;
        const sliceAngle = (2 * Math.PI) / this.prizes.length;
        
        // مسح السابق
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // رسم القطع
        for (let i = 0; i < this.prizes.length; i++) {
            const startAngle = i * sliceAngle + this.currentRotation;
            const endAngle = (i + 1) * sliceAngle + this.currentRotation;
            
            // رسم القطعة
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, centerY);
            this.ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            this.ctx.closePath();
            
            // تلوين القطعة
            this.ctx.fillStyle = this.colors[i];
            this.ctx.fill();
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // كتابة النص (الجائزة)
            this.ctx.save();
            this.ctx.translate(centerX, centerY);
            this.ctx.rotate(startAngle + sliceAngle / 2);
            this.ctx.textAlign = 'right';
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.fillText(`${this.prizes[i]}$`, radius - 20, 5);
            this.ctx.restore();
        }
        
        // رسم المركز
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#FFD700';
        this.ctx.fill();
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        
        // إضافة شعار في المركز
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillStyle = 'black';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('SPIN', centerX, centerY + 4);
    }
    
    // تدوير العجلة
    async spinWheel() {
        if (this.isSpinning || !this.token || this.user.balance < 1) {
            return;
        }
        
        this.isSpinning = true;
        this.spinButton.classList.add('spinning');
        this.spinButton.disabled = true;
        
        try {
            // تشغيل صوت التدوير
            this.playSound('spin');
            
            // إرسال طلب التدوير للخادم
            const response = await fetch('/api/wheel/spin', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                // الحصول على نتيجة الدوران
                const resultIndex = data.result.index;
                const prize = data.result.prize;
                
                // محاكاة دوران العجلة
                await this.animateWheel(resultIndex);
                
                // عرض النتيجة
                this.showResult(data);
                
                // تحديث رصيد المستخدم
                this.user.balance = data.result.newBalance;
                this.updateUserUI();
                
                // تحديث الإحصائيات
                this.updateStats(data.result);
                
                // إرسال حدث فوز كبير إذا كان كبيراً
                if (prize >= 5) {
                    this.emitBigWin(prize);
                }
                
                // إضافة إشعار حي
                this.addLiveNotification(
                    prize > 0 ? '🎉' : '💫',
                    prize > 0 ? `فزت بـ ${prize}$!` : 'حظ أوكد في المرة القادمة!'
                );
                
            } else {
                this.showMessage(data.message || '❌ خطأ في التدوير', 'error');
            }
            
        } catch (error) {
            console.error('❌ خطأ في تدوير العجلة:', error);
            this.showMessage('❌ خطأ في الاتصال بالخادم', 'error');
        } finally {
            this.isSpinning = false;
            this.spinButton.classList.remove('spinning');
            this.spinButton.disabled = this.user.balance < 1;
        }
    }
  

    // رسم حركة العجلة
    async animateWheel(resultIndex) {
        return new Promise((resolve) => {
            const targetRotation = this.currentRotation + 10 * Math.PI + (resultIndex * (2 * Math.PI / this.prizes.length));
            const startTime = Date.now();
            const startRotation = this.currentRotation;
            
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / this.spinDuration, 1);
                
                // تأثير إيبس إن إيبس آوت (Ease In Out)
                const easeProgress = progress < 0.5 
                    ? 2 * progress * progress 
                    : -1 + (4 - 2 * progress) * progress;
                
                this.currentRotation = startRotation + (targetRotation - startRotation) * easeProgress;
                this.drawWheel();
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // التأكد من أن المؤشر على الجائزة الصحيحة
                    this.currentRotation = targetRotation % (2 * Math.PI);
                    this.drawWheel();
                    resolve();
                }
            };
            
            animate();
        });
    }
    
    // عرض نتيجة الدوران
    showResult(data) {
        const result = data.result;
        const resultIcon = document.getElementById('resultIcon');
        const resultTitle = document.getElementById('resultTitle');
        const resultMessage = document.getElementById('resultMessage');
        const resultAmount = document.getElementById('resultAmount');
        const newBalance = document.getElementById('newBalance');
        const netProfit = document.getElementById('netProfit');
        
        // تحديث العناصر بناءً على النتيجة
        if (result.prize > 0) {
            // فوز
            resultIcon.textContent = '🎉';
            resultTitle.textContent = 'مبروك!';
            resultMessage.textContent = `فزت بـ`;
            resultAmount.textContent = `${result.prize.toFixed(2)}$`;
            
            // تشغيل صوت الفوز
            this.playSound('win');
            
            // تأثيرات خاصة للفوز الكبير
            if (result.prize >= 5) {
                resultIcon.textContent = '🏆';
                resultTitle.textContent = 'فوز كبير!';
                this.showConfetti();
            }
        } else {
            // خسارة
            resultIcon.textContent = '💫';
            resultTitle.textContent = 'حظ أوكد!';
            resultMessage.textContent = 'لم تربح هذه المرة';
            resultAmount.textContent = '0.00$';
            
            // تشغيل صوت الخسارة
            this.playSound('lose');
        }
        
        // تحديث الأرقام
        newBalance.textContent = `${result.newBalance.toFixed(2)}$`;
        netProfit.textContent = `${result.net >= 0 ? '+' : ''}${result.net.toFixed(2)}$`;
        netProfit.className = result.net >= 0 ? 'profit-positive' : 'profit-negative';
        
        // عرض النتيجة
        this.resultContainer.style.display = 'flex';
    }
    
    // تحديث الإحصائيات
    updateStats(result) {
        // هذه دالة تجميلية - يمكنك ربطها بقاعدة البيانات لاحقاً
        const totalSpins = document.getElementById('totalSpins');
        const totalSpent = document.getElementById('totalSpent');
        const totalWon = document.getElementById('totalWon');
        const netTotal = document.getElementById('netTotal');
        
        // زيادة العدادات (يمكن استبدالها ببيانات حقيقية من API)
        let spins = parseInt(totalSpins.textContent) || 0;
        let spent = parseFloat(totalSpent.textContent) || 0;
        let won = parseFloat(totalWon.textContent) || 0;
        
        spins += 1;
        spent += 1; // سعر الدوران
        won += result.prize;
        
        totalSpins.textContent = spins;
        totalSpent.textContent = spent.toFixed(2) + '$';
        totalWon.textContent = won.toFixed(2) + '$';
        netTotal.textContent = (won - spent).toFixed(2) + '$';
    }
    
    // إضافة إشعار حي
    addLiveNotification(icon, text) {
        const notifications = document.getElementById('liveNotifications');
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.innerHTML = `
            <span class="notification-icon">${icon}</span>
            <span class="notification-text">${this.user.username} ${text}</span>
            <span class="notification-time">الآن</span>
        `;
        
        notifications.insertBefore(notification, notifications.firstChild);
        
        // إذا كان أكثر من 5 إشعارات، احذف القديم
        if (notifications.children.length > 5) {
            notifications.removeChild(notifications.lastChild);
        }
    }
    
    // تشغيل الأصوات
    playSound(type) {
        try {
            const sound = document.getElementById(`${type}Sound`);
            if (sound) {
                sound.currentTime = 0;
                sound.play().catch(e => console.log('🔇 لا يمكن تشغيل الصوت:', e));
            }
        } catch (error) {
            console.log('🔇 خطأ في تشغيل الصوت:', error);
        }
    }
    
    // تأثير الكونفيتي للفوز الكبير
    showConfetti() {
        // تأثير بسيط - يمكن استخدام مكتبة لاحقاً
        const confetti = document.createElement('div');
        confetti.style.position = 'fixed';
        confetti.style.top = '0';
        confetti.style.left = '0';
        confetti.style.width = '100%';
        confetti.style.height = '100%';
        confetti.style.pointerEvents = 'none';
        confetti.style.zIndex = '9999';
        
        // إنشاء قطع الكونفيتي
        for (let i = 0; i < 100; i++) {
            const piece = document.createElement('div');
            piece.style.position = 'absolute';
            piece.style.width = '10px';
            piece.style.height = '10px';
            piece.style.background = this.colors[Math.floor(Math.random() * this.colors.length)];
            piece.style.borderRadius = '50%';
            piece.style.left = `${Math.random() * 100}%`;
            piece.style.top = '-10px';
            piece.style.animation = `fall ${2 + Math.random() * 3}s linear forwards`;
            
            // إضافة تأثير سقوط
            const style = document.createElement('style');
            style.textContent = `
                @keyframes fall {
                    to {
                        transform: translateY(100vh) rotate(${Math.random() * 360}deg);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
            
            confetti.appendChild(piece);
        }
        
        document.body.appendChild(confetti);
        
        // إزالة الكونفيتي بعد 3 ثوان
        setTimeout(() => {
            document.body.removeChild(confetti);
        }, 3000);
    }
    
    // الاتصال بالسوكيت
    connectSocket() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.socket = io({
            auth: {
                token: this.token
            }
        });
        
        // أحداث السوكيت
        this.socket.on('connected', (data) => {
            console.log('✅ متصل بالسوكيت:', data);
            this.addLiveNotification('🔗', 'متصل بالخادم');
        });
        
        this.socket.on('notification', (notification) => {
            this.showToast(notification.data.message || 'إشعار جديد', 'info');
        });
        
        this.socket.on('big_win_announcement', (data) => {
            if (data.userId !== this.user?.id) {
                this.addLiveNotification('🏆', `فاز بـ ${data.amount}$!`);
                this.showToast(`🎉 لاعب آخر فاز بـ ${data.amount}$!`, 'info');
            }
        });
        
        this.socket.on('user_spinning', (data) => {
            if (data.userId !== this.user?.id) {
                this.addLiveNotification('🎡', 'يدور العجلة الآن');
            }
        });
        
        this.socket.on('disconnect', () => {
            this.showToast('🔌 انقطع الاتصال', 'warning');
        });
    }
    
    // إرسال حدث فوز كبير
    emitBigWin(amount) {
        if (this.socket && this.user) {
            this.socket.emit('big_win', {
                amount: amount,
                username: this.user.username
            });
        }
    }
    
    // عرض رسالة عائمة
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${this.getToastIcon(type)}"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        
        // إزالة بعد 5 ثوانٍ
        setTimeout(() => {
            toast.style.animation = 'slideUp 0.5s ease reverse';
            setTimeout(() => {
                if (container.contains(toast)) {
                    container.removeChild(toast);
                }
            }, 500);
        }, 5000);
    }
    
    getToastIcon(type) {
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }
    
    // عرض رسالة في الواجهة
    showMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `alert alert-${type}`;
        messageDiv.textContent = message;
        
        const container = document.querySelector('.container');
        if (container) {
            container.insertBefore(messageDiv, container.firstChild);
            
            setTimeout(() => {
                if (container.contains(messageDiv)) {
                    container.removeChild(messageDiv);
                }
            }, 5000);
        } else {
            alert(message);
        }
    }
    
    // عرض نافذة الإيداع
    showDepositModal() {
        document.getElementById('depositModal').style.display = 'flex';
    }
    
    // بدء عملية الإيداع
    startDeposit() {
        const selected = document.querySelector('.deposit-option.active');
        if (!selected) {
            this.showToast('⚠️ اختر مبلغ الإيداع أولاً', 'warning');
            return;
        }
        
        const amount = selected.dataset.amount;
        this.showToast(`🚀 جاري توجيهك لإيداع ${amount}$...`, 'info');
        
        // إغلاق النافذة
        document.getElementById('depositModal').style.display = 'none';
        
        // توجيه لصفحة الإيداع (ستنشئها لاحقاً)
        setTimeout(() => {
            window.location.href = `/deposit?amount=${amount}`;
        }, 1500);
    }
    
    // تحديث الرصيد في الوقت الحقيقي
    updateBalance(newBalance) {
        this.user.balance = newBalance;
        this.userBalance.textContent = `${newBalance.toFixed(2)}$`;
        this.spinButton.disabled = newBalance < 1;
    }
}

// ========== تهيئة اللعبة عند تحميل الصفحة ==========
document.addEventListener('DOMContentLoaded', () => {
    const wheelGame = new WheelGame();
    
    // جعل اللعبة متاحة عالمياً للاستخدام في وحدة التحكم
    window.wheelGame = wheelGame;
    
    // تحديث الرصيد عبر السوكيت
    if (wheelGame.socket) {
        wheelGame.socket.on('balance_update', (data) => {
            if (data.userId === wheelGame.user?.id) {
                wheelGame.updateBalance(data.newBalance);
                wheelGame.showToast(`💰 تم تحديث رصيدك: ${data.newBalance}$`, 'success');
            }
        });
    }
    
    // إضافة بعض الإشعارات الحية الافتراضية
    setTimeout(() => {
        wheelGame.addLiveNotification('🎰', 'العجلة جاهزة للتدوير!');
    }, 1000);
    
    setTimeout(() => {
        wheelGame.addLiveNotification('💡', 'تذكر: كل دوارة بـ 1$ فقط');
    }, 3000);
    
    // تحديث التوكن إذا انتهت صلاحيته
    setInterval(async () => {
        const token = localStorage.getItem('token');
        if (token && token !== wheelGame.token) {
            wheelGame.token = token;
            await wheelGame.loadUserData();
            wheelGame.connectSocket();
        }
    }, 60000); // كل دقيقة
});
