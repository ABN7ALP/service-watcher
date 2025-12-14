// 📁 public/js/dashboard.js
class DashboardManager {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = null;
        this.chart = null;
        this.socket = null;
        
        // عناصر DOM
        this.elements = {
            username: document.getElementById('dashboardUsername'),
            email: document.getElementById('dashboardEmail'),
            balance: document.getElementById('dashboardBalance'),
            mainBalance: document.getElementById('mainBalance'),
            greetingName: document.getElementById('greetingName'),
            todaySpins: document.getElementById('todaySpins'),
            todayWins: document.getElementById('todayWins'),
            winRate: document.getElementById('winRate'),
            totalDeposited: document.getElementById('totalDeposited'),
            totalWithdrawn: document.getElementById('totalWithdrawn'),
            availableBalance: document.getElementById('availableBalance'),
            totalSpinsCount: document.getElementById('totalSpinsCount'),
            totalSpentAmount: document.getElementById('totalSpentAmount'),
            totalWonAmount: document.getElementById('totalWonAmount'),
            netProfitAmount: document.getElementById('netProfitAmount'),
            recentSpins: document.getElementById('recentSpins'),
            minWithdrawal: document.getElementById('minWithdrawal'),
            dailyLimit: document.getElementById('dailyLimit'),
            avgWithdrawalTime: document.getElementById('avgWithdrawalTime'),
            notificationsList: document.getElementById('notificationsList'),
            unreadCount: document.getElementById('unreadCount'),
            referralCount: document.getElementById('referralCount'),
            referralEarnings: document.getElementById('referralEarnings'),
            referralLink: document.getElementById('referralLink'),
            memberSince: document.getElementById('memberSince')
        };
        
