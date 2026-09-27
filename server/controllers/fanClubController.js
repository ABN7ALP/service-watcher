// ملف: server/controllers/fanClubController.js
//
// ✅ نظام "نادي المعجبين" — الانضمام بإرسال وردة رمزية بكوينز واحد (بدل السعر العادي
// بمتجر الهدايا)، عضوية فريدة لكل (مالك، عضو)، وترتيب عام لأقوى النوادي (حسب إجمالي
// الأعضاء) مع تبويب "اليوم" لعرض الأكثر نمواً خلال آخر 24 ساعة تحديداً
const mongoose = require('mongoose');
const User = require('../models/User');
const Gift = require('../models/Gift');
const GiftLog = require('../models/GiftLog');
const FanClubMembership = require('../models/FanClubMembership');

const JOIN_PRICE = 1; // ✅ سعر ثابت للانضمام — منفصل تماماً عن سعر الوردة الحقيقي بمتجر الهدايا العام

function startOfTodayUTC() {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
}
function startOfWeekUTC() {
    const d = startOfTodayUTC();
    d.setUTCDate(d.getUTCDate() - 7);
    return d;
}

// ✅ قائمة شعارات النادي المغلقة — نفس القيم المسموحة بـUser.fanClub.emblemId (enum)، تُصدَّر
// هنا أيضاً لتُعرَض بمنتقي الشعارات بالعميل دون تكرار القائمة يدوياً بمكانين مختلفين
const EMBLEM_IDS = ['heart_wings', 'shield_wings', 'crown_gold', 'star_royal'];

