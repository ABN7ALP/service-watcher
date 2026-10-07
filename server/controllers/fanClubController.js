// ملف: server/controllers/fanClubController.js
//
// ✅ نظام "نادي المعجبين" — أُعيد بناؤه بالكامل على غرار الآلية الحقيقية بتطبيقات البث
// المباشر المشهورة (Bigo Live Fan Group وTikTok LIVE Fan Club): مستوى معجب تراكمي دائم
// (1-20) لكل علاقة (معجب↔صاحب نادٍ) مبني على "نقاط معجب" حقيقية — كوينز الهدايا بمعدّل 1:1
// بالإضافة لمكافآت مهام يومية (حضور/دردشة/هدية اليوم) ومكافأة متابعة لمرة واحدة. تصميم
// الشارة (الفئة/التدرّج اللوني) يُحدَّد تلقائياً من المستوى — ليس تخصيصاً حراً لصاحب النادي.
// الانضمام تلقائي أيضاً عند أول هدية حقيقية تُرسَل لصاحب نادٍ (بلا زر انضمام صريح مطلوب) —
// نفس آلية "Heart Me" بـTikTok — مع إبقاء زر الانضمام الصريح كطريق أسرع مقابل كوينز رمزي واحد
const mongoose = require('mongoose');
const User = require('../models/User');
const Gift = require('../models/Gift');
const GiftLog = require('../models/GiftLog');
const FanClubMembership = require('../models/FanClubMembership');
const { computeFanLevelInfo } = require('../utils/fanClubLevels');

const JOIN_PRICE = 1; // ✅ سعر ثابت للانضمام الصريح — منفصل تماماً عن سعر الوردة الحقيقي بمتجر الهدايا العام

// ✅ قائمة الألوان المغلقة المشتركة بين شعار النادي وهدية الانضمام — نفس القيم المسموحة
// بـUser.fanClub.emblemColorId/giftColorId (enum). الوردة/الشعار نفسهما دوماً؛ اللون فقط
// يتبدّل (يُطبَّق بفلتر CSS بالعميل، بلا أي صور مرفوعة من المستخدم) — هوية بصرية عامة للنادي
// يختارها صاحبه، منفصلة تماماً عن شارة مستوى كل معجب (محسوبة تلقائياً، غير قابلة للتخصيص)
const FAN_CLUB_COLOR_IDS = ['pink', 'yellow', 'purple', 'blue', 'orange'];

// ✅ قيم مكافآت المهام اليومية/لمرة واحدة — أرقام صغيرة مقصودة (مقارنة بعتبات المستويات
// المبنية أساساً على كوينز الهدايا الحقيقية) كي تبقى حافزاً إضافياً لا مساراً بديلاً للسخاء
const DAILY_CHECKIN_BONUS = 15;
const DAILY_CHAT_BONUS = 20;
const DAILY_GIFT_BONUS = 25;
const FOLLOW_BONUS = 50;

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

// ✅ حدود "الأسبوع" الثابتة لميزة "نجم الأسبوع" الإضافية (منفصلة عن مستوى المعجب التراكمي
// الدائم أعلاه) — تبدأ كل إثنين 00:00 UTC، تُستخدم فقط لتحديد المتصدّر الحالي حياً بجانب
// صورة صاحب النادي، وشارة "نجم النادي الأسبوعي" الدائمة لصاحب المركز الأول بالأسبوع الماضي
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
// ✅ مُصدَّرتان لإعادة استخدامهما بـfanClubWeeklyFrameJob.js (منح إطار المساهم) بلا تكرار للمنطق
exports.currentWeekStartUTC = currentWeekStartUTC;
exports.getLastWeekRange = getLastWeekRange;

// ✅ يحسب صاحب أعلى مساهمة (هدايا) لمالك نادٍ معيّن خلال فترة زمنية معطاة
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

