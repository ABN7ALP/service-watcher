// ملف: frameController.race.test.js
// 🛡️ مراجعة أمنية (redteam-audit-1 — البند #2، Critical): purchaseFrame كانت تقرأ
// user.coins، تفحص coins < price، ثم تُعدِّل coins وownedFrames (دفع لعنصر مصفوفة) بعملية
// save() واحدة لاحقة — بلا أي معاملة أو شرط ذرّي. أُثبِت فعلياً: مستخدم برصيد كافٍ لشراء واحد
// بالضبط، 5 طلبات شراء متزامنة لنفس الإطار → 5 استجابات 200، خصم مرة واحدة فقط (coins:0) لكن
// ownedFrames.length:5 — تكرار مجاني غير محدود لأي عنصر مدفوع.
//
// الإصلاح: المعاملة الآن تقرأ user من جديد داخل جلستها الخاصة (لا القراءة المسبقة)، فيكتشف
// محرّك Mongo الحقيقي أي تضارب كتابة بين معاملتين متزامنتين تعدِّلان نفس المستند، وwithTransaction
// تُعيد تنفيذ الدالة بالكامل تلقائياً عند هذا التضارب (قراءة جديدة، لا الحالة القديمة).
//
// بخلاف باقي اختبارات هذا المشروع (jest.spyOn مباشر على findOneAndUpdate بشرط $gte)، هذا
// المسار يعتمد فعلياً على آلية إعادة المحاولة التلقائية لـwithTransaction عند تضارب كتابة بين
// جلستين — فمحاكاة هذا الاختبار تُحاكي تلك الآلية بالذات (إصدار مستند بسيط __v + رفض save()
// عند عدم تطابق الإصدار المقروء مع الحالي + إعادة محاولة withTransaction تلقائياً)، لا مجرد
// شرط $gte بسيط، كي يُثبِت أن الحل الحقيقي (الاعتماد على اكتشاف Mongo الذاتي للتضارب) يعمل لا
// فقط أن الكود "يبدو" صحيحاً
jest.useFakeTimers();

const mongoose = require('mongoose');
const User = require('../../models/User');
const ProfileFrame = require('../../models/ProfileFrame');
const frameController = require('../frameController');

function makeDb() {
    return { users: new Map() };
}
function seedUser(db, overrides) {
    const user = { _id: 'u1', coins: 0, ownedFrames: [], __v: 0, ...overrides };
    db.users.set(user._id, user);
    return user;
}

// ✅ كل قراءة findById تأخذ "مسودة" (draft) بنسخة مستقلة تماماً من ownedFrames عند لحظة
// القراءة بالضبط (تماماً كمستند Mongoose حقيقي بذاكرة معاملته الخاصة) — لا مرجعاً مشتركاً؛
// save() ترفض (تضارب كتابة) فقط لو تغيّر __v بالقاعدة منذ هذي القراءة بالذات
function wireMocks(db) {
    jest.spyOn(User, 'findById').mockImplementation((id) => {
        const chain = {
            session: () => chain,
            then: (resolve, reject) => {
                try {
                    const row = db.users.get(String(id));
                    if (!row) return resolve(null);
                    const readVersion = row.__v;
                    const draft = {
                        _id: row._id,
                        coins: row.coins,
                        ownedFrames: row.ownedFrames.map(o => ({ ...o })),
                        save: async () => {
                            const current = db.users.get(String(id));
                            if (current.__v !== readVersion) {
                                throw Object.assign(new Error('Write conflict'), { code: 112 });
                            }
                            current.coins = draft.coins;
                            current.ownedFrames = draft.ownedFrames;
                            current.__v = readVersion + 1;
                        }
                    };
                    resolve(draft);
                } catch (e) { reject(e); }
            }
        };
        return chain;
    });

    jest.spyOn(mongoose, 'startSession').mockImplementation(async () => ({
        // ✅ نفس سلوك withTransaction الحقيقي بالضبط: تضارب كتابة (code 112) يُعاد تنفيذ الدالة
        // بالكامل تلقائياً (قراءة جديدة في كل مرة)؛ أي خطأ آخر (مثل INSUFFICIENT) يُرمى فوراً بلا إعادة محاولة
        withTransaction: async (fn) => {
            for (let attempt = 0; attempt < 20; attempt++) {
                try { return await fn(); }
                catch (err) {
                    if (err.code === 112) continue;
                    throw err;
                }
            }
            throw new Error('too many retries');
        },
        endSession: async () => {}
    }));
}

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
function mockReq(overrides) {
    return { user: { id: 'u1' }, body: {}, io: null, ...overrides };
}

describe('purchaseFrame — تضارب الكتابة الحقيقي يمنع تكراراً مجانياً (البند #2)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('رصيد يكفي شراءً واحداً بالضبط + 5 طلبات متزامنة لنفس الإطار: واحد فقط ينجح، البقية "رصيد غير كافٍ"', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', coins: 100 });
        jest.spyOn(ProfileFrame, 'findById').mockResolvedValue({
            _id: 'f1', isActive: true, name: 'إطار تجريبي', prices: { day1: 100, day3: 200, day7: 300 }
        });
        wireMocks(db);

        const reqs = Array.from({ length: 5 }, () => mockReq({ body: { frameId: 'f1', duration: '1' } }));
        const reses = Array.from({ length: 5 }, () => mockRes());

        await Promise.all(reqs.map((req, i) => frameController.purchaseFrame(req, reses[i])));

        const bodies = reses.map(r => r.json.mock.calls[0][0]);
        const successCount = bodies.filter(b => b.status === 'success').length;
        const failCount = bodies.filter(b => b.status === 'fail').length;

        expect(successCount).toBe(1); // ✅ جوهر الإصلاح: ليس 5
        expect(failCount).toBe(4);
        expect(user.coins).toBe(0); // خصم مرة واحدة فقط
        expect(user.ownedFrames).toHaveLength(1); // ✅ ليس 5 — لا تكرار مجاني
    });

    test('مسار سعيد فردي (بلا تزامن): يخصم السعر ويضيف إطاراً واحداً', async () => {
        const db = makeDb();
        const user = seedUser(db, { _id: 'u1', coins: 500 });
        jest.spyOn(ProfileFrame, 'findById').mockResolvedValue({
            _id: 'f1', isActive: true, name: 'إطار تجريبي', prices: { day1: 100, day3: 200, day7: 300 }
        });
        wireMocks(db);

        const req = mockReq({ body: { frameId: 'f1', duration: '1' } });
        const res = mockRes();
        await frameController.purchaseFrame(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
        expect(user.coins).toBe(400);
        expect(user.ownedFrames).toHaveLength(1);
    });
});
