// 🛡️ feat/agents-v1 — شحن مخزون الوكيل: txnNo فريد عالمياً (E11000 يُترجَم لرسالة واضحة)،
// والشحن ذرّي (سجل AgentPurchase + قيد ائتمان agent_inventory بنفس المعاملة)
const mongoose = require('mongoose');
const User = require('../../models/User');
const Agent = require('../../models/Agent');
const AgentPurchase = require('../../models/AgentPurchase');
const LedgerEntry = require('../../models/LedgerEntry');
const SystemSettings = require('../../models/SystemSettings');
const agentController = require('../agentController');

jest.mock('../../models/AdminLog', () => ({ logAction: jest.fn().mockResolvedValue({}) }));

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.session = () => p;
    return p;
}

function mockRes() { return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }; }

describe('adminTopupInventory', () => {
    afterEach(() => jest.restoreAllMocks());

    function wireBase(db) {
        jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ agentTier1Rate: 1050, agentTier2Rate: 1080, agentTier3Rate: 1100 });
        // ✅ tierOverride:null يجعل computeAgentTier يستعلم AgentPurchase.aggregate فعلياً —
        // نُصفِّره هنا (لا مشتريات سابقة) فتكون الفئة bronze دوماً بهذا الاختبار
        jest.spyOn(AgentPurchase, 'aggregate').mockResolvedValue([]);
        jest.spyOn(Agent, 'findById').mockResolvedValue({ _id: 'agent1', user: 'user1', tierOverride: null });
        jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
            const row = db.users.get(String(filter._id));
            if (!row) return chainable(null);
            if (update.$inc) for (const k of Object.keys(update.$inc)) row[k] = (row[k] || 0) + update.$inc[k];
            return chainable({ ...row });
        });
        jest.spyOn(User, 'updateOne').mockImplementation(() => Promise.resolve({ matchedCount: 1 }));
        jest.spyOn(LedgerEntry, 'findOne').mockImplementation(() => chainable(null));
        jest.spyOn(LedgerEntry, 'create').mockImplementation((docs) => Promise.resolve(docs.map((d, i) => ({ ...d, _id: `l${i}` }))));
        jest.spyOn(mongoose, 'startSession').mockResolvedValue({
            withTransaction: async (fn) => fn(),
            endSession: async () => {}
        });
    }

    test('شحن ناجح: ينشئ AgentPurchase ويُضيف كوينز لمخزون الوكيل بنفس السعر', async () => {
        const db = { users: new Map([['user1', { _id: 'user1', walletAgentInventory: 0 }]]) };
        wireBase(db);
        jest.spyOn(AgentPurchase, 'create').mockImplementation((docs) => Promise.resolve(docs.map(d => ({ ...d }))));

        const req = { params: { agentId: 'agent1' }, body: { usd: 10, txnNo: '12345', note: '' }, admin: { _id: 'admin1' }, ip: '127.0.0.1' };
        const res = mockRes();
        await agentController.adminTopupInventory(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        const body = res.json.mock.calls[0][0];
        expect(body.data.purchase.coins).toBe(10 * 1050);
        expect(db.users.get('user1').walletAgentInventory).toBe(10 * 1050);
    });

    test('txnNo مكرر (E11000): يُرفض برسالة واضحة 409', async () => {
        const db = { users: new Map([['user1', { _id: 'user1', walletAgentInventory: 0 }]]) };
        wireBase(db);
        jest.spyOn(AgentPurchase, 'create').mockImplementation(() => {
            const err = new Error('duplicate key');
            err.code = 11000;
            throw err;
        });

        const req = { params: { agentId: 'agent1' }, body: { usd: 10, txnNo: '12345', note: '' }, admin: { _id: 'admin1' }, ip: '127.0.0.1' };
        const res = mockRes();
        await agentController.adminTopupInventory(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(db.users.get('user1').walletAgentInventory).toBe(0);
    });

    test('رقم عملية قصير جداً: يُرفض قبل أي معاملة', async () => {
        const db = { users: new Map() };
        wireBase(db);
        const createSpy = jest.spyOn(AgentPurchase, 'create');

        const req = { params: { agentId: 'agent1' }, body: { usd: 10, txnNo: '12', note: '' }, admin: { _id: 'admin1' }, ip: '127.0.0.1' };
        const res = mockRes();
        await agentController.adminTopupInventory(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(createSpy).not.toHaveBeenCalled();
    });
});