// ✅ يبثّ احتفال "ارتقاء المستوى" للعضو فقط لو تجاوزت النقاط عتبة مستوى جديدة فعلياً —
// pointsBefore محسوبة حسابياً (pointsAfter - delta) بلا أي قراءة إضافية، فتبقى العملية ذرّية
async function notifyIfLeveledUp(io, ownerId, memberId, pointsAfter, delta) {
    if (!io || delta <= 0) return;
    const afterInfo = computeFanLevelInfo(pointsAfter);
    const beforeInfo = computeFanLevelInfo(pointsAfter - delta);
    if (afterInfo.level <= beforeInfo.level) return;
    try {
        const [owner, member] = await Promise.all([
            User.findById(ownerId).select('username'),
            User.findById(memberId).select('socketId')
        ]);
        if (member?.socketId) {
            io.to(member.socketId).emit('fanclub-level-up', {
                ownerId: ownerId.toString(),
                ownerUsername: owner?.username || '',
                newLevel: afterInfo.level,
                tierName: afterInfo.tierName,
                // ✅ levelInfo الكامل يسمح للعميل بتحديث بطاقة المستوى مكانياً فوراً (بلا إعادة
                // تحميل الورقة كاملة لجلبه عبر /summary من جديد — كان هو سبب "النافذة تعيد
                // التحميل عند كسب الهدية/الارتقاء" الذي طُلب إصلاحه)
                levelInfo: afterInfo
            });
        }
    } catch (error) {
        console.error('[FAN CLUB] notifyIfLeveledUp error:', error);
    }
}

// ✅ نقطة الدخول الرئيسية لمنح نقاط المعجب — تُستدعى من مسارات إرسال الهدايا (giftController)
// بمعدّل 1:1 مع الكوينز المُنفَقة. 🐛 إصلاح صريح: كانت تُنشئ عضوية تلقائياً عند أول هدية حتى
// لو لم ينضمّ المُرسِل أبداً عبر زر "انضمام" الصريح (joinFanClub) — فيظهر بقائمة أعضاء نادٍ
// لم يطلب الانضمام إليه إطلاقاً، بلا تفسير ("ليش انضممت تلقائياً؟"). الآن: الهدية تضيف نقاطاً
// فقط لعضوية موجودة فعلاً (انضم إليها صراحة من قبل) — لا تُنشئ عضوية جديدة أبداً من مجرد هدية.
// fire-and-forget دوماً من طرف المستدعي (لا يُوقف/يُبطئ استجابة إرسال الهدية أبداً)
async function awardFanPoints(io, ownerId, memberId, pointsDelta) {
    if (!ownerId || !memberId || String(ownerId) === String(memberId) || pointsDelta <= 0) return null;
    try {
        const membership = await FanClubMembership.findOneAndUpdate(
            { owner: ownerId, member: memberId },
            { $inc: { points: pointsDelta } },
            { new: true }
        );
        if (!membership) return null;

        // ✅ مكافأة "هدية اليوم" الثابتة — مرة واحدة يومياً بغضّ النظر عن قيمة/عدد الهدايا
        const todayStart = startOfTodayUTC();
        if (!membership.lastGiftCreditAt || membership.lastGiftCreditAt < todayStart) {
            const bonusResult = await FanClubMembership.findOneAndUpdate(
                { _id: membership._id, $or: [{ lastGiftCreditAt: null }, { lastGiftCreditAt: { $lt: todayStart } }] },
                { $inc: { points: DAILY_GIFT_BONUS }, $set: { lastGiftCreditAt: new Date() } },
                { new: true }
            );
            if (bonusResult) {
                membership = bonusResult;
                pointsDelta += DAILY_GIFT_BONUS;
            }
        }

        notifyIfLeveledUp(io, ownerId, memberId, membership.points, pointsDelta);
        return membership;
    } catch (error) {
        console.error('[FAN CLUB] awardFanPoints error:', error);
        return null;
    }
}
exports.awardFanPoints = awardFanPoints;

// ✅ مكافأة الدردشة اليومية بغرفة صاحب النادي — لا تُنشئ عضوية جديدة (الانضمام حصراً عبر
// هدية حقيقية أو زر الانضمام الصريح)، تُمنح فقط لعضو حالي بالنادي، مرة واحدة يومياً
async function creditDailyChat(io, ownerId, memberId) {
    if (!ownerId || !memberId || String(ownerId) === String(memberId)) return;
    try {
        const todayStart = startOfTodayUTC();
        const membership = await FanClubMembership.findOneAndUpdate(
            { owner: ownerId, member: memberId, $or: [{ lastChatCreditAt: null }, { lastChatCreditAt: { $lt: todayStart } }] },
            { $inc: { points: DAILY_CHAT_BONUS }, $set: { lastChatCreditAt: new Date() } },
            { new: true }
        );
        if (!membership) return;
        notifyIfLeveledUp(io, ownerId, memberId, membership.points, DAILY_CHAT_BONUS);
    } catch (error) {
        console.error('[FAN CLUB] creditDailyChat error:', error);
    }
}
exports.creditDailyChat = creditDailyChat;

