// 🛡️ feat/agents-v1 — يختبر حساب فئة الوكيل: التصحيح اليدوي (tierOverride) يتجاوز الحساب
// التلقائي؛ وإلا تُحسَب من مجموع شحنات المخزون آخر 30 يوماً فقط (<200$ برونزي، 200-1000$ فضي، >1000$ ذهبي)
const AgentPurchase = require('../../models/AgentPurchase');
const { computeAgentTier, rateForTier, tierFromVolume } = require('../agentTierService');

afterEach(() => jest.restoreAllMocks());

describe('tierFromVolume', () => {
    test('حدود الشرائح الثلاث', () => {
        expect(tierFromVolume(0)).toBe('bronze');
        expect(tierFromVolume(199.99)).toBe('bronze');
        expect(tierFromVolume(200)).toBe('silver');
        expect(tierFromVolume(1000)).toBe('silver');
        expect(tierFromVolume(1000.01)).toBe('gold');
    });
});

describe('computeAgentTier', () => {
    test('tierOverride يتجاوز الحساب التلقائي كلياً (لا استعلام حتى)', async () => {
        const spy = jest.spyOn(AgentPurchase, 'aggregate');
        const tier = await computeAgentTier('agent1', 'gold');
        expect(tier).toBe('gold');
        expect(spy).not.toHaveBeenCalled();
    });

    test('بلا override: يُحسَب من مجموع آخر 30 يوماً فقط', async () => {
        jest.spyOn(AgentPurchase, 'aggregate').mockResolvedValue([{ _id: null, total: 350 }]);
        const tier = await computeAgentTier('agent1', null);
        expect(tier).toBe('silver');
    });

    test('لا شحنات بعد: برونزي افتراضياً', async () => {
        jest.spyOn(AgentPurchase, 'aggregate').mockResolvedValue([]);
        const tier = await computeAgentTier('agent1', null);
        expect(tier).toBe('bronze');
    });
});

describe('rateForTier', () => {
    test('يقرأ السعر الصحيح من الإعدادات لكل فئة', () => {
        const settings = { agentTier1Rate: 1050, agentTier2Rate: 1080, agentTier3Rate: 1100 };
        expect(rateForTier('bronze', settings)).toBe(1050);
        expect(rateForTier('silver', settings)).toBe(1080);
        expect(rateForTier('gold', settings)).toBe(1100);
    });
});
