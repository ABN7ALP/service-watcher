// ملف: HostWeeklyStat.test.js
// 🛡️ feat/live-hours-host-center: صف واحد لكل (مضيف × أسبوع) — addQualifiedSeconds/addBeans
// كلاهما $inc ذرّي عبر findOneAndUpdate+upsert، لا قراءة-ثم-كتابة. نفس استراتيجية هذا المشروع
// الثابتة (راجع adminController.moneyRaceAtomicity.test.js): محاكاة findOneAndUpdate تُطبِّق
// الإيجاد+التعديل بشكل متزامن قبل أي await، فتُحاكي بدقّة الضمان الذري الحقيقي لـMongoDB —
// طلبان متزامنان (Promise.all) يُطبَّق أولهما حتى نقطة التعليق الأولى قبل أن يبدأ الثاني فعلياً.
const HostWeeklyStat = require('../HostWeeklyStat');

function makeDb() { return { docs: [], nextId: 1 }; }

function matchesFilter(doc, filter) {
    return Object.entries(filter).every(([key, val]) => String(doc[key]) === String(val));
}

function wireMocks(db) {
    jest.spyOn(HostWeeklyStat, 'findOneAndUpdate').mockImplementation((filter, update) => {
        // ✅ مزامنة متعمَّدة: الإيجاد/الإنشاء والتعديل يحدثان هنا معاً بلا أي await داخلي —
        // يحاكي ضمان findOneAndUpdate+upsert الذرّي الحقيقي بـMongoDB (لا نافذة تسابق بينهما)
        let doc = db.docs.find(d => matchesFilter(d, filter));
        if (!doc) {
            doc = { _id: `hws_${db.nextId++}`, qualifiedSeconds: 0, beansW: 0, beansP: 0, ...(update.$setOnInsert || {}) };
            db.docs.push(doc);
        }
        if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + v;
        return Promise.resolve(doc);
    });
}

afterEach(() => jest.restoreAllMocks());

describe('HostWeeklyStat.addQualifiedSeconds / addBeans — $inc ذرّي، لا قراءة-ثم-كتابة', () => {
    test('أول استدعاء لـ(مضيف × أسبوع) جديد ينشئ الصف بـupsert', async () => {
        const db = makeDb();
        wireMocks(db);
        const weekStart = new Date('2024-01-07T00:00:00Z');
        await HostWeeklyStat.addQualifiedSeconds('host_1', weekStart, 60);
        expect(db.docs.length).toBe(1);
        expect(db.docs[0].qualifiedSeconds).toBe(60);
    });

    test('تسابق حقيقي: عدّة تِكات متزامنة (Promise.all) على نفس المضيف/الأسبوع — كل ثانية تُحسَب، بلا فقدان', async () => {
        const db = makeDb();
        wireMocks(db);
        const weekStart = new Date('2024-01-07T00:00:00Z');

        // ✅ 10 تِكات "متزامنة" (نفس اللحظة الفعلية بـPromise.all) — القيمة النهائية يجب أن
        // تساوي المجموع الكامل بالضبط، لا أقل (فقدان تحديث) ولا أكثر (تكرار)
        await Promise.all(Array.from({ length: 10 }, () => HostWeeklyStat.addQualifiedSeconds('host_1', weekStart, 60)));

        expect(db.docs.length).toBe(1); // ✅ upsert لم يُنشئ أكثر من صف واحد رغم التزامن
        expect(db.docs[0].qualifiedSeconds).toBe(600);
    });

    test('تسابق حقيقي: هدايا متزامنة (beansW/beansP) من مسارات مختلفة لا تضيع أي زيادة', async () => {
        const db = makeDb();
        wireMocks(db);
        const weekStart = new Date('2024-01-07T00:00:00Z');

        await Promise.all([
            HostWeeklyStat.addBeans('host_2', weekStart, { beansW: 1000 }),
            HostWeeklyStat.addBeans('host_2', weekStart, { beansP: 500 }),
            HostWeeklyStat.addBeans('host_2', weekStart, { beansW: 2000 }),
            HostWeeklyStat.addBeans('host_2', weekStart, { beansP: 300 })
        ]);

        expect(db.docs.length).toBe(1);
        expect(db.docs[0].beansW).toBe(3000);
        expect(db.docs[0].beansP).toBe(800);
    });

    test('ساعات وألماس لمضيفين مختلفين بنفس الأسبوع لا يتداخلان', async () => {
        const db = makeDb();
        wireMocks(db);
        const weekStart = new Date('2024-01-07T00:00:00Z');

        await Promise.all([
            HostWeeklyStat.addQualifiedSeconds('host_a', weekStart, 60),
            HostWeeklyStat.addQualifiedSeconds('host_b', weekStart, 120)
        ]);

        const a = db.docs.find(d => d.host === 'host_a');
        const b = db.docs.find(d => d.host === 'host_b');
        expect(a.qualifiedSeconds).toBe(60);
        expect(b.qualifiedSeconds).toBe(120);
    });

    test('0 ثانية/0 بينز → لا يستدعي findOneAndUpdate إطلاقاً (بلا كتابة بلا داعٍ)', async () => {
        const db = makeDb();
        wireMocks(db);
        const spy = jest.spyOn(HostWeeklyStat, 'findOneAndUpdate');
        await HostWeeklyStat.addQualifiedSeconds('host_1', new Date(), 0);
        await HostWeeklyStat.addBeans('host_1', new Date(), {});
        expect(spy).not.toHaveBeenCalled();
    });
});
