// 📁 public/js/withdraw.js
class WithdrawManager {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = null;
        this.currentStep = 1;
        this.withdrawalData = {
            amount: 0,
            method: 'sham_kash',
            accountDetails: {},
            fees: 0
        };
        
        this.init();
    }
    
    async init() {
        if (!this.token) {
            window.location.href = '/login';
            return;
        }
        
        await this.loadUserData();
        this.loadWithdrawalStats();
        this.loadRecentWithdrawals();
        this.setupEventListeners();
        this.updateStep(1);
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
                this.updateUI();
            } else {
                this.logout();
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل بيانات المستخدم:', error);
            this.showToast('❌ خطأ في الاتصال بالخادم', 'error');
        }
    }
    
    // تحديث الواجهة
    updateUI() {
        if (!this.user) return;
        
        // تحديث الرصيد
        document.getElementById('navBalance').textContent = `${this.user.balance.toFixed(2)}$`;
        document.getElementById('availableBalance').textContent = `${this.user.balance.toFixed(2)}$`;
        
        // تحديث الحد الأدنى للسحب
        this.updateWithdrawalLimits();
    }
    
    // تحديث حدود السحب
    updateWithdrawalLimits() {
        // هذه قيم افتراضية - يمكن جلبها من API
        document.getElementById('minWithdrawalAmount').textContent = '10.00$';
        document.getElementById('dailyLimit').textContent = '1,000.00$';
    }
    
    // تحميل إحصائيات السحب
    async loadWithdrawalStats() {
        try {
            const response = await fetch('/api/withdrawal/stats', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updateStatsUI(data);
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل إحصائيات السحب:', error);
        }
    }
    
    // تحديث واجهة الإحصائيات
    updateStatsUI(data) {
        if (data.success) {
            const stats = data.stats;
            
            // تحديث الإحصائيات الشهرية
            document.getElementById('monthRequests').textContent = stats.monthlyRequests || 0;
            document.getElementById('monthAmount').textContent = `${(stats.monthlyAmount || 0).toFixed(2)}$`;
            document.getElementById('avgProcessing').textContent = stats.avgProcessingTime || '24 ساعة';
            document.getElementById('completionRate').textContent = stats.completionRate || '100%';
            
            // تحديث السحوبات اليومية
            document.getElementById('todayWithdrawals').textContent = 
                `${(stats.todayWithdrawn || 0).toFixed(2)}$ / ${(stats.dailyLimit || 1000).toFixed(2)}$`;
        }
    }
    
    // تحميل آخر السحوبات
    async loadRecentWithdrawals() {
        try {
            const response = await fetch('/api/withdrawal/my-requests?limit=5', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.displayRecentWithdrawals(data);
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل آخر السحوبات:', error);
        }
    }
    
    // عرض آخر السحوبات
    displayRecentWithdrawals(data) {
        const container = document.getElementById('recentWithdrawals');
        if (!container) return;
        
        if (!data.success || !data.withdrawals || data.withdrawals.length === 0) {
            return;
        }
        
        const withdrawalsHtml = data.withdrawals.map(withdrawal => {
            const date = new Date(withdrawal.createdAt).toLocaleDateString('ar-SA');
            const statusClass = this.getStatusClass(withdrawal.status);
            const statusText = this.getStatusText(withdrawal.status);
            
            return `
                <div class="recent-withdrawal-item">
                    <div class="withdrawal-info">
                        <h4>${date}</h4>
                        <small class="${statusClass}">${statusText}</small>
                    </div>
                    <div class="withdrawal-amount">${withdrawal.amount.toFixed(2)}$</div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = withdrawalsHtml;
    }
    
    getStatusClass(status) {
        const classes = {
            'pending': 'status-pending',
            'processing': 'status-processing',
            'completed': 'status-completed',
            'rejected': 'status-rejected',
            'cancelled': 'status-cancelled'
        };
        return classes[status] || '';
    }
    
    getStatusText(status) {
        const texts = {
            'pending': 'قيد الانتظار',
            'processing': 'قيد المعالجة',
            'completed': 'مكتمل',
            'rejected': 'مرفوض',
            'cancelled': 'ملغي'
        };
        return texts[status] || status;
    }
    
    // إعداد مستمعي الأحداث
    setupEventListeners() {
        // أزرار التنقل بين الخطوات
        this.setupStepNavigation();
        
        // اختيار المبلغ
        this.setupAmountSelection();
        
        // اختيار طريقة السحب
        this.setupPaymentMethodSelection();
        
        // تأكيد الطلب
        this.setupConfirmation();
        
        // الإلغاء
        this.setupCancellation();
    }
    
    // التنقل بين الخطوات
    setupStepNavigation() {
        // التالي للخطوة 2
        document.getElementById('nextToStep2').addEventListener('click', () => {
            if (this.validateStep1()) {
                this.updateStep(2);
            }
        });
        
        // السابق للخطوة 1
        document.getElementById('backToStep1').addEventListener('click', () => {
            this.updateStep(1);
        });
        
        // التالي للخطوة 3
        document.getElementById('nextToStep3').addEventListener('click', () => {
            if (this.validateStep2()) {
                this.updateStep(3);
            }
        });
        
        // السابق للخطوة 2
        document.getElementById('backToStep2').addEventListener('click', () => {
            this.updateStep(2);
        });
        
        // إرسال طلب السحب
        document.getElementById('submitWithdrawal').addEventListener('click', () => {
            this.submitWithdrawalRequest();
        });
        
        // طلب سحب جديد
        document.getElementById('newWithdrawalBtn').addEventListener('click', () => {
            this.resetForm();
            this.updateStep(1);
        });
    }
    
    // التحقق من صحة الخطوة 1
    validateStep1() {
        const amount = this.withdrawalData.amount;
        const minAmount = 10;
        const userBalance = this.user?.balance || 0;
        
        if (amount < minAmount) {
            this.showToast(`الحد الأدنى للسحب هو ${minAmount}$`, 'error');
            return false;
        }
        
        if (amount > userBalance) {
            this.showToast('رصيدك غير كافي', 'error');
            return false;
        }
        
        // التحقق من الحد اليومي (يمكن إضافة منطق أكثر تعقيداً)
        const todayWithdrawn = 0; // يمكن جلب هذه القيمة من API
        const dailyLimit = 1000;
        
        if (amount + todayWithdrawn > dailyLimit) {
            this.showToast(`تجاوزت الحد اليومي للسحب (${dailyLimit}$)`, 'error');
            return false;
        }
        
        return true;
    }
    
    // التحقق من صحة الخطوة 2
    validateStep2() {
        const method = this.withdrawalData.method;
        
        if (method === 'sham_kash') {
            const phone = document.getElementById('shamPhone').value.trim();
            const name = document.getElementById('shamName').value.trim();
            
            if (!phone || phone.length < 10) {
                this.showToast('يرجى إدخال رقم شام كاش صحيح', 'error');
                return false;
            }
            
            if (!name) {
                this.showToast('يرجى إدخال الاسم كما في شام كاش', 'error');
                return false;
            }
            
            this.withdrawalData.accountDetails = {
                phone,
                name,
                type: 'sham_kash'
            };
            
        } else if (method === 'bank_transfer') {
            const bankName = document.getElementById('bankName').value.trim();
            const accountNumber = document.getElementById('accountNumber').value.trim();
            const accountName = document.getElementById('accountName').value.trim();
            
            if (!bankName || !accountNumber || !accountName) {
                this.showToast('يرجى ملء جميع بيانات الحساب البنكي', 'error');
                return false;
            }
            
            this.withdrawalData.accountDetails = {
                bankName,
                accountNumber,
                accountName,
                type: 'bank_transfer'
            };
        }
        
        return true;
    }
    
    // اختيار المبلغ
    setupAmountSelection() {
        // الأزرار السريعة
        document.querySelectorAll('.amount-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const amount = parseFloat(e.target.dataset.amount);
                this.selectAmount(amount);
            });
        });
        
        // المدخل المخصص
        const customInput = document.getElementById('customAmount');
        const slider = document.getElementById('amountSlider');
        
        customInput.addEventListener('input', (e) => {
            let value = parseFloat(e.target.value) || 0;
            value = Math.min(Math.max(value, 10), 1000);
            
            this.selectAmount(value);
            slider.value = value;
        });
        
        slider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.selectAmount(value);
            customInput.value = value;
        });
        
        // اختيار مبلغ افتراضي
        this.selectAmount(50);
    }
    
    // اختيار المبلغ
    selectAmount(amount) {
        // تحديث الأزرار النشطة
        document.querySelectorAll('.amount-option').forEach(btn => {
            const btnAmount = parseFloat(btn.dataset.amount);
            if (Math.abs(btnAmount - amount) < 0.01) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // تحديث البيانات
        this.withdrawalData.amount = amount;
        this.withdrawalData.fees = this.calculateFees(amount);
        
        // تحديث الواجهة
        this.updateAmountSummary();
        
        // تفعيل زر التالي
        document.getElementById('nextToStep2').disabled = false;
    }
    
    // حساب الرسوم
    calculateFees(amount) {
        // رسوم ثابتة أو نسبة مئوية
        if (this.withdrawalData.method === 'bank_transfer') {
            return amount * 0.01; // 1% للتحويل البنكي
        }
        return 0; // مجاني لشام كاش
    }
    
    // تحديث ملخص المبلغ
    updateAmountSummary() {
        const { amount, fees } = this.withdrawalData;
        const netAmount = amount - fees;
        const userBalance = this.user?.balance || 0;
        const remainingBalance = userBalance - amount;
        
        document.getElementById('selectedAmount').textContent = `${amount.toFixed(2)}$`;
        document.getElementById('withdrawalFee').textContent = `${fees.toFixed(2)}$`;
        document.getElementById('netAmount').textContent = `${netAmount.toFixed(2)}$`;
        document.getElementById('remainingBalance').textContent = `${remainingBalance.toFixed(2)}$`;
    }
    
    // اختيار طريقة السحب
    setupPaymentMethodSelection() {
        document.querySelectorAll('.payment-method').forEach(method => {
            method.addEventListener('click', (e) => {
                const selectedMethod = e.currentTarget.dataset.method;
                this.selectPaymentMethod(selectedMethod);
            });
        });
    }
    
    // اختيار طريقة السحب
    selectPaymentMethod(method) {
        // تحديث الأيقونات
        document.querySelectorAll('.payment-method').forEach(m => {
            const checkIcon = m.querySelector('.method-check i');
            if (m.dataset.method === method) {
                m.classList.add('active');
                checkIcon.className = 'fas fa-check-circle';
            } else {
                m.classList.remove('active');
                checkIcon.className = 'far fa-circle';
            }
        });
        
        // تحديث البيانات
        this.withdrawalData.method = method;
        this.withdrawalData.fees = this.calculateFees(this.withdrawalData.amount);
        
        // إظهار/إخفاء نماذج التفاصيل
        if (method === 'sham_kash') {
            document.getElementById('shamKashDetails').style.display = 'block';
            document.getElementById('bankDetails').style.display = 'none';
        } else {
            document.getElementById('shamKashDetails').style.display = 'none';
            document.getElementById('bankDetails').style.display = 'block';
        }
        
        // تحديث الملخص
        this.updateAmountSummary();
        this.updateConfirmationDetails();
    }
    
    // تأكيد الطلب
    setupConfirmation() {
        // قبول الشروط
        document.getElementById('acceptTerms').addEventListener('change', (e) => {
            document.getElementById('submitWithdrawal').disabled = !e.target.checked;
        });
        
        // تحديث تفاصيل التأكيد
        this.updateConfirmationDetails();
    }
    
    // تحديث تفاصيل التأكيد
    updateConfirmationDetails() {
        const { amount, fees, method, accountDetails } = this.withdrawalData;
        const netAmount = amount - fees;
        
        // تحديث الأرقام
        document.getElementById('confirmAmount').textContent = `${amount.toFixed(2)}$`;
        document.getElementById('confirmFee').textContent = `${fees.toFixed(2)}$`;
        document.getElementById('confirmNet').textContent = `${netAmount.toFixed(2)}$`;
        
        // تحديث طريقة السحب
        const methodText = method === 'sham_kash' ? 'شام كاش' : 'حوالة بنكية';
        document.getElementById('confirmMethod').textContent = methodText;
        
        // تحديث الحساب المستلم
        let accountText = '--';
        if (method === 'sham_kash' && accountDetails.phone) {
            accountText = accountDetails.phone;
        } else if (method === 'bank_transfer' && accountDetails.accountNumber) {
            accountText = `****${accountDetails.accountNumber.slice(-4)}`;
        }
        document.getElementById('confirmAccount').textContent = accountText;
        
        // تحديث التاريخ
        const now = new Date();
        const dateStr = now.toLocaleDateString('ar-SA', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const timeStr = now.toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit'
        });
        document.getElementById('orderDate').textContent = `${dateStr} - ${timeStr}`;
        
        // وقت المعالجة المتوقع
        const processingTime = method === 'sham_kash' ? '24-48 ساعة' : '3-5 أيام عمل';
        document.getElementById('confirmTime').textContent = processingTime;
    }
    
    // إرسال طلب السحب
    async submitWithdrawalRequest() {
        try {
            const response = await fetch('/api/withdrawal/request', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: this.withdrawalData.amount,
                    paymentMethod: this.withdrawalData.method,
                    accountDetails: this.withdrawalData.accountDetails
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showSuccess(data);
                this.updateStep(4);
            } else {
                this.showToast(data.message || '❌ خطأ في إرسال طلب السحب', 'error');
            }
        } catch (error) {
            console.error('❌ خطأ في إرسال طلب السحب:', error);
            this.showToast('❌ خطأ في الاتصال بالخادم', 'error');
        }
    }
    
    // عرض نجاح الطلب
    showSuccess(data) {
        document.getElementById('successOrderId').textContent = data.data.requestId;
        document.getElementById('successAmount').textContent = `${this.withdrawalData.amount.toFixed(2)}$`;
        
        const processingTime = this.withdrawalData.method === 'sham_kash' ? '24-48 ساعة' : '3-5 أيام عمل';
        document.getElementById('successTime').textContent = processingTime;
    }
    
    // الإلغاء
    setupCancellation() {
        const cancelModal = document.getElementById('cancelModal');
        const cancelCancelBtn = document.getElementById('cancelCancel');
        const confirmCancelBtn = document.getElementById('confirmCancel');
        
        // زر الإلغاء في الخطوة 1
        document.querySelector('.btn-outline[onclick*="dashboard"]').addEventListener('click', (e) => {
            e.preventDefault();
            cancelModal.style.display = 'flex';
        });
        
        // إغلاق نافذة الإلغاء
        cancelCancelBtn.addEventListener('click', () => {
            cancelModal.style.display = 'none';
        });
        
        // تأكيد الإلغاء
        confirmCancelBtn.addEventListener('click', () => {
            window.location.href = '/dashboard';
        });
        
        // إغلاق بالنقر خارج النافذة
        window.addEventListener('click', (e) => {
            if (e.target === cancelModal) {
                cancelModal.style.display = 'none';
            }
        });
    }
    
    // تحديث الخطوة
    updateStep(step) {
        this.currentStep = step;
        
        // تحديث شريط التقدم
        document.querySelectorAll('.progress-step').forEach(progressStep => {
            const stepNumber = parseInt(progressStep.dataset.step);
            
            progressStep.classList.remove('active', 'completed');
            
            if (stepNumber < step) {
                progressStep.classList.add('completed');
            } else if (stepNumber === step) {
                progressStep.classList.add('active');
            }
        });
        
        // تحديث الخط المنزلق
        const progressLine = document.querySelector('.progress-line');
        const progressPercent = ((step - 1) / 3) * 100;
        progressLine.style.setProperty('--progress', `${progressPercent}%`);
        
        // إخفاء جميع الخطوات
        document.querySelectorAll('.withdraw-step').forEach(stepEl => {
            stepEl.classList.remove('active');
        });
        
        // إظهار الخطوة الحالية
        document.getElementById(`step${step}`).classList.add('active');
        
        // تحديث تفاصيل التأكيد في الخطوة 3
        if (step === 3) {
            this.updateConfirmationDetails();
        }
        
        // إعادة تعليمات التركيز
        setTimeout(() => {
            const currentStep = document.querySelector('.withdraw-step.active');
            if (currentStep) {
                const firstInput = currentStep.querySelector('input, button, select, textarea');
                if (firstInput) {
                    firstInput.focus();
                }
            }
        }, 300);
    }
    
    // إعادة تعيين النموذج
    resetForm() {
        this.withdrawalData = {
            amount: 0,
            method: 'sham_kash',
            accountDetails: {},
            fees: 0
        };
        
        // إعادة تعيين المدخلات
        document.getElementById('customAmount').value = '';
        document.getElementById('amountSlider').value = 50;
        document.getElementById('shamPhone').value = '';
        document.getElementById('shamName').value = '';
        document.getElementById('bankName').value = '';
        document.getElementById('accountNumber').value = '';
        document.getElementById('accountName').value = '';
        document.getElementById('acceptTerms').checked = false;
        
        // إعادة تعيين الأزرار
        document.querySelectorAll('.amount-option').forEach(btn => {
            btn.classList.remove('active');
        });
        
        document.querySelectorAll('.payment-method').forEach(method => {
            method.classList.remove('active');
        });
        
        // اختيار قيم افتراضية
        this.selectAmount(50);
        this.selectPaymentMethod('sham_kash');
    }
    
    // تسجيل الخروج
    logout() {
        localStorage.removeItem('token');
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

// تهيئة صفحة السحب
document.addEventListener('DOMContentLoaded', () => {
    const withdrawManager = new WithdrawManager();
    window.withdrawManager = withdrawManager;
    
    // إضافة بعض الأنماط الديناميكية
    const style = document.createElement('style');
    style.textContent = `
        .status-pending { color: #f39c12; }
        .status-processing { color: #3498db; }
        .status-completed { color: #2ecc71; }
        .status-rejected { color: #e74c3c; }
        .status-cancelled { color: #95a5a6; }
        
        .progress-line::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            background: #2ecc71;
            width: var(--progress, 0%);
            transition: width 0.5s ease;
        }
        
        .modal-icon.warning {
            color: #f39c12;
        }
    `;
    document.head.appendChild(style);
});
