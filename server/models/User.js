const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const generateCustomId = async () => {
    let isUnique = false;
    let customId;
    while (!isUnique) {
        customId = Math.floor(100000000 + Math.random() * 900000000).toString();
        const existingUser = await mongoose.models.User.findOne({ customId });
        if (!existingUser) isUnique = true;
    }
    return customId;
};

const userSchema = new mongoose.Schema({
    customId: { type: String, unique: true, required: true },
    gender: { type: String, enum: ['male', 'female'], required: true },
    birthDate: { type: Date, required: true },
    socialStatus: { type: String, enum: ['single', 'in_relationship', 'engaged', 'married', 'divorced', 'searching'], default: 'single' },
    educationStatus: { type: String, enum: ['studying', 'graduated', 'primary', 'high_school', 'university'], default: 'studying' },
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    passwordChangedAt: { type: Date, select: false },
    profileImage: { type: String, default: 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg' },
    balance: { type: Number, default: 0 },
    coins: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    experience: { type: Number, default: 0 },
         isAdmin: { type: Boolean, default: false },
         // ✅ كل إطار مملوك له تاريخ شراء + تاريخ تفعيل (يبدأ العد فقط عند التفعيل) + تاريخ انتهاء
    ownedFrames: [{
        frame: { type: mongoose.Schema.Types.ObjectId, ref: 'ProfileFrame' },
        purchasedAt: { type: Date, default: Date.now },
        durationDays: { type: Number, required: true }, // مدة الصلاحية المشتراة (1/3/7)
        activatedAt: { type: Date, default: null }, // null = لم يُفعّل بعد، يبقى صالحاً للأبد بالمخزن
        expiresAt: { type: Date, default: null }, // يُحسب فقط عند التفعيل
        // ✅ "الصندوق" بمتجر الإطارات — يُضبط false عند كل شراء جديد (نقطة حمراء تنبيهية على
        // أيقونة الصندوق)، ويتحوّل true جماعياً لكل الإطارات المملوكة بمجرد فتح الصندوق مرة
        seenInBox: { type: Boolean, default: false }
    }],
    activeFrame: { type: mongoose.Schema.Types.ObjectId, ref: 'ProfileFrame', default: null },
    activeFrameClass: { type: String, default: null },
    activeFrameExpiresAt: { type: Date, default: null },
    hasReceivedWelcomeFrame: { type: Boolean, default: false }, // منع تكرار هدية الترحيب
    // ✅ شارة الأدمن الخاصة — تظهر تلقائياً لكل من isAdmin:true، بخيار إخفائها شخصياً (لا تُلزَم
    // بإظهارها). hasSeenAdminBadgeIntro يمنع تكرار احتفال "حصلت على الشارة" كل جلسة دخول
    adminBadgeVisible: { type: Boolean, default: true },
    hasSeenAdminBadgeIntro: { type: Boolean, default: false },
    // ✅ تخصيص نادي المعجبين — الاسم، ولون كل من شعار المجموعة وهديتها (5 ألوان مغلقة، تُطبَّق
    // بفلتر CSS على نفس صورتي الشعار/الوردة بلا أي صور مرفوعة من المستخدم). منفصل تماماً عن
    // نظام "مستوى المعجب" (server/utils/fanClubLevels.js) — شارة المستوى تعكس ولاء كل عضو على
    // حدة وتُحسب تلقائياً، بينما لون الشعار/الهدية هنا هوية بصرية عامة للنادي يختارها صاحبه
    fanClub: {
        name: { type: String, maxlength: 13, default: null }, // null = يُعرض "نادي {username}" افتراضياً
        emblemColorId: { type: String, enum: ['pink', 'yellow', 'purple', 'blue', 'orange'], default: 'pink' },
        giftColorId: { type: String, enum: ['pink', 'yellow', 'purple', 'blue', 'orange'], default: 'pink' }
    },
    // ✅ مهام "مستوى الدعم" اليومية (للسخاء/giving فقط — التلقي/receiving مبني على أفعال
    // آخرين، لا مهام قابلة للإنجاز منه). bonusXP يُضاف حرفياً فوق كوينز الهدايا الحقيقية عند
    // حساب مستوى الدعم (server/controllers/userController.js computeSupportLevels) — لا يُغيّر
    // رصيد المستخدم الفعلي (coins)، مجرد نقاط ولاء إضافية بنفس فلسفة نقاط نادي المعجبين تماماً
    supportMissions: {
        lastCheckInAt: { type: Date, default: null },
        lastChatBonusAt: { type: Date, default: null },
        bonusXP: { type: Number, default: 0 },
        streakCount: { type: Number, default: 0 } // ✅ تتابع أيام الحضور اليومي — يمنح "إطار المثابر" عند بلوغ 7
    },
    // ✅ حقول جديدة للوحة التحكم
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: null },
    banExpires: { type: Date, default: null },
    adminPermissions: [{ type: String }],
    // ✅ حقول نظام الوكلاء
    isAgent: { type: Boolean, default: false },
    agentWhatsapp: { type: String, default: null },
    isBot: { type: Boolean, default: false }, // ✅ حساب البوت الرسمي للمنصة
    isOnline: { type: Boolean, default: false },
    lastActive: { type: Date, default: Date.now },
    socketId: { type: String, default: null },
    status: { type: String, default: '🚀 جاهز للتحديات!', maxlength: 100 }, 
    ownedBubbleSkins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ChatBubbleSkin' }],
    activeBubbleSkinClass: { type: String, default: null },

    // =====================================================
    // ✅ حقول مركز الملف الشخصي (Profile Hub) — غلاف + بيانات إضافية قابلة للتعديل
    // =====================================================
    coverImage: { type: String, default: null }, // غلاف الملف الشخصي (منفصل عن الصورة الشخصية profileImage)
    // ✅ إخفاء/إظهار المعلومات الشخصية (الجنس/العمر/الحالة الاجتماعية/التعليمية/مسقط الرأس/
    // الموقع/روابط التواصل) أمام زوّار الملف الشخصي — صلاحية تُفتح فقط عند بلوغ مستوى 7
    // بالثروة، تُفحَص بالخادم بكل طلب تغيير (updatePersonalInfoVisibility)
    // لا بالعميل فقط. لا تخفي شيئاً عن صاحبها نفسه — فقط عن الآخرين (راجع getUserById)
    personalInfoVisible: { type: Boolean, default: true },
    // ✅ إخفاء/إظهار شارات "نجم نادي المعجبين الأسبوعي" عن زوّار الملف الشخصي — تحكّم واحد لكل
    // الشارات معاً (طلب صريح: إضافتها لقسم الشارات القابلة للتحكم)، يُفحَص بالخادم بـgetWeeklyWins
    fanClubBadgesVisible: { type: Boolean, default: true },
    hometown: { type: String, default: '', maxlength: 40, trim: true }, // ✅ مسقط الرأس — يحدّده المستخدم يدوياً
    location: { type: String, default: '', maxlength: 40, trim: true }, // ✅ الموقع الحالي — يُحدَّد تلقائياً (تخمين تقريبي من المنطقة الزمنية بالمتصفح، بلا أي طلب صلاحية GPS)
    socialLinks: {
        instagram: { type: String, default: '', maxlength: 60, trim: true },
        youtube: { type: String, default: '', maxlength: 60, trim: true },
        tiktok: { type: String, default: '', maxlength: 60, trim: true }
    },
    // ✅ إدخالات تعليم متعددة (زر "+") — اسم مؤسسة تعليمية + فترة نصية حرة (مثلاً "2018 - 2022")
    education: [{
        institution: { type: String, required: true, maxlength: 80, trim: true },
        period: { type: String, default: '', maxlength: 30, trim: true }
    }],
    job: {
        title: { type: String, default: '', maxlength: 50, trim: true },
        company: { type: String, default: '', maxlength: 50, trim: true },
        from: { type: String, default: '', maxlength: 20, trim: true },
        to: { type: String, default: '', maxlength: 20, trim: true }
    },
    // ✅ تحكّم المستخدم بإظهار/إخفاء خصائص معيّنة أمام زوّار ملفه الشخصي
    showVipBadge: { type: Boolean, default: true },
    showWallet: { type: Boolean, default: true },
    // ✅ متابعة أحادية الاتجاه بين الأشخاص (منفصلة تماماً عن نظام الصداقة friends أعلاه،
    // ومنفصلة عن متابعة الغرف بـVoiceRoom.followers) — يُبنى عليها عدّاد "متابعين/متابَعين"
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // --- ✅ الحقول الجديدة لنظام الصداقة ---
    friends: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    friendRequestsSent: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    friendRequestsReceived: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    // --- ✅ الحقول الجديدة لنظام الحظر ---
    blockedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    blockedBy: [{
       type: mongoose.Schema.Types.ObjectId,
       ref: 'User'
    }],
    // --- نهاية الحقول الجديدة --

}, { timestamps: true });

