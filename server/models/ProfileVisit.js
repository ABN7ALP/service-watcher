// ✅ سجل زيارات الملف الشخصي — حدث خام لكل مشاهدة (لا يُدمَج تلقائياً)، يُستخدم لحساب
// "المشاهدات" (كل الأحداث) و"الزوّار" (عدد مميَّز) منفصلين، وتوزيع يومي لقائمة الزوّار
const mongoose = require('mongoose');

const profileVisitSchema = new mongoose.Schema({
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    visited: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    visitedAt: { type: Date, default: Date.now }
});

profileVisitSchema.index({ visited: 1, visitedAt: -1 });

module.exports = mongoose.model('ProfileVisit', profileVisitSchema);
