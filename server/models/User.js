const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        index: true,
        maxlength: 30
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    phone: {
        type: String,
        trim: true
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    totalDeposits: {
        type: Number,
        default: 0
    },
    totalWithdrawals: {
        type: Number,
        default: 0
    },
    totalWins: {
        type: Number,
        default: 0
    },
    shamCashId: {
        type: String
    },
    role: { // <-- إضافة جديدة
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    playerBehavioralState: {
    type: String,
    enum: ['new', 'active', 'near_withdrawal', 'whale'],
    default: 'new'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// تشفير كلمة المرور قبل الحفظ
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// مقارنة كلمة المرور
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// تحديث الرصيد
userSchema.methods.updateBalance = async function(amount, type) {
    if (type === 'deposit' || type === 'win') {
        this.balance += amount;
        if (type === 'deposit') this.totalDeposits += amount;
        if (type === 'win') this.totalWins += amount;
    } else if (type === 'withdraw' || type === 'spin') {
        if (this.balance < amount) {
            throw new Error('رصيد غير كافٍ');
        }
        this.balance -= amount;
        if (type === 'withdraw') this.totalWithdrawals += amount;
    }
    
    await this.save();
};

module.exports = mongoose.model('User', userSchema);
