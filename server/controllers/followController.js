// ملف: server/controllers/followController.js
// 🛡️ feat/follow-v2: يستبدل متابعة/إلغاء/قوائم Person-follow القديمة بـuserController.js (كانت
// تُحدِّث مصفوفتي User.followers/following بعمليتي findByIdAndUpdate منفصلتين تماماً — بلا أي
// معاملة، عرضة لعدّاد غير متطابق عند تزامن طلبات). المصدر الوحيد الآن مجموعة Follow (راجع
// models/Follow.js) + عدّادا followersCount/followingCount على User، يُحدَّثان ذرّياً بنفس
// معاملة Mongo التي تُنشئ/تحذف مستند Follow. "صديق" = متابعة متبادلة (كلا الاتجاهين موجودان).
const mongoose = require('mongoose');
const User = require('../models/User');
const Follow = require('../models/Follow');
const VoiceRoom = require('../models/VoiceRoom');

const PAGE_SIZE = 20;
const FOLLOW_LIST_USER_FIELDS = 'username profileImage customId level activeFrameClass';

function isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function encodeCursor(doc) {
    return Buffer.from(JSON.stringify({ t: new Date(doc.createdAt).getTime(), id: String(doc._id) })).toString('base64');
}

function decodeCursor(raw) {
    if (!raw || typeof raw !== 'string') return null;
    try {
        const obj = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
        if (!obj || typeof obj.t !== 'number' || !obj.id || !isValidId(obj.id)) return null;
        return { createdAt: new Date(obj.t), _id: new mongoose.Types.ObjectId(obj.id) };
    } catch {
        return null;
    }
}

function cursorMatch(cursor) {
    if (!cursor) return {};
    return { $or: [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }
    ] };
}

// 🛡️ مراجعة #147: كانت io.emit('follow-changed', ...) تبثّ لكل متصل بالمنصة — أي زائر يعرف من
// يتابع من لحظياً (تسريب خصوصية حقيقي). الحدث يخصّ طرفي العلاقة فقط، فيُرسَل حصراً لغرفتي
// Socket.IO الشخصيتين (`user:<id>`، ينضمّ لها كل اتصال تلقائياً — راجع socketService.js) بدل
// البث العام؛ كل طرف يستقبل تحديث عدّاده الخاص فقط، لا عدّاد الطرف الآخر معه
function broadcastFollowChanged(req, { targetId, targetFollowersCount, targetFriendsCount, followerId, followerFollowingCount, followerFriendsCount, isFollowing }) {
    const io = req.app.get('socketio');
    if (!io) return;
    const payload = { targetUserId: targetId, targetFollowersCount, targetFriendsCount, followerId, followerFollowingCount, followerFriendsCount, isFollowing };
    io.to(`user:${targetId}`).emit('follow-changed', payload);
    io.to(`user:${followerId}`).emit('follow-changed', payload);
}

