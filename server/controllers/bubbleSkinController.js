const ChatBubbleSkin = require('../models/ChatBubbleSkin');
const User = require('../models/User');

exports.getShop = async (req, res) => {
    try {
        const skins = await ChatBubbleSkin.find({ isActive: true }).sort('sortOrder');
        const user = await User.findById(req.user.id).select('ownedBubbleSkins activeBubbleSkinClass coins');
        const ownedIds = user.ownedBubbleSkins.map(id => id.toString());

        res.status(200).json({
            status: 'success',
            data: {
                skins: skins.map(s => ({ ...s.toObject(), owned: ownedIds.includes(s._id.toString()) })),
                activeClass: user.activeBubbleSkinClass,
                coins: user.coins
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.purchase = async (req, res) => {
    try {
        const { skinId } = req.body;
        const [user, skin] = await Promise.all([User.findById(req.user.id), ChatBubbleSkin.findById(skinId)]);

        if (!skin) return res.status(404).json({ status: 'fail', message: 'غير متوفر' });
        if (user.ownedBubbleSkins.map(id => id.toString()).includes(skinId)) {
            return res.status(400).json({ status: 'fail', message: 'تمتلكه بالفعل' });
        }
        if (user.coins < skin.price) return res.status(400).json({ status: 'fail', message: 'رصيد غير كافٍ' });

        user.coins -= skin.price;
        user.ownedBubbleSkins.push(skin._id);
        await user.save();

        res.status(200).json({ status: 'success', message: `تم شراء ${skin.name}`, data: { newCoins: user.coins } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.equip = async (req, res) => {
    try {
        const { skinId } = req.body;
        const user = await User.findById(req.user.id);

        if (!skinId) {
            user.activeBubbleSkinClass = null;
            await user.save();
            return res.status(200).json({ status: 'success', data: { activeClass: null } });
        }

        if (!user.ownedBubbleSkins.map(id => id.toString()).includes(skinId)) {
            return res.status(403).json({ status: 'fail', message: 'يجب الشراء أولاً' });
        }

        const skin = await ChatBubbleSkin.findById(skinId);
        user.activeBubbleSkinClass = skin.cssClass;
        await user.save();

        res.status(200).json({ status: 'success', message: `تم تفعيل ${skin.name}`, data: { activeClass: skin.cssClass } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};
