const mongoose = require('mongoose');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ProfileFrame = require('../models/ProfileFrame');
const User = require('../models/User');
const AdminLog = require('../models/AdminLog');
const { broadcastUserFrameChange } = require('../services/socketService');
const { uploadFrameAsset, assertRealType } = require('../utils/cloudinary');
const { normalizeOne } = require('../../scripts/normalize-frames');
const { checkFrameFile } = require('../../scripts/check-frames');

// ✅ طلب صريح: مدد شراء قصيرة فقط (1/3/7 أيام) بدل المدد الطويلة السابقة (7/30/365 يوماً)
const DURATION_DAYS_MAP = { '1': 'day1', '3': 'day3', '7': 'day7' };

// ✅ نفس القيم الافتراضية بالضبط المضبوطة بمخطط ProfileFrame.display (راجع ProfileFrame.js) —
// مُكرَّرة هنا فقط كاحتياط صريح لحساب body استجابة getFrameDisplayConfig، لا كمصدر حقيقة ثانٍ
const DEFAULT_DISPLAY = { frameScale: 1.45, avatarScale: 0.8, offsetX: 0, offsetY: 0, crownTop: 0.45 };
const NO_FRAME_CROWN_TOP = 0.62; // ✅ مطابق لـ_noFrame.crownTop بـframe-display.json سابقاً
const DISPLAY_FIELDS = ['frameScale', 'avatarScale', 'offsetX', 'offsetY', 'crownTop'];
// ✅ طلب صريح: حدود واضحة لكل قيمة عرض — نفس المدى تماماً المستخدَم بمنزلقات الاستوديو
// (public/admin/admin.js) كي لا يتمكّن أي طلب مباشر (بتجاوز الواجهة) من دفع قيمة تكسر الرسم
const DISPLAY_BOUNDS = {
    frameScale: { min: 0.8, max: 2.4, label: 'مقاس الإطار' },
    avatarScale: { min: 0.4, max: 1, label: 'مقاس الصورة' },
    offsetX: { min: -0.3, max: 0.3, label: 'إزاحة X' },
    offsetY: { min: -0.3, max: 0.3, label: 'إزاحة Y' },
    crownTop: { min: 0.2, max: 1, label: 'ارتفاع التاج' }
};
const PRICE_MAX = 10000000; // ✅ طلب صريح: سقف أرقام صحيحة واقعي، يمنع أخطاء كتابة تتحوّل لأسعار عبثية

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
        const { frameId, duration, autoRenew } = req.body; // duration: '1' | '3' | '7'

        const durationKey = DURATION_DAYS_MAP[duration];
        if (!durationKey) {
            return res.status(400).json({ status: 'fail', message: 'مدة غير صالحة' });
        }

        const frame = await ProfileFrame.findById(frameId);
        if (!frame || !frame.isActive) {
            return res.status(404).json({ status: 'fail', message: 'الإطار غير متوفر' });
        }

        const price = frame.prices[durationKey];
        const newDurationDays = parseInt(duration);
        // ✅ طلب صريح: خيار "تجديد تلقائي" أصبح متاحاً بنافذة المعاينة قبل الشراء مباشرة (لا فقط
        // لمن يملك الإطار أصلاً) — يُحفَظ كتفضيل هنا لحظة الشراء نفسها بدل انتظار جولة تفعيل/
        // تبديل منفصلة لاحقاً بالصندوق
        const wantsAutoRenew = typeof autoRenew === 'boolean' ? autoRenew : undefined;

        // 🛡️ إصلاح جذري (مراجعة أمنية — redteam-audit-1، البند #2): كان فحص الرصيد وتحديث
        // ownedFrames (مصفوفة فرعية مُتفرِّعة لـ4 حالات) كله على مستند user بالذاكرة مقروء
        // مسبقاً بلا أي معاملة — إثبات مباشر: 5 طلبات شراء متزامنة بنفس المستخدم أنتجت 5 إطارات
        // مملوكة بخصم مرة واحدة فقط (Mongoose .push() على مصفوفة تُترجَم لـ$push ذرّي فعلي عند
        // .save() حتى لو بقي الخصم نفسه غير ذرّي محسوباً من قراءة قديمة مكرَّرة بالتوازي).
        // المعاملة هنا تقرأ المستخدم من جديد ضمن جلستها (لا القراءة السابقة قبل أي خصم) — أي
        // تضارب كتابة حقيقي بين معاملتين متزامنتين تعدِّلان نفس المستند يُكتشَف ذاتياً بمستوى
        // محرّك قاعدة البيانات، وwithTransaction تُعيد المحاولة تلقائياً عند هذا التضارب تحديداً
        const session = await mongoose.startSession();
        let txError = null;
        let finalCoins = null;
        let hadExisting = false;
        try {
            await session.withTransaction(async () => {
                const user = await User.findById(userId).session(session);
                if (!user) {
                    throw Object.assign(new Error('يرجى تسجيل الدخول من جديد'), { code: 'USER_NOT_FOUND' });
                }
                if (user.coins < price) {
                    throw Object.assign(new Error('رصيد الكوينز غير كافٍ'), { code: 'INSUFFICIENT' });
                }

                // ✅ طلب صريح: الإطار يبقى متاحاً للشراء دائماً حتى لو كان مملوكاً فعلاً — الشراء
                // المتكرر لا يُرفض بعد الآن، بل تُضاف المدة الجديدة فوق المدة المتبقية الحالية
                // (تكديس/تمديد) بدل رفضه بخطأ "تمتلكه بالفعل"
                const existing = user.ownedFrames.find(o => o.frame.toString() === frameId.toString());
                hadExisting = !!existing;
                user.coins -= price;
                if (!existing) {
                    // ✅ الشراء وحده لا يبدأ عد الصلاحية — activatedAt وexpiresAt يبقيان null لحين التفعيل الفعلي
                    user.ownedFrames.push({
                        frame: frame._id,
                        purchasedAt: new Date(),
                        durationDays: newDurationDays,
                        activatedAt: null,
                        expiresAt: null,
                        seenInBox: false,
                        autoRenew: !!wantsAutoRenew
                    });
                } else if (!existing.activatedAt) {
                    // لم يُفعَّل بعد — نضيف المدة الجديدة فوق المدة بانتظار التفعيل، بلا بدء عدّ حتى الآن
                    existing.durationDays += newDurationDays;
                    existing.seenInBox = false;
                    if (wantsAutoRenew !== undefined) existing.autoRenew = wantsAutoRenew;
                } else if (existing.expiresAt && existing.expiresAt < new Date()) {
                    // انتهت صلاحيته فعلاً — إعادة الشراء تعني بدايةً جديدة بانتظار تفعيل جديد (لا تكديس
                    // فوق وقت منتهٍ أصلاً، لا معنى له)
                    existing.durationDays = newDurationDays;
                    existing.activatedAt = null;
                    existing.expiresAt = null;
                    existing.seenInBox = false;
                    if (wantsAutoRenew !== undefined) existing.autoRenew = wantsAutoRenew;
                } else {
                    // مُفعَّل حالياً وما زال سارياً — تمديد تاريخ الانتهاء الحالي بالمدة الجديدة مباشرة
                    existing.durationDays += newDurationDays;
                    existing.expiresAt = new Date(existing.expiresAt.getTime() + newDurationDays * 24 * 60 * 60 * 1000);
                    existing.seenInBox = false;
                    if (wantsAutoRenew !== undefined) existing.autoRenew = wantsAutoRenew;
                }
                await user.save({ session });
                finalCoins = user.coins;
            });
        } catch (e) {
            txError = e;
        } finally {
            await session.endSession();
        }

        if (txError) {
            if (txError.code === 'USER_NOT_FOUND') {
                return res.status(401).json({ status: 'fail', message: txError.message });
            }
            if (txError.code === 'INSUFFICIENT') {
                return res.status(400).json({ status: 'fail', message: txError.message });
            }
            throw txError;
        }

        res.status(200).json({
            status: 'success',
            message: hadExisting
                ? `تم شراء ${frame.name} بنجاح — أُضيفت ${duration} يوم إلى المدة المتبقية بالصندوق`
                : `تم شراء ${frame.name} بنجاح (صالح ${duration} يوم من لحظة التفعيل) — فعّله من الصندوق`,
            data: { newCoins: finalCoins }
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

// ✅ طلب صريح: تفعيل/إلغاء "التجديد التلقائي" لإطار مملوك محدَّد — عند انتهاء صلاحيته لاحقاً
// (راجع checkAndExpireActiveFrame أدناه) يُفحص رصيد المستخدم لحظتها: كافٍ → يُخصم وتُمدَّد
// الصلاحية بنفس المدة تلقائياً بلا أي تدخل؛ غير كافٍ → يُحذف الإطار كلياً (لا تجديد جزئي)
exports.setFrameAutoRenew = async (req, res) => {
    try {
        const { frameId, autoRenew } = req.body;
        const user = await User.findById(req.user.id).select('ownedFrames');
        const entry = user.ownedFrames.find(o => o.frame.toString() === String(frameId));
        if (!entry) return res.status(404).json({ status: 'fail', message: 'لا تملك هذا الإطار' });
        entry.autoRenew = !!autoRenew;
        await user.save();
        res.status(200).json({ status: 'success', data: { autoRenew: entry.autoRenew } });
    } catch (error) {
        console.error('[ERROR] in setFrameAutoRenew:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ✅ دالة مساعدة جوهرية — تُستدعى عند كل فتح للمتجر/تحديث لبيانات المستخدم، وأيضاً دورياً عبر
// server/utils/frameExpiryJob.js (لضمان الإزالة الفورية من كل مكان حتى لو لم يفتح صاحب الإطار
// شيئاً بنفسه، بما أن مشاهديه بالغرفة/قوائم المتابعين يرونه أيضاً). تفحص:
// 1) إطار الأدمن المسحوبة صلاحيته (كما كانت الدالة سابقاً)
// 2) كل إطار مملوك انتهت صلاحيته (لا فقط المفعَّل حالياً — إطار آخر بالصندوق قد ينتهي بصمت
//    أيضاً): لو autoRenew مفعّل ورصيده يكفي سعر نفس المدة → تجديد تلقائي كامل (خصم + تمديد)،
//    وإلا حذف الإطار نهائياً من ownedFrames (طلب صريح: لا يبقى "منتهياً" ظاهراً للأبد بالصندوق)
const DURATION_KEY_BY_DAYS = { 1: 'day1', 3: 'day3', 7: 'day7' };
async function checkAndExpireActiveFrame(user, io = null) {
    const now = new Date();
    let changed = false;
    let activeFrameRemoved = false;
    let activeFrameRenewed = false;

    const revokedAdminFrame = user.activeFrameClass === 'profile-frame-admin' && !user.isAdmin;
    if (revokedAdminFrame) {
        changed = true;
        activeFrameRemoved = true;
    }

    const expiredEntries = user.ownedFrames.filter(o => o.activatedAt && o.expiresAt && o.expiresAt < now);
    if (expiredEntries.length) {
        const frames = await ProfileFrame.find({ _id: { $in: expiredEntries.map(o => o.frame) } }).select('prices');
        const frameById = new Map(frames.map(f => [f._id.toString(), f]));
        const removeFrameIds = [];
        for (const entry of expiredEntries) {
            const frame = frameById.get(entry.frame.toString());
            const durationKey = DURATION_KEY_BY_DAYS[entry.durationDays];
            const price = frame && durationKey ? frame.prices[durationKey] : null;
            const isActive = user.activeFrame && user.activeFrame.toString() === entry.frame.toString();
            if (entry.autoRenew && price != null && user.coins >= price) {
                user.coins -= price;
                entry.expiresAt = new Date(entry.expiresAt.getTime() + entry.durationDays * 24 * 60 * 60 * 1000);
                entry.seenInBox = false; // ✅ تجديد = "جديد" بالصندوق مجدداً، نفس إشارة الشراء
                changed = true;
                if (isActive) {
                    user.activeFrameExpiresAt = entry.expiresAt;
                    activeFrameRenewed = true;
                }
            } else {
                removeFrameIds.push(entry.frame.toString());
                changed = true;
                if (isActive) activeFrameRemoved = true;
            }
        }
        if (removeFrameIds.length) {
            user.ownedFrames = user.ownedFrames.filter(o => !removeFrameIds.includes(o.frame.toString()));
        }
    }

    if (activeFrameRemoved) {
        user.activeFrame = null;
        user.activeFrameClass = null;
        user.activeFrameExpiresAt = null;
    }

    if (changed) {
        await user.save();
        console.log(`[FRAME EXPIRE] Processed expired frame(s) for user ${user._id}`);
        if (io) {
            if (activeFrameRemoved) broadcastUserFrameChange(io, user._id, null);
            else if (activeFrameRenewed) broadcastUserFrameChange(io, user._id, user.activeFrameClass);
        }
    }
    return { changed, activeFrameRemoved, activeFrameRenewed };
}

exports.checkAndExpireActiveFrame = checkAndExpireActiveFrame;

// =====================================================
// ✅ استوديو الإطارات بلوحة التحكم — الأدمن يضيف/يضبط الإطارات بلا أي تعديل كود
// =====================================================

// ✅ GET /api/frames/display — عام بلا أي مصادقة (مُثبَّت قبل authMiddleware بـframeRoutes.js
// صراحةً)، مُخزَّن بـETag (نفس نمط getGiftShop بالضبط). يستبدل frame-display.json الثابت +
// FRAME_ASSET_URLS المُضمَّنة بـapp.js سابقاً — مصدر الحقيقة الآن قاعدة البيانات. لا فلتر
// isActive هنا عمداً (بخلاف getFrameShop): مستخدم يرتدي إطاراً أُلغي تفعيله (حذف ناعم) يجب أن
// يستمر عرضه بشكله الصحيح لمن يشاهده، فقط لا يعود متاحاً للشراء من جديد (ذاك الفلتر بـgetFrameShop فقط)
exports.getFrameDisplayConfig = async (req, res) => {
    try {
        const frames = await ProfileFrame.find({ assetUrl: { $nin: [null, ''] } })
            .select('cssClass assetUrl staticUrl display')
            .lean();
        const frameMap = {};
        for (const f of frames) {
            if (!f.assetUrl) continue; // ✅ دفاع إضافي بالعمق — فوق شرط الاستعلام أعلاه مباشرة
            frameMap[f.cssClass] = {
                assetUrl: f.assetUrl,
                staticUrl: f.staticUrl || null,
                frameScale: f.display?.frameScale ?? DEFAULT_DISPLAY.frameScale,
                avatarScale: f.display?.avatarScale ?? DEFAULT_DISPLAY.avatarScale,
                offsetX: f.display?.offsetX ?? DEFAULT_DISPLAY.offsetX,
                offsetY: f.display?.offsetY ?? DEFAULT_DISPLAY.offsetY,
                crownTop: f.display?.crownTop ?? DEFAULT_DISPLAY.crownTop
            };
        }
        const body = { _default: DEFAULT_DISPLAY, _noFrame: { crownTop: NO_FRAME_CROWN_TOP }, frames: frameMap };
        const etag = '"' + crypto.createHash('sha1').update(JSON.stringify(body)).digest('hex') + '"';
        res.set('Cache-Control', 'public, max-age=0, must-revalidate');
        res.set('ETag', etag);
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        res.status(200).json(body);
    } catch (error) {
        console.error('[ERROR] in getFrameDisplayConfig:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ✅ يقرأ القيم الخمس من req.body (multipart → كل القيم نصوص دوماً) ويتجاهل أي حقل غائب/فارغ —
// فيُدمَج لاحقاً مع DEFAULT_DISPLAY (إنشاء) أو القيم الحالية (تحديث) لحقول غير مُرسَلة
function parseDisplayInput(body) {
    const display = {};
    for (const key of DISPLAY_FIELDS) {
        const raw = body[key];
        if (raw === undefined || raw === '') continue;
        const num = parseFloat(raw);
        const bounds = DISPLAY_BOUNDS[key];
        if (!Number.isFinite(num) || num < bounds.min || num > bounds.max) {
            throw Object.assign(
                new Error(`قيمة "${bounds.label}" يجب أن تكون رقماً بين ${bounds.min} و${bounds.max}`),
                { code: 'BAD_DISPLAY' }
            );
        }
        display[key] = num;
    }
    return display;
}

// ✅ طلب صريح: الأسعار أرقام صحيحة فقط (لا كسور عشرية) غير سالبة، بسقف واقعي — Number.isInteger
// يرفض أي قيمة مُعشّرة (مثل 50.5) بوضوح، لا مجرد تقريبها صامتاً
function parsePricesInput(body) {
    const day1 = parseFloat(body.day1);
    const day3 = parseFloat(body.day3);
    const day7 = parseFloat(body.day7);
    const valid = [day1, day3, day7].every(n => Number.isInteger(n) && n >= 0 && n <= PRICE_MAX);
    if (!valid) {
        throw Object.assign(
            new Error(`أسعار المدد الثلاث (1/3/7 أيام) يجب أن تكون أرقاماً صحيحة (بلا كسور) بين 0 و${PRICE_MAX}`),
            { code: 'BAD_PRICES' }
        );
    }
    return { day1, day3, day7 };
}

// ✅ أنبوب الرفع الموحَّد المطلوب صراحةً: يطبِّع (normalizeOne — 384px، توقيت المصدر الحقيقي
// محفوظ، ≤24 لقطة، نسخة ثابتة، ≤400KB — كل ذلك مُنفَّذ فعلياً داخل normalizeOne نفسها)، ثم
// يفحص (checkFrameFile) كلا الناتجين (متحرك+ثابت) بقواعد check-frames نفسها (لا قصّ حافة،
// فتحة مركزية شفافة فعلاً) كتحقّق مستقل إضافي، يرفعهما لـCloudinary، وينظِّف الملفات المؤقتة
// دوماً (نجاحاً أو فشلاً — finally). نفس public_id (=frameKey) بين الإنشاء والتحديث: رفع لاحق
// بنفس public_id يستبدل (overwrite:true) الأصل القديم بالضبط بنفس الرابط — رقم الإصدار
// المُضمَّن تلقائياً برابط Cloudinary (vNNNN) يتغيّر فيكسر أي تخزين مؤقت قديم بالمتصفح تلقائياً،
// بلا حاجة لتتبّع/حذف الأصل القديم يدوياً
async function runFrameUploadPipeline(buffer, frameKey) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-studio-'));
    try {
        const tempSrcPath = path.join(tempDir, `source-${frameKey}`);
        fs.writeFileSync(tempSrcPath, buffer);

        const result = await normalizeOne(frameKey, tempSrcPath, {
            outDir: tempDir, verbose: false, manifestOverrides: {}, persistManifest: false
        });

        const animatedCheck = await checkFrameFile(result.outPath);
        const staticCheck = await checkFrameFile(result.staticOutPath);
        const violations = [...animatedCheck.violations, ...staticCheck.violations];
        if (violations.length) {
            throw Object.assign(new Error(`الأصل المرفوع لا يحقّق شروط الإطار: ${violations.join('؛ ')}`), { code: 'VALIDATION' });
        }

        const [animatedUpload, staticUpload] = await Promise.all([
            uploadFrameAsset(result.outPath, frameKey),
            uploadFrameAsset(result.staticOutPath, `${frameKey}-static`)
        ]);

        return { assetUrl: animatedUpload.secure_url, staticUrl: staticUpload.secure_url };
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

exports.adminListFrames = async (req, res) => {
    try {
        const frames = await ProfileFrame.find({}).sort('sortOrder name');
        res.json({ success: true, frames });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.adminCreateFrame = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'يرجى اختيار ملف الإطار' });
        }
        const name = (req.body.name || '').trim();
        if (!name) {
            return res.status(400).json({ success: false, message: 'اسم الإطار مطلوب' });
        }

        let prices, display;
        try {
            prices = parsePricesInput(req.body);
            display = { ...DEFAULT_DISPLAY, ...parseDisplayInput(req.body) };
        } catch (parseErr) {
            return res.status(400).json({ success: false, message: parseErr.message });
        }

        try {
            assertRealType(req.file.buffer, ['image/png', 'image/gif', 'image/webp']);
        } catch (typeErr) {
            return res.status(400).json({ success: false, message: typeErr.message });
        }

        // ✅ cssClass فريد يُولَّد هنا (لا يُسلَّم من العميل إطلاقاً) — نفس بادئة الإطارات
        // الأصلية (profile-frame-) لتوافق أنماط CSS القديمة المتقاعدة إن وُجدت لأي صنف مطابق
        const cssClass = `profile-frame-custom-${crypto.randomBytes(6).toString('hex')}`;

        let uploaded;
        try {
            uploaded = await runFrameUploadPipeline(req.file.buffer, cssClass);
        } catch (pipelineErr) {
            const status = pipelineErr.code === 'VALIDATION' ? 400 : 500;
            console.error('[ERROR] frame upload pipeline:', pipelineErr);
            return res.status(status).json({ success: false, message: pipelineErr.message || 'تعذّر معالجة ملف الإطار' });
        }

        let frame;
        try {
            frame = await ProfileFrame.create({
                name,
                cssClass,
                assetUrl: uploaded.assetUrl,
                staticUrl: uploaded.staticUrl,
                isActive: req.body.isActive !== 'false',
                adminOnly: req.body.adminOnly === 'true',
                sortOrder: parseInt(req.body.sortOrder) || 0,
                prices,
                display
            });
        } catch (dbErr) {
            if (dbErr.code === 11000) {
                return res.status(400).json({ success: false, message: 'يوجد إطار آخر بهذا الاسم بالضبط' });
            }
            throw dbErr;
        }

        await AdminLog.logAction({
            admin: req.admin._id, action: 'create_frame', targetEntity: 'frame', entityId: frame._id,
            details: { name: frame.name, cssClass }, ipAddress: req.ip
        });

        const io = req.app.get('socketio');
        if (io) io.emit('frames:updated', {});

        res.status(201).json({ success: true, message: 'تم إنشاء الإطار بنجاح', frame });
    } catch (error) {
        console.error('[ERROR] in adminCreateFrame:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.adminUpdateFrame = async (req, res) => {
    try {
        const frame = await ProfileFrame.findById(req.params.frameId);
        if (!frame) return res.status(404).json({ success: false, message: 'الإطار غير موجود' });

        let prices, display;
        try {
            prices = (req.body.day1 !== undefined) ? parsePricesInput(req.body) : frame.prices;
            display = { ...frame.display.toObject(), ...parseDisplayInput(req.body) };
        } catch (parseErr) {
            return res.status(400).json({ success: false, message: parseErr.message });
        }

        if (req.body.name) frame.name = String(req.body.name).trim();
        if (req.body.isActive !== undefined) frame.isActive = (req.body.isActive === 'true' || req.body.isActive === true);
        if (req.body.adminOnly !== undefined) frame.adminOnly = (req.body.adminOnly === 'true' || req.body.adminOnly === true);
        if (req.body.sortOrder !== undefined) frame.sortOrder = parseInt(req.body.sortOrder) || 0;
        frame.prices = prices;
        frame.display = display;

        if (req.file) {
            try {
                assertRealType(req.file.buffer, ['image/png', 'image/gif', 'image/webp']);
            } catch (typeErr) {
                return res.status(400).json({ success: false, message: typeErr.message });
            }
            let uploaded;
            try {
                uploaded = await runFrameUploadPipeline(req.file.buffer, frame.cssClass);
            } catch (pipelineErr) {
                const status = pipelineErr.code === 'VALIDATION' ? 400 : 500;
                console.error('[ERROR] frame upload pipeline (update):', pipelineErr);
                return res.status(status).json({ success: false, message: pipelineErr.message || 'تعذّر معالجة ملف الإطار' });
            }
            frame.assetUrl = uploaded.assetUrl;
            frame.staticUrl = uploaded.staticUrl;
        }

        try {
            await frame.save();
        } catch (dbErr) {
            if (dbErr.code === 11000) {
                return res.status(400).json({ success: false, message: 'يوجد إطار آخر بهذا الاسم بالضبط' });
            }
            throw dbErr;
        }

        await AdminLog.logAction({
            admin: req.admin._id, action: 'update_frame', targetEntity: 'frame', entityId: frame._id,
            details: { name: frame.name }, ipAddress: req.ip
        });

        const io = req.app.get('socketio');
        if (io) io.emit('frames:updated', {});

        res.json({ success: true, message: 'تم تحديث الإطار بنجاح', frame });
    } catch (error) {
        console.error('[ERROR] in adminUpdateFrame:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ حذف ناعم (طلب صريح): isActive=false فقط — لا حذف حقيقي من القاعدة (يحافظ على مرجعية
// ownedFrames/activeFrame لأي مستخدم يملكه فعلاً بالفعل، تماماً كأي إطار آخر غير نشط بالمتجر)
exports.adminDeleteFrame = async (req, res) => {
    try {
        const frame = await ProfileFrame.findByIdAndUpdate(req.params.frameId, { isActive: false }, { new: true });
        if (!frame) return res.status(404).json({ success: false, message: 'الإطار غير موجود' });

        await AdminLog.logAction({
            admin: req.admin._id, action: 'delete_frame', targetEntity: 'frame', entityId: frame._id,
            details: { name: frame.name }, ipAddress: req.ip
        });

        const io = req.app.get('socketio');
        if (io) io.emit('frames:updated', {});

        res.json({ success: true, message: 'تم إلغاء تفعيل الإطار (حذف ناعم)' });
    } catch (error) {
        console.error('[ERROR] in adminDeleteFrame:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
