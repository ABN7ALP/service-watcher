// ملف: migrationGate.test.js
// 🛡️ مراجعة ما قبل الدمج (6 عوائق — PR #131، عائق #1): يختبر حراسة الصيانة المستقلة عن
// server.js — 503 (HTML أو JSON حسب Accept) لكل طلب HTTP، ورفض اتصال Socket.IO، طالما
// العلم لم يُضبَط جاهزاً، وتدفّق طبيعي كامل بعده مباشرة

describe('migrationGate', () => {
    afterEach(() => jest.resetModules());

    test('isReady() تبدأ false — maintenanceMiddleware تُرجِع 503 JSON لطلب لا يقبل HTML', () => {
        const migrationGate = require('../migrationGate');
        expect(migrationGate.isReady()).toBe(false);

        const req = { accepts: () => 'json' };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() };
        const next = jest.fn();

        migrationGate.maintenanceMiddleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({ status: 'fail', message: migrationGate.MAINTENANCE_MESSAGE });
        expect(next).not.toHaveBeenCalled();
    });

    test('maintenanceMiddleware تُرجِع 503 HTML لطلب متصفّح يقبل HTML', () => {
        const migrationGate = require('../migrationGate');
        const req = { accepts: () => 'html' };
        const res = { status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() };
        const next = jest.fn();

        migrationGate.maintenanceMiddleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.type).toHaveBeenCalledWith('html');
        expect(res.send).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('socketGate تمرّر خطأً للاتصال بدل next() طالما غير جاهز', () => {
        const migrationGate = require('../migrationGate');
        const next = jest.fn();
        migrationGate.socketGate({}, next);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(next.mock.calls[0][0].message).toBe(migrationGate.MAINTENANCE_MESSAGE);
    });

    test('markReady(): كل الحراسات تسمح بالعبور فوراً بلا أي حجب', () => {
        const migrationGate = require('../migrationGate');
        migrationGate.markReady();
        expect(migrationGate.isReady()).toBe(true);

        const req = { accepts: () => 'html' };
        const res = { status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
        const next = jest.fn();
        migrationGate.maintenanceMiddleware(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();

        const socketNext = jest.fn();
        migrationGate.socketGate({}, socketNext);
        expect(socketNext).toHaveBeenCalledWith(); // بلا أي خطأ
    });
});