// ✅ متابعة — ذرّية بالكامل: إنشاء مستند Follow + زيادة followersCount لدى المتابَع +
// followingCount لدى المتابِع، الثلاثة بنفس معاملة Mongo. فهرس Follow الفريد (follower,followee)
// هو الضمان الحقيقي عند تزامن طلبين (نفس نمط purchaseFrame — راجع frameController.race.test.js):
// أي محاولة ثانية تصطدم بتضارب كتابة فيُعاد تنفيذها تلقائياً (withTransaction)، فتكتشف الحافة
// موجودة فعلاً وتُرمى E11000 — نُعامِلها هنا كنجاح idempotent (لا زيادة عدّاد مضاعفة)
const followUser = async (req, res) => {
    try {
        const targetId = req.params.id;
        const myId = req.user.id;
        if (!isValidId(targetId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف مستخدم غير صالح' });
        }
        if (targetId === myId) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكنك متابعة نفسك' });
        }

        const targetExists = await User.exists({ _id: targetId });
        if (!targetExists) {
            return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        }

        const [targetBlockedMe, iBlockedTarget] = await Promise.all([
            User.exists({ _id: targetId, blockedUsers: myId }),
            User.exists({ _id: myId, blockedUsers: targetId })
        ]);
        if (targetBlockedMe || iBlockedTarget) {
            return res.status(403).json({ status: 'fail', message: 'لا يمكنك متابعة هذا المستخدم' });
        }

        let created = false;
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await Follow.create([{ follower: myId, followee: targetId }], { session });
                // 🛡️ ترتيب كتابة ثابت (معرّف أصغر نصّياً أولاً) بصرف النظر عن الدور (متابِع/متابَع) —
                // بدونه، A يتابع B وB يتابع A بنفس اللحظة يقفلان مستندَي بعضهما بترتيب معاكس
                // تماماً (هذا يتابَع-ثم-أنا مقابل ذاك يتابَع-ثم-أنا) فيُنتج تقفّلاً دورانياً (deadlock)
                // حقيقياً يُفشِل كلا الطلبين بدل أن ينجح أحدهما ببساطة بعد إعادة محاولة واحدة.
                // 🛡️ مراجعة #147 (تصحيح لاحق): هاتان الكتابتان تُنفَّذان *قبل* فحص reverseExists —
                // لا بعده كما كانت أول محاولة — لأنهما ما يُثبِت التسلسل الحقيقي مع المعاملة
                // المعاكسة (حجز قفلَي مستندَي الطرفين فعلياً). فحص الحافة المعاكسة بعد تأمين
                // القفلين يضمن عدم وجود أي نافذة تفوت فيها حافة الطرف الآخر التي تلتزم بالضبط
                // بين الفحص وكتابة العدّادات — أثبتَت أول محاولة (فحص قبل التأمين) فعلياً أنها
                // تسمح لمعاملة ثانية بالالتزام "خلسة" بين فحص الأولى وكتاباتها، فلا يُكتشَف
                // التبادل أبداً (راجع سجلّ الاختبار قبل هذا التصحيح)
                const sortedIds = [targetId, myId].sort((a, b) => String(a).localeCompare(String(b)));
                for (const id of sortedIds) {
                    const inc = id === targetId ? { followersCount: 1 } : { followingCount: 1 };
                    await User.updateOne({ _id: id }, { $inc: inc }, { session });
                }
                const reverseExists = await Follow.exists({ follower: targetId, followee: myId }).session(session);
                if (reverseExists) {
                    await User.updateOne({ _id: targetId }, { $inc: { friendsCount: 1 } }, { session });
                    await User.updateOne({ _id: myId }, { $inc: { friendsCount: 1 } }, { session });
                }
                created = true;
            });
        } catch (err) {
            if (err.code !== 11000) throw err;
            created = false; // ✅ متابَع فعلاً (تزامن) — idempotent، لا خطأ للعميل
        } finally {
            await session.endSession();
        }

        const [targetFresh, meFresh] = await Promise.all([
            User.findById(targetId).select('followersCount friendsCount'),
            User.findById(myId).select('followingCount friendsCount')
        ]);

        broadcastFollowChanged(req, {
            targetId, targetFollowersCount: targetFresh.followersCount, targetFriendsCount: targetFresh.friendsCount,
            followerId: myId, followerFollowingCount: meFresh.followingCount, followerFriendsCount: meFresh.friendsCount, isFollowing: true
        });

        if (created) {
            // ✅ مكافأة متابعة نادي المعجبين — لا تُنتظَر (fire-and-forget)، نفس استدعاء
            // userController.js القديم بالضبط؛ تُمنح مرّة واحدة فقط لكل علاقة (محسومة ذرّياً
            // داخل creditFollowBonus نفسها عبر followBonusClaimed)
            const io = req.app.get('socketio');
            const { creditFollowBonus } = require('./fanClubController');
            creditFollowBonus(io, targetId, myId);
        }

        res.status(200).json({ status: 'success', data: { followersCount: targetFresh.followersCount, isFollowing: true } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ إلغاء متابعة — ذرّية بالكامل أيضاً، idempotent: findOneAndDelete لا يجد شيئاً لو كانت
// الحافة محذوفة فعلاً (تزامن أو نقرة مزدوجة) فلا خصم عدّاد مضاعف
const unfollowUser = async (req, res) => {
    try {
        const targetId = req.params.id;
        const myId = req.user.id;
        if (!isValidId(targetId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف مستخدم غير صالح' });
        }

        const targetExists = await User.exists({ _id: targetId });
        if (!targetExists) {
            return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        }

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const deleted = await Follow.findOneAndDelete({ follower: myId, followee: targetId }, { session });
                if (!deleted) return;
                // 🛡️ نفس ترتيب الكتابة الثابت بـfollowUser (راجع الشرح هناك) — يمنع تقفّلاً دورانياً
                // عند إلغاء متابعتين متبادلتين بنفس اللحظة تقريباً، ويؤمّن قفلَي المستندَين *قبل*
                // فحص reverseExists أدناه (لا بعده) لنفس سبب followUser بالضبط
                const writes = [[targetId, { followersCount: -1 }, 'followersCount'], [myId, { followingCount: -1 }, 'followingCount']]
                    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
                for (const [id, dec, guardField] of writes) {
                    await User.updateOne({ _id: id, [guardField]: { $gt: 0 } }, { $inc: dec }, { session });
                }
                // 🛡️ مراجعة #147: هل هذي الحافة المحذوفة كانت نصف صداقة متبادلة؟ — بعد تأمين
                // القفلين أعلاه فقط (لا قبله). friendsCount لا يمكن أن يسبق followersCount أو
                // followingCount (لا يُزاد إلا حين يُزادان معاً) فشرط $gt:0 عليهما أعلاه يحمي
                // friendsCount أيضاً من أي قيمة سالبة بلا حاجة لشرط منفصل على كتابته هنا
                const reverseExists = await Follow.exists({ follower: targetId, followee: myId }).session(session);
                if (reverseExists) {
                    await User.updateOne({ _id: targetId }, { $inc: { friendsCount: -1 } }, { session });
                    await User.updateOne({ _id: myId }, { $inc: { friendsCount: -1 } }, { session });
                }
            });
        } finally {
            await session.endSession();
        }

        const [targetFresh, meFresh] = await Promise.all([
            User.findById(targetId).select('followersCount friendsCount'),
            User.findById(myId).select('followingCount friendsCount')
        ]);

        broadcastFollowChanged(req, {
            targetId, targetFollowersCount: targetFresh.followersCount, targetFriendsCount: targetFresh.friendsCount,
            followerId: myId, followerFollowingCount: meFresh.followingCount, followerFriendsCount: meFresh.friendsCount, isFollowing: false
        });

        res.status(200).json({ status: 'success', data: { followersCount: targetFresh.followersCount, isFollowing: false } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ يحسب حالة العلاقة بين الزائر (viewerId) وكل مستخدم بقائمة candidateIds — دفعة واحدة
// (لا استعلام لكل صف): amIFollowing (أتابعه) + followsMe (يتابعني) -> friend = الاثنان معاً.
// يُستخدَم بالثلاث قوائم (متابِعين/متابَعين/أصدقاء) لضمان نفس منطق الزر بكل مكان
async function getRelationStates(viewerId, candidateIds) {
    if (!viewerId || candidateIds.length === 0) return new Map();
    const [followingDocs, followerDocs] = await Promise.all([
        Follow.find({ follower: viewerId, followee: { $in: candidateIds } }).select('followee').lean(),
        Follow.find({ followee: viewerId, follower: { $in: candidateIds } }).select('follower').lean()
    ]);
    const amIFollowingSet = new Set(followingDocs.map(d => String(d.followee)));
    const followsMeSet = new Set(followerDocs.map(d => String(d.follower)));
    const map = new Map();
    for (const id of candidateIds) {
        const idStr = String(id);
        const amIFollowing = amIFollowingSet.has(idStr);
        const followsMe = followsMeSet.has(idStr);
        map.set(idStr, { amIFollowing, followsMe, isFriend: amIFollowing && followsMe });
    }
    return map;
}

async function hydrateUsers(ids) {
    const users = await User.find({ _id: { $in: ids } }).select(FOLLOW_LIST_USER_FIELDS).lean();
    const byId = new Map(users.map(u => [String(u._id), u]));
    return ids.map(id => byId.get(String(id))).filter(Boolean);
}

function buildRow(user, relation) {
    return {
        _id: user._id, username: user.username, profileImage: user.profileImage,
        customId: user.customId, level: user.level, activeFrameClass: user.activeFrameClass,
        relation: relation || { amIFollowing: false, followsMe: false, isFriend: false }
    };
}

// ✅ "يبثّون الآن" — فقط بأول صفحة (بلا cursor) من قائمة "متابَعين" لصاحب القائمة نفسه؛ يفحص
// الغرف الصوتية المباشرة فعلاً (isLive:true, status:'active') ويُبقي فقط من يتابعه viewerId —
// أسرع من قراءة قائمة متابَعين الكاملة (قد تبلغ مئات) ثم تقطيعها، لأن عدد الغرف المباشرة فعلياً
// بلحظة معيّنة محدود دوماً بصرف النظر عن حجم شبكة المتابعة
async function getLiveNowAmongFollowing(viewerId, limit = 10) {
    const viewerObjId = new mongoose.Types.ObjectId(viewerId);
    const rows = await VoiceRoom.aggregate([
        { $match: { isLive: true, status: 'active', isOfficial: { $ne: true } } },
        { $lookup: {
            from: 'follows',
            let: { hostId: '$host' },
            pipeline: [{ $match: { $expr: { $and: [
                { $eq: ['$follower', viewerObjId] },
                { $eq: ['$followee', '$$hostId'] }
            ] } } }],
            as: 'followEdge'
        } },
        { $match: { followEdge: { $ne: [] } } },
        { $limit: limit },
        { $lookup: { from: 'users', localField: 'host', foreignField: '_id', as: 'hostUser' } },
        { $unwind: '$hostUser' },
        { $project: {
            _id: '$hostUser._id', username: '$hostUser.username', profileImage: '$hostUser.profileImage',
            customId: '$hostUser.customId', level: '$hostUser.level', activeFrameClass: '$hostUser.activeFrameClass',
            roomId: '$_id', roomName: '$name', roomCoverImage: '$coverImage', roomIsPrivate: '$isPrivate'
        } }
    ]);
    return rows;
}

// ✅ معالج موحَّد للثلاث قوائم (followers/following/friends) — يحمل كل منطق الترقيم بالمؤشّر
// المشترك؛ friends تضيف فحص الاتجاه المعاكس (reverse lookup) فوق نفس الأساس لأنها مُشتقَّة
// (متابعة متبادلة)، لا مجموعة مخزَّنة مستقلة
async function buildPaginatedList({ req, res, type }) {
    const targetId = req.params.id;
    if (!isValidId(targetId)) {
        return res.status(400).json({ status: 'fail', message: 'معرّف مستخدم غير صالح' });
    }
    const targetExists = await User.exists({ _id: targetId });
    if (!targetExists) {
        return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
    }

    const cursor = decodeCursor(req.query.cursor);
    const viewerId = req.user?.id;
    const targetObjId = new mongoose.Types.ObjectId(targetId);

    let edges;
    if (type === 'friends') {
        edges = await Follow.aggregate([
            { $match: { follower: targetObjId, ...cursorMatch(cursor) } },
            { $sort: { createdAt: -1, _id: -1 } },
            { $lookup: {
                from: 'follows',
                let: { otherId: '$followee' },
                pipeline: [{ $match: { $expr: { $and: [
                    { $eq: ['$follower', '$$otherId'] },
                    { $eq: ['$followee', targetObjId] }
                ] } } }],
                as: 'reverse'
            } },
            { $match: { reverse: { $ne: [] } } },
            { $limit: PAGE_SIZE + 1 },
            { $project: { _id: 1, createdAt: 1, otherId: '$followee' } }
        ]);
    } else {
        const matchField = type === 'followers' ? 'followee' : 'follower';
        const otherField = type === 'followers' ? 'follower' : 'followee';
        const docs = await Follow.find({ [matchField]: targetObjId, ...cursorMatch(cursor) })
            .sort({ createdAt: -1, _id: -1 })
            .limit(PAGE_SIZE + 1)
            .select(`${otherField} createdAt`)
            .lean();
        edges = docs.map(d => ({ _id: d._id, createdAt: d.createdAt, otherId: d[otherField] }));
    }

    const hasMore = edges.length > PAGE_SIZE;
    const page = hasMore ? edges.slice(0, PAGE_SIZE) : edges;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;

    const otherIds = page.map(e => e.otherId);
    const [users, relations] = await Promise.all([
        hydrateUsers(otherIds),
        getRelationStates(viewerId, otherIds)
    ]);
    const rows = users.map(u => buildRow(u, relations.get(String(u._id))));

    const data = { users: rows, nextCursor };
    // ✅ "يبثّون الآن" — فقط بأول صفحة (بلا cursor)، وفقط بتبويب "متابَعين"، وفقط حين الزائر هو
    // صاحب القائمة نفسه (لا معنى لعرض "من يتابعه هو مباشر الآن" بملف مستخدم آخر)
    if (type === 'following' && !cursor && viewerId && viewerId === targetId) {
        data.liveNow = await getLiveNowAmongFollowing(viewerId);
    }

    res.status(200).json({ status: 'success', data });
}

const getFollowersList = (req, res) => buildPaginatedList({ req, res, type: 'followers' }).catch(() => res.status(500).json({ status: 'error', message: 'خطأ في الخادم' }));
const getFollowingList = (req, res) => buildPaginatedList({ req, res, type: 'following' }).catch(() => res.status(500).json({ status: 'error', message: 'خطأ في الخادم' }));
const getFriendsList = (req, res) => buildPaginatedList({ req, res, type: 'friends' }).catch(() => res.status(500).json({ status: 'error', message: 'خطأ في الخادم' }));

module.exports = {
    followUser, unfollowUser, getFollowersList, getFollowingList, getFriendsList,
    getRelationStates, PAGE_SIZE
};
