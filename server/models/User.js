const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// --- استبدل userSchema بالكامل ---
const userSchema = new mongoose.Schema({
    customId: { // ✅ ID مخصص جديد
        type: String,
        unique: true,
        required: true,
    },
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
        select: false,
    },
    profileImage: {
        type: String,
        default: 'https://res.cloudinary.com/demo/image/upload/w_100,h_100,c_thumb,g_face,r_max/face_left.png', // صورة افتراضية أفضل
    },
    gender: { // ✅ حقل الجنس
        type: String,
        enum: ['male', 'female'],
        required: [true, 'الجنس مطلوب'],
    },
    birthDate: { // ✅ حقل تاريخ الميلاد
        type: Date,
        required: [true, 'تاريخ الميلاد مطلوب'],
    },
    socialStatus: { // ✅ حقل الحالة الاجتماعية
        type: String,
        enum: ['single', 'in_relationship', 'engaged', 'married', 'divorced', 'searching'],
        default: 'single',
    },
    balance: { type: Number, default: 0 },
    coins: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    experience: { type: Number, default: 0 },
    isAdmin: { type: Boolean, default: false },
    socketId: { type: String },
    passwordChangedAt: { type: Date },
}, { timestamps: true });

// --- Middleware لتشفير كلمة المرور وإنشاء ID مخصص ---
userSchema.pre('save', async function(next) {
    // تشفير كلمة المرور فقط إذا تم تعديلها
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 12);
    }

    // ✅ إنشاء ID مخصص فقط عند إنشاء مستخدم جديد
    if (this.isNew) {
        let isUnique = false;
        let customId;
        while (!isUnique) {
            // إنشاء رقم عشوائي من 9 أرقام
            customId = Math.floor(100000000 + Math.random() * 900000000).toString();
            const existingUser = await mongoose.model('User').findOne({ customId });
            if (!existingUser) {
                isUnique = true;
            }
        }
        this.customId = customId;
    }
    
    next();
});

// --- دالة لحساب العمر (خاصية افتراضية) ---
userSchema.virtual('age').get(function() {
    if (!this.birthDate) return null;
    const today = new Date();
    const birthDate = new Date(this.birthDate);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
});

// --- تأكد من تضمين الخصائص الافتراضية عند تحويل الكائن إلى JSON ---
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

// --- مقارنة كلمة المرور ---
userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
