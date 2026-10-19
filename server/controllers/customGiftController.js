const mongoose = require('mongoose');
const CustomGift = require('../models/CustomGift');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const SystemSettings = require('../models/SystemSettings');
const AdminLog = require('../models/AdminLog');
const { cloudinary, assertRealType, deleteFromCloudinary, getPublicIdFromUrl } = require('../utils/cloudinary');
const { sendBotMessage } = require('../utils/botMessenger');

const MAX_PENDING_PER_USER = 3;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ✅ طلب صريح (هدايا v2 — المرحلة 4): رفع Cloudinary حقيقي (نفس نمط updateProfilePicture
// بـuserController.js بالضبط) — تحويل/تصغير 256×256 webp يتم على جانب Cloudinary نفسه
// (transformation)، لا بمكتبة محلية (لا sharp مُستخدَمة فعلياً بأي مسار سيرفر حي بهذا المشروع
// — راجع البحث المسبق). يُستدعى قبل أي معاملة Mongo (ليست عملية قاعدة بيانات، لا معنى لتضمينها
// بمعاملة — فشلها لا يكلّف المستخدم شيئاً لأنه قبل أي خصم)
function uploadCustomGiftImage(buffer, ownerId) {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'custom_gifts',
                public_id: `${ownerId}_${Date.now()}`,
                overwrite: true,
                format: 'webp',
                transformation: [{ width: 256, height: 256, crop: 'fill' }]
            },
            (error, result) => (error ? reject(error) : resolve(result))
        );
        uploadStream.end(buffer);
    });
}

