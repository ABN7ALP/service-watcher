// ملف: LiveSession.test.js
// 🛡️ feat/live-hours-host-center: جلسة بث واحدة لكل غرفة مباشرة — ادّعاء ذرّي على الفتح
// (فهرس جزئي فريد على room حين endedAt:null)، تِك ذرّي واحد لا يُطبَّق على جلسة أُغلقت للتو،
// وتعافٍ من انهيار الخادم يُغلِق كل جلسة عالقة عند *آخر تِك مؤكَّد* لا "الآن".
// نفس استراتيجية هذا المشروع الثابتة: jest.spyOn على نموذج Mongoose الحقيقي بمحاكاة بذاكرة JS.
const LiveSession = require('../LiveSession');

function makeDb() { return { docs: [], nextId: 1 }; }

function matchesFilter(doc, filter) {
    return Object.entries(filter).every(([key, val]) => {
        if (val && typeof val === 'object' && '$ne' in val) return String(doc[key]) !== String(val.$ne);
        return String(doc[key]) === String(val);
    });
}

function applyUpdate(doc, update) {
    if (update.$set) Object.assign(doc, update.$set);
    if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + v;
    if (update.$max) for (const [k, v] of Object.entries(update.$max)) doc[k] = Math.max(doc[k] || 0, v);
}

function wireMocks(db) {
    jest.spyOn(LiveSession, 'create').mockImplementation(async (data) => {
        if (db.docs.some(d => String(d.room) === String(data.room) && d.endedAt === null)) {
            throw Object.assign(new Error('duplicate key'), { code: 11000 });
        }
        const doc = { _id: `ls_${db.nextId++}`, endedAt: null, qualifiedSeconds: 0, peakListeners: 0, ...data };
        db.docs.push(doc);
        return doc;
    });
    jest.spyOn(LiveSession, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
        const doc = db.docs.find(d => matchesFilter(d, filter));
        if (!doc) return null;
        applyUpdate(doc, update);
        return doc;
    });
    jest.spyOn(LiveSession, 'findOne').mockImplementation((filter) => {
        const doc = db.docs.find(d => matchesFilter(d, filter)) || null;
        const p = Promise.resolve(doc);
        p.select = () => p;
        return p;
    });
    jest.spyOn(LiveSession, 'find').mockImplementation((filter) => {
        const rows = db.docs.filter(d => matchesFilter(d, filter));
        const p = Promise.resolve(rows);
        p.select = () => p;
        return p;
    });
    jest.spyOn(LiveSession, 'updateOne').mockImplementation(async (filter, update) => {
        const doc = db.docs.find(d => matchesFilter(d, filter));
        if (!doc) return { matchedCount: 0 };
        applyUpdate(doc, update);
        return { matchedCount: 1 };
    });
}

afterEach(() => jest.restoreAllMocks());

describe('LiveSession.openForRoom — جلسة مفتوحة واحدة فقط لكل غرفة', () => {
    test('أول فتح لغرفة ينشئ جلسة جديدة', async () => {
        const db = makeDb();
        wireMocks(db);
        const session = await LiveSession.openForRoom('room_1', 'host_1');
        expect(session).not.toBeNull();
        expect(session.host).toBe('host_1');
        expect(session.endedAt).toBeNull();
    });

    test('فتح ثانٍ لنفس الغرفة وجلستها الأولى لا تزال مفتوحة → يُعاد null بأمان (سباق/نداء مكرَّر)', async () => {
        const db = makeDb();
        wireMocks(db);
        await LiveSession.openForRoom('room_1', 'host_1');
        const second = await LiveSession.openForRoom('room_1', 'host_1');
        expect(second).toBeNull();
        expect(db.docs.length).toBe(1); // ✅ لم تُنشأ جلسة ثانية فعلياً
    });

    test('إغلاق الجلسة الأولى ثم فتح جلسة جديدة لنفس الغرفة ينجح (بث جديد حقيقي)', async () => {
        const db = makeDb();
        wireMocks(db);
        await LiveSession.openForRoom('room_1', 'host_1');
        await LiveSession.closeForRoom('room_1');
        const second = await LiveSession.openForRoom('room_1', 'host_1');
        expect(second).not.toBeNull();
        expect(db.docs.filter(d => d.endedAt === null).length).toBe(1);
    });
});

