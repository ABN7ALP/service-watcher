// ملف: dependencyHealthJob.test.js
// ✅ فحص صحة الاعتماديات (chore/dependency-health): npm outdated/audit بـ--json يخرجان بكود
// خروج غير صفري (exit 1) كل مرة يجدان فيها أي نتيجة لعرضها (حزمة قديمة/ثغرة) — هذا ليس فشلاً
// لـnpm، وstdout يبقى JSON صالح بكل الحالات، لذا يجب تحليل stdout أولاً بصرف النظر عن كود
// الخروج، ولا نعتبر الأمر فاشلاً إلا إذا كان stdout فارغاً فعلاً (عطل npm/الشبكة الحقيقي)

jest.mock('child_process', () => ({ execFile: jest.fn() }));
const { execFile } = require('child_process');
const SystemHealth = require('../../models/SystemHealth');
const { runDependencyHealthCheck, isMajorBump } = require('../dependencyHealthJob');

describe('dependencyHealthJob.isMajorBump', () => {
    test('يرصد ترقية الإصدار الرئيسي (major) فقط، لا minor/patch', () => {
        expect(isMajorBump('1.41.3', '2.11.0')).toBe(true);
        expect(isMajorBump('7.8.12', '7.8.13')).toBe(false);
        expect(isMajorBump('16.6.1', '18.0.9')).toBe(true);
        expect(isMajorBump('3.4.19', '3.4.19')).toBe(false);
        expect(isMajorBump('x', 'y')).toBe(false); // مدخلات غير رقمية لا تُسقط الفحص بخطأ
    });
});

