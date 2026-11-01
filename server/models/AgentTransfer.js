const mongoose = require('mongoose');

// ✅ feat/agents-v1: سجل تحويل وكيل → مستخدم واحد. clientRequestId فريد لكل وكيل (لا عالمياً)
// يضمن التكرار الآمن (idempotency) — نفس الطلب المُعاد لا يُنفَّذ مرتين
const agentTransferSchema = new mongoose.Schema({
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
    agentUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    coins: { type: Number, required: true, min: 1 },
    clientRequestId: { type: String, required: true },
    // ✅ "راجع" (report) خلال 24 ساعة من المستلِم — queue منفصل تُحلّه الإدارة (status + note)
    report: {
        reportedAt: { type: Date, default: null },
        reason: { type: String, default: null, maxlength: 300 },
        status: { type: String, enum: ['none', 'open', 'resolved'], default: 'none' },
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        resolvedAt: { type: Date, default: null },
        resolutionNote: { type: String, default: null, maxlength: 300 }
    },
    rating: { type: Number, min: 1, max: 5, default: null },
    ratedAt: { type: Date, default: null }
}, { timestamps: true });

// ✅ فهرس تكرار آمن لكل وكيل (لا عالمياً — نفس clientRequestId لوكيلين مختلفين مسموح نظرياً،
// لكن فعلياً كل عميل يولّد UUID عشوائياً فلا تصادم حقيقي متوقَّع إطلاقاً)
agentTransferSchema.index({ agent: 1, clientRequestId: 1 }, { unique: true });
agentTransferSchema.index({ 'report.status': 1 });

module.exports = mongoose.model('AgentTransfer', agentTransferSchema);
