// ملف: server/models/Follow.js
// 🛡️ feat/follow-v2: مصدر الحقيقة الوحيد لعلاقة "متابعة" بين شخصين — تستبدل مصفوفتي
// User.followers/following (تبقيان للقراءة فقط، راجع models/User.js). "صديق" ليس حقلاً مخزَّناً
// إطلاقاً، بل مفهوم مُشتق: كلا الاتجاهين موجودان بهذي المجموعة (متابعة متبادلة) — لا نظام طلب/قبول.
const mongoose = require('mongoose');

const followSchema = new mongoose.Schema({
    follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    followee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
});

// ✅ يمنع متابعة مكرَّرة على مستوى قاعدة البيانات نفسها (ذرّياً) — follow() يعتمد عليه مباشرة
// (محاولة إنشاء ثانية لنفس الزوج تصطدم بـE11000 بدل فحص read-then-write عرضة للتسابق)
followSchema.index({ follower: 1, followee: 1 }, { unique: true });
// ✅ فهارس جهة واحدة — لاستعلامات "من يتابع فلاناً" (followee) و"من يتابعه فلان" (follower)
// بكل منهما مرتَّبة زمنياً (createdAt) للترقيم بالمؤشّر (cursor pagination)
followSchema.index({ followee: 1, createdAt: -1, _id: -1 });
followSchema.index({ follower: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('Follow', followSchema);
