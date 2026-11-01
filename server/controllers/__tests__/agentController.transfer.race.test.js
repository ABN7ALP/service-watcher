// 🛡️ feat/agents-v1 — يختبر أن تحويلات وكيل متزامنة لا يمكن أن تتجاوز مخزونه (agent_inventory)
// مجتمعة: walletService.post تحجز ضمن معاملة Mongo حقيقية (محاكاة تضارب كتابة حقيقي، لا شرط
// $gte بسيط) — نفس نمط withdrawalController.createRace.test.js المجاور تماماً
const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');
const User = require('../../models/User');
const Agent = require('../../models/Agent');
const AgentTransfer = require('../../models/AgentTransfer');
const LedgerEntry = require('../../models/LedgerEntry');
const SystemSettings = require('../../models/SystemSettings');
const linkageService = require('../../utils/linkageService');
const agentController = require('../agentController');

jest.mock('../../utils/botMessenger', () => ({ sendBotMessage: jest.fn().mockResolvedValue(null) }));

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.session = () => p;
    p.populate = () => p;
    p.lean = () => p;
    return p;
}

function makeDb() {
    return { users: new Map(), agents: new Map(), transfers: new Map(), ledgerByKey: new Map(), _locks: new Map() };
}

const AGENT_USER_ID = '507f191e810c19729de860ea';
const AGENT_DOC_ID = '507f191e810c19729de860eb';
const RECIPIENT_ID = '507f191e810c19729de860ec';

function seedStandard(db, { inventory = 10000 } = {}) {
    db.users.set(AGENT_USER_ID, { _id: AGENT_USER_ID, walletAgentInventory: inventory, coins: 0, balance: 0, socketId: null, username: 'agent1' });
    db.users.set(RECIPIENT_ID, { _id: RECIPIENT_ID, walletCoinsPaid: 0, walletCoinsBonus: 0, coins: 0, balance: 0, socketId: null, customId: 'R1', username: 'recipient1' });
    db.agents.set(AGENT_DOC_ID, { _id: AGENT_DOC_ID, user: AGENT_USER_ID, status: 'active', totalTransfers: 0, totalCoinsTransferred: 0 });
}

const txContext = new AsyncLocalStorage();
function recordUndo(db, map, key, beforeValue) {
    const ctx = txContext.getStore();
    if (ctx) ctx.undo.push({ map, key, before: beforeValue });
}
function acquireLock(db, docId) {
    const ctx = txContext.getStore();
    if (!ctx) return;
    const holder = db._locks.get(docId);
    if (holder && holder !== ctx) throw Object.assign(new Error('Write conflict'), { code: 112 });
    if (!holder) { db._locks.set(docId, ctx); ctx.locks.push({ db, docId }); }
}