describe('dependencyHealthJob.runDependencyHealthCheck', () => {
    afterEach(() => jest.restoreAllMocks());

    test('كود خروج غير صفري من npm لكن stdout فيه JSON صالح → يُحلَّل، لا يُعامَل كفشل', async () => {
        const outdatedJson = JSON.stringify({
            cloudinary: { current: '1.41.3', wanted: '1.41.3', latest: '2.11.0' }
        });
        const auditJson = JSON.stringify({
            vulnerabilities: {
                cloudinary: {
                    severity: 'high',
                    via: [{ title: 'Cloudinary Node SDK vulnerable to argument injection', url: 'https://github.com/advisories/GHSA-g4mf-96x5-5m2c' }]
                },
                'postcss-nested': {
                    severity: 'moderate',
                    via: ['postcss-selector-parser'] // via نصي فقط = تبعية غير مباشرة بلا تفاصيل استشارة مباشرة
                }
            }
        });

        execFile.mockImplementation((cmd, args, options, cb) => {
            // ✅ محاكاة سلوك npm الحقيقي: خطأ exit code غير صفري + stdout صالح بآن واحد
            if (args[0] === 'outdated') cb(new Error('Command failed with exit code 1'), outdatedJson, '');
            else cb(new Error('Command failed with exit code 1'), auditJson, '');
        });

        const deleteManySpy = jest.spyOn(SystemHealth, 'deleteMany').mockResolvedValue({});
        const insertManySpy = jest.spyOn(SystemHealth, 'insertMany').mockResolvedValue([]);

        const result = await runDependencyHealthCheck();

        expect(deleteManySpy).toHaveBeenCalledWith({});
        expect(insertManySpy).toHaveBeenCalledTimes(1);
        const docs = insertManySpy.mock.calls[0][0];

        const outdatedDoc = docs.find(d => d.type === 'outdated' && d.package === 'cloudinary');
        expect(outdatedDoc.isMajorUpdate).toBe(true);
        expect(outdatedDoc.current).toBe('1.41.3');
        expect(outdatedDoc.latest).toBe('2.11.0');

        const vulnDoc = docs.find(d => d.type === 'vulnerability' && d.package === 'cloudinary');
        expect(vulnDoc.severity).toBe('high');
        expect(vulnDoc.advisoryUrl).toBe('https://github.com/advisories/GHSA-g4mf-96x5-5m2c');

        const transitiveVulnDoc = docs.find(d => d.type === 'vulnerability' && d.package === 'postcss-nested');
        expect(transitiveVulnDoc.severity).toBe('moderate');
        expect(transitiveVulnDoc.advisoryUrl).toBe(''); // via نصي فقط بلا تفاصيل استشارة قابلة للاستخراج

        expect(result.vulnerabilityCount).toBe(2);
        expect(result.outdatedCount).toBe(1);
        expect(result.errorCount).toBe(0);

        // ✅ ترتيب الحذف قبل الإدراج فعلياً — نتيجة التشغيل السابق لا تبقى مختلطة بالجديدة
        expect(deleteManySpy.mock.invocationCallOrder[0]).toBeLessThan(insertManySpy.mock.invocationCallOrder[0]);
    });

    test('مهلة الأمر (60 ثانية) — error.killed بلا stdout → مستند خطأ واضح، بلا انهيار', async () => {
        execFile.mockImplementation((cmd, args, options, cb) => {
            const err = new Error('Command timed out');
            err.killed = true;
            cb(err, '', '');
        });
        const deleteManySpy = jest.spyOn(SystemHealth, 'deleteMany').mockResolvedValue({});
        const insertManySpy = jest.spyOn(SystemHealth, 'insertMany').mockResolvedValue([]);

        const result = await runDependencyHealthCheck();

        expect(deleteManySpy).toHaveBeenCalledWith({});
        const docs = insertManySpy.mock.calls[0][0];
        expect(docs).toHaveLength(2); // خطأ outdated + خطأ audit
        expect(docs.every(d => d.type === 'error')).toBe(true);
        expect(docs.find(d => d.source === 'outdated').errorMessage).toMatch(/مهلة/);
        expect(docs.find(d => d.source === 'audit').errorMessage).toMatch(/مهلة/);
        expect(result.errorCount).toBe(2);
    });

    test('npm أو الشبكة غير متاحة (خطأ عام بلا stdout) → يُخزَّن كخطأ، الدالة لا تُرمى ولا تنهار', async () => {
        execFile.mockImplementation((cmd, args, options, cb) => {
            cb(new Error('spawn npm ENOENT'), '', '');
        });
        jest.spyOn(SystemHealth, 'deleteMany').mockResolvedValue({});
        const insertManySpy = jest.spyOn(SystemHealth, 'insertMany').mockResolvedValue([]);

        await expect(runDependencyHealthCheck()).resolves.toBeDefined();
        const docs = insertManySpy.mock.calls[0][0];
        expect(docs.every(d => d.type === 'error' && d.errorMessage.includes('ENOENT'))).toBe(true);
    });

    test('لا نتائج إطلاقاً (كل الحزم محدَّثة، بلا ثغرات) — deleteMany فقط بلا insertMany بمصفوفة فاضية', async () => {
        execFile.mockImplementation((cmd, args, options, cb) => {
            if (args[0] === 'outdated') cb(null, '{}', '');
            else cb(null, JSON.stringify({ vulnerabilities: {} }), '');
        });
        jest.spyOn(SystemHealth, 'deleteMany').mockResolvedValue({});
        const insertManySpy = jest.spyOn(SystemHealth, 'insertMany').mockResolvedValue([]);

        const result = await runDependencyHealthCheck();
        expect(insertManySpy).not.toHaveBeenCalled();
        expect(result.vulnerabilityCount).toBe(0);
        expect(result.outdatedCount).toBe(0);
        expect(result.errorCount).toBe(0);
    });

    test('فشل الحفظ بقاعدة البيانات (DB down) يُرمى لا يُبتلَع بصمت — المستدعي (الوظيفة المجدولة) يسجّله', async () => {
        execFile.mockImplementation((cmd, args, options, cb) => cb(null, '{}', ''));
        jest.spyOn(SystemHealth, 'deleteMany').mockRejectedValue(new Error('Mongo connection lost'));

        await expect(runDependencyHealthCheck()).rejects.toThrow('Mongo connection lost');
    });
});
