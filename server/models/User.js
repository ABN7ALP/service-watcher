// ملف: server/models/User.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// --- ✅ دالة مساعدة لإنشاء الـ ID ---
// وضعناها في الخارج لتكون قابلة لإعادة الاستخدام ونظيفة
const generateCustomId = async () => {
    let isUnique = false;
    let customId;
    while (!isUnique) {
        customId = Math.floor(100000000 + Math.random() * 900000000).toString();
        // نستخدم mongoose.models.User للوصول إلى النموذج حتى لو لم يتم تصديره بعد
        const existingUser = await mongoose.models.User.findOne({ customId });
        if (!existingUser) {
            isUnique = true;
        }
    }
    return customId;
};


const userSchema = new mongoose.Schema({
    customId: {
        type: String,
        unique: true,
        required: true,
    },
    username: {
        type: String,
        required: [true, 'اسم المستخدم مطلوب'],
        unique: true,
    },
    email: {
        type: String,
        required: [true, 'البريد الإلكتروني مطلوب'],
        unique: true,
    },
    password: {
        type: String,
        required: [true, 'كلمة المرور مطلوبة'],
        minlength: 6,
        select: false,
    },
    gender: {
        type: String,
        enum: ['male', 'female'],
        required: [true, 'الجنس مطلوب'],
    },
    birthDate: {
        type: Date,
        required: [true, 'تاريخ الميلاد مطلوب'],
    },
    socialStatus: {
        type: String,
        enum: ['single', 'in_relationship', 'engaged', 'married', 'divorced', 'searching'],
        default: 'single',
    },
    // ... (باقي الحقول مثل balance, coins, etc.)
}, { timestamps: true });


// --- ✅✅ الحل الصحيح: استخدام pre('validate') ---
// هذا الـ hook يعمل قبل مرحلة التحقق من الصحة
userSchema.pre('validate', async function(next) {
    // قم بإنشاء الـ ID فقط إذا كان المستند جديدًا ولم يتم تعيين ID له بعد
    if (this.isNew && !this.customId) {
        this.customId = await generateCustomId();
    }
    next();
});


// --- hook لتشفير كلمة المرور (يعمل قبل الحفظ) ---
userSchema.pre('save', async function(next) {
    // قم بتشفير كلمة المرور فقط إذا تم تعديلها
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 12);
    }
    next();
});


// --- دوال وخصائص افتراضية أخرى ---
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

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

userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });


// --- تصدير النموذج ---
module.exports = mongoose.model('User', userSchema);
