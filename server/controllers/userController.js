// ملف: server/controllers/userController.js

const mongoose = require('mongoose');
const User = require('../models/User');
const ProfileVisit = require('../models/ProfileVisit');
const Poke = require('../models/Poke');
const { cloudinary, deleteFromCloudinary, getPublicIdFromUrl, assertRealType } = require('../utils/cloudinary');

// ✅ يسجّل زيارة ملف شخصي (حدث خام لكل مشاهدة) — بتهدئة بسيطة: لا يُسجَّل حدث جديد لنفس
// الزائر لنفس الشخص خلال 5 دقائق (يمنع تضخيم "المشاهدات" من فتح/إغلاق سريع متكرر أو إساءة
// استخدام متعمَّدة)؛ لا يُسجَّل إطلاقاً لو كان الزائر هو صاحب الملف نفسه. لا يُفشل الطلب
// الأصلي أبداً حتى لو حدث خطأ هنا — مجرد إحصائية جانبية، ليست جوهر الاستجابة
async function recordProfileVisit(visitorId, visitedId) {
    if (!visitorId || visitorId === visitedId) return;
    try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recent = await ProfileVisit.findOne({ visitor: visitorId, visited: visitedId, visitedAt: { $gte: fiveMinAgo } }).select('_id').lean();
        if (recent) return;
        await ProfileVisit.create({ visitor: visitorId, visited: visitedId });
    } catch (error) {
        console.error('[PROFILE VISIT] Failed to record:', error);
    }
}

// --- تعريف الدوال أولاً ---

const updateUsername = async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ status: 'fail', message: 'اسم المستخدم مطلوب.' });
        }
        const updatedUser = await User.findByIdAndUpdate(req.user.id, { username }, { new: true, runValidators: true });
        res.status(200).json({ status: 'success', data: { user: updatedUser } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ أثناء تحديث اسم المستخدم.' });
    }
};

const updateProfilePicture = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'الرجاء اختيار ملف صورة.' });
        }

        // 🛡️ التحقق من المحتوى الفعلي للملف قبل رفعه (لا من الترويسة القابلة للتزوير)
        try {
            assertRealType(req.file.buffer, ['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
        } catch (typeErr) {
            return res.status(400).json({ status: 'fail', message: typeErr.message });
        }

        const user = await User.findById(req.user.id);
        if (user.profileImage && user.profileImage.includes('cloudinary')) {
            const oldPublicId = getPublicIdFromUrl(user.profileImage);
            if (oldPublicId) {
                await deleteFromCloudinary(oldPublicId);
            }
        }

        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'battle_platform_users',
                    public_id: req.user.id,
                    overwrite: true,
                    format: 'webp',
                    transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }]
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            uploadStream.end(req.file.buffer);
        });

        const updatedUser = await User.findByIdAndUpdate(req.user.id, { profileImage: result.secure_url }, { new: true });
        res.status(200).json({ status: 'success', data: { user: updatedUser } });

    } catch (error) {
        console.error("Error in updateProfilePicture:", error);
        res.status(500).json({ status: 'error', message: 'فشل رفع الصورة.' });
    }
};

// 🛡️ حقول عامة فقط لملف شخصي يعرضه *غيره* — لا نُرجع البريد/الرصيد/الكوينز/سبب الحظر/رقم
// واتساب الوكيل/قائمة المحظورين... إلخ لأي زائر لملف مستخدم آخر. كانت findById السابقة تُرجع
// المستند كاملاً بلا أي تصفية (عدا كلمة المرور المستثناة أصلاً بـselect:false على مستوى
// السكيما) — ثغرة تسريب بيانات حقيقية أُصلحت هنا؛ بيانات المستخدم الكاملة لنفسه تبقى متاحة
// فقط عبر getMeDetails (مُقيَّدة بـreq.user.id أصلاً)
const PUBLIC_PROFILE_FIELDS = 'username customId profileImage coverImage gender birthDate hometown location socialLinks education job level experience status socialStatus educationStatus activeFrameClass isAgent isBot friends followers following showVipBadge showWallet createdAt';

