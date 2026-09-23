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

exports.getSummary = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const [owner, memberCount, isMember] = await Promise.all([
            User.findById(ownerId).select('username profileImage'),
            FanClubMembership.countDocuments({ owner: ownerId }),
            FanClubMembership.exists({ owner: ownerId, member: req.user.id })
        ]);
        if (!owner) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });

        res.status(200).json({
            status: 'success',
            data: {
                ownerId,
                ownerUsername: owner.username,
                ownerProfileImage: owner.profileImage,
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

exports.getMembers = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const skip = Math.max(parseInt(req.query.skip) || 0, 0);

        const memberships = await FanClubMembership.find({ owner: ownerId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('member', 'username profileImage customId activeFrameClass');

        res.status(200).json({
            status: 'success',
            data: {
                members: memberships.filter(m => m.member).map(m => ({
                    userId: m.member._id,
                    username: m.member.username,
                    profileImage: m.member.profileImage,
                    activeFrameClass: m.member.activeFrameClass,
                    joinedAt: m.createdAt
                }))
            }
        });
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