exports.getSummary = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const [owner, memberCount, isMember] = await Promise.all([
            User.findById(ownerId).select('username profileImage fanClub').populate('fanClub.joinGiftId', 'name imageUrl price discountedPrice'),
            FanClubMembership.countDocuments({ owner: ownerId }),
            FanClubMembership.exists({ owner: ownerId, member: req.user.id })
        ]);
        if (!owner) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });

        const joinGift = owner.fanClub?.joinGiftId;
        res.status(200).json({
            status: 'success',
            data: {
                ownerId,
                ownerUsername: owner.username,
                ownerProfileImage: owner.profileImage,
                clubName: owner.fanClub?.name || null,
                emblemId: owner.fanClub?.emblemId || 'heart_wings',
                joinGift: joinGift ? { giftId: joinGift._id, name: joinGift.name, imageUrl: joinGift.imageUrl, price: joinGift.price } : null,
                isOwner: ownerId === req.user.id.toString(),
                memberCount,
                isMember: !!isMember,
                joinPrice: JOIN_PRICE
            }
        });
    } catch (error) {
        console.error('[FAN CLUB] getSummary error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ تخصيص النادي — الاسم (حد أقصى 13 حرفاً)، الشعار (قيمة من قائمة مغلقة EMBLEM_IDS فقط —
// لا نص حر إطلاقاً هنا لمنع أي حقن)، وهدية الانضمام المخصصة (يُتحقَّق أنها هدية حقيقية فعّالة
// بمتجر الهدايا قبل قبولها). أي حقل من الثلاثة اختياري بنفس الطلب
exports.updateSettings = async (req, res) => {
    try {
        const { name, emblemId, joinGiftId } = req.body;
        const update = {};

        if (name !== undefined) {
            const trimmed = String(name || '').trim();
            if (trimmed.length > 13) {
                return res.status(400).json({ status: 'fail', message: 'اسم النادي يجب ألا يتجاوز 13 حرفاً' });
            }
            update['fanClub.name'] = trimmed || null;
        }
        if (emblemId !== undefined) {
            if (!EMBLEM_IDS.includes(emblemId)) {
                return res.status(400).json({ status: 'fail', message: 'شعار غير صالح' });
            }
            update['fanClub.emblemId'] = emblemId;
        }
        if (joinGiftId !== undefined) {
            if (joinGiftId === null || joinGiftId === '') {
                update['fanClub.joinGiftId'] = null;
            } else {
                if (!mongoose.Types.ObjectId.isValid(joinGiftId)) {
                    return res.status(400).json({ status: 'fail', message: 'هدية غير صالحة' });
                }
                const gift = await Gift.findOne({ _id: joinGiftId, isActive: true }).select('_id');
                if (!gift) {
                    return res.status(400).json({ status: 'fail', message: 'هذه الهدية غير متوفرة حالياً' });
                }
                update['fanClub.joinGiftId'] = joinGiftId;
            }
        }
        if (Object.keys(update).length === 0) {
            return res.status(400).json({ status: 'fail', message: 'لا يوجد ما يُحدَّث' });
        }

        const updated = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true })
            .select('fanClub').populate('fanClub.joinGiftId', 'name imageUrl price discountedPrice');
        const joinGift = updated.fanClub?.joinGiftId;
        res.status(200).json({
            status: 'success',
            data: {
                clubName: updated.fanClub?.name || null,
                emblemId: updated.fanClub?.emblemId || 'heart_wings',
                joinGift: joinGift ? { giftId: joinGift._id, name: joinGift.name, imageUrl: joinGift.imageUrl, price: joinGift.price } : null
            }
        });
    } catch (error) {
        console.error('[FAN CLUB] updateSettings error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

exports.joinFanClub = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        const memberId = req.user.id;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        if (ownerId === memberId) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكنك الانضمام لناديك الخاص' });
        }

        const alreadyMember = await FanClubMembership.exists({ owner: ownerId, member: memberId });
        if (alreadyMember) {
            const memberCount = await FanClubMembership.countDocuments({ owner: ownerId });
            return res.status(200).json({ status: 'success', data: { alreadyMember: true, memberCount } });
        }

        const [owner, rose] = await Promise.all([
            User.findById(ownerId).select('username profileImage socketId isBot'),
            Gift.findOne({ name: 'وردة' })
        ]);
        if (!owner) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        if (owner.isBot) return res.status(403).json({ status: 'fail', message: 'لا يمكن الانضمام لهذا الحساب' });

        // ✅ خصم ذري — يستحيل خصم كوينز من رصيد غير كافٍ حتى مع طلبات متزامنة بنفس اللحظة
        const updatedMember = await User.findOneAndUpdate(
            { _id: memberId, coins: { $gte: JOIN_PRICE } },
            { $inc: { coins: -JOIN_PRICE } },
            { new: true }
        );
        if (!updatedMember) {
            return res.status(400).json({ status: 'fail', message: 'رصيد الكوينز غير كافٍ للانضمام' });
        }

        // 🛡️ الفهرس الفريد (owner+member) هو خط الدفاع الحقيقي ضد سباق نقرتين متزامنتين —
        // لو نجحت محاولتان بالتوازي رغم الفحص أعلاه، ثانيتهما تفشل هنا بخطأ E11000 ونُرجع
        // الكوينز المخصومة فوراً (لا يُعاقَب المستخدم على خطأ توقيت لا ذنب له فيه)
        try {
            await FanClubMembership.create({ owner: ownerId, member: memberId });
        } catch (dupError) {
            if (dupError.code === 11000) {
                await User.updateOne({ _id: memberId }, { $inc: { coins: JOIN_PRICE } });
                const memberCount = await FanClubMembership.countDocuments({ owner: ownerId });
                return res.status(200).json({ status: 'success', data: { alreadyMember: true, memberCount } });
            }
            throw dupError;
        }

        if (rose) {
            await GiftLog.create({
                sender: memberId,
                receiver: ownerId,
                gift: rose._id,
                giftName: rose.name,
                giftImage: rose.imageUrl,
                quantity: 1,
                unitPrice: JOIN_PRICE,
                totalPrice: JOIN_PRICE,
                context: 'fanclub_join'
            });
        }

        const memberCount = await FanClubMembership.countDocuments({ owner: ownerId });
        const io = req.app.get('socketio');
        if (io) {
            io.emit('fanclub-member-count-updated', { ownerId, memberCount });
            const { broadcastSupportLevelUpdate } = require('./giftController');
            broadcastSupportLevelUpdate(io, memberId);
            broadcastSupportLevelUpdate(io, ownerId);
            if (owner.socketId) {
                io.to(owner.socketId).emit('fanclub-new-member', {
                    memberId, memberUsername: updatedMember.username, memberProfileImage: updatedMember.profileImage, memberCount
                });
            }
        }

        res.status(201).json({
            status: 'success',
            data: { alreadyMember: false, memberCount, newCoins: updatedMember.coins }
        });
    } catch (error) {
        console.error('[FAN CLUB] joinFanClub error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ الأعضاء مرتَّبون حسب إجمالي ما دعموا به صاحب النادي (كل الهدايا التي أرسلوها له)، الأعلى
// أولاً — يطابق سلوك تطبيقات البث المباشر المشهورة (فرز أعضاء النادي حسب المساهمة لا الانضمام)
exports.getMembers = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const skip = Math.max(parseInt(req.query.skip) || 0, 0);

        const [memberships, contributions] = await Promise.all([
            FanClubMembership.find({ owner: ownerId }).populate('member', 'username profileImage customId activeFrameClass'),
            GiftLog.aggregate([
                { $match: { receiver: new mongoose.Types.ObjectId(ownerId) } },
                { $group: { _id: '$sender', total: { $sum: '$totalPrice' } } }
            ])
        ]);
        const contributionMap = new Map(contributions.map(c => [c._id.toString(), c.total]));

        const members = memberships
            .filter(m => m.member)
            .map(m => ({
                userId: m.member._id,
                username: m.member.username,
                profileImage: m.member.profileImage,
                activeFrameClass: m.member.activeFrameClass,
                joinedAt: m.createdAt,
                contributionPoints: contributionMap.get(m.member._id.toString()) || 0
            }))
            .sort((a, b) => b.contributionPoints - a.contributionPoints)
            .slice(skip, skip + limit);

        res.status(200).json({ status: 'success', data: { members } });
    } catch (error) {
        console.error('[FAN CLUB] getMembers error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ ترتيب أقوى نوادي المعجبين — المعيار الرسمي دائماً إجمالي الأعضاء (يُحدَّث أسبوعياً
// بحكم طبيعة النمو التراكمي)، وتبويب "اليوم" يعيد الترتيب حسب الأعضاء الجدد خلال آخر 24
// ساعة فقط (لإبراز الأسرع نمواً حالياً) — كل صف يحمل الرقمين معاً بغض النظر عن التبويب
exports.getLeaderboard = async (req, res) => {
    try {
        const period = req.query.period === 'daily' ? 'daily' : 'weekly';
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const myId = req.user.id;

        const periodStart = period === 'daily' ? startOfTodayUTC() : startOfWeekUTC();
        const todayStart = startOfTodayUTC();

        // ✅ تجميع واحد يحسب: الإجمالي الكلي (لكل الأعضاء)، أعضاء اليوم، وأعضاء فترة العرض
        // الحالية (يوم/أسبوع) — لكل مالك نادٍ لديه عضو واحد فعلي على الأقل
        const rows = await FanClubMembership.aggregate([
            {
                $group: {
                    _id: '$owner',
                    totalMembers: { $sum: 1 },
                    todayMembers: { $sum: { $cond: [{ $gte: ['$createdAt', todayStart] }, 1, 0] } },
                    periodMembers: { $sum: { $cond: [{ $gte: ['$createdAt', periodStart] }, 1, 0] } }
                }
            },
            { $sort: period === 'daily' ? { periodMembers: -1, totalMembers: -1 } : { totalMembers: -1 } },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' },
            {
                $project: {
                    ownerId: '$_id', username: '$user.username', profileImage: '$user.profileImage',
                    totalMembers: 1, todayMembers: 1
                }
            }
        ]);

        const top = rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));

        let myRank = null;
        const myIndex = rows.findIndex(r => r.ownerId.toString() === myId);
        if (myIndex !== -1) {
            myRank = {
                rank: myIndex + 1,
                ownerId: myId,
                totalMembers: rows[myIndex].totalMembers,
                todayMembers: rows[myIndex].todayMembers,
                inTop: myIndex < limit
            };
        }

        res.status(200).json({ status: 'success', data: { period, leaders: top, myRank } });
    } catch (error) {
        console.error('[FAN CLUB] getLeaderboard error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};