const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select(PUBLIC_PROFILE_FIELDS);
        if (!user) {
            return res.status(404).json({ status: 'fail', message: 'لم يتم العثور على المستخدم.' });
        }
        const requesterId = req.user?.id;
        const obj = user.toObject();
        const isFollowing = !!(requesterId && user.followers.some(f => f.toString() === requesterId));
        await recordProfileVisit(requesterId, req.params.id); // ✅ يسجّل الزيارة قبل الرد (تهدئة 5 دقائق داخلية، ولا يفشل الطلب أبداً)
        res.status(200).json({
            status: 'success',
            data: {
                user: {
                    ...obj,
                    friendsCount: obj.friends.length,
                    followersCount: obj.followers.length,
                    followingCount: obj.following.length,
                    isFollowing,
                    friends: undefined, followers: undefined, following: undefined // ✅ الأعداد فقط تُرسَل، لا قوائم معرّفات المستخدمين الآخرين بالكامل
                }
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم.' });
    }
};

// --- ✅ هذه هي الدالة التي أضفناها مؤخرًا ---
const getMeDetails = async (req, res) => {
    try {
        // ✅ فحص وإزالة الإطار تلقائياً إذا انتهت صلاحيته، في كل استدعاء لبيانات المستخدم
        const { checkAndExpireActiveFrame } = require('./frameController');
        const rawUser = await User.findById(req.user.id);
        await checkAndExpireActiveFrame(rawUser);

        const user = await User.findById(req.user. id)
            .populate('friends', 'username profileImage customId level')
            .populate('friendRequestsReceived', 'username profileImage customId')
            .populate('friendRequestsSent', 'username profileImage customId');

        res.status(200).json({
            status: 'success',
            data:  {
                user: {
                    ... user. toObject(),
                    // ✅ إضافة عدد الأصدقاء بصيغة محسنة
                    friendsStats: {
                        totalFriends:  user.friends.length,
                        // ✅ صيغ مختلفة لعرض العدد
                        displayText: user.friends.length === 0 
                            ? 'لا توجد أصدقاء' 
                            : user.friends.length === 1 
                            ? '1 صديق'
                            : user.friends.length <= 10
                            ? `${user.friends.length} أصدقاء`
                            : user.friends.length
                    },
                    pendingRequests: user.friendRequestsReceived.length,
                    sentRequests: user.friendRequestsSent.length
                }
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message:  'خطأ في الخادم.' });
    }
};

// ✅ دالة جديدة لجلب بيانات الملف الشخصي المصغر
const getUserMiniProfile = async (req, res) => {
    try {
        const currentUserId = req.user?. id;
        const targetUserId = req.params.id;

            const user = await User.findById(targetUserId)
            .select('username profileImage customId level friends isAgent activeFrameClass isBot')
            .populate('friends', '_id');

        if (!user) {
            return res.status(404).json({ status: 'fail', message: 'لم يتم العثور على المستخدم.' });
        }

        // التحقق من حالة الصداقة
        const areFriends = currentUserId && user.friends.some(f => f._id.toString() === currentUserId);

                res.status(200).json({
            status: 'success',
            data: {
                id:  user._id,
                username: user.username,
                profileImage: user.profileImage,
                customId: user.customId,
                level: user.level,
                friendsCount: user.friends.length,
                areFriends: areFriends || false,
                isAgent: user.isAgent,
                activeFrameClass: user.activeFrameClass,
                isBot: user.isBot || false
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم.' });
    }
};

// =====================================================
// ✅ رفع غلاف الملف الشخصي — نفس نمط رفع الصورة الشخصية بالضبط (تحقق فعلي من نوع الملف
// بالبايتات، حذف الغلاف القديم من Cloudinary قبل رفع الجديد)
// =====================================================
const updateCoverImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'الرجاء اختيار ملف صورة.' });
        }
        try {
            assertRealType(req.file.buffer, ['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
        } catch (typeErr) {
            return res.status(400).json({ status: 'fail', message: typeErr.message });
        }

        const user = await User.findById(req.user.id);
        if (user.coverImage && user.coverImage.includes('cloudinary')) {
            const oldPublicId = getPublicIdFromUrl(user.coverImage);
            if (oldPublicId) await deleteFromCloudinary(oldPublicId);
        }

        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'battle_platform_user_covers',
                    public_id: req.user.id,
                    overwrite: true,
                    format: 'webp',
                    transformation: [{ width: 640, height: 260, crop: 'fill' }]
                },
                (error, uploaded) => { if (error) reject(error); else resolve(uploaded); }
            );
            uploadStream.end(req.file.buffer);
        });

        const updatedUser = await User.findByIdAndUpdate(req.user.id, { coverImage: result.secure_url }, { new: true });
        res.status(200).json({ status: 'success', data: { user: updatedUser } });
    } catch (error) {
        console.error('Error in updateCoverImage:', error);
        res.status(500).json({ status: 'error', message: 'فشل رفع صورة الغلاف.' });
    }
};

