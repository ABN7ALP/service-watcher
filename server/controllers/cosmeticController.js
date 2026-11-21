// ملف: server/controllers/cosmeticController.js
// ✅ feat/gift-fx-and-cosmetics-base: متجر فقاعات الدردشة الجديد — يحل محل bubbleSkinController
// (ChatBubbleSkin حُذفت نهائياً، راجع migrateDeleteAllChatBubbleSkins بـautoSeed.js). فقط
// source:'shop' قابل للشراء هنا؛ 'welcome' يُمنح تلقائياً عند التسجيل (authController)،
// و'fanclub'/'couple' يُحسَبان حياً بلا شراء ولا ملكية مخزَّنة إطلاقاً (راجع fanClubBubbleClass/
// coupleBubbleClass بـapp.js والتعليق المقابل بدردشة الغرفة)
const mongoose = require('mongoose');
const CosmeticItem = require('../models/CosmeticItem');
const User = require('../models/User');
const walletService = require('../utils/walletService');

// ✅ نفس منطق frameRemainingLabel/activeFrameExpiresAt بالضبط — عنصر نشط فقط لو لم تنتهِ
// صلاحيته بعد؛ CRON_EXPIRE (راجع server/utils/cosmeticExpiryJob.js) ينظّف المنتهي دورياً أيضاً،
// هذا الفحص الحي احتياط إضافي لا يعتمد عليه وحده لحظة القراءة فقط
function isCosmeticActive(expiresAt) {
    return !!expiresAt && new Date(expiresAt).getTime() > Date.now();
}

