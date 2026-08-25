const ProfileFrame = require('../models/ProfileFrame');
const User = require('../models/User');

exports.getFrameShop = async (req, res) => {
    try {
        const frames = await ProfileFrame.find({ isActive: true }).sort('sortOrder price');
        const user = await User.findById(req.user.id).select('ownedFrames activeFrame coins');
        const ownedIds = user.ownedFrames.map(id => id.toString());

        res.status(200).json({
            status: 'success',
            data: {
                frames: frames.map(f => ({
                    _id: f._id,
                    name: f.name,
                    price: f.price,
                    cssClass: f.cssClass,
                    owned: ownedIds.includes(f._id.toString())
                })),
                activeFrame: user.activeFrame,
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
        const { frameId } = req.body;

        const [user, frame] = await Promise.all([
            User.findById(userId),
            ProfileFrame.findById(frameId)
        ]);

        if (!frame || !frame.isActive) {
            return res.status(404).json({ status: 'fail', message: 'الإطار غير متوفر' });
        }

        const alreadyOwned = user.ownedFrames.map(id => id.toString()).includes(frameId.toString());
        if (alreadyOwned) {
            return res.status(400).json({ status: 'fail', message: 'أنت تمتلك هذا الإطار بالفعل' });
        }

        if (user.coins < frame.price) {
            return res.status(400).json({ status: 'fail', message: 'رصيد الكوينز غير كافٍ' });
        }

        user.coins -= frame.price;
        user.ownedFrames.push(frame._id);
        await user.save();

        res.status(200).json({
            status: 'success',
            message: `تم شراء ${frame.name} بنجاح`,
            data: { newCoins: user.coins, frameId: frame._id }
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
            await user.save();
            return res.status(200).json({ status: 'success', message: 'تمت إزالة الإطار', data: { activeFrameClass: null } });
        }

        const ownsFrame = user.ownedFrames.map(id => id.toString()).includes(frameId.toString());
        if (!ownsFrame) {
            return res.status(403).json({ status: 'fail', message: 'يجب شراء هذا الإطار أولاً' });
        }

        const frame = await ProfileFrame.findById(frameId);
        if (!frame) {
            return res.status(404).json({ status: 'fail', message: 'الإطار غير موجود' });
        }

        user.activeFrame = frame._id;
        user.activeFrameClass = frame.cssClass;
        await user.save();

        res.status(200).json({
            status: 'success',
            message: `تم تفعيل ${frame.name}`,
            data: { activeFrameClass: frame.cssClass }
        });
    } catch (error) {
        console.error('[ERROR] in setActiveFrame:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};