// =====================================================
// ✅ تحديث موحَّد لبيانات مركز الملف الشخصي — كل حقل اختياري (يُحدَّث فقط لو أُرسل)، وكل
// قيمة تُنظَّف وتُتحقَّق صراحة قبل الحفظ (لا نثق بأي شكل قادم من الواجهة مهما بدا سليماً)
// =====================================================
const updateProfile = async (req, res) => {
    try {
        const { status, birthDate, gender, hometown, location, socialLinks, education, job, showVipBadge, showWallet } = req.body;
        const updates = {};

        if (status !== undefined) {
            const clean = String(status).trim();
            if (!clean || clean.length > 100) {
                return res.status(400).json({ status: 'fail', message: 'الحالة يجب أن تكون بين 1 و100 حرف' });
            }
            updates.status = clean;
        }
        if (birthDate !== undefined) {
            const d = new Date(birthDate);
            const minDate = new Date(); minDate.setFullYear(minDate.getFullYear() - 100);
            const maxDate = new Date(); maxDate.setFullYear(maxDate.getFullYear() - 10); // 🛡️ سقف أدنى 10 سنوات يمنع تواريخ عبثية
            if (isNaN(d.getTime()) || d < minDate || d > maxDate) {
                return res.status(400).json({ status: 'fail', message: 'تاريخ ميلاد غير صالح' });
            }
            updates.birthDate = d;
        }
        if (gender !== undefined) {
            if (!['male', 'female'].includes(gender)) {
                return res.status(400).json({ status: 'fail', message: 'جنس غير صالح' });
            }
            updates.gender = gender;
        }
        if (hometown !== undefined) updates.hometown = String(hometown).trim().slice(0, 40);
        if (location !== undefined) updates.location = String(location).trim().slice(0, 40);
        if (socialLinks && typeof socialLinks === 'object') {
            updates.socialLinks = {
                instagram: String(socialLinks.instagram || '').trim().slice(0, 60),
                youtube: String(socialLinks.youtube || '').trim().slice(0, 60),
                tiktok: String(socialLinks.tiktok || '').trim().slice(0, 60)
            };
        }
        if (Array.isArray(education)) {
            updates.education = education.slice(0, 10).map(e => ({
                institution: String(e?.institution || '').trim().slice(0, 80),
                period: String(e?.period || '').trim().slice(0, 30)
            })).filter(e => e.institution);
        }
        if (job && typeof job === 'object') {
            updates.job = {
                title: String(job.title || '').trim().slice(0, 50),
                company: String(job.company || '').trim().slice(0, 50),
                from: String(job.from || '').trim().slice(0, 20),
                to: String(job.to || '').trim().slice(0, 20)
            };
        }
        if (showVipBadge !== undefined) updates.showVipBadge = !!showVipBadge;
        if (showWallet !== undefined) updates.showWallet = !!showWallet;

        const updatedUser = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true });
        res.status(200).json({ status: 'success', data: { user: updatedUser } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ أثناء تحديث الملف الشخصي' });
    }
};

// --- ✅ دالة جديدة: تحديث الحالة النصية ---
const updateStatus = async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!status || status.length > 100) {
            return res.status(400).json({ 
                status: 'fail', 
                message: 'الحالة يجب أن تكون بين 1 و100 حرف' 
            });
        }
        
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { status },
            { new: true, runValidators: true }
        );
        
        res.status(200).json({ 
            status: 'success', 
            data: { user: updatedUser } 
        });
        
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'حدث خطأ أثناء تحديث الحالة' 
        });
    }
};


