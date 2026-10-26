const mongoose = require('mongoose');
const ChatBubbleSkin = require('../models/ChatBubbleSkin');
const User = require('../models/User');
const walletService = require('../utils/walletService');

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

// 🛡️ دفتر الأستاذ (feat/wallet-ledger-v1): كانت الدالة تقرأ user.coins، تفحصه، ثم تُعدِّل
// coins وownedBubbleSkins بعملية save() واحدة لاحقة بلا أي معاملة أو شرط ذرّي — طلبا شراء
// متزامنان لنفس المستخدم يتجاوزان الفحص معاً بالاعتماد على نفس القراءة القديمة (خصم مزدوج أو
// تكرار مجاني). المعاملة الآن تخصم ذرّياً عبر walletService (بونص أولاً) قبل تعديل المصفوفة،
// وتقرأ user من جديد ضمن جلستها الخاصة — أي تضارب كتابة حقيقي بين معاملتين متزامنتين يُكتشَف
// ذاتياً بمستوى محرّك قاعدة البيانات، وwithTransaction تُعيد المحاولة تلقائياً عند هذا التضارب
exports.purchase = async (req, res) => {
    try {
        const { skinId } = req.body;
        const skin = await ChatBubbleSkin.findById(skinId);
        if (!skin) return res.status(404).json({ status: 'fail', message: 'غير متوفر' });

        const session = await mongoose.startSession();
        let txError = null;
        let finalCoins = null;
        try {
            await session.withTransaction(async () => {
                const user = await User.findById(req.user.id).session(session);
                if (!user) {
                    throw Object.assign(new Error('يرجى تسجيل الدخول من جديد'), { code: 'USER_NOT_FOUND' });
                }
                if (user.ownedBubbleSkins.map(id => id.toString()).includes(skinId)) {
                    throw Object.assign(new Error('تمتلكه بالفعل'), { code: 'ALREADY_OWNED' });
                }

                try {
                    const { fromBonus, fromPaid } = await walletService.computeCoinSpendSplit(req.user.id, skin.price, session);
                    const idemBase = new mongoose.Types.ObjectId();
                    const entries = [];
                    if (fromBonus > 0) entries.push({ user: req.user.id, wallet: 'coins_bonus', delta: -fromBonus, type: 'purchase', refType: 'ChatBubbleSkin', refId: skin._id, idempotencyKey: `${idemBase}:bonus` });
                    if (fromPaid > 0) entries.push({ user: req.user.id, wallet: 'coins_paid', delta: -fromPaid, type: 'purchase', refType: 'ChatBubbleSkin', refId: skin._id, idempotencyKey: `${idemBase}:paid` });
                    await walletService.post(entries, session);
                } catch (err) {
                    if (err.code === 'INSUFFICIENT_FUNDS') {
                        throw Object.assign(new Error('رصيد غير كافٍ'), { code: 'INSUFFICIENT' });
                    }
                    throw err;
                }

                const freshUser = await User.findById(req.user.id).session(session);
                freshUser.ownedBubbleSkins.push(skin._id);
                await freshUser.save({ session });
                finalCoins = freshUser.coins;
            });
        } catch (e) {
            txError = e;
        } finally {
            await session.endSession();
        }

        if (txError) {
            if (txError.code === 'USER_NOT_FOUND') return res.status(401).json({ status: 'fail', message: txError.message });
            if (txError.code === 'ALREADY_OWNED') return res.status(400).json({ status: 'fail', message: txError.message });
            if (txError.code === 'INSUFFICIENT') return res.status(400).json({ status: 'fail', message: txError.message });
            throw txError;
        }

        res.status(200).json({ status: 'success', message: `تم شراء ${skin.name}`, data: { newCoins: finalCoins } });
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