        this.init();
    }
    
    async init() {
        if (!this.token) {
            window.location.href = '/login';
            return;
        }
        
        await this.loadUserData();
        await this.loadDashboardData();
        this.setupEventListeners();
        this.connectSocket();
        this.initChart();
        this.loadRecentSpins();
        this.loadNotifications();
    }
    
    // تحميل بيانات المستخدم
    async loadUserData() {
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
            } else {
                this.logout();
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل بيانات المستخدم:', error);
            this.showToast('❌ خطأ في الاتصال بالخادم', 'error');
        }
    }
    
    // تحديث واجهة المستخدم
    updateUserUI() {
        if (!this.user) return;
        
        const { username, email, balance, createdAt, totalDeposited = 0, totalWithdrawn = 0 } = this.user;
        
        // المعلومات الأساسية
        this.elements.username.textContent = username;
        this.elements.email.textContent = email;
        this.elements.balance.textContent = `${balance.toFixed(2)}$`;
        this.elements.mainBalance.textContent = `${balance.toFixed(2)}$`;
        this.elements.greetingName.textContent = username;
        
        // تاريخ التسجيل
        if (createdAt) {
            const joinDate = new Date(createdAt);
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            this.elements.memberSince.textContent = joinDate.toLocaleDateString('ar-SA', options);
        }
        
        // معلومات الرصيد
        this.elements.totalDeposited.textContent = `${(totalDeposited || 0).toFixed(2)}$`;
        this.elements.totalWithdrawn.textContent = `${(totalWithdrawn || 0).toFixed(2)}$`;
        this.elements.availableBalance.textContent = `${balance.toFixed(2)}$`;
        
        // رابط الدعوة
        const referralLink = `${window.location.origin}/register?ref=${username}`;
        this.elements.referralLink.value = referralLink;
    }
    
    // تحميل بيانات اللوحة
    async loadDashboardData() {
        try {
            // إحصائيات اليوم
            const todayResponse = await fetch('/api/user/stats/today', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (todayResponse.ok) {
                const data = await todayResponse.json();
                this.updateTodayStats(data);
            }
            
            // إحصائيات العجلة
            const wheelResponse = await fetch('/api/user/wheel/stats', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (wheelResponse.ok) {
                const data = await wheelResponse.json();
                this.updateWheelStats(data);
            }
            
            // إعدادات السحب
            const withdrawalResponse = await fetch('/api/withdrawal/stats', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (withdrawalResponse.ok) {
                const data = await withdrawalResponse.json();
                this.updateWithdrawalInfo(data);
            }
            
            // إحصائيات الدعوة
            const referralResponse = await fetch('/api/user/referrals/stats', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (referralResponse.ok) {
                const data = await referralResponse.json();
                this.updateReferralStats(data);
            }
            
        } catch (error) {
            console.error('❌ خطأ في تحميل بيانات اللوحة:', error);
        }
    }
    
    // تحديث إحصائيات اليوم
    updateTodayStats(data) {
        if (data.success) {
            const stats = data.stats;
            this.elements.todaySpins.textContent = stats.todaySpins || 0;
            this.elements.todayWins.textContent = `${(stats.todayWins || 0).toFixed(2)}$`;
            
            // حساب نسبة الفوز
            if (stats.todaySpins > 0) {
                const winRate = ((stats.todayWins / stats.todaySpins) * 100).toFixed(1);
                this.elements.winRate.textContent = `${winRate}%`;
            }
        }
    }
    
    // تحديث إحصائيات العجلة
    updateWheelStats(data) {
        if (data.success) {
            const stats = data.stats;
            this.elements.totalSpinsCount.textContent = stats.totalSpins || 0;
            this.elements.totalSpentAmount.textContent = `${(stats.totalSpent || 0).toFixed(2)}$`;
            this.elements.totalWonAmount.textContent = `${(stats.totalWon || 0).toFixed(2)}$`;
            
            // حساب صافي الربح
            const netProfit = (stats.totalWon || 0) - (stats.totalSpent || 0);
            this.elements.netProfitAmount.textContent = `${netProfit.toFixed(2)}$`;
            
            // تحديث اللون بناءً على الربح/الخسارة
            this.elements.netProfitAmount.style.color = netProfit >= 0 ? '#00b894' : '#ff6b6b';
        }
    }
    
    // تحديث معلومات السحب
    updateWithdrawalInfo(data) {
        if (data.success) {
            const stats = data.stats;
            this.elements.minWithdrawal.textContent = `${stats.minWithdrawal || 10}$`;
            this.elements.dailyLimit.textContent = `${stats.maxDailyWithdrawal || 1000}$`;
            this.elements.avgWithdrawalTime.textContent = stats.avgProcessingTime || '24 ساعة';
        }
    }
    
    // تحديث إحصائيات الدعوة
    updateReferralStats(data) {
        if (data.success) {
            const stats = data.stats;
            this.elements.referralCount.textContent = stats.referralCount || 0;
            this.elements.referralEarnings.textContent = `${(stats.referralEarnings || 0).Fixed(2)}$`;
        }
    }
    
    // تحميل آخر الدورات
    async loadRecentSpins() {
        try {
            const response = await fetch('/api/user/wheel/recent?limit=5', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.displayRecentSpins(data);
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل آخر الدورات:', error);
        }
    }
    
    // عرض آخر الدورات
    displayRecentSpins(data) {
        if (!data.success || !data.spins || data.spins.length === 0) {
            return;
        }
        
        const spinsHtml = data.spins.map(spin => {
            const isWin = spin.prize > 0;
            const netProfit = spin.prize - 1; // سعر الدوران 1$
            const time = new Date(spin.createdAt).toLocaleTimeString('ar-SA', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `
                <div class="recent-spin-item">
                    <div class="spin-result">
                        <div class="spin-icon ${isWin ? 'win' : 'lose'}">
                            <i class="fas fa-${isWin ? 'trophy' : 'redo'}"></i>
                        </div>
                        <div class="spin-details">
                            <h4>${isWin ? '🎉 فوز' : '💫 محاولة'}</h4>
                            <small>${time}</small>
                        </div>
                    </div>
                    <div class="spin-amount" style="color: ${isWin ? '#00b894' : '#ff6b6b'}">
                        ${isWin ? '+' : ''}${netProfit.toFixed(2)}$
                    </div>
                </div>
            `;
        }).join('');
        
        this.elements.recentSpins.innerHTML = spinsHtml;
    }
    
    // تحميل الإشعارات
    async loadNotifications() {
        try {
            const response = await fetch('/api/user/notifications?limit=5', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.displayNotifications(data);
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل الإشعارات:', error);
        }
    }
    
    // عرض الإشعارات
    displayNotifications(data) {
        if (!data.success || !data.notifications || data.notifications.length === 0) {
            return;
        }
        
        const notificationsHtml = data.notifications.map(notification => {
            const time = new Date(notification.createdAt).toLocaleTimeString('ar-SA', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `
                <div class="notification-item ${notification.read ? '' : 'unread'}">
                    <div class="notification-icon">
                        <i class="fas fa-${this.getNotificationIcon(notification.type)}"></i>
                    </div>
                    <div class="notification-content">
                        <p>${notification.message}</p>
                        <small>${time}</small>
                    </div>
                </div>
            `;
        }).join('');
        
        this.elements.notificationsList.innerHTML = notificationsHtml;
        this.elements.unreadCount.textContent = data.unreadCount || 0;
    }
    
    getNotificationIcon(type) {
        const icons = {
            'deposit_approved': 'check-circle',
            'deposit_rejected': 'times-circle',
            'withdrawal_approved': 'money-bill-wave',
            'withdrawal_rejected': 'ban',
            'wheel_spin_win': 'trophy',
            'wheel_spin_lose': 'redo',
            'bonus_received': 'gift',
            'system_alert': 'exclamation-triangle'
        };
        return icons[type] || 'bell';
    }
    
    // إعداد الرسم البياني
    initChart() {
        const ctx = document.getElementById('performanceChart').getContext('2d');
        
        // بيانات تجميلية
        const data = {
            labels: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
            datasets: [{
                label: 'الأرباح ($)',
                data: [12, 19, 8, 15, 22, 18, 25],
                borderColor: '#6a11cb',
                backgroundColor: 'rgba(106, 17, 203, 0.1)',
                tension: 0.4,
                fill: true
            }, {
                label: 'الدورات',
                data: [5, 8, 6, 9, 7, 10, 12],
                borderColor: '#00b894',
                backgroundColor: 'rgba(0, 184, 148, 0.1)',
                tension: 0.4,
                fill: true
            }]
        };
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#fff',
                            font: {
                                family: 'Cairo'
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#aaa'
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#aaa'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
        
        // التحكم في الفترة الزمنية
        document.querySelectorAll('.btn-chart').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.btn-chart').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.updateChartPeriod(e.target.dataset.period);
            });
        });
    }
    
    // تحديث فترة الرسم البياني
    updateChartPeriod(period) {
        // هنا يمكنك جلب بيانات جديدة من API بناءً على الفترة
        const periods = {
            week: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
            month: ['الأسبوع 1', 'الأسبوع 2', 'الأسبوع 3', 'الأسبوع 4'],
            year: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
        };
        
        this.chart.data.labels = periods[period] || periods.week;
        this.chart.update();
    }
    
    // إعداد مستمعي الأحداث
    setupEventListeners() {
        // تسجيل الخروج
        const logoutBtn = document.getElementById('logoutBtn');
        const logoutModal = document.getElementById('logoutModal');
        const cancelLogout = document.getElementById('cancelLogout');
        const confirmLogout = document.getElementById('confirmLogout');
        
        logoutBtn.addEventListener('click', () => {
            logoutModal.style.display = 'flex';
        });
        
        cancelLogout.addEventListener('click', () => {
            logoutModal.style.display = 'none';
        });
        
        confirmLogout.addEventListener('click', () => {
            this.logout();
        });
        
        // إغلاق النوافذ المنبثقة بالنقر خارجها
        window.addEventListener('click', (e) => {
            if (e.target === logoutModal) {
                logoutModal.style.display = 'none';
            }
        });
        
        // نسخ رابط الدعوة
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const targetId = e.currentTarget.dataset.target;
                const text = document.getElementById(targetId).value;
                
                try {
                    await navigator.clipboard.writeText(text);
                    
                    const originalHTML = e.currentTarget.innerHTML;
                    e.currentTarget.innerHTML = '<i class="fas fa-check"></i>';
                    e.currentTarget.classList.add('copied');
                    
                    this.showToast('✅ تم نسخ رابط الدعوة', 'success');
                    
                    setTimeout(() => {
                        e.currentTarget.innerHTML = originalHTML;
                        e.currentTarget.classList.remove('copied');
                    }, 2000);
                } catch (error) {
                    this.showToast('❌ تعذر نسخ الرابط', 'error');
                }
            });
        });
        
        // مشاركة الرابط
        document.getElementById('shareBtn').addEventListener('click', () => {
            const link = this.elements.referralLink.value;
            this.shareLink(link);
        });
        
        // تحديث البيانات كل 30 ثانية
        setInterval(() => {
            this.loadDashboardData();
            this.loadRecentSpins();
            this.loadNotifications();
        }, 30000);
        
        // تحديث التوكن كل 5 دقائق
        setInterval(async () => {
            await this.refreshToken();
        }, 300000);
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
        
        // تحديث الرصيد في الوقت الحقيقي
        this.socket.on('balance_update', (data) => {
            if (data.userId === this.user?.id) {
                this.user.balance = data.newBalance;
                this.elements.balance.textContent = `${data.newBalance.toFixed(2)}$`;
                this.elements.mainBalance.textContent = `${data.newBalance.toFixed(2)}$`;
                this.showToast(`💰 تم تحديث رصيدك: ${data.newBalance.toFixed(2)}$`, 'success');
            }
        });
        
        // إشعارات جديدة
        this.socket.on('notification', (notification) => {
            this.showToast(notification.data.message, 'info');
            this.loadNotifications();
        });
        
        // تحديث إحصائيات العجلة
        this.socket.on('spin_completed', (data) => {
            if (data.userId === this.user?.id) {
                this.loadDashboardData();
                this.loadRecentSpins();
            }
        });
        
        this.socket.on('disconnect', () => {
            this.showToast('🔌 انقطع الاتصال، جاري إعادة المحاولة...', 'warning');
        });
    }
    
    // مشاركة الرابط
    async shareLink(link) {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'انضم إلى عجلة الثروة!',
                    text: 'اربح آلاف الدولارات في ثوانٍ! انضم الآن عبر هذا الرابط:',
                    url: link
                });
                this.showToast('✅ تمت المشاركة بنجاح', 'success');
            } catch (error) {
                console.log('❌ إلغاء المشاركة:', error);
            }
        } else {
            // نسخ للاحتياط
            await navigator.clipboard.writeText(link);
            this.showToast('✅ تم نسخ الرابط للمشاركة', 'success');
        }
    }
    
    // تجديد التوكن
    async refreshToken() {
        try {
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.token) {
                    this.token = data.token;
                    localStorage.setItem('token', data.token);
                }
            }
        } catch (error) {
            console.error('❌ خطأ في تجديد التوكن:', error);
        }
    }
    
    // تسجيل الخروج
    logout() {
        localStorage.removeItem('token');
        if (this.socket) {
            this.socket.disconnect();
        }
        window.location.href = '/login';
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
}

// تهيئة اللوحة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new DashboardManager();
    window.dashboard = dashboard;
});
