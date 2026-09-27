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

// ✅ حدود "الأسبوع" الثابتة لنظام تصفير مساهمات نادي المعجبين (يبدأ كل أسبوع الإثنين
// 00:00 UTC) — منفصلة تماماً عن startOfWeekUTC أعلاه (نافذة متحرّكة لآخر 7 أيام، خاصة
// بترتيب أقوى النوادي)؛ هنا نحتاج حدّاً ثابتاً واحداً يتزامن للجميع لعرض عدّاد تنازلي حقيقي
function currentWeekStartUTC() {
    const d = startOfTodayUTC();
    const day = d.getUTCDay(); // 0=الأحد .. 6=السبت
    const diffToMonday = day === 0 ? 6 : day - 1;
    d.setUTCDate(d.getUTCDate() - diffToMonday);
    return d;
}
function getCurrentWeekRange() {
    const start = currentWeekStartUTC();
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start, end };
}
function getLastWeekRange() {
    const { start: curStart } = getCurrentWeekRange();
    const start = new Date(curStart);
    start.setUTCDate(start.getUTCDate() - 7);
    return { start, end: curStart };
}

// ✅ يحسب صاحب أعلى مساهمة (هدايا) لمالك نادٍ معيّن خلال فترة زمنية معطاة — يُستخدم للمتصدّر
// الحالي (الظاهر بجانب المالك، يتحدّث حياً) ولحساب "نجم الأسبوع الماضي" (شارة الملف الدائمة)
async function computeTopContributor(ownerId, range) {
    const rows = await GiftLog.aggregate([
        { $match: { receiver: new mongoose.Types.ObjectId(ownerId), createdAt: { $gte: range.start, $lt: range.end } } },
        { $group: { _id: '$sender', total: { $sum: '$totalPrice' } } },
        { $sort: { total: -1, _id: 1 } },
        { $limit: 1 }
    ]);
    if (rows.length === 0) return null;
    const user = await User.findById(rows[0]._id).select('username profileImage');
    if (!user) return null;
    return { userId: rows[0]._id, username: user.username, profileImage: user.profileImage, points: rows[0].total };
}

// ✅ قائمة الألوان المغلقة المشتركة بين شعار النادي وهدية الانضمام — نفس القيم المسموحة
// بـUser.fanClub.emblemColorId/giftColorId (enum). الوردة/الشعار نفسهما دوماً؛ اللون فقط
// يتبدّل (يُطبَّق بفلتر CSS بالعميل، بلا أي صور مرفوعة من المستخدم)
const FAN_CLUB_COLOR_IDS = ['pink', 'yellow', 'purple', 'blue', 'orange'];