// ✅ إنشاء هدية مخصّصة — رفع الصورة أولاً، ثم معاملة Mongo ذرّية واحدة تجمع: فحص حدّ الهدايا
// المعلّقة (3 كحد أقصى، بنفس لقطة القراءة التي تمنع تسابق طلبين متزامنين من تجاوزه)، الخصم
// الذري لرسم التصميم (createCost من SystemSettings — أبداً من جسم الطلب)، إنشاء الوثيقة
// المعلّقة، وقيد دفتر الأستاذ (Transaction). فشل أي خطوة يُسقِط كل شيء بلا خصم جزئي أبداً
exports.createCustomGift = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'يرجى اختيار صورة للهدية' });
        }
        const name = (req.body.name || '').trim();
        if (!name) {
            return res.status(400).json({ status: 'fail', message: 'يرجى إدخال اسم للهدية' });
        }
        if (name.length > 12) {
            return res.status(400).json({ status: 'fail', message: 'اسم الهدية يجب ألا يتجاوز 12 حرفاً' });
        }

        try {
            assertRealType(req.file.buffer, ALLOWED_TYPES);
        } catch (typeErr) {
            return res.status(400).json({ status: 'fail', message: typeErr.message });
        }

        const userId = req.user.id;
        const settings = await SystemSettings.getSettings();
        const createCost = settings.customGiftDesignFeeCoins;
        const sendPrice = settings.customGiftSendPriceCoins;

        let uploadResult;
        try {
            uploadResult = await uploadCustomGiftImage(req.file.buffer, userId);
        } catch (uploadErr) {
            console.error('[ERROR] custom gift image upload failed:', uploadErr);
            return res.status(500).json({ status: 'fail', message: 'تعذّر رفع الصورة، حاول مجدداً' });
        }

        const session = await mongoose.startSession();
        let created = null;
        let newCoins = null;
        try {
            await session.withTransaction(async () => {
                const pendingCount = await CustomGift.countDocuments({ owner: userId, status: 'pending' }).session(session);
                if (pendingCount >= MAX_PENDING_PER_USER) {
                    throw Object.assign(new Error(`لديك بالفعل ${MAX_PENDING_PER_USER} هدايا قيد المراجعة — انتظر مراجعتها أولاً`), { code: 'PENDING_LIMIT' });
                }

                const updatedUser = await User.findOneAndUpdate(
                    { _id: userId, coins: { $gte: createCost } },
                    { $inc: { coins: -createCost } },
                    { new: true, session }
                );
                if (!updatedUser) {
                    const sender = await User.findById(userId).select('coins').session(session);
                    throw Object.assign(new Error(`رصيد الكوينز غير كافٍ (تحتاج ${createCost} كوينز لتصميم هدية)`), {
                        code: 'INSUFFICIENT', balance: sender ? sender.coins : 0, needed: createCost
                    });
                }
                newCoins = updatedUser.coins;

                const docs = await CustomGift.create([{
                    owner: userId, name, imageUrl: uploadResult.secure_url,
                    createCost, sendPrice, status: 'pending'
                }], { session });
                created = docs[0];

                await Transaction.create([{
                    user: userId, type: 'custom_gift_fee', amount: createCost, currency: 'coins',
                    status: 'completed', description: `رسم تصميم هدية مخصّصة: ${name}`, processedAt: new Date()
                }], { session });
            });
        } catch (txError) {
            // ✅ الصورة رُفعت بالفعل لـCloudinary خارج هذي المعاملة — فشل المعاملة (رصيد غير
            // كافٍ أو تجاوز الحد) يجب ألا يترك صورة يتيمة بلا أي وثيقة تُشير إليها
            await deleteFromCloudinary(uploadResult.public_id);
            if (txError.code === 'INSUFFICIENT') {
                return res.status(400).json({ status: 'fail', code: 'INSUFFICIENT', message: txError.message, balance: txError.balance, needed: txError.needed });
            }
            if (txError.code === 'PENDING_LIMIT') {
                return res.status(400).json({ status: 'fail', code: 'PENDING_LIMIT', message: txError.message });
            }
            throw txError;
        } finally {
            await session.endSession();
        }

        res.status(201).json({
            status: 'success',
            message: 'تم الدفع — الهدية قيد المراجعة',
            data: { customGift: created, newCoins }
        });
    } catch (error) {
        console.error('[ERROR] in createCustomGift:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ===== لوحة التحكم =====
exports.adminListCustomGifts = async (req, res) => {
    try {
        const { status } = req.query;
        const query = {};
        if (status && status !== 'all') query.status = status;

        const customGifts = await CustomGift.find(query)
            .populate('owner', 'username profileImage customId')
            .sort('-createdAt')
            .limit(200);

        res.status(200).json({ status: 'success', data: { customGifts } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// 🛡️ إصلاح جذري (مراجعة PR #109 — بند 1 BLOCKER): النسخة السابقة كانت تقرأ status، تسترد
// الرصيد، ثم تحفظ status لاحقاً — نافذة سباق حقيقية بين القراءة والحفظ. نقرة مزدوجة، أو مديران
// يرفضان بنفس اللحظة تقريباً، كلاهما يجد status='pending' فيسترد كلاهما الرسم (استرداد مزدوج
// فعلي). الآن: findOneAndUpdate({_id, status:'pending'}, {$set:{status,...}}) ذرّية واحدة داخل
// معاملة Mongo — "ادّعاء" الوثيقة والاسترداد (لو رفض) بنفس المعاملة، فيستحيل نجاح طلبين معاً.
// فشل الادّعاء (null — روجعت مسبقاً) يُرجع 409 فوراً بلا أي كتابة إطلاقاً. الإشعارات
// (socket/bot/AdminLog) تعمل بعد الالتزام (commit) فقط — best-effort، لا تُسقِط المراجعة نفسها
exports.adminReviewCustomGift = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, reason } = req.body; // action: 'approve' | 'reject'
        if (action !== 'approve' && action !== 'reject') {
            return res.status(400).json({ status: 'fail', message: 'إجراء غير صالح' });
        }
        const rejectReason = action === 'reject' ? (reason || 'لم يُحدد سبب') : null;

        const session = await mongoose.startSession();
        let claim = null;
        let updatedOwner = null;
        try {
            await session.withTransaction(async () => {
                claim = await CustomGift.findOneAndUpdate(
                    { _id: id, status: 'pending' },
                    {
                        $set: {
                            status: action === 'approve' ? 'approved' : 'rejected',
                            rejectReason,
                            reviewedBy: req.admin._id,
                            reviewedAt: new Date()
                        }
                    },
                    { new: true, session }
                );
                if (!claim) {
                    throw Object.assign(new Error('تمت مراجعة هذي الهدية مسبقاً'), { code: 'ALREADY_REVIEWED' });
                }

                if (action === 'reject') {
                    // ✅ استرداد رسم التصميم ذرّياً بنفس المعاملة — نفس نمط reviewWithdrawal
                    updatedOwner = await User.findByIdAndUpdate(
                        claim.owner, { $inc: { coins: claim.createCost } }, { new: true, session }
                    );
                    await Transaction.create([{
                        user: claim.owner, type: 'custom_gift_refund', amount: claim.createCost, currency: 'coins',
                        status: 'completed', description: `استرداد رسم تصميم هدية مرفوضة: ${claim.name}`,
                        processedBy: req.admin._id, processedAt: new Date()
                    }], { session });
                }
            });
        } catch (txError) {
            if (txError.code === 'ALREADY_REVIEWED') {
                return res.status(409).json({ status: 'fail', message: txError.message });
            }
            throw txError;
        } finally {
            await session.endSession();
        }

        await AdminLog.logAction({
            admin: req.admin._id,
            action: action === 'approve' ? 'approve_custom_gift' : 'reject_custom_gift',
            targetUser: claim.owner,
            targetEntity: 'gift',
            entityId: claim._id,
            details: { name: claim.name, reason: claim.rejectReason || null },
            severity: action === 'reject' ? 'warning' : 'info',
            ipAddress: req.ip
        });

        // ✅ بند 2: حذف صورة Cloudinary اليتيمة بعد الالتزام مباشرة — best effort صراحةً
        // (الهدية رُفضت واسُترد رسمها بالفعل، فشل الحذف هنا لا يستحق إفشال الاستجابة كلها)
        if (action === 'reject') {
            const publicId = getPublicIdFromUrl(claim.imageUrl);
            if (publicId) await deleteFromCloudinary(publicId);
        }

        const io = req.app.get('socketio');
        // ✅ لـreject: نفس وثيقة المالك المُحدَّثة بالفعل بالمعاملة (رصيد صحيح جاهز) — لا قراءة
        // إضافية. لـapprove: قراءة خفيفة فقط لـsocketId (لا تغيير رصيد إطلاقاً هنا)
        const owner = action === 'reject' ? updatedOwner : await User.findById(claim.owner).select('socketId');

        if (io && owner?.socketId) {
            if (action === 'reject') io.to(owner.socketId).emit('coinsUpdated', { newCoins: owner.coins });
            io.to(owner.socketId).emit('customGiftStatusUpdated', {
                customGiftId: claim._id, status: claim.status, reason: claim.rejectReason || null
            });
        }
        await sendBotMessage(io, claim.owner,
            action === 'approve'
                ? `✅ تمت الموافقة على هديتك المخصّصة "${claim.name}" — أصبحت قابلة للإرسال الآن!`
                : `❌ تم رفض هديتك المخصّصة "${claim.name}". السبب: ${claim.rejectReason}\nتم إرجاع رسم التصميم (${claim.createCost} كوينز) لرصيدك.`
        );

        res.status(200).json({ status: 'success', message: 'تم تحديث حالة الهدية', data: { customGift: claim } });
    } catch (error) {
        console.error('[ERROR] in adminReviewCustomGift:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};
