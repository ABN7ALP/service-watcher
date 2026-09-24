const PrivateMessage = require('../models/PrivateMessage');
const { deleteChatMedia } = require('./cloudinary');

// 🐛 إصلاح جوهري: سكيما PrivateMessage تحمل فهرس TTL أصلي (الحقل expiresAt، افتراضياً
// +12 ساعة من الإنشاء، expireAfterSeconds:0) يجعل MongoDB نفسه يحذف المستند تلقائياً من
// خلفنا — بينما كانت هذي المهمة تكتسح فقط الرسائل الأقدم من 24 ساعة. بما أن MongoDB يحذف
// المستند فعلياً عند 12 ساعة (أي قبل وصول عمر أي رسالة لـ24 ساعة بكثير)، فإن find() هنا لم
// تكن تعيد أي نتائج تقريباً أبداً — أي أن ملفات الوسائط على Cloudinary (صور/تسجيلات صوتية
// بالدردشة الخاصة) لم تكن تُحذف عملياً إطلاقاً، وتتراكم للأبد يتيمة بلا أي مرجع بقاعدة
// البيانات بعد اختفاء المستند. الحل: نكتسح الرسائل العادية بمهلة أقصر من TTL نفسها بهامش
// أمان كافٍ (10 ساعات < 12 ساعة) لضمان قراءة publicId وحذف الملف قبل أن يسبقنا MongoDB
const NORMAL_MEDIA_GRACE_MS = 10 * 60 * 60 * 1000; // 10 ساعات
// ✅ رسائل "محذوفة لدى الجميع" (صور/أصوات): تبقى بقاعدة البيانات 3 ساعات إضافية من لحظة
// الحذف لأغراض المراجعة/البلاغات (deleteMessage بـprivateChatController يمدّد expiresAt
// لهذي الرسائل لضمان عدم سبق TTL لهذا الاكتساح)
const DELETE_FOR_EVERYONE_GRACE_MS = 3 * 60 * 60 * 1000; // 3 ساعات

async function sweepBatch(query, label) {
    const expiredMessages = await PrivateMessage.find(query).limit(300);
    for (const msg of expiredMessages) {
        const publicId = msg.metadata?.publicId;
        if (publicId) {
            const resourceType = msg.type === 'image' ? 'image' : 'video'; // الصوت والفيديو يُخزنان كـ video بـ Cloudinary
            await deleteChatMedia(publicId, resourceType);
        }
    }
    if (expiredMessages.length > 0) {
        const ids = expiredMessages.map(m => m._id);
        await PrivateMessage.deleteMany({ _id: { $in: ids } });
        console.log(`🧹 [CLEANUP] (${label}) تم حذف ${expiredMessages.length} رسالة وملفاتها من Cloudinary`);
    }
}

async function sweepExpiredChatMedia() {
    try {
        await sweepBatch({
            'status.deletedForEveryone': true,
            'status.deletedForEveryoneAt': { $lte: new Date(Date.now() - DELETE_FOR_EVERYONE_GRACE_MS) }
        }, 'حذف للجميع بعد 3 ساعات');

        await sweepBatch({
            'status.deletedForEveryone': { $ne: true },
            createdAt: { $lte: new Date(Date.now() - NORMAL_MEDIA_GRACE_MS) }
        }, 'انتهاء صلاحية عادي');
    } catch (error) {
        console.error('[MEDIA CLEANUP JOB ERROR]', error);
    }
}

function startMediaCleanupJob() {
    sweepExpiredChatMedia(); // فحص فوري عند إقلاع السيرفر
    setInterval(sweepExpiredChatMedia, 10 * 60 * 1000); // ثم كل 10 دقائق
}

module.exports = { startMediaCleanupJob };
