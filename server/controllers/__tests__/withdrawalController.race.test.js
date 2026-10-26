// ملف: withdrawalController.race.test.js
// 🛡️ مراجعة أمنية (redteam-audit-1 — البند #5، High): reviewWithdrawal كانت تقرأ طلب السحب،
// تفحص status !== 'pending'، ثم تُعدِّل status وuser.balance (عند الرفض) بعملية save() منفصلة
// تماماً بلا أي قفل. أُثبِت فعلياً: طلبا "رفض" متزامنان لنفس طلب السحب أعادا كلاهما المبلغ
// (استرداد مزدوج). الإصلاح: حجز ذرّي واحد (findOneAndUpdate بشرط status:'pending') + استرداد
// الرصيد بنفس المعاملة — نفس نمط adminReviewCustomGift المرجعي بهذا المشروع، مطابق تماماً
// لنمط adminController.moneyRaceAtomicity.test.js المجاور (راجعه لشرح AsyncLocalStorage)
const mongoose = require('mongoose');
const User = require('../../models/User');
const Withdrawal = require('../../models/Withdrawal');
const withdrawalController = require('../withdrawalController');

jest.mock('../../utils/botMessenger', () => ({ sendBotMessage: jest.fn().mockResolvedValue(null) }));
jest.mock('../../models/AdminLog', () => ({ logAction: jest.fn().mockResolvedValue({}) }));

function chainable(value) { return Promise.resolve(value); }

function makeDb() {
    return { users: new Map(), withdrawals: new Map() };
}
function seedUser(db, overrides) {
    const user = { _id: 'u_default', balance: 0, socketId: null, ...overrides };
    db.users.set(user._id, user);
    return user;
}
function seedWithdrawal(db, overrides) {
    const w = { _id: 'w_default', user: 'u_default', amount: 50, status: 'pending', ...overrides };
    db.withdrawals.set(w._id, w);
    return w;
}

function wireMocks(db) {
    const { AsyncLocalStorage } = require('async_hooks');
    const txContext = new AsyncLocalStorage();
    function recordUndo(map, key, beforeValue) {
        const ctx = txContext.getStore();
        if (ctx) ctx.undo.push({ map, key, before: beforeValue });
    }

    jest.spyOn(User, 'findByIdAndUpdate').mockImplementation((id, update) => {
        const row = db.users.get(String(id));
        if (!row) return chainable(null);
        recordUndo(db.users, row._id, { ...row });
        if (update.$inc) {
            for (const k of Object.keys(update.$inc)) row[k] = (row[k] || 0) + update.$inc[k];
        }
        return chainable({ ...row });
    });
    jest.spyOn(User, 'findById').mockImplementation((id) => ({
        session: () => chainable(db.users.get(String(id)) || null)
    }));

    jest.spyOn(Withdrawal, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.withdrawals.get(String(filter._id));
        if (!row) return chainable(null);
        if (filter.status && row.status !== filter.status) return chainable(null);
        recordUndo(db.withdrawals, row._id, { ...row });
        if (update.$set) Object.assign(row, update.$set);
        return chainable({ ...row });
    });

    jest.spyOn(mongoose, 'startSession').mockImplementation(async () => ({
        withTransaction: async (fn) => {
            const ctx = { undo: [] };
            try {
                await txContext.run(ctx, fn);
            } catch (error) {
                for (let i = ctx.undo.length - 1; i >= 0; i--) {
                    const { map, key, before } = ctx.undo[i];
                    if (before === null) map.delete(key);
                    else map.set(key, before);
                }
                throw error;
            }
        },
        endSession: async () => {}
    }));
}

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
function mockReq(overrides) {
    return { admin: { _id: 'admin1' }, params: {}, body: {}, ip: '127.0.0.1', app: { get: () => ({ to: () => ({ emit: () => {} }) }) }, ...overrides };
}

describe('reviewWithdrawal (reject) — حجز ذرّي يمنع استرداد مزدوج (البند #5)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('رفضان متزامنان لنفس طلب السحب: استرداد واحد فقط، لا استرداد مزدوج', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', balance: 0 });
        seedWithdrawal(db, { _id: 'w1', user: 'u1', amount: 40, status: 'pending' });
        wireMocks(db);

        const req1 = mockReq({ params: { withdrawalId: 'w1' }, body: { action: 'reject', reason: 'r1' } });
        const res1 = mockRes();
        const req2 = mockReq({ params: { withdrawalId: 'w1' }, body: { action: 'reject', reason: 'r2' } });
        const res2 = mockRes();

        await Promise.all([
            withdrawalController.reviewWithdrawal(req1, res1),
            withdrawalController.reviewWithdrawal(req2, res2)
        ]);

        const statuses = [res1.status.mock.calls[0]?.[0], res2.status.mock.calls[0]?.[0]];
        const bodies = [res1.json.mock.calls[0][0], res2.json.mock.calls[0][0]];
        const successCount = bodies.filter(b => b.status === 'success').length;
        const failCount = bodies.filter(b => b.status === 'fail').length;

        expect(successCount).toBe(1);
        expect(failCount).toBe(1);
        expect(statuses).toContain(409); // ALREADY_REVIEWED
        expect(user.balance).toBe(40); // ✅ ليس 80 — استرداد واحد فقط
    });

    test('موافقة فردية (بلا تزامن): لا استرداد (الرصيد محجوز مسبقاً عند الطلب، لا يُعاد عند الموافقة)', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', balance: 0 });
        seedWithdrawal(db, { _id: 'w1', user: 'u1', amount: 40, status: 'pending' });
        wireMocks(db);

        const req = mockReq({ params: { withdrawalId: 'w1' }, body: { action: 'approve' } });
        const res = mockRes();
        await withdrawalController.reviewWithdrawal(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(db.withdrawals.get('w1').status).toBe('completed');
        expect(user.balance).toBe(0);
    });
});
