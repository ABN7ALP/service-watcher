const jwt = require('jsonwebtoken');
const User = require('../models/User');

// دالة مساعدة لإنشاء توكن JWT
const signToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE,
    });
};

// دالة مساعدة لإرسال التوكن مع الاستجابة
const createSendToken = (user, statusCode, res) => {
    const token = signToken(user._id);

    // إزالة كلمة المرور من المخرجات
    user.password = undefined;

    res.status(statusCode).json({
        status: 'success',
        token,
        data: {
            user,
        },
    });
};

// --- إنشاء حساب جديد ---
// --- استبدل دالة register فقط ---
exports.register = async (req, res, next) => {
    try {
        const { username, email, password, gender, birthDate, socialStatus, educationStatus } = req.body;

        if (!username || !email || !password || !gender || !birthDate) {
            return res.status(400).json({ status: 'fail', message: 'يرجى ملء جميع الحقول الإلزامية.' });
        }

                const newUser = await User.create({
            username,
            email,
            password,
            gender,
            birthDate,
            socialStatus,
            educationStatus
        });

        // ✅ إهداء إطار الترحيب تلقائياً، صالح 3 أيام من لحظة التسجيل مباشرة (مُفعّل فوراً)
        try {
            const ProfileFrame = require('../models/ProfileFrame');
            const welcomeFrame = await ProfileFrame.findOne({ name: 'إطار الترحيب' });
            if (welcomeFrame) {
                const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
                newUser.ownedFrames.push({
                    frame: welcomeFrame._id,
                    purchasedAt: new Date(),
                    durationDays: 3,
                    activatedAt: new Date(),
                    expiresAt: expiresAt
                });
                newUser.activeFrame = welcomeFrame._id;
                newUser.activeFrameClass = welcomeFrame.cssClass;
                newUser.activeFrameExpiresAt = expiresAt;
                newUser.hasReceivedWelcomeFrame = true;
                await newUser.save();
            }
        } catch (frameError) {
            console.error('[WELCOME FRAME ERROR]', frameError);
        }
        
        createSendToken(newUser, 201, res);

    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ status: 'fail', message: 'البريد الإلكتروني أو اسم المستخدم مسجل بالفعل.' });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ status: 'fail', message: Object.values(error.errors).map(e => e.message).join(', ') });
        }
        next(error);
    }
};

// --- تسجيل الدخول ---
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ status: 'fail', message: 'يرجى تقديم البريد الإلكتروني وكلمة المرور' });
        }

        // 1) البحث عن المستخدم وإرجاع كلمة المرور للتحقق
        const user = await User.findOne({ email }).select('+password');

               // 2) التحقق من وجود المستخدم وصحة كلمة المرور
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ status: 'fail', message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }

        // 3) ✅ التحقق من حالة الحظر — بعد التأكد من صحة كلمة المرور فقط
        // (لعدم كشف حالة حظر الحساب لأي شخص لا يملك كلمة المرور الصحيحة)
        if (user.isBanned) {
            if (user.banExpires && new Date(user.banExpires) < new Date()) {
                user.isBanned = false;
                user.banReason = null;
                user.banExpires = null;
                await user.save();
            } else {
                    return res.status(403).json({
                    status: 'fail',
                    code: 'ACCOUNT_BANNED',
                    message: 'تم حظر حسابك.',
                    banReason: user.banReason || 'مخالفة لشروط الاستخدام',
                    banExpires: user.banExpires,
                    isPermanent: !user.banExpires,
                    userId: user._id
                });
            }
        }

                // 3) ✅ وضع الصيانة: يمنع دخول أي مستخدم عادي (المدراء مستثنون دائماً)
        if (!user.isAdmin) {
            const SystemSettings = require('../models/SystemSettings');
            const settings = await SystemSettings.getSettings();
            if (settings.maintenanceMode) {
                return res.status(503).json({
                    status: 'fail',
                    code: 'MAINTENANCE_MODE',
                    message: settings.maintenanceMessage || 'الموقع تحت الصيانة حالياً، عد لاحقاً'
                });
            }
        }

        // 4) إذا كان كل شيء صحيحاً، أرسل التوكن
        createSendToken(user, 200, res);

    } catch (error) {
        next(error);
    }
};
// --- أضف هذه الدالة الجديدة في authController.js ---

exports.updatePassword = async (req, res) => {
    try {
        // 1. جلب المستخدم من قاعدة البيانات
        const user = await User.findById(req.user.id).select('+password');

        // 2. التحقق من أن كلمة المرور الحالية صحيحة
        const { currentPassword, newPassword, newPasswordConfirm } = req.body;
        if (!(await user.comparePassword(currentPassword))) {
            return res.status(401).json({ status: 'fail', message: 'كلمة المرور الحالية غير صحيحة.' });
        }

        // 3. التحقق من أن كلمة المرور الجديدة وتأكيدها متطابقان
        if (newPassword !== newPasswordConfirm) {
            return res.status(400).json({ status: 'fail', message: 'كلمة المرور الجديدة وتأكيدها غير متطابقين.' });
        }

        // 4. تحديث كلمة المرور
        user.password = newPassword;
        await user.save();

        // 5. (اختياري ولكن موصى به) إنشاء توكن جديد وإرساله
        // هذا يضمن أن أي جلسات قديمة تصبح غير صالحة
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '90d'
        });

        res.status(200).json({
            status: 'success',
            token,
            message: 'تم تغيير كلمة المرور بنجاح.'
        });

    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ ما.' });
    }
};
