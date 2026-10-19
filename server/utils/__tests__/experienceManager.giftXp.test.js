// ملف: experienceManager.giftXp.test.js
// 🛡️ طلب صريح (هدايا v2): "Sender XP = floor(totalCoins / 3)" — بلا سقف أقصى (كان
// GIFT_XP_MAX_PER_TRANSACTION=500 يُطبَّق على المُرسِل أيضاً سابقاً، بالإضافة لـMath.round
// بدل floor). قاعدة المستقبِل (القسمة على 6 + السقف 500) تبقى كما كانت تماماً — لم تتغيّر.
//
// نفس استراتيجية هذا المشروع الثابتة: jest.spyOn على نموذج User الحقيقي بدل قاعدة بيانات
// حقيقية أو محاكاتها بـmongodb-memory-server (راجع jest.config.js — تنزيل ثنائي mongod قد
// يفشل ببيئات التشغيل التي تحجب نطاقات mongodb.org/mongodb.com؛ لا نخاطر بكسر الاختبار هناك)
// 🐛 اختبارات الخبرة الضخمة أدناه تُسبِّب ترقية مستوى حقيقية (levelUp) — grantGiftXp يستدعي
// عندها sendBotMessage (رسالة تهنئة من البوت)، التي بدورها تستعلم عن مستند مستخدم حقيقي
// بقاعدة بيانات غير متصلة هنا، فتنتظر 10 ثوانٍ كاملة (مهلة Mongoose الافتراضية) قبل فشلها
// بصمت (معالَجة داخلياً بـbotMessenger.js نفسها، لا تُسقط الاختبار لكنها تُبطئه وتُلوِّث
// سجلّ الإخراج بخطأ مخيف لا علاقة له بما يُختبَر هنا فعلياً) — محاكاتها هنا تتجنّب الاثنين
jest.mock('../botMessenger', () => ({ sendBotMessage: jest.fn().mockResolvedValue(undefined) }));

const User = require('../../models/User');
const { addGiftExperience } = require('../experienceManager');

function makeUserDoc(overrides = {}) {
    const doc = {
        _id: 'u1',
        level: 1,
        experience: 0,
        socketId: null,
        ...overrides,
        save: async function () { return this; }
    };
    return doc;
}

function makeIo() {
    return { to: () => ({ emit: () => {} }) };
}

describe('addGiftExperience — خبرة المُرسِل بلا سقف أقصى، floor لا round', () => {
    afterEach(() => jest.restoreAllMocks());

    test('هدية ضخمة واحدة (كانت ستُحدّ بـ500 سابقاً): المُرسِل يحصل floor(coinsSpent/3) كاملة بلا أي سقف', async () => {
        const user = makeUserDoc();
        jest.spyOn(User, 'findById').mockResolvedValue(user);

        const coinsSpent = 131400; // هدية "التنين" الأسطورية × كمية كبيرة (مثال واقعي من النموذج)
        await addGiftExperience(makeIo(), 'u1', coinsSpent, 'sender');

        const expectedRawXp = Math.floor(coinsSpent / 3); // 43800 — أكبر بكثير من السقف القديم 500
        // ✅ قد يرتفع المستوى عدة مرات أثناء المنح (requiredXp=level*1500) — نعيد حساب experience/level
        // المتوقعين يدوياً هنا بنفس حلقة grantGiftXp بالضبط، كي يبقى التحقق حقيقياً لا تقديرياً
        let level = 1, xp = expectedRawXp;
        while (xp >= level * 1500) { xp -= level * 1500; level++; }
        expect(user.level).toBe(level);
        expect(user.experience).toBe(xp);
        expect(expectedRawXp).toBeGreaterThan(500); // ✅ يثبت فعلياً أن هذا المبلغ كان سيُحَدّ سابقاً
    });

    test('floor لا round: مبلغ يقع تماماً بين درجتَي تقريب (coinsSpent=11 ⇒ 11/3=3.666)', async () => {
        const user = makeUserDoc();
        jest.spyOn(User, 'findById').mockResolvedValue(user);

        await addGiftExperience(makeIo(), 'u1', 11, 'sender');

        expect(user.experience).toBe(3); // floor(3.666)=3 — لو كانت round لكانت 4
    });

    test('قاعدة المستقبِل لم تتغيّر: القسمة على 6 + Math.round + سقف 500 كما كانت تماماً', async () => {
        const user = makeUserDoc();
        jest.spyOn(User, 'findById').mockResolvedValue(user);

        await addGiftExperience(makeIo(), 'u1', 131400, 'receiver');

        // round(131400/6)=21900، لكن السقف 500 يبقى سارياً للمستقبِل (لم يُحذف إلا للمُرسِل)
        let level = 1, xp = 500;
        while (xp >= level * 1500) { xp -= level * 1500; level++; }
        expect(user.level).toBe(level);
        expect(user.experience).toBe(xp);
    });
});