function wireMocks(db) {
    jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({
        agentTransferMinCoins: 1000, agentTransferMaxCoins: 500000, agentDailyCapCoins: 2000000,
        agentTransferRequirePin: false
    });
    jest.spyOn(linkageService, 'areLinked').mockResolvedValue(false);

    jest.spyOn(Agent, 'findOne').mockImplementation((filter) => {
        if (filter.user) return chainable(Array.from(db.agents.values()).find(a => String(a.user) === String(filter.user)) || null);
        if (filter.agent && filter.clientRequestId) {
            return chainable(Array.from(db.transfers.values()).find(t => String(t.agent) === String(filter.agent) && t.clientRequestId === filter.clientRequestId) || null);
        }
        return chainable(null);
    });
    jest.spyOn(Agent, 'updateOne').mockImplementation((filter, update) => {
        const row = db.agents.get(String(filter._id));
        if (!row) return Promise.resolve({ matchedCount: 0 });
        if (update.$inc) for (const k of Object.keys(update.$inc)) row[k] = (row[k] || 0) + update.$inc[k];
        return Promise.resolve({ matchedCount: 1 });
    });

    jest.spyOn(AgentTransfer, 'findOne').mockImplementation((filter) => {
        const match = Array.from(db.transfers.values()).find(t => String(t.agent) === String(filter.agent) && t.clientRequestId === filter.clientRequestId);
        return chainable(match || null);
    });
    jest.spyOn(AgentTransfer, 'aggregate').mockResolvedValue([]);
    jest.spyOn(AgentTransfer, 'create').mockImplementation((docs) => {
        acquireLock(db, docs[0]._id ? String(docs[0]._id) : 'new-transfer-placeholder');
        const created = docs.map(d => ({ ...d }));
        created.forEach(d => db.transfers.set(String(d._id), d));
        return Promise.resolve(created);
    });

    jest.spyOn(User, 'findById').mockImplementation((id) => chainable(db.users.get(String(id)) || null));
    jest.spyOn(User, 'findOne').mockImplementation((filter) => chainable(Array.from(db.users.values()).find(u => u.customId === filter.customId) || null));
    jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return chainable(null);
        acquireLock(db, row._id);
        for (const [field, cond] of Object.entries(filter)) {
            if (field === '_id') continue;
            if (cond && typeof cond.$gte === 'number' && (row[field] || 0) < cond.$gte) return chainable(null);
        }
        recordUndo(db, db.users, row._id, { ...row });
        if (update.$inc) for (const k of Object.keys(update.$inc)) row[k] = (row[k] || 0) + update.$inc[k];
        if (update.$set) Object.assign(row, update.$set);
        return chainable({ ...row });
    });
    jest.spyOn(User, 'updateOne').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return chainable({ matchedCount: 0 });
        acquireLock(db, row._id);
        recordUndo(db, db.users, row._id, { ...row });
        if (update.$set) Object.assign(row, update.$set);
        return chainable({ matchedCount: 1 });
    });

    jest.spyOn(LedgerEntry, 'findOne').mockImplementation((filter) => chainable(db.ledgerByKey.get(filter.idempotencyKey) || null));
    jest.spyOn(LedgerEntry, 'create').mockImplementation((docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        const created = arr.map((d, i) => ({ ...d, _id: `ledger_${db.ledgerByKey.size + i}` }));
        created.forEach(c => db.ledgerByKey.set(c.idempotencyKey, c));
        return Promise.resolve(created);
    });

    jest.spyOn(mongoose, 'startSession').mockImplementation(async () => ({
        withTransaction: async (fn) => {
            for (let attempt = 0; attempt < 20; attempt++) {
                const ctx = { undo: [], locks: [] };
                try {
                    const result = await txContext.run(ctx, fn);
                    ctx.locks.forEach(({ db: d, docId }) => d._locks.delete(docId));
                    return result;
                } catch (error) {
                    for (let i = ctx.undo.length - 1; i >= 0; i--) {
                        const { map, key, before } = ctx.undo[i];
                        Object.assign(map.get(key), before);
                    }
                    ctx.locks.forEach(({ db: d, docId }) => d._locks.delete(docId));
                    if (error.code === 112) continue;
                    throw error;
                }
            }
            throw new Error('too many retries');
        },
        endSession: async () => {}
    }));
}

function mockRes() { return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }; }
function mockReq(overrides) {
    return { user: { id: AGENT_USER_ID }, body: {}, app: { get: () => null }, ...overrides };
}