exports.getSummary = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const [owner, memberCount, isMember, currentLeader] = await Promise.all([
            User.findById(ownerId).select('username profileImage fanClub'),
            FanClubMembership.countDocuments({ owner: ownerId }),
            FanClubMembership.exists({ owner: ownerId, member: req.user.id }),
            computeTopContributor(ownerId, getCurrentWeekRange())
        ]);
        if (!owner) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });

        res.status(200).json({
            status: 'success',
            data: {
                ownerId,
                ownerUsername: owner.username,
                ownerProfileImage: owner.profileImage,
                clubName: owner.fanClub?.name || null,
                emblemColorId: owner.fanClub?.emblemColorId || 'pink',
                giftColorId: owner.fanClub?.giftColorId || 'pink',
                isOwner: ownerId === req.user.id.toString(),
                memberCount,
                isMember: !!isMember,
                joinPrice: JOIN_PRICE,
                // ✅ نجم الأسبوع الحالي (المتصدّر حياً بمساهمات هذا الأسبوع) — يظهر بجانب صورة
                // صاحب النادي ويتبدّل فوراً كلما تغيّر المتصدّر؛ ليس شارة دائمة (تلك تُمنح فقط
                // لصاحب المركز الأول بعد انتهاء الأسبوع فعلياً، عبر getWeeklyWins)
                currentLeader
            }
        });
    } catch (error) {
        console.error('[FAN CLUB] getSummary error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ تخصيص النادي — الاسم (حد أقصى 13 حرفاً)، ولون كل من الشعار وهدية الانضمام (قيمة من
// قائمة مغلقة FAN_CLUB_COLOR_IDS فقط — لا نص حر إطلاقاً هنا لمنع أي حقن). أي حقل من الثلاثة اختياري
exports.updateSettings = async (req, res) => {
    try {
        const { name, emblemColorId, giftColorId } = req.body;
        const update = {};

        if (name !== undefined) {
            const trimmed = String(name || '').trim();
            if (trimmed.length > 13) {
                return res.status(400).json({ status: 'fail', message: 'اسم النادي يجب ألا يتجاوز 13 حرفاً' });
            }
            update['fanClub.name'] = trimmed || null;
        }
        if (emblemColorId !== undefined) {
            if (!FAN_CLUB_COLOR_IDS.includes(emblemColorId)) {
                return res.status(400).json({ status: 'fail', message: 'لون غير صالح' });
            }
            update['fanClub.emblemColorId'] = emblemColorId;
        }
        if (giftColorId !== undefined) {
            if (!FAN_CLUB_COLOR_IDS.includes(giftColorId)) {
                return res.status(400).json({ status: 'fail', message: 'لون غير صالح' });
            }
            update['fanClub.giftColorId'] = giftColorId;
        }
        if (Object.keys(update).length === 0) {
            return res.status(400).json({ status: 'fail', message: 'لا يوجد ما يُحدَّث' });
        }

        const updated = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true }).select('fanClub');
        res.status(200).json({
            status: 'success',
            data: {
                clubName: updated.fanClub?.name || null,
                emblemColorId: updated.fanClub?.emblemColorId || 'pink',
                giftColorId: updated.fanClub?.giftColorId || 'pink'
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

// ✅ قائمة المعجبين VIP — الأعضاء مرتَّبون حسب مساهمتهم بالهدايا لصاحب النادي خلال الأسبوع
// الجاري فقط (يبدأ كل إثنين 00:00 UTC)، الأعلى أولاً. المساهمات والمراكز تُصفَّر تلقائياً كل
// أسبوع (لا حاجة لوظيفة مجدولة — الحساب مباشر من GiftLog بحدود التاريخ) لكن العضوية (وجود
// المستخدم بالنادي أصلاً) تبقى دائمة بلا أي تصفير
exports.getMembers = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const skip = Math.max(parseInt(req.query.skip) || 0, 0);
        const { start: weekStart, end: weekEnd } = getCurrentWeekRange();

        const [memberships, contributions] = await Promise.all([
            FanClubMembership.find({ owner: ownerId }).populate('member', 'username profileImage customId activeFrameClass'),
            GiftLog.aggregate([
                { $match: { receiver: new mongoose.Types.ObjectId(ownerId), createdAt: { $gte: weekStart, $lt: weekEnd } } },
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

        res.status(200).json({ status: 'success', data: { members, weekEndsAt: weekEnd.toISOString() } });
    } catch (error) {
        console.error('[FAN CLUB] getMembers error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ "نجم النادي الأسبوعي" — شارة دائمة تُمنح لمن حلّ بالمركز الأول بمساهمات نادٍ معيّن خلال
// الأسبوع الماضي المكتمل فعلياً (لا الأسبوع الجاري). تُحسب عند الطلب مباشرة من GiftLog بحدود
// تاريخ ثابتة (بلا حفظ أي سجل/وظيفة مجدولة) — بيانات الأسابيع الماضية لا تتغيّر، فالحساب
// المباشر يبقى صحيحاً للأبد ويتجنّب خطر تفويت تشغيل وظيفة مجدولة عند نهاية أسبوع ما.
// نمرّ فقط على النوادي التي هذا المستخدم عضو بها فعلاً (عدد محدود لكل مستخدم)
exports.getWeeklyWins = async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const ownerIds = await FanClubMembership.find({ member: userId }).distinct('owner');
        if (ownerIds.length === 0) {
            return res.status(200).json({ status: 'success', data: { wins: [] } });
        }
        const { start, end } = getLastWeekRange();
        const rows = await GiftLog.aggregate([
            { $match: { receiver: { $in: ownerIds }, createdAt: { $gte: start, $lt: end } } },
            { $group: { _id: { owner: '$receiver', sender: '$sender' }, total: { $sum: '$totalPrice' } } },
            { $sort: { total: -1, '_id.sender': 1 } },
            { $group: { _id: '$_id.owner', topSender: { $first: '$_id.sender' } } }
        ]);
        const winningOwnerIds = rows
            .filter(r => r.topSender.toString() === userId.toString())
            .map(r => r._id);
        if (winningOwnerIds.length === 0) {
            return res.status(200).json({ status: 'success', data: { wins: [] } });
        }
        const owners = await User.find({ _id: { $in: winningOwnerIds } }).select('username profileImage');
        res.status(200).json({
            status: 'success',
            data: {
                wins: owners.map(o => ({ ownerId: o._id, ownerUsername: o.username, ownerProfileImage: o.profileImage }))
            }
        });
    } catch (error) {
        console.error('[FAN CLUB] getWeeklyWins error:', error);
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
