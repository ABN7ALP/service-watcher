// 🛡️ مراجعة الأمان v2 (البند 2) — يضمن أن استجابة /pin/status لا تُسرّب withdrawalPin أو
// pinResetCodeHash مهما كانت موجودة على مستند المستخدم المُسترجَع (الكنترولر يبني استجابة
// بحقول محدّدة يدوياً، لا ينشر المستند كاملاً) — دفاع إضافي فوق select:false بمخطط Mongoose
const User = require('../../models/User');
const withdrawalPinController = require('../withdrawalPinController');

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    return p;
}
function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
function mockReq(overrides) {
    return { user: { id: 'u1' }, body: {}, app: { get: () => null }, ...overrides };
}

afterEach(() => jest.restoreAllMocks());

describe('withdrawalPinController.getStatus — لا تسرّب الحقول الحساسة', () => {
    test('حتى لو عاد withdrawalPin/pinResetCodeHash من الاستعلام، لا يظهران بالاستجابة', async () => {
        jest.spyOn(User, 'findById').mockImplementation(() => chainable({
            _id: 'u1',
            withdrawalPin: '$2a$10$fakehashvalueshouldneverleak',
            pinResetCodeHash: 'deadbeef-secret-reset-code-hash',
            withdrawalPinLockedUntil: null,
            withdrawalBlockedUntil: null,
            payoutShamCashWallet: null,
            payoutWalletChangedAt: null,
            isEmailVerified: false
        }));

        const req = mockReq();
        const res = mockRes();
        await withdrawalPinController.getStatus(req, res);

        const body = res.json.mock.calls[0][0];
        const serialized = JSON.stringify(body);
        expect(serialized).not.toContain('fakehashvalueshouldneverleak');
        expect(serialized).not.toContain('deadbeef-secret-reset-code-hash');
        expect(body.data.hasPin).toBe(true);
    });
});

describe('withdrawalPinController.setup — تطابق الرمزين', () => {
    test('يرفض فوراً لو الرمزان غير متطابقين دون استدعاء الخدمة', async () => {
        const pinService = require('../../utils/withdrawalPinService');
        const spy = jest.spyOn(pinService, 'setInitialWithdrawalPin');

        const req = mockReq({ body: { pin: '1234', confirmPin: '5678' } });
        const res = mockRes();
        await withdrawalPinController.setup(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('withdrawalPinController.change — قفل الرمز يُترجَم لـ423', () => {
    test('LOCKED_NOW يُترجَم لرمز حالة 423', async () => {
        const pinService = require('../../utils/withdrawalPinService');
        jest.spyOn(pinService, 'changeWithdrawalPin').mockResolvedValue({ code: 'LOCKED_NOW', lockedUntil: new Date(), ok: false });

        const req = mockReq({ body: { currentPin: '0000', newPin: '1234', confirmPin: '1234' } });
        const res = mockRes();
        await withdrawalPinController.change(req, res);

        expect(res.status).toHaveBeenCalledWith(423);
    });
});
