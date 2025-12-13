// 📁 services/notificationService.js - النسخة المعدلة
class NotificationService {
    constructor(io) {
        this.io = io;
        this.onlineUsers = new Map();
    }
    
    // إشعارات للمستخدمين
    async sendUserNotification(userId, type, data) {
        try {
            const notification = {
                id: Date.now().toString(),
                type,
                data,
                read: false,
                createdAt: new Date()
            };
            
            // إرسال فوري إذا كان متصلاً
            const user = this.onlineUsers.get(userId.toString());
            if (user && this.io) {
                this.io.to(user.socketId).emit('notification', {
                    type,
                    data: notification,
                    timestamp: new Date()
                });
            }
            
            console.log(`📨 إشعار ${type} للمستخدم ${userId}`);
            
            // حفظ في قاعدة البيانات (يمكن إضافة جدول Notifications لاحقاً)
            return true;
        } catch (error) {
            console.error('❌ خطأ في إرسال الإشعار:', error);
            return false;
        }
    }
    
    // إشعارات للأدمن
    async sendAdminNotification(type, data) {
        try {
            if (this.io) {
                this.io.to('admin-room').emit('admin_notification', {
                    id: Date.now().toString(),
                    type,
                    data,
                    createdAt: new Date()
                });
            }
            
            console.log(`🔔 إشعار أدمن: ${type}`);
            return true;
        } catch (error) {
            console.error('❌ خطأ في إشعار الأدمن:', error);
            return false;
        }
    }
    
    // تحديث قائمة المستخدمين المتصلين
    updateOnlineUsers(onlineUsers) {
        this.onlineUsers = onlineUsers;
    }
    
    // أنواع الإشعارات
    static types = {
        DEPOSIT_APPROVED: 'deposit_approved',
        DEPOSIT_REJECTED: 'deposit_rejected',
        WITHDRAWAL_APPROVED: 'withdrawal_approved',
        WITHDRAWAL_REJECTED: 'withdrawal_rejected',
        WITHDRAWAL_COMPLETED: 'withdrawal_completed',
        WHEEL_SPIN_WIN: 'wheel_spin_win',
        WHEEL_SPIN_LOSE: 'wheel_spin_lose',
        BONUS_RECEIVED: 'bonus_received',
        NEW_MESSAGE: 'new_message',
        SYSTEM_ALERT: 'system_alert'
    };
    
    // قوالب الإشعارات
    static templates = {
        deposit_approved: (amount) => ({
            title: '✅ تمت الموافقة على الإيداع',
            message: `تم إضافة ${amount}$ إلى رصيدك بنجاح.`,
            icon: '💰',
            color: 'green'
        }),
        deposit_rejected: (reason) => ({
            title: '❌ تم رفض الإيداع',
            message: `طلب الإيداع مرفوض. ${reason}`,
            icon: '⚠️',
            color: 'red'
        }),
        wheel_spin_win: (amount) => ({
            title: '🎉 فوز في العجلة!',
            message: `مبروك! فزت بـ ${amount}$ في العجلة.`,
            icon: '🎡',
            color: 'gold'
        }),
        wheel_spin_lose: () => ({
            title: '💫 حظ أوكد في المرة القادمة',
            message: 'لم تربح هذه المرة، جرب حظك مجدداً!',
            icon: '🔄',
            color: 'blue'
        }),
        big_win_alert: (username, amount) => ({
            title: '🏆 فوز كبير!',
            message: `المستخدم ${username} فاز بـ ${amount}$!`,
            icon: '🔥',
            color: 'orange'
        })
    };
}

module.exports = NotificationService;