describe('LiveSession.applyTick — تِك ذرّي واحد', () => {
    test('qualifies:true → qualifiedSeconds +60 و peakListeners يُحدَّث بالأعلى', async () => {
        const db = makeDb();
        wireMocks(db);
        const session = await LiveSession.openForRoom('room_1', 'host_1');
        await LiveSession.applyTick(session._id, { qualifies: true, listenerCount: 5, now: new Date() });
        await LiveSession.applyTick(session._id, { qualifies: true, listenerCount: 3, now: new Date() });
        const final = db.docs[0];
        expect(final.qualifiedSeconds).toBe(120);
        expect(final.peakListeners).toBe(5); // ✅ $max يبقي الأعلى، لا يُستبدَل بالأحدث الأصغر
    });

    test('qualifies:false → qualifiedSeconds لا يتغيّر، لكن lastTickAt وpeakListeners يُحدَّثان', async () => {
        const db = makeDb();
        wireMocks(db);
        const session = await LiveSession.openForRoom('room_1', 'host_1');
        await LiveSession.applyTick(session._id, { qualifies: false, listenerCount: 1, now: new Date('2030-01-01T00:00:00Z') });
        const final = db.docs[0];
        expect(final.qualifiedSeconds).toBe(0);
        expect(final.peakListeners).toBe(1);
        expect(final.lastTickAt.getTime()).toBe(new Date('2030-01-01T00:00:00Z').getTime());
    });

    test('جلسة مُغلَقة فعلاً (endedAt غير null) → التِك لا يُطبَّق عليها (الشرط endedAt:null بالاستعلام نفسه)', async () => {
        const db = makeDb();
        wireMocks(db);
        const session = await LiveSession.openForRoom('room_1', 'host_1');
        await LiveSession.closeForRoom('room_1');
        const result = await LiveSession.applyTick(session._id, { qualifies: true, listenerCount: 5, now: new Date() });
        expect(result).toBeNull();
        expect(db.docs[0].qualifiedSeconds).toBe(0); // ✅ لم يُضَف شيء بعد الإغلاق
    });
});

describe('LiveSession.recoverStaleOnBoot — تعافٍ من انهيار الخادم', () => {
    test('جلسة بقيت مفتوحة من عملية سابقة تُغلَق عند آخر تِك مؤكَّد (lastTickAt) لا "الآن"', async () => {
        const db = makeDb();
        wireMocks(db);
        const staleLastTick = new Date('2024-05-01T10:00:00Z');
        db.docs.push({ _id: 'ls_stale', host: 'host_x', room: 'room_x', startedAt: new Date('2024-05-01T09:00:00Z'), endedAt: null, lastTickAt: staleLastTick, qualifiedSeconds: 600, peakListeners: 4 });

        const recovered = await LiveSession.recoverStaleOnBoot();

        expect(recovered).toBe(1);
        expect(db.docs[0].endedAt.getTime()).toBe(staleLastTick.getTime());
        expect(db.docs[0].endedAt.getTime()).not.toBe(Date.now()); // ✅ ليس "الآن" — لا وقت غير مُثبَت يُمنَح
    });

    test('جلسات مغلقة فعلاً لا تُلمَس إطلاقاً', async () => {
        const db = makeDb();
        wireMocks(db);
        const alreadyEnded = new Date('2024-05-01T08:00:00Z');
        db.docs.push({ _id: 'ls_done', host: 'host_y', room: 'room_y', startedAt: new Date(), endedAt: alreadyEnded, lastTickAt: new Date(), qualifiedSeconds: 60, peakListeners: 2 });

        const recovered = await LiveSession.recoverStaleOnBoot();

        expect(recovered).toBe(0);
        expect(db.docs[0].endedAt.getTime()).toBe(alreadyEnded.getTime()); // ✅ بلا تغيير
    });

    test('بلا أي جلسة مفتوحة → recovered=0 وبلا أي كتابة', async () => {
        const db = makeDb();
        wireMocks(db);
        const recovered = await LiveSession.recoverStaleOnBoot();
        expect(recovered).toBe(0);
    });
});
