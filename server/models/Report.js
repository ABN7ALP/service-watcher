const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reportedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['user', 'message', 'content', 'payment', 'other'],
        required: true,
        default: 'user'
    },
    reason: {
        type: String,
        required: true,
        enum: [
            'harassment',
            'spam',
            'inappropriate_content',
            'fraud',
            'fake_account',
            'payment_issue',
            'cheating',
            'other'
        ]
    },
    details: {
        type: String,
        required: true
    },
    // For message reports
    messageId: {
        type: mongoose.Schema.Types.ObjectId
    },
    roomId: String,
    messageContent: String,
    messageType: String,
    
    // For content reports
    contentUrl: String,
    contentType: String,
    
    // For payment reports
    transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction'
    },
    
    evidence: [{
        type: String, // URLs to evidence images/screenshots
    }],
    
    status: {
        type: String,
        enum: ['pending', 'under_review', 'resolved', 'dismissed', 'escalated'],
        default: 'pending'
    },
    
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // Admin assigned to handle report
    },
    
    adminNotes: String,
    
    resolution: {
        action: {
            type: String,
            enum: ['warning', 'mute', 'ban', 'content_removal', 'refund', 'no_action', 'other']
        },
        duration: Number, // For temporary bans/mutes
        notes: String,
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        resolvedAt: Date
    },
    
    // Automated flags
    isDuplicate: {
        type: Boolean,
        default: false
    },
    
    duplicateOf: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Report'
    },
    
    // Statistics
    viewCount: {
        type: Number,
        default: 0
    },
    
    updatedBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        action: String,
        timestamp: Date
    }]
}, {
    timestamps: true
});

// Indexes for faster queries
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ reportedUser: 1, createdAt: -1 });
reportSchema.index({ status: 1, priority: -1, createdAt: -1 });
reportSchema.index({ assignedTo: 1, status: 1 });
reportSchema.index({ type: 1, reason: 1 });

// Pre-save hook to set priority based on type and reason
reportSchema.pre('save', function(next) {
    if (this.reason === 'fraud' || this.reason === 'cheating') {
        this.priority = 'high';
    } else if (this.reason === 'harassment' || this.reason === 'inappropriate_content') {
        this.priority = 'medium';
    } else {
        this.priority = 'low';
    }
    
    if (this.type === 'payment') {
        this.priority = 'high';
    }
    
    next();
});

// Method to get readable reason
reportSchema.methods.getReasonText = function() {
    const reasons = {
        'harassment': 'تحرش',
        'spam': 'رسائل مزعجة',
        'inappropriate_content': 'محتوى غير لائق',
        'fraud': 'احتيال',
        'fake_account': 'حساب مزيف',
        'payment_issue': 'مشكلة في الدفع',
        'cheating': 'غش',
        'other': 'أخرى'
    };
    return reasons[this.reason] || this.reason;
};

// Method to get readable type
reportSchema.methods.getTypeText = function() {
    const types = {
        'user': 'مستخدم',
        'message': 'رسالة',
        'content': 'محتوى',
        'payment': 'دفع',
        'other': 'أخرى'
    };
    return types[this.type] || this.type;
};

// Method to get readable status
reportSchema.methods.getStatusText = function() {
    const statuses = {
        'pending': 'قيد الانتظار',
        'under_review': 'قيد المراجعة',
        'resolved': 'تم الحل',
        'dismissed': 'مرفوض',
        'escalated': 'مرفوع'
    };
    return statuses[this.status] || this.status;
};

// Method to get readable resolution action
reportSchema.methods.getResolutionActionText = function() {
    const actions = {
        'warning': 'تحذير',
        'mute': 'كتم',
        'ban': 'حظر',
        'content_removal': 'إزالة محتوى',
        'refund': 'استرداد',
        'no_action': 'لا إجراء',
        'other': 'أخرى'
    };
    return actions[this.resolution?.action] || this.resolution?.action || 'لا يوجد';
};

// Static method to check for duplicate reports
reportSchema.statics.checkDuplicate = async function(reportData) {
    const { reporter, reportedUser, type, reason, messageId } = reportData;
    
    const query = {
        reporter,
        reportedUser,
        type,
        reason,
        status: { $in: ['pending', 'under_review'] },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    };
    
    if (messageId) {
        query.messageId = messageId;
    }
    
    const duplicate = await this.findOne(query);
    return duplicate;
};

// Static method to get report statistics
reportSchema.statics.getStatistics = async function(timeframe = '7d') {
    let startDate;
    const now = new Date();
    
    switch (timeframe) {
        case '24h':
            startDate = new Date(now - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
            startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    }
    
    const stats = await this.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: {
                    status: '$status',
                    reason: '$reason',
                    type: '$type'
                },
                count: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: '$_id.status',
                byReason: {
                    $push: {
                        reason: '$_id.reason',
                        count: '$count'
                    }
                },
                byType: {
                    $push: {
                        type: '$_id.type',
                        count: '$count'
                    }
                },
                total: { $sum: '$count' }
            }
        },
        {
            $project: {
                status: '$_id',
                byReason: 1,
                byType: 1,
                total: 1
            }
        }
    ]);
    
    return stats;
};

const Report = mongoose.model('Report', reportSchema);
module.exports = Report;
