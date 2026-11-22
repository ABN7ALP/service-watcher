// ملف: giftEngine.test.js
// 🛡️ feat/gift-display-engine: اختبارات GiftStage الخالصة (بلا DOM/متصفّح إطلاقاً) — كل سلوك
// مذكور صراحة بطلب إعادة تصميم محرّك عرض الهدايا: التكرار (المُرسِل يرى مؤثراً واحداً فقط)،
// ترتيب الطابور، الكمية->شارة، السقف 20، تنظيف المغادرة، إسقاط القديم بعد إخفاء التبويب.
const GiftStage = require('../giftEngine.js');

function makeEvt(overrides = {}) {
    return {
        eventId: `ev_${Math.random().toString(36).slice(2)}`,
        roomId: 'room1',
        sender: { id: 'u1', username: 'sender' },
        receivers: [{ id: 'r1', username: 'recipient' }],
        gift: { id: 'g1', name: 'وردة', image: null, videoUrl: null, tier: 'common' },
        qty: 1,
        comboKey: null,
        sentAt: Date.now(),
        ...overrides
    };
}

describe('GiftStage — التكرار (dedupe)', () => {
    test('نفس eventId مرتين: تأثير واحد فقط (المُرسِل لا يرى الهدية مرتين)', () => {
        const onPop = jest.fn((evt, done) => done());
        const onFly = jest.fn();
        const stage = new GiftStage({ onPop, onFly });
        const evt = makeEvt({ eventId: 'dup-1' });
        stage.handleGiftSent(evt);
        stage.handleGiftSent(evt); // ✅ نفس الحدث بالضبط يصل مرة ثانية (محاكاة إعادة تسليم)
        expect(onPop).toHaveBeenCalledTimes(1);
        expect(onFly).toHaveBeenCalledTimes(1);
    });
});

describe('GiftStage — طابور الفيديو: الترتيب والتسلسل', () => {
    test('3 تنانين من مُرسِلَين: تُشغَّل بترتيب الوصول بالضبط، واحداً تلو الآخر', () => {
        const order = [];
        let pendingDone = null;
        const onVideoPlay = jest.fn((item, done) => {
            order.push(item.evt.sender.id);
            pendingDone = done;
        });
        const onFly = jest.fn();
        const stage = new GiftStage({ onVideoPlay, onFly });
        const dragon = { id: 'dragon', videoUrl: 'https://x/dragon.mp4' };

        stage.handleGiftSent(makeEvt({ eventId: 'e1', sender: { id: 'A' }, gift: dragon }));
        expect(onVideoPlay).toHaveBeenCalledTimes(1); // ✅ الأول يبدأ فوراً (الطابور كان فارغاً)
        stage.handleGiftSent(makeEvt({ eventId: 'e2', sender: { id: 'B' }, gift: dragon }));
        stage.handleGiftSent(makeEvt({ eventId: 'e3', sender: { id: 'A' }, gift: dragon }));
        expect(onVideoPlay).toHaveBeenCalledTimes(1); // ✅ الثاني والثالث ينتظران بالطابور فعلياً

        pendingDone(); // أول فيديو انتهى
        expect(onVideoPlay).toHaveBeenCalledTimes(2);
        pendingDone(); // ثاني فيديو انتهى
        expect(onVideoPlay).toHaveBeenCalledTimes(3);
        pendingDone();

        expect(order).toEqual(['A', 'B', 'A']); // ✅ ترتيب الوصول بالضبط، بصرف النظر عن المُرسِل
        expect(onFly).toHaveBeenCalledTimes(3); // كل فيديو يطير لمقعده بعد انتهائه
    });
});

describe('GiftStage — الكمية الكبيرة: حتى 3 تشغيلات + شارة ×N على الأخير فقط', () => {
    test('qty=99 لنفس الهدية: 3 تشغيلات فيديو، badgeQty=99 على الثالث فقط', () => {
        const plays = [];
        let pendingDone = null;
        const onVideoPlay = jest.fn((item, done) => { plays.push(item); pendingDone = done; });
        const stage = new GiftStage({ onVideoPlay, onFly: jest.fn() });
        stage.handleGiftSent(makeEvt({
            eventId: 'big-qty', qty: 99, gift: { id: 'dragon', videoUrl: 'https://x/dragon.mp4' }
        }));
        pendingDone(); pendingDone(); pendingDone();

        expect(onVideoPlay).toHaveBeenCalledTimes(3);
        expect(plays.map(p => p.badgeQty)).toEqual([null, null, 99]);
        expect(plays.map(p => p.isLast)).toEqual([false, false, true]);
    });
});