userSchema.pre('validate', async function(next) {
    if (this.isNew && !this.customId) {
        this.customId = await generateCustomId();
    }
    next();
});

userSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 12);
    }
    next();
});
// ✅ تسجيل لحظة تغيير كلمة المرور (نطرح ثانية لضمان أن التوكن الجديد يُصدر بعدها دائماً،
// تفادياً لفارق التوقيت البسيط بين الحفظ في القاعدة وإصدار التوكن)
userSchema.pre('save', function(next) {
    if (!this.isModified('password') || this.isNew) return next();
    this.passwordChangedAt = Date.now() - 1000;
    next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
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

// ✅ هل تغيّرت كلمة المرور بعد إصدار هذا التوكن؟
userSchema.methods.changedPasswordAfter = function(jwtIat) {
    if (!this.passwordChangedAt) return false;
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return jwtIat < changedTimestamp;
};

// ✅ شبكة أمان مالية: تطبيع كل الحقول المالية قبل أي حفظ
// يمنع تسرّب قيم مثل 57.999999999998 إلى قاعدة البيانات أو واجهة المستخدم
userSchema.pre('save', function(next) {
    const { toMoney } = require('../utils/money');
    if (this.isModified('balance')) {
        this.balance = toMoney(this.balance);
    }
    if (this.isModified('coins')) {
        // الكوينز أعداد صحيحة — نمنع أي كسور نهائياً
        this.coins = Math.max(0, Math.floor(Number(this.coins) || 0));
    }
    next();
});

userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const User = mongoose.model('User', userSchema);
module.exports = User;


