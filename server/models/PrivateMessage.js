const mongoose = require('mongoose');

const privateMessageSchema = new mongoose.Schema({
    // الرابط للدردشة
    chatId: {
        type: String,
        required: true,
        index: true
    },
    
    // المرسل والمستقبل
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // نوع الرسالة
    type: {
        type: String,
        enum: ['text', 'image', 'video', 'voice', 'file', 'system'],
        default: 'text',
        required: true
    },
    
    // المحتوى (نص أو رابط)
    content: {
        type: String,
        required: function() {
            return this.type !== 'system';
        }
    },
    
    // محتوى الرسائل النظامية
    systemContent: {
        type: String,
        required: function() {
            return this.type === 'system';
        }
    },
    
    // بيانات إضافية
    metadata: {
        // للملفات
        fileName: String,
        fileSize: Number, // بالبايت
        fileType: String,
        duration: Number, // للصوت والفيديو (بالثواني)
        dimensions: {
            width: Number,
            height: Number
        },
        
        // خيارات الحماية
        viewOnce: { type: Boolean, default: false },
        disableSave: { type: Boolean, default: false },
        hasWatermark: { type: Boolean, default: false },
        disableReply: { type: Boolean, default: false },
        autoDelete: { type: Boolean, default: false },
        autoDeleteAfter: Number, // بعد كم ثانية
        
        // للصور والفيديو
        thumbnail: String,
        originalFileName: String,
        
        // تشفير
        isEncrypted: { type: Boolean, default: false },
        encryptionKey: String
    },
    
    // حالة الرسالة
    status: {
        sent: { type: Boolean, default: true },
        delivered: { type: Boolean, default: false },
        deliveredAt: Date,
        seen: { type: Boolean, default: false },
        seenAt: Date,
        
        // الحذف
        deletedForSender: { type: Boolean, default: false },
        deletedForReceiver: { type: Boolean, default: false },
        deletedAt: Date,
        
        // المشاهدة (لـ View Once)
        viewed: { type: Boolean, default: false },
        viewedAt: Date,
        viewCount: { type: Number, default: 0 }
    },
    
    // الرد على رسالة سابقة
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PrivateMessage'
    },
    
    // التفاعلات
    reactions: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        emoji: String,
        createdAt: { type: Date, default: Date.now }
    }],
    
    // البلاغات
    isReported: { type: Boolean, default: false },
    reportCount: { type: Number, default: 0 },
    
    // للمراقبة
    isSuspicious: { type: Boolean, default: false },
    aiAnalysis: {
        toxicityScore: Number,
        spamScore: Number,
        analyzedAt: Date
    },
    
    // انتهاء الصلاحية
    expiresAt: {
        type: Date,
        default: function() {
            // حذف بعد 12 ساعة تلقائياً
            return new Date(Date.now() + 12 * 60 * 60 * 1000);
        },
        index: true
    }

}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual للمرسل (populated)
privateMessageSchema.virtual('senderData', {
    ref: 'User',
    localField: 'sender',
    foreignField: '_id',
    justOne: true
});

// Virtual للمستقبل (populated)
privateMessageSchema.virtual('receiverData', {
    ref: 'User',
    localField: 'receiver',
    foreignField: '_id',
    justOne: true
});

// Virtual للرد (populated)
privateMessageSchema.virtual('replyToData', {
    ref: 'PrivateMessage',
    localField: 'replyTo',
    foreignField: '_id',
    justOne: true
});

// Middleware قبل الحفظ
privateMessageSchema.pre('save', function(next) {
    // إذا كانت رسالة نظامية، تعيين المحتوى المناسب
    if (this.type === 'system' && !this.systemContent) {
        this.systemContent = this.content;
        this.content = undefined;
    }
    
    // التحقق من حجم الملفات
    if (this.metadata.fileSize) {
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (this.metadata.fileSize > maxSize) {
            return next(new Error(`حجم الملف ${(this.metadata.fileSize / 1024 / 1024).toFixed(2)}MB يتجاوز الحد المسموح 5MB`));
        }
    }
    
    // التحقق من مدة الصوت/الفيديو
    if (this.metadata.duration) {
        if (this.type === 'voice' && this.metadata.duration > 15) {
            return next(new Error('مدة الرسالة الصوتية تتجاوز 15 ثانية'));
        }
        if (this.type === 'video' && this.metadata.duration > 30) {
            return next(new Error('مدة الفيديو تتجاوز 30 ثانية'));
        }
    }
    
    next();
});

// Indexes
privateMessageSchema.index({ chatId: 1, createdAt: -1 });
privateMessageSchema.index({ sender: 1, receiver: 1 });
privateMessageSchema.index({ 'status.delivered': 1 });
privateMessageSchema.index({ 'status.seen': 1 });
privateMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// دالة مساعدة للتحقق من الصلاحيات
privateMessageSchema.methods.canView = function(userId) {
    return this.sender.toString() === userId.toString() || 
           this.receiver.toString() === userId.toString();
};

// دالة مساعدة للتحقق من الحذف
privateMessageSchema.methods.isDeletedForUser = function(userId) {
    if (this.sender.toString() === userId.toString()) {
        return this.status.deletedForSender;
    }
    if (this.receiver.toString() === userId.toString()) {
        return this.status.deletedForReceiver;
    }
    return false;
};

const PrivateMessage = mongoose.model('PrivateMessage', privateMessageSchema);
module.exports = PrivateMessage;
