const mongoose = require('mongoose');

const chatReportSchema = new mongoose.Schema({
    // من أبلغ
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // من تم الإبلاغ عنه
    reportedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // الرسالة المبلغ عنها
    messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PrivateMessage',
        required: true
    },
    
    // الدردشة
    chatId: {
        type: String,
        required: true
    },
    
    // سبب الإبلاغ
    reason: {
        type: String,
        enum: [
            'spam',
            'harassment',
            'inappropriate_content',
            'threats',
            'impersonation',
            'scam',
            'hate_speech',
            'other'
        ],
        required: true
    },
    
    // تفاصيل إضافية
    description: {
        type: String,
        maxlength: 500
    },
    
    // أدلة
    evidence: {
        screenshot: String,
        messageContent: String,
        additionalInfo: String
    },
    
    // الحالة
    status: {
        type: String,
        enum: ['pending', 'under_review', 'resolved', 'dismissed'],
        default: 'pending'
    },
    
    // الإجراء المتخذ
    actionTaken: {
        type: String,
        enum: [
            'warning',
            'temp_ban',
            'permanent_ban',
            'message_removed',
            'chat_blocked',
            'no_action'
        ]
    },
    
    // ملاحظات المدير
    adminNotes: String,
    
    // من قام بالمراجعة
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    reviewedAt: Date,
    
    // نتيجة المراجعة
    resolution: {
        type: String,
        enum: ['valid', 'invalid', 'needs_more_info']
    },
    
    // إخفاء البلاغ
    isHidden: {
        type: Boolean,
        default: false
    },
    
    // أولوية البلاغ (1-5، 5 أعلى)
    priority: {
        type: Number,
        min: 1,
        max: 5,
        default: 3
    }

}, { timestamps: true });

// Indexes
chatReportSchema.index({ reporter: 1 });
chatReportSchema.index({ reportedUser: 1 });
chatReportSchema.index({ status: 1, createdAt: -1 });
chatReportSchema.index({ messageId: 1 });
chatReportSchema.index({ priority: -1, createdAt: -1 });

// دالة لتحديث أولوية البلاغ
chatReportSchema.methods.updatePriority = function() {
    let priority = 3; // متوسط
    
    switch(this.reason) {
        case 'threats':
        case 'scam':
            priority = 5;
            break;
        case 'harassment':
        case 'hate_speech':
            priority = 4;
            break;
        case 'inappropriate_content':
            priority = 3;
            break;
        case 'spam':
        case 'impersonation':
            priority = 2;
            break;
        default:
            priority = 1;
    }
    
    this.priority = priority;
    return this;
};

const ChatReport = mongoose.model('ChatReport', chatReportSchema);
module.exports = ChatReport;
