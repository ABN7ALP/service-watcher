const mongoose = require('mongoose');

// ✅ سجل Idempotency لكل رسالة دُفعة كومبو (مفتاح: senderId:comboId:seq) — يُستخدم من
// معالج Socket.IO الجديد gift:combo (راجع server/services/socketService.js) لمنع تكرار
// الخصم لو أعاد العميل إرسال نفس الرسالة بالضبط بعد انقطاع شبكة قبل استلام تأكيد الرد (ack):
// إعادة محاولة تحمل نفس comboId+seq تجد هذا السجل موجوداً فتُرجع نفس balanceAfter المخزَّن
// بدل تنفيذ الخصم مرة ثانية. TTL 24 ساعة — لا حاجة لحفظه أطول من نافذة إعادة المحاولة الواقعية
const giftComboTxSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    comboId: { type: String, required: true },
    seq: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 }
});

module.exports = mongoose.model('GiftComboTx', giftComboTxSchema);
