// ملف: depositIntentExpiryJob.test.js
// ✅ شحن الكوينزات (feat/wallet-recharge-v1) — يثبت أن المهمة الدورية تستهدف awaiting_payment
// المنتهية فقط (expiresAt تجاوز الآن)، ولا تلمس submitted أبداً (إشعار تحويل أُرسِل فعلياً،
// بانتظار مراجعة إدارية لا وقت) حتى لو تجاوز expiresAt القديم لحظة الإرسال
const DepositIntent = require('../../models/DepositIntent');
const { expireStaleDepositIntents } = require('../depositIntentExpiryJob');

describe('expireStaleDepositIntents', () => {
    afterEach(() => jest.restoreAllMocks());

    test('يستهدف awaiting_payment المنتهية فقط عبر updateMany بشرط الحالة + expiresAt', async () => {
        const updateMany = jest.spyOn(DepositIntent, 'updateMany').mockResolvedValue({ modifiedCount: 2 });

        await expireStaleDepositIntents();

        expect(updateMany).toHaveBeenCalledTimes(1);
        const [filter, update] = updateMany.mock.calls[0];
        expect(filter.status).toBe('awaiting_payment');
        expect(filter.expiresAt).toHaveProperty('$lte');
        expect(update).toEqual({ $set: { status: 'expired' } });
    });

    test('فشل الاستعلام لا يُسقط العملية (يُسجَّل فقط)', async () => {
        jest.spyOn(DepositIntent, 'updateMany').mockRejectedValue(new Error('db down'));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        await expect(expireStaleDepositIntents()).resolves.toBeUndefined();
    });
});
