// ملف: authController.welcomeCosmetic.test.js
// 🛡️ يثبت طلب المستخدم الصريح: فقاعة/دخول الترحيب تُمنَح تلقائياً لحساب جديد، إلا إذا كان
// الجهاز (x-device-id) مرتبطاً بحساب أقدم بالفعل (DeviceSession.exists) — عندها تُرفَض بصمت
// بلا أي كسر لتسجيل الحساب نفسه (catch منفصل بـauthController.js).

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-auth-welcome-cosmetic';

const User = require('../../models/User');
const ProfileFrame = require('../../models/ProfileFrame');
const DeviceSession = require('../../models/DeviceSession');
const CosmeticItem = require('../../models/CosmeticItem');
const authController = require('../authController');

function makeNewUser() {
    const doc = {
        _id: 'newU1',
        ownedCosmetics: [],
        ownedFrames: [],
        activeBubbleCosmetic: null,
        activeBubbleCosmeticClass: null,
        activeBubbleCosmeticExpiresAt: null,
        activeEntranceCosmetic: null,
        activeEntranceCosmeticClass: null,
        activeEntranceCosmeticExpiresAt: null,
        hasReceivedWelcomeCosmetic: false,
        save: jest.fn().mockResolvedValue(true)
    };
    return doc;
}

function mockReq(overrides) {
    return {
        headers: {},
        body: { username: 'u', email: 'u@test.com', password: 'p12345', gender: 'male', birthDate: '2000-01-01' },
        ip: '1.2.3.4',
        ...overrides
    };
}
function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe('authController.register — منح فقاعة/دخول الترحيب وحظره للحساب المرتبط', () => {
    beforeEach(() => {
        jest.spyOn(ProfileFrame, 'findOne').mockResolvedValue(null);
        jest.spyOn(require('../../utils/linkageService'), 'recordDeviceSession').mockImplementation(() => {});
    });
    afterEach(() => jest.restoreAllMocks());

    test('حساب جديد بلا جهاز مرتبط سابقاً: يُمنح فقاعة ودخول الترحيب ويُعلَّم hasReceivedWelcomeCosmetic', async () => {
        const newUser = makeNewUser();
        jest.spyOn(User, 'create').mockResolvedValue(newUser);
        jest.spyOn(DeviceSession, 'exists').mockResolvedValue(null);
        jest.spyOn(CosmeticItem, 'findOne').mockImplementation(({ type }) => Promise.resolve(
            type === 'bubble'
                ? { _id: 'bub1', cssClass: 'cosmetic-bubble-welcome' }
                : { _id: 'ent1', cssClass: 'cosmetic-entrance-welcome' }
        ));

        const req = mockReq({ headers: { 'x-device-id': 'dev-new' } });
        const res = mockRes();
        await authController.register(req, res, () => {});

        expect(DeviceSession.exists).toHaveBeenCalledWith({ deviceId: 'dev-new', user: { $ne: newUser._id } });
        expect(newUser.hasReceivedWelcomeCosmetic).toBe(true);
        expect(newUser.activeBubbleCosmetic).toBe('bub1');
        expect(newUser.activeBubbleCosmeticClass).toBe('cosmetic-bubble-welcome');
        expect(newUser.activeEntranceCosmetic).toBe('ent1');
        expect(newUser.ownedCosmetics).toHaveLength(2);
        expect(res.status).toHaveBeenCalledWith(201);
    });

    test('نفس الجهاز مرتبط بحساب أقدم: لا تُمنح أي فقاعة/دخول ترحيب، والتسجيل ينجح رغم ذلك', async () => {
        const newUser = makeNewUser();
        jest.spyOn(User, 'create').mockResolvedValue(newUser);
        jest.spyOn(DeviceSession, 'exists').mockResolvedValue({ _id: 'oldSession' }); // ✅ جهاز مستخدَم من قبل
        const cosmeticFindOneSpy = jest.spyOn(CosmeticItem, 'findOne');

        const req = mockReq({ headers: { 'x-device-id': 'dev-reused' } });
        const res = mockRes();
        await authController.register(req, res, () => {});

        expect(cosmeticFindOneSpy).not.toHaveBeenCalled(); // ✅ لا يُفحَص الكتالوج أصلاً إن كان الجهاز مرتبطاً
        expect(newUser.hasReceivedWelcomeCosmetic).toBe(false);
        expect(newUser.activeBubbleCosmetic).toBeNull();
        expect(newUser.ownedCosmetics).toHaveLength(0);
        expect(res.status).toHaveBeenCalledWith(201); // ✅ التسجيل نفسه لا يتأثر إطلاقاً
    });
});
