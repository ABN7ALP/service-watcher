// ملف: linkageService.test.js
// 🛡️ كشف الحسابات المرتبطة (feat/wallet-ledger-v1): نفس معرّف جهاز، أو نفس IP خلال 24 ساعة
// من بعضهما، أو نفس محفظة شام كاش بسحب سابق — أي إشارة منها تكفي. jest.spyOn على النماذج
// الحقيقية بمحاكاة بذاكرة JS (نفس الاتفاقية الثابتة بهذا المشروع).

const DeviceSession = require('../../models/DeviceSession');
const Withdrawal = require('../../models/Withdrawal');
const { areLinked } = require('../linkageService');

function lean(rows) {
    const p = Promise.resolve(rows);
    p.select = () => p;
    p.lean = () => p;
    return p;
}

describe('linkageService.areLinked', () => {
    afterEach(() => jest.restoreAllMocks());

    test('نفس معرّف الجهاز لحسابين مختلفين → مرتبطان', async () => {
        jest.spyOn(DeviceSession, 'find').mockImplementation(({ user }) => lean(
            user === 'a' ? [{ deviceId: 'dev1', ip: null, createdAt: new Date() }] : [{ deviceId: 'dev1', ip: null, createdAt: new Date() }]
        ));
        jest.spyOn(Withdrawal, 'find').mockImplementation(() => lean([]));
        expect(await areLinked('a', 'b')).toBe(true);
    });

    test('نفس IP خلال 24 ساعة من بعضهما → مرتبطان', async () => {
        const now = Date.now();
        jest.spyOn(DeviceSession, 'find').mockImplementation(({ user }) => lean(
            user === 'a'
                ? [{ deviceId: null, ip: '1.2.3.4', createdAt: new Date(now) }]
                : [{ deviceId: null, ip: '1.2.3.4', createdAt: new Date(now + 10 * 60 * 60 * 1000) }] // +10h
        ));
        jest.spyOn(Withdrawal, 'find').mockImplementation(() => lean([]));
        expect(await areLinked('a', 'b')).toBe(true);
    });

    test('نفس IP لكن متباعد أكثر من 24 ساعة → غير مرتبطين (بهذه الإشارة)', async () => {
        const now = Date.now();
        jest.spyOn(DeviceSession, 'find').mockImplementation(({ user }) => lean(
            user === 'a'
                ? [{ deviceId: null, ip: '1.2.3.4', createdAt: new Date(now) }]
                : [{ deviceId: null, ip: '1.2.3.4', createdAt: new Date(now + 25 * 60 * 60 * 1000) }] // +25h
        ));
        jest.spyOn(Withdrawal, 'find').mockImplementation(() => lean([]));
        expect(await areLinked('a', 'b')).toBe(false);
    });

    test('نفس محفظة شام كاش بسحب سابق لكليهما → مرتبطان', async () => {
        jest.spyOn(DeviceSession, 'find').mockImplementation(() => lean([]));
        jest.spyOn(Withdrawal, 'find').mockImplementation(({ user }) => lean(
            [{ walletNumber: user === 'a' ? 'W123' : 'W123' }]
        ));
        expect(await areLinked('a', 'b')).toBe(true);
    });

    test('لا أي إشارة مشتركة → غير مرتبطين', async () => {
        jest.spyOn(DeviceSession, 'find').mockImplementation(({ user }) => lean(
            user === 'a' ? [{ deviceId: 'dev1', ip: '1.1.1.1', createdAt: new Date() }] : [{ deviceId: 'dev2', ip: '2.2.2.2', createdAt: new Date() }]
        ));
        jest.spyOn(Withdrawal, 'find').mockImplementation(({ user }) => lean(
            [{ walletNumber: user === 'a' ? 'WA' : 'WB' }]
        ));
        expect(await areLinked('a', 'b')).toBe(false);
    });

    test('نفس المستخدم مع نفسه → false دوماً (استدعاء غير منطقي يُرفَض بأمان)', async () => {
        expect(await areLinked('a', 'a')).toBe(false);
    });
});
