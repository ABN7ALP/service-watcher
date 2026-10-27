// ملف: linkageService.test.js
// 🛡️ كشف الحسابات المرتبطة: نفس معرّف جهاز، أو نفس محفظة شام كاش بسحب سابق — أي إشارة منها
// تكفي. jest.spyOn على النماذج الحقيقية بمحاكاة بذاكرة JS (نفس الاتفاقية الثابتة بهذا المشروع).
//
// 🛡️ مراجعة PR (بند 1): إشارة "نفس IP" أُزيلت تماماً من areLinked (شبكات CGNAT بسوريا تشارك
// IP واحداً بين آلاف حسابات حقيقية مختلفة) — راجع نفس IP لا يعني مرتبطَين أدناه

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

    test('نفس IP لكن أجهزة مختلفة تماماً → غير مرتبطين (CGNAT — راجع بند 1)', async () => {
        const now = Date.now();
        jest.spyOn(DeviceSession, 'find').mockImplementation(({ user }) => lean(
            user === 'a'
                ? [{ deviceId: 'devA', ip: '1.2.3.4', createdAt: new Date(now) }]
                : [{ deviceId: 'devB', ip: '1.2.3.4', createdAt: new Date(now) }]
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
