// ملف: HostDailyStat.test.js
// 🛡️ مراجعة #155: مصدر الحقيقة الوحيد لساعات مسبح المضيفين — صف واحد لكل (مضيف × يوم).
// addQualifiedSeconds هو $inc ذرّي عبر findOneAndUpdate+upsert، لا قراءة-ثم-كتابة (نفس استراتيجية
// محاكاة findOneAndUpdate المستخدَمة بـHostWeeklyStat.test.js المجاور: الإيجاد+التعديل يحدثان
// معاً بلا أي await داخلي، فتُحاكي بدقّة الضمان الذري الحقيقي بـMongoDB).
const HostDailyStat = require('../HostDailyStat');

function makeDb() { return { docs: [], nextId: 1 }; }

function matchesFilter(doc, filter) {
    return Object.entries(filter).every(([key, val]) => String(doc[key]) === String(val));
}

function wireMocks(db) {
    jest.spyOn(HostDailyStat, 'findOneAndUpdate').mockImplementation((filter, update) => {
        let doc = db.docs.find(d => matchesFilter(d, filter));
        if (!doc) {
            doc = { _id: `hds_${db.nextId++}`, qualifiedSeconds: 0, ...(update.$setOnInsert || {}) };
            db.docs.push(doc);
        }
        if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + v;
        return Promise.resolve(doc);
    });
}

afterEach(() => jest.restoreAllMocks());

describe('HostDailyStat.addQualifiedSeconds — $inc ذرّي، لا قراءة-ثم-كتابة', () => {
    test('أول استدعاء لـ(مضيف × يوم) جديد ينشئ الصف بـupsert', async () => {
        const db = makeDb();
        wireMocks(db);
        const day = new Date('2024-01-07T00:00:00Z');
        await HostDailyStat.addQualifiedSeconds('host_1', day, 60);
        expect(db.docs.length).toBe(1);
        expect(db.docs[0].qualifiedSeconds).toBe(60);
    });

    test('تسابق حقيقي: عدّة تِكات متزامنة (Promise.all) على نفس المضيف/اليوم — كل ثانية تُحسَب، بلا فقدان', async () => {
        const db = makeDb();
        wireMocks(db);
        const day = new Date('2024-01-07T00:00:00Z');

        await Promise.all(Array.from({ length: 10 }, () => HostDailyStat.addQualifiedSeconds('host_1', day, 60)));

        expect(db.docs.length).toBe(1); // ✅ upsert لم يُنشئ أكثر من صف واحد رغم التزامن
        expect(db.docs[0].qualifiedSeconds).toBe(600);
    });

    test('نفس المضيف بيومين مختلفين لا يتداخلان', async () => {
        const db = makeDb();
        wireMocks(db);
        const day1 = new Date('2024-01-07T00:00:00Z');
        const day2 = new Date('2024-01-08T00:00:00Z');

        await Promise.all([
            HostDailyStat.addQualifiedSeconds('host_1', day1, 60),
            HostDailyStat.addQualifiedSeconds('host_1', day2, 120)
        ]);

        expect(db.docs.length).toBe(2);
        const d1 = db.docs.find(d => d.day.getTime() === day1.getTime());
        const d2 = db.docs.find(d => d.day.getTime() === day2.getTime());
        expect(d1.qualifiedSeconds).toBe(60);
        expect(d2.qualifiedSeconds).toBe(120);
    });

    test('مضيفان مختلفان بنفس اليوم لا يتداخلان', async () => {
        const db = makeDb();
        wireMocks(db);
        const day = new Date('2024-01-07T00:00:00Z');

        await Promise.all([
            HostDailyStat.addQualifiedSeconds('host_a', day, 60),
            HostDailyStat.addQualifiedSeconds('host_b', day, 120)
        ]);

        const a = db.docs.find(d => d.host === 'host_a');
        const b = db.docs.find(d => d.host === 'host_b');
        expect(a.qualifiedSeconds).toBe(60);
        expect(b.qualifiedSeconds).toBe(120);
    });

    test('0 ثانية → لا يستدعي findOneAndUpdate إطلاقاً (بلا كتابة بلا داعٍ)', async () => {
        const db = makeDb();
        wireMocks(db);
        const spy = jest.spyOn(HostDailyStat, 'findOneAndUpdate');
        await HostDailyStat.addQualifiedSeconds('host_1', new Date(), 0);
        expect(spy).not.toHaveBeenCalled();
    });
});
