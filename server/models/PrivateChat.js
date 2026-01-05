const mongoose = require('mongoose');

const privateChatSchema = new mongoose.Schema({
    // معرف فريد للدردشة: user1_user2 (مفرز أبجدياً)
    chatId: {
        type: String,
        required: true,
        unique: true
    },
    
    // المشاركون في الدردشة (دائماً 2)
    participants: {
    type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    validate: {
        validator: function(array) {
            return array.length === 2;
        },
        message: 'الدردشة الخاصة بين شخصين فقط'
    },
    required: true
},
    
    // بيانات المشاركين (للأداء)
    participantData: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
        profileImage: String
    }],
    
    // آخر رسالة
    lastMessage: {
        type: String,
        default: ''
    },
    
    lastMessageAt: {
        type: Date,
        default: Date.now
    },
    
    lastMessageBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // إحصاءات
    messageCount: {
        type: Number,
        default: 0
    },
    
    unreadCount: {
        type: Map,
        of: Number,
        default: {}
    },
    
    // إعدادات
    isActive: {
        type: Boolean,
        default: true
    },
    
    // تفضيلات المستخدمين
    userPreferences: {
        type: Map,
        of: {
            mute: { type: Boolean, default: false },
            archive: { type: Boolean, default: false },
            customName: String
        },
        default: {}
    },
    
    // حذف بعد 12 ساعة
    autoDeleteAt: {
        type: Date,
        default: () => new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 ساعة
    },
    
    // علامات
    isReported: {
        type: Boolean,
        default: false
    },
    
    reportCount: {
        type: Number,
        default: 0
    },
    
    // الحظر
    isBlocked: {
        type: Boolean,
        default: false
    },
    
    blockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }

}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// التحقق من أن المشاركين اثنان فقط
function arrayLimit(val) {
    return val.length === 2;
}

// Middleware قبل الحفظ
privateChatSchema.pre('save', function(next) {
    // فرز الـ IDs أبجدياً لإنشاء chatId فريد
    const sortedIds = this.participants
        .map(id => id.toString())
        .sort();
    
    this.chatId = sortedIds.join('_');
    next();
});

// Virtual للمشارك الآخر
privateChatSchema.virtual('otherParticipant').get(function() {
    const currentUserId = this.participants[0]; // هذا فقط كمثال
    return this.participants.find(p => p.toString() !== currentUserId.toString());
});

// Virtual للحصول على أسماء المشاركين
privateChatSchema.virtual('participantNames').get(function() {
    return this.participantData.map(p => p.username).join(' و ');
});

// Indexes لتحسين الأداء
privateChatSchema.index({ chatId: 1 }, { unique: true });
privateChatSchema.index({ participants: 1 });
privateChatSchema.index({ lastMessageAt: -1 });
privateChatSchema.index({ autoDeleteAt: 1 }, { expireAfterSeconds: 0 });

const PrivateChat = mongoose.model('PrivateChat', privateChatSchema);
module.exports = PrivateChat;