// =====================================================
// ✅ متابعة/إلغاء متابعة شخص — أحادية الاتجاه (منفصلة تماماً عن نظام الصداقة friends،
// ومنفصلة عن متابعة الغرف بـVoiceRoom.followers). يُحدّث الطرفين معاً (followers/following)
// =====================================================
const followUser = async (req, res) => {
    try {
        const targetId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف مستخدم غير صالح' });
        }
        if (targetId === req.user.id) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكنك متابعة نفسك' });
        }
        const target = await User.findByIdAndUpdate(targetId, { $addToSet: { followers: req.user.id } }, { new: true }).select('followers');
        if (!target) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        await User.findByIdAndUpdate(req.user.id, { $addToSet: { following: targetId } });
        res.status(200).json({ status: 'success', data: { followersCount: target.followers.length, isFollowing: true } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

const unfollowUser = async (req, res) => {
    try {
        const targetId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف مستخدم غير صالح' });
        }
        const target = await User.findByIdAndUpdate(targetId, { $pull: { followers: req.user.id } }, { new: true }).select('followers');
        if (!target) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        await User.findByIdAndUpdate(req.user.id, { $pull: { following: targetId } });
        res.status(200).json({ status: 'success', data: { followersCount: target.followers.length, isFollowing: false } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ حقول بطاقة شخص واحد بقائمة متابعين/متابَعين — نفس الحقول المختصرة المستخدَمة بقائمة الاكتشاف
const FOLLOW_LIST_USER_FIELDS = 'username profileImage customId level activeFrameClass';

// =====================================================
// ✅ قائمة متابِعي شخص (من يتابعه) — كل صف يحمل isFollowedByMe (هل أنا أتابعه هو أيضاً؟)
// لعرض زر "متابعة رد" لمن لا أتابعهم بعد، بدل زر متابعة موحَّد لا يعكس الحالة الحقيقية
// =====================================================
const getFollowersList = async (req, res) => {
    try {
        const targetId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف مستخدم غير صالح' });
        }
        const [target, me] = await Promise.all([
            User.findById(targetId).select('followers').populate('followers', FOLLOW_LIST_USER_FIELDS),
            User.findById(req.user.id).select('following')
        ]);
        if (!target) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        const myFollowingSet = new Set((me?.following || []).map(String));
        const users = target.followers.map(u => ({
            _id: u._id, username: u.username, profileImage: u.profileImage, customId: u.customId,
            level: u.level, activeFrameClass: u.activeFrameClass,
            isFollowedByMe: myFollowingSet.has(u._id.toString())
        }));
        res.status(200).json({ status: 'success', data: { users } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// =====================================================
// ✅ قائمة من يتابعهم شخص معيّن
// =====================================================
const getFollowingList = async (req, res) => {
    try {
        const targetId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف مستخدم غير صالح' });
        }
        const [target, me] = await Promise.all([
            User.findById(targetId).select('following').populate('following', FOLLOW_LIST_USER_FIELDS),
            User.findById(req.user.id).select('following')
        ]);
        if (!target) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        const myFollowingSet = new Set((me?.following || []).map(String));
        const users = target.following.map(u => ({
            _id: u._id, username: u.username, profileImage: u.profileImage, customId: u.customId,
            level: u.level, activeFrameClass: u.activeFrameClass,
            isFollowedByMe: myFollowingSet.has(u._id.toString())
        }));
        res.status(200).json({ status: 'success', data: { users } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// =====================================================
// ✅ سجل زوّار ملفي الشخصي — إجمالي المشاهدات/الزوّار المميَّزين + نفس الشيء لليوم + توزيع
// يومي (عدد الزوّار المميَّزين لكل يوم، آخر 30 يوماً) — لقسم "الزوّار" بمركز الملف الشخصي
// =====================================================
const getMyProfileVisits = async (req, res) => {
    try {
        const myId = new mongoose.Types.ObjectId(req.user.id);
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const [totalViews, totalVisitorIds, todayViews, todayVisitorIds, dailyGroups, todayPokes, recentVisitorGroups] = await Promise.all([
            ProfileVisit.countDocuments({ visited: myId }),
            ProfileVisit.distinct('visitor', { visited: myId }),
            ProfileVisit.countDocuments({ visited: myId, visitedAt: { $gte: startOfToday } }),
            ProfileVisit.distinct('visitor', { visited: myId, visitedAt: { $gte: startOfToday } }),
            ProfileVisit.aggregate([
                { $match: { visited: myId } },
                { $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$visitedAt' } },
                    visitors: { $addToSet: '$visitor' }
                } },
                { $sort: { _id: -1 } },
                { $limit: 30 }
            ]),
            Poke.countDocuments({ to: myId, createdAt: { $gte: startOfToday } }),
            // ✅ آخر الزوار (هوياتهم) — تُعرض ضبابية بالواجهة حتى يصل صاحب الملف للفل 3
            ProfileVisit.aggregate([
                { $match: { visited: myId } },
                { $group: { _id: '$visitor', lastVisitedAt: { $max: '$visitedAt' } } },
                { $sort: { lastVisitedAt: -1 } },
                { $limit: 20 },
                { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
                { $unwind: '$user' },
                { $project: {
                    userId: '$_id', username: '$user.username', profileImage: '$user.profileImage',
                    activeFrameClass: '$user.activeFrameClass', lastVisitedAt: 1
                } }
            ])
        ]);

        const myLevel = req.user.level || 1;
        const identityRevealed = myLevel >= 3;

        res.status(200).json({
            status: 'success',
            data: {
                totalViews,
                totalVisitors: totalVisitorIds.length,
                todayViews,
                todayVisitors: todayVisitorIds.length,
                todayPokes,
                dailyBreakdown: dailyGroups.map(g => ({ date: g._id, visitorsCount: g.visitors.length })),
                identityRevealed,
                recentVisitors: recentVisitorGroups.map(v => ({
                    userId: v.userId,
                    username: identityRevealed ? v.username : null,
                    profileImage: v.profileImage,
                    activeFrameClass: v.activeFrameClass,
                    lastVisitedAt: v.lastVisitedAt
                }))
            }
        });
    } catch (error) {
        console.error('[PROFILE VISITS] Error:', error);
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// ✅ "نكزة" — إشعار لحظي فوري إن كان الطرف متصلاً، ويُسجَّل دائماً بسجل Poke لحساب "نكز اليوم"
const pokeUser = async (req, res) => {
    try {
        const targetId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ status: 'fail', message: 'معرّف مستخدم غير صالح' });
        }
        if (targetId === req.user.id) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكنك نكز نفسك' });
        }
        const target = await User.findById(targetId).select('isOnline socketId');
        if (!target) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        if (req.io && target.isOnline && target.socketId) {
            req.io.to(target.socketId).emit('user-poked', { fromUserId: req.user.id, fromUsername: req.user.username, fromProfileImage: req.user.profileImage });
        }
        // ✅ يُسجَّل دائماً (متصل أو لا) — مصدر عدّاد "نكز اليوم" بمركز الملف الشخصي؛ لا يُفشل الطلب أبداً
        Poke.create({ from: req.user.id, to: targetId }).catch(err => console.error('[POKE] Failed to record:', err));
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

// =====================================================
// ✅ اكتشاف أشخاص — اقتراحات متابعة بسيطة: عيّنة عشوائية تستبعد نفسي وأصدقائي ومن أتابعهم
// أصلاً ومن حظرت/حظرني، وتستبعد البوت/المحظورين إدارياً. عشوائي بالكامل حالياً (لا خوارزمية
// "اهتمامات مشتركة" بعد) — كافٍ كبداية حقيقية بدل شاشة فارغة
// =====================================================
const discoverPeople = async (req, res) => {
    try {
        const me = await User.findById(req.user.id).select('friends blockedUsers blockedBy following');
        const excludeIds = [
            req.user.id,
            ...me.friends.map(String),
            ...me.blockedUsers.map(String),
            ...me.blockedBy.map(String),
            ...me.following.map(String)
        ].map(id => new mongoose.Types.ObjectId(id));

        const suggestions = await User.aggregate([
            { $match: { _id: { $nin: excludeIds }, isBot: { $ne: true }, isBanned: { $ne: true } } },
            { $sample: { size: 12 } },
            { $project: { username: 1, profileImage: 1, customId: 1, level: 1, gender: 1, activeFrameClass: 1 } }
        ]);

        res.status(200).json({ status: 'success', data: { users: suggestions } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'خطأ في الخادم' });
    }
};

const getOnlinePublicRoomUsers = async (req, res) => {
    try {
        const io = req.app.get('socketio');
        const room = io.sockets.adapter.rooms.get('public-room');
        const userIds = new Set();

        if (room) {
            for (const socketId of room) {
                const s = io.sockets.sockets.get(socketId);
                if (s?.user?.id) userIds.add(s.user.id.toString());
            }
        }
        userIds.delete(req.user.id.toString());

        const users = await User.find({ _id: { $in: Array.from(userIds) } })
            .select('username profileImage activeFrameClass');

        res.status(200).json({ status: 'success', data: { users } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// --- ✅✅ التصدير الصحيح في النهاية ---
module.exports = {
    updateUsername,
    updateProfilePicture,
    updateCoverImage,
    updateProfile,
    getUserById, // ✅ تصدير الدالة التي كانت موجودة
    getMeDetails,
    getUserMiniProfile,
    getOnlinePublicRoomUsers,
    updateStatus,
    followUser,
    unfollowUser,
    getMyProfileVisits,
    pokeUser,
    discoverPeople,
    getFollowersList,
    getFollowingList
};
