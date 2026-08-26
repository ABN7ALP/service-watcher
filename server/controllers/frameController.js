const ProfileFrame = require('../models/ProfileFrame');
const User = require('../models/User');

const DURATION_DAYS_MAP = { '7': 'days7', '30': 'days30', '365': 'days365' };

exports.getFrameShop = async (req, res) => {
    try {
        const frames = await ProfileFrame.find({ isActive: true }).sort('sortOrder');
        const user = await User.findById(req.user.id).select('ownedFrames activeFrame coins activeFrameExpiresAt');

        // ✅ إزالة أي إطار مفعّل انتهت صلاحيته تلقائياً عند كل فتح للمتجر (فحص فوري)
        await checkAndExpireActiveFrame(user);

        const ownedMap = {};
        user.ownedFrames.forEach(o => { ownedMap[o.frame.toString()] = o; });

        res.status(200).json({
            status: 'success',
            data: {
                frames: frames.map(f => ({
                    _id: f._id,
                    name: f.name,
                    cssClass: f.cssClass,
                    prices: f.prices,
                    ownedInstance: ownedMap[f._id.toString()] || null
                })),
                activeFrame: user.activeFrame,
                activeFrameExpiresAt: user.activeFrameExpiresAt,
                coins: user.coins
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
        const { frameId, duration } = req.body; // duration: '7' | '30' | '365'

        const durationKey = DURATION_DAYS_MAP[duration];
        if (!durationKey) {
            return res.status(400).json({ status: 'fail', message: 'مدة غير صالحة' });
        }

        const [user, frame] = await Promise.all([User.findById(userId), ProfileFrame.findById(frameId)]);
        if (!frame || !frame.isActive) {
            return res.status(404).json({ status: 'fail', message: 'الإطار غير متوفر' });
        }

        const alreadyOwned = user.ownedFrames.some(o => o.frame.toString() === frameId.toString());
        if (alreadyOwned) {
            return res.status(400).json({ status: 'fail', message: 'أنت تمتلك هذا الإطار بالفعل' });
        }

        const price = frame.prices[durationKey];
        if (user.coins < price) {
            return res.status(400).json({ status: 'fail', message: 'رصيد الكوينز غير كافٍ' });
        }

        user.coins -= price;
        // ✅ الشراء وحده لا يبدأ عد الصلاحية — activatedAt و expiresAt يبقيان null لحين التفعيل الفعلي
        user.ownedFrames.push({
            frame: frame._id,
            purchasedAt: new Date(),
            durationDays: parseInt(duration),
            activatedAt: null,
            expiresAt: null
        });
        await user.save();

        res.status(200).json({
            status: 'success',
            message: `تم شراء ${frame.name} بنجاح (صالح ${duration} يوم من لحظة التفعيل)`,
            data: { newCoins: user.coins }
        });
    } catch (error) {
        console.error('[ERROR] in purchaseFrame:', error);
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
            return res.status(200).json({ status: 'success', message: 'تمت إزالة الإطار', data: { activeFrameClass: null } });
        }

        const ownedInstance = user.ownedFrames.find(o => o.frame.toString() === frameId.toString());
        if (!ownedInstance) {
            return res.status(403).json({ status: 'fail', message: 'يجب شراء هذا الإطار أولاً' });
        }

        const frame = await ProfileFrame.findById(frameId);
        if (!frame) return res.status(404).json({ status: 'fail', message: 'الإطار غير موجود' });

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

// ✅ دالة مساعدة: تُزيل الإطار المفعّل تلقائياً من كل مكان إذا انتهت صلاحيته
async function checkAndExpireActiveFrame(user) {
    if (user.activeFrameExpiresAt && user.activeFrameExpiresAt < new Date()) {
        user.activeFrame = null;
        user.activeFrameClass = null;
        user.activeFrameExpiresAt = null;
        await user.save();
        console.log(`[FRAME EXPIRE] Frame auto-removed for user ${user._id}`);
    }
}

exports.checkAndExpireActiveFrame = checkAndExpireActiveFrame;