// ✅ مكافأة متابعة صاحب النادي — لمرة واحدة فقط لكل علاقة (followBonusClaimed)، لا تُنشئ
// عضوية جديدة أيضاً (يجب أن يكون عضواً بالفعل)
async function creditFollowBonus(io, ownerId, memberId) {
    if (!ownerId || !memberId || String(ownerId) === String(memberId)) return;
    try {
        const membership = await FanClubMembership.findOneAndUpdate(
            { owner: ownerId, member: memberId, followBonusClaimed: false },
            { $inc: { points: FOLLOW_BONUS }, $set: { followBonusClaimed: true } },
            { new: true }
        );
        if (!membership) return;
        notifyIfLeveledUp(io, ownerId, memberId, membership.points, FOLLOW_BONUS);
    } catch (error) {
        console.error('[FAN CLUB] creditFollowBonus error:', error);
    }
}
exports.creditFollowBonus = creditFollowBonus;

exports.getSummary = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const [owner, memberCount, membership, currentLeader] = await Promise.all([
            User.findById(ownerId).select('username profileImage activeFrameClass fanClub'),
            FanClubMembership.countDocuments({ owner: ownerId }),
            FanClubMembership.findOne({ owner: ownerId, member: req.user.id }),
            computeTopContributor(ownerId, getCurrentWeekRange())
        ]);
        if (!owner) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });

        res.status(200).json({
            status: 'success',
            data: {
                ownerId,
                ownerUsername: owner.username,
                ownerProfileImage: owner.profileImage,
                ownerActiveFrameClass: owner.activeFrameClass || '',
                clubName: owner.fanClub?.name || null,
                emblemColorId: owner.fanClub?.emblemColorId || 'pink',
                giftColorId: owner.fanClub?.giftColorId || 'pink',
                isOwner: ownerId === req.user.id.toString(),
                memberCount,
                isMember: !!membership,
                // ✅ معلومات مستوى المعجب الخاصة بالمستخدم الحالي بهذا النادي تحديداً — null لو
                // لم ينضم بعد (الواجهة تعرض حينها دعوة انضمام بدل بطاقة المستوى)
                myLevelInfo: membership ? computeFanLevelInfo(membership.points) : null,
                joinPrice: JOIN_PRICE,
                // ✅ نجم الأسبوع الحالي (المتصدّر حياً بمساهمات هذا الأسبوع) — يظهر بجانب صورة
                // صاحب النادي ويتبدّل فوراً كلما تغيّر المتصدّر؛ ميزة إضافية منفصلة عن مستوى
                // المعجب التراكمي الدائم أعلاه
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
        // الكوينز المخصومة فوراً (لا يُعاقَب المستخدم على خطأ توقيت لا ذنب له فيه). نقاط الانضمام
        // تبدأ بقيمة سعر الانضمام نفسه (يطابق سجل GiftLog الرمزي أدناه)
        try {
            await FanClubMembership.create({ owner: ownerId, member: memberId, points: JOIN_PRICE });
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
            // 🛡️ الدلتا مشروطة بوجود "rose" فعلاً — هي فقط ما يُنشئ سجل GiftLog الذي يُحتسب
            // بمجموع مستوى الثروة؛ بلا هذا الشرط قد نبلّغ عن دلتا لم تُضَف فعلياً للمجموع الحقيقي
            const joinDelta = rose ? JOIN_PRICE : 0;
            broadcastSupportLevelUpdate(io, memberId, 'giving', joinDelta);
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

// ✅ "أعلى المعجبين" — الأعضاء مرتَّبون حسب نقاط المعجب التراكمية الدائمة بهذا النادي تحديداً
// (لا تُصفَّر أبداً)، الأعلى أولاً. القراءة الآن مباشرة من الحقل المُخزَّن (points) بدل تجميع
// GiftLog في كل طلب — أسرع بكثير، ومتوافق مع مصدر الحقيقة الوحيد لمستوى المعجب
exports.getMembers = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const skip = Math.max(parseInt(req.query.skip) || 0, 0);

        const memberships = await FanClubMembership.find({ owner: ownerId })
            .populate('member', 'username profileImage customId activeFrameClass')
            .sort({ points: -1 })
            .skip(skip)
            .limit(limit);

        const members = memberships
            .filter(m => m.member)
            .map(m => {
                const levelInfo = computeFanLevelInfo(m.points);
                return {
                    userId: m.member._id,
                    username: m.member.username,
                    profileImage: m.member.profileImage,
                    activeFrameClass: m.member.activeFrameClass,
                    joinedAt: m.createdAt,
                    points: m.points,
                    level: levelInfo.level,
                    tierName: levelInfo.tierName,
                    tierIcon: levelInfo.tierIcon,
                    tierGradient: levelInfo.tierGradient
                };
            });

        res.status(200).json({ status: 'success', data: { members } });
    } catch (error) {
        console.error('[FAN CLUB] getMembers error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ مهام المعجب اليومية — حالة العضو الحالي فقط بهذا النادي. "تسجيل الحضور" يدوي (زر مطالبة
// صريح)، وباقي المهام (دردشة/هدية اليوم/متابعة) تُمنح تلقائياً لحظة إتمامها من مسارات أخرى —
// هذا المسار للعرض فقط (حالة كل مهمة)
exports.getMissions = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        const memberId = req.user.id;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const membership = await FanClubMembership.findOne({ owner: ownerId, member: memberId });
        if (!membership) {
            return res.status(200).json({ status: 'success', data: { isMember: false, missions: [] } });
        }
        const todayStart = startOfTodayUTC();
        const claimedToday = (date) => !!date && date >= todayStart;

        res.status(200).json({
            status: 'success',
            data: {
                isMember: true,
                levelInfo: computeFanLevelInfo(membership.points),
                missions: [
                    { id: 'checkin', title: 'تسجيل الحضور اليومي', icon: 'fa-calendar-check', points: DAILY_CHECKIN_BONUS, claimed: claimedToday(membership.lastCheckInClaimedAt), manual: true, oneTime: false },
                    { id: 'chat', title: 'الدردشة في غرفة صاحب النادي', icon: 'fa-comments', points: DAILY_CHAT_BONUS, claimed: claimedToday(membership.lastChatCreditAt), manual: false, oneTime: false },
                    { id: 'gift', title: 'إرسال أي هدية اليوم', icon: 'fa-gift', points: DAILY_GIFT_BONUS, claimed: claimedToday(membership.lastGiftCreditAt), manual: false, oneTime: false },
                    { id: 'follow', title: 'متابعة صاحب النادي', icon: 'fa-heart', points: FOLLOW_BONUS, claimed: !!membership.followBonusClaimed, manual: false, oneTime: true }
                ]
            }
        });
    } catch (error) {
        console.error('[FAN CLUB] getMissions error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

exports.claimCheckIn = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        const memberId = req.user.id;
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        const todayStart = startOfTodayUTC();
        const membership = await FanClubMembership.findOneAndUpdate(
            {
                owner: ownerId, member: memberId,
                $or: [{ lastCheckInClaimedAt: null }, { lastCheckInClaimedAt: { $lt: todayStart } }]
            },
            { $inc: { points: DAILY_CHECKIN_BONUS }, $set: { lastCheckInClaimedAt: new Date() } },
            { new: true }
        );
        if (!membership) {
            const exists = await FanClubMembership.exists({ owner: ownerId, member: memberId });
            return res.status(400).json({ status: 'fail', message: exists ? 'سجّلت حضورك اليوم بالفعل' : 'انضم للنادي أولاً' });
        }
        const io = req.app.get('socketio');
        notifyIfLeveledUp(io, ownerId, memberId, membership.points, DAILY_CHECKIN_BONUS);
        res.status(200).json({
            status: 'success',
            data: { levelInfo: computeFanLevelInfo(membership.points), pointsGained: DAILY_CHECKIN_BONUS }
        });
    } catch (error) {
        console.error('[FAN CLUB] claimCheckIn error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ "نجم النادي الأسبوعي" — شارة دائمة تُمنح لمن حلّ بالمركز الأول بمساهمات نادٍ معيّن خلال
// الأسبوع الماضي المكتمل فعلياً (لا الأسبوع الجاري). تُحسب عند الطلب مباشرة من GiftLog بحدود
// تاريخ ثابتة (بلا حفظ أي سجل/وظيفة مجدولة) — بيانات الأسابيع الماضية لا تتغيّر، فالحساب
// المباشر يبقى صحيحاً للأبد. منفصلة تماماً عن مستوى المعجب التراكمي (ميزة "الأضواء" إضافية)
exports.getWeeklyWins = async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف غير صالح' });
        }
        // 🛡️ طلب صريح: إخفاء/إظهار شارات "نجم النادي الأسبوعي" يُفحَص بالخادم — لا تُرسَل
        // لأي زائر غير صاحبها نفسه لو اختار إخفاءها (لا تُخفى عن صاحبها أبداً)
        const isOwner = req.user?.id && req.user.id === userId;
        if (!isOwner) {
            const target = await User.findById(userId).select('fanClubBadgesVisible');
            if (target && target.fanClubBadgesVisible === false) {
                return res.status(200).json({ status: 'success', data: { wins: [] } });
            }
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
