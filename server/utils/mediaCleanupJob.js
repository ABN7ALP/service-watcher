const PrivateMessage = require('../models/PrivateMessage');
const { deleteChatMedia } = require('./cloudinary');

async function sweepExpiredChatMedia() {
    try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const expiredMessages = await PrivateMessage.find({ createdAt: { $lte: cutoff } }).limit(300);

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
            console.log(`🧹 [CLEANUP] تم حذف ${expiredMessages.length} رسالة (نص/وسائط) وملفاتها من Cloudinary`);
        }
    } catch (error) {
        console.error('[MEDIA CLEANUP JOB ERROR]', error);
    }
}

function startMediaCleanupJob() {
    sweepExpiredChatMedia(); // فحص فوري عند إقلاع السيرفر
    setInterval(sweepExpiredChatMedia, 10 * 60 * 1000); // ثم كل 10 دقائق
}

module.exports = { startMediaCleanupJob };