exports.getShop = async (req, res) => {
    try {
        const items = await CosmeticItem.find({ type: 'bubble', source: 'shop', isActive: true }).sort('sortOrder');
        const user = await User.findById(req.user.id).select('ownedCosmetics activeBubbleCosmetic activeBubbleCosmeticExpiresAt coins');
        const ownedMap = new Map(
            user.ownedCosmetics
                .filter(o => isCosmeticActive(o.expiresAt))
                .map(o => [o.item.toString(), o])
        );
        const activeId = (user.activeBubbleCosmetic && isCosmeticActive(user.activeBubbleCosmeticExpiresAt))
            ? user.activeBubbleCosmetic.toString() : null;

        res.status(200).json({
            status: 'success',
            data: {
                items: items.map(it => ({
                    ...it.toObject(),
                    owned: ownedMap.has(it._id.toString()),
                    expiresAt: ownedMap.get(it._id.toString())?.expiresAt || null
                })),
                activeItemId: activeId,
                coins: user.coins
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// 🛡️ دفتر الأستاذ: خصم ذرّي (بونص أولاً ثم مدفوع) داخل معاملة واحدة مع إضافة الملكية وتفعيلها
// فوراً — نفس نمط purchaseFrame بالضبط (راجع التعليق هناك)، لكن أبسط: لا "صندوق" ولا تفعيل
// لاحق منفصل، الفقاعة تُفعَّل تلقائياً فور الشراء (تحل محل أي فقاعة نشطة سابقة من نفس النوع)
exports.purchase = async (req, res) => {
    try {
        const { itemId, days } = req.body;
        const item = await CosmeticItem.findById(itemId);
        if (!item || !item.isActive || item.source !== 'shop') {
            return res.status(404).json({ status: 'fail', message: 'غير متوفر' });
        }
        const durationDays = parseInt(days);
        const chosenDuration = item.durations.find(d => d.days === durationDays);
        if (!chosenDuration) {
            return res.status(400).json({ status: 'fail', message: 'مدة غير صالحة' });
        }

        const session = await mongoose.startSession();
        let txError = null;
        let finalCoins = null;
        let newExpiresAt = null;
        try {
            await session.withTransaction(async () => {
                try {
                    const { fromBonus, fromPaid } = await walletService.computeCoinSpendSplit(req.user.id, chosenDuration.price, session);
                    const idemBase = new mongoose.Types.ObjectId();
                    const entries = [];
                    if (fromBonus > 0) entries.push({ user: req.user.id, wallet: 'coins_bonus', delta: -fromBonus, type: 'purchase', refType: 'CosmeticItem', refId: item._id, idempotencyKey: `${idemBase}:bonus` });
                    if (fromPaid > 0) entries.push({ user: req.user.id, wallet: 'coins_paid', delta: -fromPaid, type: 'purchase', refType: 'CosmeticItem', refId: item._id, idempotencyKey: `${idemBase}:paid` });
                    await walletService.post(entries, session);
                } catch (err) {
                    if (err.code === 'INSUFFICIENT_FUNDS') {
                        throw Object.assign(new Error('رصيد غير كافٍ'), { code: 'INSUFFICIENT' });
                    }
                    throw err;
                }

                const user = await User.findById(req.user.id).session(session);
                if (!user) {
                    throw Object.assign(new Error('يرجى تسجيل الدخول من جديد'), { code: 'USER_NOT_FOUND' });
                }
                const now = new Date();
                newExpiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
                user.ownedCosmetics.push({
                    item: item._id,
                    purchasedAt: now,
                    durationDays,
                    activatedAt: now,
                    expiresAt: newExpiresAt
                });
                if (item.type === 'bubble') {
                    user.activeBubbleCosmetic = item._id;
                    user.activeBubbleCosmeticClass = item.cssClass;
                    user.activeBubbleCosmeticExpiresAt = newExpiresAt;
                } else {
                    user.activeEntranceCosmetic = item._id;
                    user.activeEntranceCosmeticClass = item.cssClass;
                    user.activeEntranceCosmeticExpiresAt = newExpiresAt;
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
            if (txError.code === 'USER_NOT_FOUND') return res.status(401).json({ status: 'fail', message: txError.message });
            if (txError.code === 'INSUFFICIENT') return res.status(400).json({ status: 'fail', message: txError.message });
            throw txError;
        }

        res.status(200).json({ status: 'success', message: `تم شراء ${item.name}`, data: { newCoins: finalCoins, expiresAt: newExpiresAt } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ✅ تفعيل عنصر مملوك غير منتهي الصلاحية (أو null لإلغاء التفعيل — يعود المستخدم لحساب الأولوية
// الطبيعي: نادٍ ← ثنائي ← لا شيء، بلا احتياط ترحيب لو انتهت صلاحيته فعلاً)
exports.equip = async (req, res) => {
    try {
        const { itemId } = req.body;
        const user = await User.findById(req.user.id);
        if (!itemId) {
            user.activeBubbleCosmetic = null;
            user.activeBubbleCosmeticClass = null;
            user.activeBubbleCosmeticExpiresAt = null;
            await user.save();
            return res.status(200).json({ status: 'success', data: { activeItemId: null } });
        }

        const owned = user.ownedCosmetics.find(o => o.item.toString() === itemId && isCosmeticActive(o.expiresAt));
        if (!owned) {
            return res.status(403).json({ status: 'fail', message: 'يجب الشراء أولاً أو انتهت صلاحيته' });
        }
        const item = await CosmeticItem.findById(itemId);
        if (!item) return res.status(404).json({ status: 'fail', message: 'غير موجود' });

        if (item.type === 'bubble') {
            user.activeBubbleCosmetic = item._id;
            user.activeBubbleCosmeticClass = item.cssClass;
            user.activeBubbleCosmeticExpiresAt = owned.expiresAt;
        } else {
            user.activeEntranceCosmetic = item._id;
            user.activeEntranceCosmeticClass = item.cssClass;
            user.activeEntranceCosmeticExpiresAt = owned.expiresAt;
        }
        await user.save();
        res.status(200).json({ status: 'success', message: `تم تفعيل ${item.name}`, data: { activeItemId: item._id } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.isCosmeticActive = isCosmeticActive;
