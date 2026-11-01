// ✅ feat/agents-v1: فئة الوكيل (bronze/silver/gold) — تصحيح يدوي (tierOverride) أو محسوبة
// تلقائياً من مجموع شحنات المخزون (AgentPurchase) آخر 30 يوماً: <200$ برونزي، 200-1000$ فضي،
// >1000$ ذهبي. الأسعار (كوينز/دولار) تُقرأ من SystemSettings الموجودة أصلاً (agentTier1/2/3Rate)
const AgentPurchase = require('../models/AgentPurchase');

const TIER_RATE_FIELD = { bronze: 'agentTier1Rate', silver: 'agentTier2Rate', gold: 'agentTier3Rate' };

function tierFromVolume(usd30d) {
    if (usd30d > 1000) return 'gold';
    if (usd30d >= 200) return 'silver';
    return 'bronze';
}

async function computeAgentTier(agentId, tierOverride) {
    if (tierOverride) return tierOverride;
    const since = new Date(Date.now() - 30 * 24 * 3600000);
    const agg = await AgentPurchase.aggregate([
        { $match: { agent: agentId, createdAt: { $gte: since } } },
        { $group: { _id: null, total: { $sum: '$usd' } } }
    ]);
    return tierFromVolume(agg[0]?.total || 0);
}

function rateForTier(tier, settings) {
    return settings[TIER_RATE_FIELD[tier]] || settings.agentTier1Rate || 1050;
}

module.exports = { computeAgentTier, rateForTier, tierFromVolume };