describe('GiftStage — سقف طابور الفيديو (20)', () => {
    test('دفعة 25 هدية فيديو متزامنة بلا أي اكتمال: أول 20 تدخل الأنبوب، الباقي 5 تطير فقط', () => {
        const onVideoPlay = jest.fn(); // ✅ لا نستدعي done — نحاكي ضغطاً حقيقياً بلا أي تصريف إطلاقاً
        const onPop = jest.fn((evt, done) => done());
        const onFly = jest.fn();
        const stage = new GiftStage({ onVideoPlay, onPop, onFly });
        const dragon = { id: 'dragon', videoUrl: 'https://x/dragon.mp4' };
        for (let i = 0; i < 25; i++) {
            stage.handleGiftSent(makeEvt({ eventId: `cap-${i}`, gift: dragon }));
        }
        // ✅ واحد فقط "قيد التشغيل" فعلياً بأي لحظة (onVideoPlay يُستدعى له وحده)، والـ19 الباقون
        // من أصل الـ20 المقبولين بالأنبوب ينتظرون بالطابور الداخلي بصمت حتى يحين دورهم
        expect(onVideoPlay).toHaveBeenCalledTimes(1);
        expect(stage._videoQueue).toHaveLength(19);
        expect(onPop).toHaveBeenCalledTimes(5); // ✅ الخمسة الزائدة (تجاوزت سقف 20 بالأنبوب): شريط جانبي + طيران فقط
        expect(onFly).toHaveBeenCalledTimes(5);
    });
});

describe('GiftStage — مغادرة الغرفة تُطهِّر كل شيء', () => {
    test('leaveRoom(): لا طيران/فيديو متبقٍ، والحالة تبدأ نظيفة لغرفة جديدة', () => {
        const onVideoPlay = jest.fn();
        const onPop = jest.fn();
        const stage = new GiftStage({ onVideoPlay, onPop, onFly: jest.fn() });
        const dragon = { id: 'dragon', videoUrl: 'https://x/dragon.mp4' };
        for (let i = 0; i < 5; i++) stage.handleGiftSent(makeEvt({ eventId: `lv-${i}`, gift: dragon }));
        expect(stage._videoQueue.length + (stage._videoPlaying ? 1 : 0)).toBeGreaterThan(0);

        stage.leaveRoom();
        expect(stage._videoQueue).toHaveLength(0);
        expect(stage._videoPlaying).toBe(false);
        expect(stage._flyActive).toBe(0);
        expect(stage._laneVisible).toHaveLength(0);

        // ✅ غرفة جديدة تعمل بشكل طبيعي تماماً بعد التطهير — لا بقايا تمنع هدية جديدة
        onVideoPlay.mockClear();
        stage.handleGiftSent(makeEvt({ eventId: 'fresh-1', gift: dragon }));
        expect(onVideoPlay).toHaveBeenCalledTimes(1);
    });
});

describe('GiftStage — إخفاء التبويب يوقف الطابور ويُسقط القديم عند العودة', () => {
    test('مخفي أثناء الانتظار: لا تشغيل جديد؛ عند العودة بعد >30ث تُسقَط العناصر القديمة فقط', () => {
        let clock = 1000;
        const onVideoPlay = jest.fn((item, done) => { /* لا استدعاء done — يبقى قيد "التشغيل" بالاختبار */ });
        const stage = new GiftStage({ onVideoPlay, onFly: jest.fn(), now: () => clock });
        const dragon = { id: 'dragon', videoUrl: 'https://x/dragon.mp4' };

        stage.handleGiftSent(makeEvt({ eventId: 'v1', gift: dragon })); // يبدأ فوراً (يبقى "عالقاً" بلا done)
        stage.setHidden(true);

        clock += 5000; // +5ث: هدية جديدة تصل أثناء الإخفاء — يجب ألا تُشغَّل الآن
        stage.handleGiftSent(makeEvt({ eventId: 'v2-fresh', gift: dragon }));
        expect(onVideoPlay).toHaveBeenCalledTimes(1); // فقط v1 (التي بدأت قبل الإخفاء)

        clock += 40000; // مجموع الغياب تجاوز 30ث منذ إضافة v2
        stage.setHidden(false);
        // v1 ما زالت "تُشغَّل" (لم تُستدعَ done لها قط) فالطابور لا يتقدّم أصلاً — v2 يجب أن تكون
        // قد أُسقِطت فعلياً من الطابور (أقدم من 30ث)، فلا تُحتسَب حتى لو انتهت v1 لاحقاً
        expect(stage._videoQueue.find(it => it.evt.eventId === 'v2-fresh')).toBeUndefined();
    });

    test('مخفي ثم عودة خلال أقل من 30ث: العنصر المنتظر يبقى ويُشغَّل بعد انتهاء الحالي', () => {
        let clock = 1000;
        let firstDone = null;
        const onVideoPlay = jest.fn((item, done) => { if (!firstDone) firstDone = done; });
        const stage = new GiftStage({ onVideoPlay, onFly: jest.fn(), now: () => clock });
        const dragon = { id: 'dragon', videoUrl: 'https://x/dragon.mp4' };

        stage.handleGiftSent(makeEvt({ eventId: 'v1', gift: dragon }));
        stage.setHidden(true);
        clock += 5000;
        stage.handleGiftSent(makeEvt({ eventId: 'v2-recent', gift: dragon }));
        clock += 2000; // غياب إجمالي 7ث فقط — أقل من 30ث
        stage.setHidden(false);
        expect(onVideoPlay).toHaveBeenCalledTimes(1); // v1 لا تزال تُشغَّل، v2 بالطابور بانتظار دورها

        firstDone(); // v1 تنتهي الآن
        expect(onVideoPlay).toHaveBeenCalledTimes(2); // ✅ v2 بدأت فعلياً، لم تُسقَط
    });
});
