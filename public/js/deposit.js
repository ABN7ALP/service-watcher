// 📁 public/js/deposit.js
class DepositManager {
    constructor() {
        this.currentStep = 1;
        this.shamNumber = '07701234567'; // رقم افتراضي - يمكن تغييره
        this.depositAmount = this.getUrlParam('amount') || '10';
        this.token = localStorage.getItem('token');
        this.user = null;
        
        this.init();
    }
    
    async init() {
        // تحميل بيانات المستخدم
        await this.loadUserData();
        
        // إعداد الواجهة
        this.setupUI();
        
        // إعداد الأحداث
        this.setupEventListeners();
        
        // تحديث خطوات الإيداع
        this.updateSteps();
    }
    
    // تحميل بيانات المستخدم
    async loadUserData() {
        if (!this.token) {
            window.location.href = '/login';
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
            document.getElementById('username').textContent = this.user.username;
            document.getElementById('userBalance').textContent = `${this.user.balance.toFixed(2)}$`;
        }
    }
    
    // إعداد الواجهة
    setupUI() {
        // عرض رقم شام كاش والمبلغ
        document.getElementById('shamNumber').textContent = this.shamNumber;
        document.getElementById('depositAmount').textContent = `${this.depositAmount}$`;
        
        // تحديث شريط التقدم
        this.updateProgressBar();
    }
    
    // إعداد مستمعي الأحداث
    setupEventListeners() {
        // زر النسخ
        document.querySelectorAll('.btn-copy').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.currentTarget.dataset.copy;
                const text = document.getElementById(targetId).textContent;
                this.copyToClipboard(text, e.currentTarget);
            });
        });
        
        // رفع الصورة
        const fileInput = document.getElementById('screenshot');
        const filePreview = document.getElementById('filePreview');
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    this.showMessage('⚠️ حجم الملف أكبر من 5MB', 'error');
                    fileInput.value = '';
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    filePreview.innerHTML = `
                        <img src="${event.target.result}" alt="معاينة الإيصال">
                        <p>${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)</p>
                    `;
                };
                reader.readAsDataURL(file);
            }
        });
        
        // نموذج الإيداع
        document.getElementById('depositForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitDepositRequest();
        });
        
        // زر العودة للعجلة
        document.getElementById('goToWheelBtn').addEventListener('click', () => {
            window.location.href = '/wheel';
        });
        
        // زر مشاهدة الطلب
        document.getElementById('viewRequestBtn').addEventListener('click', () => {
            window.location.href = '/deposit/requests';
        });
    }
    
    // نسخ للنصوص
    async copyToClipboard(text, button) {
        try {
            await navigator.clipboard.writeText(text);
            
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-check"></i> تم النسخ';
            button.classList.add('copied');
            
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('copied');
            }, 2000);
            
            this.showMessage('✅ تم نسخ الرقم', 'success');
        } catch (error) {
            console.error('❌ خطأ في النسخ:', error);
            this.showMessage('❌ تعذر نسخ الرقم', 'error');
        }
    }
    
    // إرسال طلب الإيداع
    async submitDepositRequest() {
        const form = document.getElementById('depositForm');
        const formData = new FormData(form);
        
        // إضافة البيانات الإضافية
        formData.append('amount', this.depositAmount);
        formData.append('paymentMethod', 'sham_kash');
        
        try {
            const response = await fetch('/api/deposit/request', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showDepositResult(data);
                form.reset();
                document.getElementById('filePreview').innerHTML = '';
            } else {
                this.showMessage(data.message || '❌ خطأ في طلب الإيداع', 'error');
            }
        } catch (error) {
            console.error('❌ خطأ في إرسال الطلب:', error);
            this.showMessage('❌ خطأ في الاتصال بالخادم', 'error');
        }
    }
    
    // عرض نتيجة الإيداع
    showDepositResult(data) {
        const modal = document.getElementById('resultModal');
        const resultIcon = document.getElementById('resultIcon');
        const resultTitle = document.getElementById('resultTitle');
        const resultMessage = document.getElementById('resultMessage');
        const resultDetails = document.getElementById('resultDetails');
        
        // تحديث المحتوى
        resultIcon.textContent = '⏳';
        resultTitle.textContent = 'طلب الإيداع قيد المراجعة';
        resultMessage.textContent = data.message;
        
        resultDetails.innerHTML = `
            <div class="detail">
                <span>رقم الطلب:</span>
                <strong>${data.data.requestId}</strong>
            </div>
            <div class="detail">
                <span>المبلغ:</span>
                <strong>${data.data.amount}$</strong>
            </div>
            <div class="detail">
                <span>رقم المعاملة:</span>
                <strong>${data.data.transactionId}</strong>
            </div>
            <div class="detail">
                <span>الوقت المتوقع:</span>
                <strong>${data.data.estimatedTime}</strong>
            </div>
        `;
        
        modal.style.display = 'flex';
        
        // تحديث الخطوة
        this.currentStep = 1;
        this.updateSteps();
        this.updateProgressBar();
    }
    
    // تحديث خطوات الإيداع
    updateSteps() {
        document.querySelectorAll('.step').forEach((step, index) => {
            const stepNumber = index + 1;
            
            if (stepNumber === this.currentStep) {
                step.classList.add('active');
            } else {
                step.classList.remove('active');
            }
            
            // إضافة حدث النقر للخطوات النشطة السابقة
            if (stepNumber < this.currentStep) {
                step.style.cursor = 'pointer';
                step.addEventListener('click', () => {
                    this.currentStep = stepNumber;
                    this.updateSteps();
                    this.updateProgressBar();
                });
            } else {
                step.style.cursor = 'default';
                step.removeEventListener('click', () => {});
            }
        });
    }
    
    // تحديث شريط التقدم
    updateProgressBar() {
        const progress = (this.currentStep / 3) * 100;
        document.getElementById('progressFill').style.width = `${progress}%`;
    }
    
    // الحصول على معامل من الرابط
    getUrlParam(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }
    
    // عرض رسالة
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
}

// تهيئة مدير الإيداع عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    const depositManager = new DepositManager();
    window.depositManager = depositManager;
});
