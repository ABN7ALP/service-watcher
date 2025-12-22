const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'اسم المستخدم مطلوب'],
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 20,
    },
    email: {
        type: String,
        required: [true, 'البريد الإلكتروني مطلوب'],
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: [true, 'كلمة المرور مطلوبة'],
        minlength: 6,
        select: false, // لإخفاء كلمة المرور عند جلب بيانات المستخدم
    },
    profileImage: {
        type: String,
        default: 'https://via.placeholder.com/150',
    },
    balance: { type: Number, default: 0 },
    coins: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    experience: { type: Number, default: 0 },
    isAdmin: { type: Boolean, default: false },
}, { timestamps: true });

// --- Middleware لتشفير كلمة المرور قبل الحفظ ---
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// --- دالة لمقارنة كلمة المرور المدخلة بالكلمة المشفرة ---
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
