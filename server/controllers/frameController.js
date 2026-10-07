const ProfileFrame = require('../models/ProfileFrame');
const User = require('../models/User');
const { broadcastUserFrameChange } = require('../services/socketService');

// ✅ طلب صريح: مدد شراء قصيرة فقط (1/3/7 أيام) بدل المدد الطويلة السابقة (7/30/365 يوماً)
const DURATION_DAYS_MAP = { '1': 'day1', '3': 'day3', '7': 'day7' };

exports.getFrameShop = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('ownedFrames activeFrame activeFrameClass coins activeFrameExpiresAt isAdmin');

        // ✅ إزالة أي إطار مفعّل انتهت صلاحيته تلقائياً عند كل فتح للمتجر (فحص فوري)
        await checkAndExpireActiveFrame(user, req.io);

        const ownedMap = {};
        user.ownedFrames.forEach(o => { ownedMap[o.frame.toString()] = o; });

        // ✅ القائمة = كتالوج المتجر (isActive:true، شراء متاح للجميع) + أي إطار يملكه المستخدم
        // فعلاً حتى لو isActive:false (مثل "إطار المساهم" المكتسب حصراً بالفوز الأسبوعي —
        // غير مباع إطلاقاً، purchaseFrame يرفضه صراحة عبر فحص frame.isActive المنفصل هناك،
        // فإدراجه هنا للمالك فقط لا يفتح أي ثغرة شراء). بدون هذا كان المستخدم يفوز بالإطار
        // لكن لا يراه أبداً بقائمته ليُعيد تفعيله بعد تبديله لإطار آخر — طلب صريح. + إطار
        // الأدمن (adminOnly) يُدرَج فقط لو كان هذا المستخدم أدمن فعلاً حالياً (غير مرتبط بأي
        // ownedFrames — ownership "ضمنية" بحكم isAdmin نفسها، تُزال تلقائياً لو فُقدت الصلاحية)
        const ownedFrameIds = Object.keys(ownedMap);
        const query = { $or: [{ isActive: true }, { _id: { $in: ownedFrameIds } }] };
        if (user.isAdmin) query.$or.push({ adminOnly: true });
        const frames = await ProfileFrame.find(query).sort('sortOrder');

        // ✅ "الصندوق" — إشارة نقطة حمراء لو يوجد أي إطار مملوك لم يُفتَح الصندوق منذ شرائه
        // (seenInBox:false)؛ إطار الأدمن الضمني (لا سجل ownedFrames حقيقي له) لا يُحسب هنا أبداً
        const hasUnseenBox = user.ownedFrames.some(o => !o.seenInBox);

        res.status(200).json({
            status: 'success',
            data: {
                frames: frames.map(f => ({
                    _id: f._id,
                    name: f.name,
                    cssClass: f.cssClass,
                    prices: f.prices,
                    adminOnly: f.adminOnly,
                    // ✅ إطار الأدمن: "مملوك" ضمنياً لأي أدمن حالي بلا حاجة لسجل ownedFrames فعلي
                    // (activatedAt:null يجعل الواجهة تعرض "بحوزتك" بدل تاريخ انتهاء غير موجود أصلاً)
                    ownedInstance: ownedMap[f._id.toString()] || (f.adminOnly && user.isAdmin ? { activatedAt: null, expiresAt: null } : null)
                })),
                activeFrame: user.activeFrame,
                activeFrameExpiresAt: user.activeFrameExpiresAt,
                coins: user.coins,
                hasUnseenBox
            }
        });
    } catch (error) {
        console.error('[ERROR] in getFrameShop:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.purchaseFrame = async (req, res) => {
    try {
        const userId = req.user.id;
        const { frameId, duration } = req.body; // duration: '1' | '3' | '7'

        const durationKey = DURATION_DAYS_MAP[duration];
        if (!durationKey) {
            return res.status(400).json({ status: 'fail', message: 'مدة غير صالحة' });
        }

        const [user, frame] = await Promise.all([User.findById(userId), ProfileFrame.findById(frameId)]);
        if (!frame || !frame.isActive) {
            return res.status(404).json({ status: 'fail', message: 'الإطار غير متوفر' });
        }

        const price = frame.prices[durationKey];
        if (user.coins < price) {
            return res.status(400).json({ status: 'fail', message: 'رصيد الكوينز غير كافٍ' });
        }

        const newDurationDays = parseInt(duration);
        // ✅ طلب صريح: الإطار يبقى متاحاً للشراء دائماً حتى لو كان مملوكاً فعلاً — الشراء المتكرر
        // لا يُرفض بعد الآن، بل تُضاف المدة الجديدة فوق المدة المتبقية الحالية (تكديس/تمديد)
        // بدل رفضه بخطأ "تمتلكه بالفعل"
        const existing = user.ownedFrames.find(o => o.frame.toString() === frameId.toString());
        user.coins -= price;
        if (!existing) {
            // ✅ الشراء وحده لا يبدأ عد الصلاحية — activatedAt و expiresAt يبقيان null لحين التفعيل الفعلي
            user.ownedFrames.push({
                frame: frame._id,
                purchasedAt: new Date(),
                durationDays: newDurationDays,
                activatedAt: null,
                expiresAt: null,
                seenInBox: false
            });
        } else if (!existing.activatedAt) {
            // لم يُفعَّل بعد — نضيف المدة الجديدة فوق المدة بانتظار التفعيل، بلا بدء عدّ حتى الآن
            existing.durationDays += newDurationDays;
            existing.seenInBox = false;
        } else if (existing.expiresAt && existing.expiresAt < new Date()) {
            // انتهت صلاحيته فعلاً — إعادة الشراء تعني بدايةً جديدة بانتظار تفعيل جديد (لا تكديس
            // فوق وقت منتهٍ أصلاً، لا معنى له)
            existing.durationDays = newDurationDays;
            existing.activatedAt = null;
            existing.expiresAt = null;
            existing.seenInBox = false;
        } else {
            // مُفعَّل حالياً وما زال سارياً — تمديد تاريخ الانتهاء الحالي بالمدة الجديدة مباشرة
            existing.durationDays += newDurationDays;
            existing.expiresAt = new Date(existing.expiresAt.getTime() + newDurationDays * 24 * 60 * 60 * 1000);
            existing.seenInBox = false;
        }
        await user.save();

        res.status(200).json({
            status: 'success',
            message: existing
                ? `تم شراء ${frame.name} بنجاح — أُضيفت ${duration} يوم إلى المدة المتبقية بالصندوق`
                : `تم شراء ${frame.name} بنجاح (صالح ${duration} يوم من لحظة التفعيل) — فعّله من الصندوق`,
            data: { newCoins: user.coins }
        });
    } catch (error) {
        console.error('[ERROR] in purchaseFrame:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ✅ فتح "الصندوق" — يُطفئ النقطة الحمراء جماعياً (كل الإطارات المملوكة تصبح seenInBox:true)،
// بصرف النظر عن كونها مفعّلة/منتهية/بانتظار التفعيل؛ شراء جديد لاحقاً يعيد تفعيل النقطة فقط
// لذاك الإطار الجديد (كل عنصر مصفوفة منفصل تماماً، لا حقل عام واحد)
exports.markFrameBoxSeen = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('ownedFrames');
        user.ownedFrames.forEach(o => { o.seenInBox = true; });
        await user.save();
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('[ERROR] in markFrameBoxSeen:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.setActiveFrame = async (req, res) => {
    try {
        const userId = req.user.id;
        const { frameId } = req.body;

        const user = await User.findById(userId);

        if (!frameId) {
            user.activeFrame = null;
            user.activeFrameClass = null;
            user.activeFrameExpiresAt = null;
            await user.save();
            broadcastUserFrameChange(req.io, userId, null);
            return res.status(200).json({ status: 'success', message: 'تمت إزالة الإطار', data: { activeFrameClass: null } });
        }

        const frame = await ProfileFrame.findById(frameId);
        if (!frame) return res.status(404).json({ status: 'fail', message: 'الإطار غير موجود' });

        // ✅ إطار الأدمن: يتجاوز نظام ownedFrames/الصلاحية بالكامل — الفحص الوحيد هو isAdmin
        // نفسها الآن (لا شراء، لا مدة صلاحية؛ "ملكيته" ضمنية طالما بقي أدمن). لا أحد غيره
        // يقدر يصل لهذا الفرع إطلاقاً (adminOnly لا تظهر بقائمته أصلاً لو لم يكن أدمن)
        if (frame.adminOnly) {
            if (!user.isAdmin) {
                return res.status(403).json({ status: 'fail', message: 'هذا الإطار خاص بالأدمن فقط' });
            }
            user.activeFrame = frame._id;
            user.activeFrameClass = frame.cssClass;
            user.activeFrameExpiresAt = null;
            await user.save();
            broadcastUserFrameChange(req.io, userId, frame.cssClass);
            return res.status(200).json({
                status: 'success',
                message: `تم تفعيل ${frame.name}`,
                data: { activeFrameClass: frame.cssClass, expiresAt: null }
            });
        }

        const ownedInstance = user.ownedFrames.find(o => o.frame.toString() === frameId.toString());
        if (!ownedInstance) {
            return res.status(403).json({ status: 'fail', message: 'يجب شراء هذا الإطار أولاً' });
        }

        // ✅ القاعدة الدقيقة المطلوبة:
        // - إذا كان هذا الإطار مُفعّلاً من قبل (له activatedAt سابق) → لا نعيد ضبط المدة، نكمل حيث توقفت
        // - إذا لم يُفعّل أبداً من قبل (activatedAt = null) → الآن فقط يبدأ عد الصلاحية من لحظة هذا التفعيل
        if (!ownedInstance.activatedAt) {
            ownedInstance.activatedAt = new Date();
            ownedInstance.expiresAt = new Date(Date.now() + ownedInstance.durationDays * 24 * 60 * 60 * 1000);
        }

        // ✅ إذا انتهت صلاحيته أصلاً (نادراً، لكن للحماية) نمنع التفعيل ونطلب شراء جديد
        if (ownedInstance.expiresAt && ownedInstance.expiresAt < new Date()) {
            return res.status(400).json({ status: 'fail', message: 'انتهت صلاحية هذا الإطار، يرجى شراء إطار جديد' });
        }

        user.activeFrame = frame._id;
        user.activeFrameClass = frame.cssClass;
        user.activeFrameExpiresAt = ownedInstance.expiresAt;
        await user.save();
        broadcastUserFrameChange(req.io, userId, frame.cssClass);

        res.status(200).json({
            status: 'success',
            message: `تم تفعيل ${frame.name}`,
            data: { activeFrameClass: frame.cssClass, expiresAt: ownedInstance.expiresAt }
        });
    } catch (error) {
        console.error('[ERROR] in setActiveFrame:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ✅ دالة مساعدة: تُزيل الإطار المفعّل تلقائياً من كل مكان إذا انتهت صلاحيته — أو إذا كان إطار
// الأدمن الخاص (activeFrameExpiresAt يبقى null له دائماً فلن تُدركه الصلاحية العادية أبداً)
// وفُقدت صلاحية isAdmin لاحقاً (تعديل مباشر بقاعدة البيانات) — بلا هذا الفحص الإضافي يبقى
// إطار الأدمن ظاهراً للأبد على من فُقد منه isAdmin، بعكس كل الإطارات الأخرى المحكومة بمدة فعلية
async function checkAndExpireActiveFrame(user, io = null) {
    const expiredByTime = user.activeFrameExpiresAt && user.activeFrameExpiresAt < new Date();
    const revokedAdminFrame = user.activeFrameClass === 'profile-frame-admin' && !user.isAdmin;
    if (expiredByTime || revokedAdminFrame) {
        user.activeFrame = null;
        user.activeFrameClass = null;
        user.activeFrameExpiresAt = null;
        await user.save();
        console.log(`[FRAME EXPIRE] Frame auto-removed for user ${user._id}`);
        if (io) broadcastUserFrameChange(io, user._id, null);
    }
}

exports.checkAndExpireActiveFrame = checkAndExpireActiveFrame;