describe('agentController.transfer — تضارب الكتابة الحقيقي يمنع تجاوز المخزون', () => {
    afterEach(() => jest.restoreAllMocks());

    test('مخزون يكفي تحويلاً واحداً بالضبط + طلبان متزامنان بنفس المبلغ: واحد فقط ينجح، لا سالب', async () => {
        const db = makeDb();
        seedStandard(db, { inventory: 5000 });
        wireMocks(db);

        const body = { toCustomId: 'R1', coins: 5000, clientRequestId: 'req-A' };
        const body2 = { toCustomId: 'R1', coins: 5000, clientRequestId: 'req-B' };
        const req1 = mockReq({ body });
        const res1 = mockRes();
        const req2 = mockReq({ body: body2 });
        const res2 = mockRes();

        await Promise.all([agentController.transfer(req1, res1), agentController.transfer(req2, res2)]);

        const bodies = [res1.json.mock.calls[0][0], res2.json.mock.calls[0][0]];
        const successCount = bodies.filter(b => b.status === 'success').length;
        const failCount = bodies.filter(b => b.status === 'fail').length;

        expect(successCount).toBe(1);
        expect(failCount).toBe(1);
        expect(db.users.get(AGENT_USER_ID).walletAgentInventory).toBe(0);
        expect(db.users.get(AGENT_USER_ID).walletAgentInventory).toBeGreaterThanOrEqual(0);
    });

    test('نفس clientRequestId مرتين (إعادة إرسال شبكة): ينفَّذ مرة واحدة فقط (idempotent)', async () => {
        const db = makeDb();
        seedStandard(db, { inventory: 5000 });
        wireMocks(db);

        const body = { toCustomId: 'R1', coins: 2000, clientRequestId: 'same-req' };
        const req1 = mockReq({ body });
        const res1 = mockRes();
        await agentController.transfer(req1, res1);
        expect(res1.json.mock.calls[0][0].status).toBe('success');
        expect(db.users.get(AGENT_USER_ID).walletAgentInventory).toBe(3000);

        const req2 = mockReq({ body });
        const res2 = mockRes();
        await agentController.transfer(req2, res2);
        expect(res2.json.mock.calls[0][0].status).toBe('success');
        // ✅ لم يُخصَم مرة ثانية — نفس الطلب أُعيد لا نُفِّذ من جديد
        expect(db.users.get(AGENT_USER_ID).walletAgentInventory).toBe(3000);
        expect(db.transfers.size).toBe(1);
    });

    test('مسار سعيد فردي: الخصم والإضافة ينجحان معاً', async () => {
        const db = makeDb();
        seedStandard(db, { inventory: 10000 });
        wireMocks(db);

        const req = mockReq({ body: { toCustomId: 'R1', coins: 3000, clientRequestId: 'req-ok' } });
        const res = mockRes();
        await agentController.transfer(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(db.users.get(AGENT_USER_ID).walletAgentInventory).toBe(7000);
        expect(db.users.get(RECIPIENT_ID).walletCoinsPaid).toBe(3000);
    });

    test('مخزون غير كافٍ: يُرفض بوضوح ولا يُنشأ سجل تحويل', async () => {
        const db = makeDb();
        seedStandard(db, { inventory: 500 });
        wireMocks(db);

        const req = mockReq({ body: { toCustomId: 'R1', coins: 1000, clientRequestId: 'req-insufficient' } });
        const res = mockRes();
        await agentController.transfer(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(db.transfers.size).toBe(0);
        expect(db.users.get(AGENT_USER_ID).walletAgentInventory).toBe(500);
    });

    test('وكيل موقوف: يُرفض التحويل فوراً', async () => {
        const db = makeDb();
        seedStandard(db, { inventory: 5000 });
        db.agents.get(AGENT_DOC_ID).status = 'suspended';
        wireMocks(db);

        const req = mockReq({ body: { toCustomId: 'R1', coins: 1000, clientRequestId: 'req-suspended' } });
        const res = mockRes();
        await agentController.transfer(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(db.transfers.size).toBe(0);
    });

    test('تحويل لحساب الوكيل نفسه: يُرفض', async () => {
        const db = makeDb();
        seedStandard(db, { inventory: 5000 });
        db.users.get(AGENT_USER_ID).customId = 'SELF1';
        wireMocks(db);
        jest.spyOn(User, 'findOne').mockImplementation((filter) => chainable(Array.from(db.users.values()).find(u => u.customId === filter.customId) || null));

        const req = mockReq({ body: { toCustomId: 'SELF1', coins: 1000, clientRequestId: 'req-self' } });
        const res = mockRes();
        await agentController.transfer(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(db.transfers.size).toBe(0);
    });

    test('حساب مرتبط (areLinked=true): يُرفض التحويل', async () => {
        const db = makeDb();
        seedStandard(db, { inventory: 5000 });
        wireMocks(db);
        linkageService.areLinked.mockResolvedValue(true);

        const req = mockReq({ body: { toCustomId: 'R1', coins: 1000, clientRequestId: 'req-linked' } });
        const res = mockRes();
        await agentController.transfer(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(db.transfers.size).toBe(0);
    });

    test('تجاوز الحد اليومي: يُرفض التحويل الذي يتجاوز agentDailyCapCoins', async () => {
        const db = makeDb();
        seedStandard(db, { inventory: 100000 });
        wireMocks(db);
        SystemSettings.getSettings.mockResolvedValue({
            agentTransferMinCoins: 1000, agentTransferMaxCoins: 500000, agentDailyCapCoins: 5000,
            agentTransferRequirePin: false
        });
        AgentTransfer.aggregate.mockResolvedValue([{ _id: null, total: 4000 }]);

        const req = mockReq({ body: { toCustomId: 'R1', coins: 2000, clientRequestId: 'req-cap' } });
        const res = mockRes();
        await agentController.transfer(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        const body = res.json.mock.calls[0][0];
        expect(body.message).toContain('اليومي');
    });

    test('أقل من الحد الأدنى: يُرفض', async () => {
        const db = makeDb();
        seedStandard(db, { inventory: 5000 });
        wireMocks(db);

        const req = mockReq({ body: { toCustomId: 'R1', coins: 500, clientRequestId: 'req-min' } });
        const res = mockRes();
        await agentController.transfer(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('agentController.rateTransfer — تقييم مرة واحدة فقط', () => {
    afterEach(() => jest.restoreAllMocks());

    test('التقييم الثاني لنفس التحويل يُرفض (rating:null بالشرط الذرّي)', async () => {
        const transfer = { _id: 't1', agent: AGENT_DOC_ID, toUser: RECIPIENT_ID, rating: null };
        jest.spyOn(AgentTransfer, 'findOneAndUpdate').mockImplementation((filter) => {
            if (filter.rating !== null) return chainable(null);
            if (transfer.rating !== null) return chainable(null); // ✅ القيد الذرّي: مُقيَّم مسبقاً فلا يطابق الشرط
            transfer.rating = 4;
            return chainable({ ...transfer });
        });
        jest.spyOn(Agent, 'updateOne').mockResolvedValue({ matchedCount: 1 });

        const req1 = { params: { transferId: 't1' }, body: { rating: 4 }, user: { id: RECIPIENT_ID } };
        const res1 = mockRes();
        await agentController.rateTransfer(req1, res1);
        expect(res1.status).toHaveBeenCalledWith(200);

        const req2 = { params: { transferId: 't1' }, body: { rating: 2 }, user: { id: RECIPIENT_ID } };
        const res2 = mockRes();
        await agentController.rateTransfer(req2, res2);
        expect(res2.status).toHaveBeenCalledWith(400);
    });
});

describe('agentController.reportTransfer — نافذة 24 ساعة', () => {
    afterEach(() => jest.restoreAllMocks());

    test('إبلاغ بعد 24 ساعة من التحويل يُرفض', async () => {
        const oldTransfer = { _id: 't2', toUser: RECIPIENT_ID, createdAt: new Date(Date.now() - 25 * 3600000), report: { status: 'none' } };
        jest.spyOn(AgentTransfer, 'findOne').mockResolvedValue(oldTransfer);

        const req = { params: { transferId: 't2' }, body: { reason: 'لم تصلني الكوينز' }, user: { id: RECIPIENT_ID } };
        const res = mockRes();
        await agentController.reportTransfer(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        const body = res.json.mock.calls[0][0];
        expect(body.message).toContain('24');
    });

    test('إبلاغ ضمن 24 ساعة يُقبَل', async () => {
        const recentTransfer = { _id: 't3', toUser: RECIPIENT_ID, createdAt: new Date(), report: { status: 'none' } };
        jest.spyOn(AgentTransfer, 'findOne').mockResolvedValue(recentTransfer);
        jest.spyOn(AgentTransfer, 'updateOne').mockResolvedValue({ matchedCount: 1 });

        const req = { params: { transferId: 't3' }, body: { reason: 'لم تصلني الكوينز' }, user: { id: RECIPIENT_ID } };
        const res = mockRes();
        await agentController.reportTransfer(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });
});
