// ملف: giftEngine.test.js
// 🛡️ feat/gift-display-engine + fix/gift-stage-top-layer: اختبارات GiftStage الخالصة (بلا
// DOM/متصفّح إطلاقاً) — التكرار، ترتيب طابور الفيديو، الكمية->شارة، السقف 20، تنظيف المغادرة،
// إسقاط القديم بعد إخفاء التبويب، موكب مدينة الملاهي (الهدايا بلا فيديو)، راعي الهدية، تأثير المقعد.
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

function makeProcHooks(overrides = {}) {
    return {
        onProcPop: jest.fn((proc, done) => done()),
        onProcLaunch: jest.fn(),
        onProcDone: jest.fn((proc, done) => done()),
        onFly: jest.fn(),
        ...overrides
    };
}

describe('GiftStage — التكرار (dedupe)', () => {
    test('نفس eventId مرتين: تأثير واحد فقط (المُرسِل لا يرى الهدية مرتين)', () => {
        const hooks = makeProcHooks();
        const stage = new GiftStage(hooks);
        const evt = makeEvt({ eventId: 'dup-1' });
        stage.handleGiftSent(evt);
        stage.handleGiftSent(evt); // ✅ نفس الحدث بالضبط يصل مرة ثانية (محاكاة إعادة تسليم)
        expect(hooks.onProcPop).toHaveBeenCalledTimes(1);
        expect(hooks.onProcLaunch).toHaveBeenCalledTimes(1);
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
    test('دفعة 25 هدية فيديو متزامنة بلا أي اكتمال: أول 20 تدخل الأنبوب، الباقي 5 موكب فقط', () => {
        const onVideoPlay = jest.fn(); // ✅ لا نستدعي done — نحاكي ضغطاً حقيقياً بلا أي تصريف إطلاقاً
        const hooks = makeProcHooks({ onVideoPlay });
        const stage = new GiftStage(hooks);
        const dragon = { id: 'dragon', videoUrl: 'https://x/dragon.mp4' };
        for (let i = 0; i < 25; i++) {
            stage.handleGiftSent(makeEvt({ eventId: `cap-${i}`, gift: dragon }));
        }
        // ✅ واحد فقط "قيد التشغيل" فعلياً بأي لحظة (onVideoPlay يُستدعى له وحده)، والـ19 الباقون
        // من أصل الـ20 المقبولين بالأنبوب ينتظرون بالطابور الداخلي بصمت حتى يحين دورهم
        expect(onVideoPlay).toHaveBeenCalledTimes(1);
        expect(stage._videoQueue).toHaveLength(19);
        // ✅ الخمسة الزائدة (تجاوزت سقف 20) تذهب لمسار الموكب (_procHandle) بدل الفيديو — سواء
        // اندمجت بموكب واحد أو تتابعت (يعتمد على توقيت onProcPop بالاختبار)، المحصّلة النهائية
        // واحدة دوماً: 5 وحدات أُطلِقت فعلياً بالمجموع، لا أقل ولا أكثر
        expect(hooks.onProcPop.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(hooks.onProcLaunch).toHaveBeenCalledTimes(5);
    });
});

describe('GiftStage — مغادرة الغرفة تُطهِّر كل شيء', () => {
    test('leaveRoom(): لا طيران/فيديو/موكب/راعي هدية متبقٍ، والحالة تبدأ نظيفة لغرفة جديدة', () => {
        const onVideoPlay = jest.fn();
        const stage = new GiftStage({ onVideoPlay, onFly: jest.fn(), ...makeProcHooks() });
        const dragon = { id: 'dragon', videoUrl: 'https://x/dragon.mp4' };
        for (let i = 0; i < 5; i++) stage.handleGiftSent(makeEvt({ eventId: `lv-${i}`, gift: dragon }));
        expect(stage._videoQueue.length + (stage._videoPlaying ? 1 : 0)).toBeGreaterThan(0);

        stage.leaveRoom();
        expect(stage._videoQueue).toHaveLength(0);
        expect(stage._videoPlaying).toBe(false);
        expect(stage._laneVisible).toHaveLength(0);
        expect(stage._topSenderByGift.size).toBe(0);
        expect(stage._procession).toBeNull();

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

describe('GiftStage — موكب مدينة الملاهي (الهدايا بلا فيديو)', () => {
    test('وردة ×1 لـ3 مستلمين: 3 وحدات بالضبط (لا تُفقَد مستلمين لأن qty=1)', () => {
        const hooks = makeProcHooks();
        const stage = new GiftStage(hooks);
        stage.handleGiftSent(makeEvt({
            eventId: 'rose-3', qty: 1,
            receivers: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]
        }));
        expect(hooks.onProcPop).toHaveBeenCalledTimes(1);
        expect(hooks.onProcLaunch).toHaveBeenCalledTimes(3);
        const recipients = hooks.onProcLaunch.mock.calls.map(c => c[2].id);
        expect(recipients).toEqual(['r1', 'r2', 'r3']); // ✅ بالتناوب بالضبط على كل المستلمين
    });

    test('qty < 10: بلا احتفال رقم كبير', () => {
        const hooks = makeProcHooks({ onProcCelebrate: jest.fn() });
        const stage = new GiftStage(hooks);
        stage.handleGiftSent(makeEvt({ eventId: 'small-qty', qty: 7 }));
        expect(hooks.onProcCelebrate).not.toHaveBeenCalled();
        expect(hooks.onProcLaunch).toHaveBeenCalledTimes(7);
    });

    test('qty ≥ 10: احتفال رقم كبير + أقصى 10 وحدات ظاهرة (العدّاد يحمل الرقم الحقيقي)', () => {
        const hooks = makeProcHooks({ onProcCelebrate: jest.fn() });
        const stage = new GiftStage(hooks);
        stage.handleGiftSent(makeEvt({ eventId: 'big-qty', qty: 99 }));
        expect(hooks.onProcCelebrate).toHaveBeenCalledTimes(1);
        expect(hooks.onProcCelebrate.mock.calls[0][0].realQty).toBe(99);
        expect(hooks.onProcLaunch).toHaveBeenCalledTimes(10); // ✅ سقف 10 وحدات ظاهرة بالضبط
    });

    test('كومبو من نفس المُرسِل+الهدية أثناء الـpop: يُمدِّد نفس الموكب (لا موكب جديد)', () => {
        let popDone = null;
        const hooks = makeProcHooks({ onProcPop: jest.fn((proc, done) => { popDone = done; }), onProcExtend: jest.fn() });
        const stage = new GiftStage(hooks);
        stage.handleGiftSent(makeEvt({ eventId: 'combo-1', sender: { id: 'S' }, qty: 5 }));
        stage.handleGiftSent(makeEvt({ eventId: 'combo-2', sender: { id: 'S' }, qty: 3 })); // ✅ أثناء نفس نافذة الـpop
        expect(hooks.onProcPop).toHaveBeenCalledTimes(1); // ✅ لا موكب ثانٍ بدأ — امتداد فقط
        expect(hooks.onProcExtend).toHaveBeenCalledTimes(1);
        popDone();
        expect(hooks.onProcLaunch).toHaveBeenCalledTimes(8); // 5+3 مُدمَجة بموكب واحد
    });

    test('موكب واحد بأي وقت — مُرسِل/هدية مختلفان أثناء موكب جارٍ يُطابَران بالطابور', () => {
        let popDoneA = null;
        const onProcPop = jest.fn((proc, done) => { if (!popDoneA) popDoneA = done; else done(); });
        const hooks = makeProcHooks({ onProcPop });
        const stage = new GiftStage(hooks);
        stage.handleGiftSent(makeEvt({ eventId: 'A', sender: { id: 'S1' }, gift: { id: 'rose' } }));
        stage.handleGiftSent(makeEvt({ eventId: 'B', sender: { id: 'S2' }, gift: { id: 'heart' } })); // مُرسِل مختلف تماماً
        expect(onProcPop).toHaveBeenCalledTimes(1); // ✅ B ينتظر بالطابور، لا موكب ثانٍ متزامن
        popDoneA();
        expect(onProcPop).toHaveBeenCalledTimes(2); // الآن يبدأ موكب B
    });

    test('وضع الأجهزة الضعيفة: سقف 3 وحدات ظاهرة بدل 10', () => {
        const hooks = makeProcHooks({ isLite: () => true });
        const stage = new GiftStage(hooks);
        stage.handleGiftSent(makeEvt({ eventId: 'lite-big', qty: 99 }));
        expect(hooks.onProcLaunch).toHaveBeenCalledTimes(3);
    });
});

describe('GiftStage — راعي الهدية (أكبر مُرسِل لكل هدية بهذي الجلسة)', () => {
    test('مُرسِلان لنفس الهدية — الأكبر مجموعاً (عند ظهور شريطه) يُعلَّم isTopSender=true، والآخر false', () => {
        // ✅ S2 يُرسِل الكمية الأكبر أولاً (يصبح الصدارة) ثم S1 يصل لاحقاً بكمية أصغر — شريط S1
        // يُبنى وقتها وقد صار S2 الصدارة فعلياً، فيظهر isTopSender=false له بشكل لا لبس فيه
        const onLaneShow = jest.fn();
        const onLaneMerge = jest.fn();
        const stage = new GiftStage({ onLaneShow, onLaneMerge, ...makeProcHooks() });
        stage.handleGiftSent(makeEvt({ eventId: 'e1', sender: { id: 'S2' }, gift: { id: 'rose' }, qty: 20, receivers: [{ id: 'other' }] }));
        stage.handleGiftSent(makeEvt({ eventId: 'e2', sender: { id: 'S1' }, gift: { id: 'rose' }, qty: 5 }));

        const items = onLaneShow.mock.calls.map(c => c[0]);
        const s1Item = items.find(it => it.sender.id === 'S1');
        const s2Item = items.find(it => it.sender.id === 'S2');
        expect(s2Item.isTopSender).toBe(true); // 20 وحدة — الأكبر والوحيد وقتها
        expect(s1Item.isTopSender).toBe(false); // 5 وحدات فقط، وS2 صاحب الصدارة فعلاً عند ظهور شريطه
    });

    test('مُرسِل يسبق بشريطه ثم يتخطّاه آخر — الوسم يُنقَل فوراً (بثّ حيّ، لا تجميد لحظة الظهور)', () => {
        // ✅ وُجد هذا تحديداً بفحص حيّ على المتصفح الحقيقي: S1 يُرسِل أولاً فيصبح الصدارة (شريطه
        // يُعلَّم isTopSender=true)، ثم S2 يصل بكمية أكبر — إن بقي شريط S1 القديم معلَّماً لأنه
        // لم يُعَد فحصه، يظهر وسم "راعي الهدية" على شريطين معاً، وهذا خطأ: يجب أن يُنزَع من S1
        // فور تخطّي S2 له (onLaneMerge تُستدعى على شريط S1 القديم لتحديث DOM فعلياً لا فقط الحالة)
        const onLaneShow = jest.fn();
        const onLaneMerge = jest.fn();
        const stage = new GiftStage({ onLaneShow, onLaneMerge, ...makeProcHooks() });
        stage.handleGiftSent(makeEvt({ eventId: 'e1', sender: { id: 'S1' }, gift: { id: 'rose' }, qty: 10 }));
        const s1Item = onLaneShow.mock.calls[0][0];
        expect(s1Item.isTopSender).toBe(true);

        stage.handleGiftSent(makeEvt({ eventId: 'e2', sender: { id: 'S2' }, gift: { id: 'rose' }, qty: 50, receivers: [{ id: 'other' }] }));
        const s2Item = onLaneShow.mock.calls[1][0];
        expect(s2Item.isTopSender).toBe(true);
        expect(s1Item.isTopSender).toBe(false); // نُزِع منه فوراً عند تخطّي S2
        expect(onLaneMerge).toHaveBeenCalledWith(s1Item); // أُعيد رسم شريط S1 القديم فعلياً
    });
});

describe('GiftStage — الشريط الجانبي: سقف ديناميكي (feat/room-notice-lanes-v2)', () => {
    test('بلا hooks.laneCapacity: يبقى السقف الافتراضي 2 (LANE_MAX_VISIBLE)', () => {
        const onLaneShow = jest.fn();
        const stage = new GiftStage({ onLaneShow, ...makeProcHooks() });
        stage.handleGiftSent(makeEvt({ eventId: 'e1', sender: { id: 'S1' }, gift: { id: 'g1' } }));
        stage.handleGiftSent(makeEvt({ eventId: 'e2', sender: { id: 'S2' }, gift: { id: 'g2' } }));
        stage.handleGiftSent(makeEvt({ eventId: 'e3', sender: { id: 'S3' }, gift: { id: 'g3' } }));
        expect(onLaneShow).toHaveBeenCalledTimes(2); // S3 ينتظر بالطابور — لم تُستدعَ onLaneShow له بعد
        expect(stage._laneVisible).toHaveLength(2);
        expect(stage._laneQueue).toHaveLength(1);
    });

    test('hooks.laneCapacity تُستعلَم حياً — ترجع 3 فتُظهِر 3 شرائط معاً فعلاً', () => {
        const onLaneShow = jest.fn();
        const stage = new GiftStage({ onLaneShow, laneCapacity: () => 3, ...makeProcHooks() });
        stage.handleGiftSent(makeEvt({ eventId: 'e1', sender: { id: 'S1' }, gift: { id: 'g1' } }));
        stage.handleGiftSent(makeEvt({ eventId: 'e2', sender: { id: 'S2' }, gift: { id: 'g2' } }));
        stage.handleGiftSent(makeEvt({ eventId: 'e3', sender: { id: 'S3' }, gift: { id: 'g3' } }));
        expect(onLaneShow).toHaveBeenCalledTimes(3);
        expect(stage._laneVisible).toHaveLength(3);
        expect(stage._laneQueue).toHaveLength(0);
    });
});

describe('GiftStage — الشريط الجانبي: دمج نفس المُرسِل+الهدية أثناء الانتظار بالطابور (feat/room-notice-lanes-v2)', () => {
    test('نفس comboKey يصل مرتين وهو لا يزال بالطابور — يُحدَّث عدّاده صامتاً بدل صفّ جديد مكرَّر', () => {
        // ✅ الطلب الصريح: "A new hit with the same comboKey updates its existing lane's ×N
        // (small bump) instead of a new slot, even while queued" — لا onLaneShow له إطلاقاً
        // بعد (لم يأتِ دوره)، ولا onLaneMerge أيضاً (لا عنصر DOM ظاهر بعد ليُحدَّث)؛ فقط عدّاده
        // الداخلي يتجمَّع، فيظهر بالعدّاد الصحيح المُجمَّع لحظة ظهوره الفعلي لاحقاً
        const onLaneShow = jest.fn();
        const onLaneMerge = jest.fn();
        const stage = new GiftStage({ onLaneShow, onLaneMerge, ...makeProcHooks() });
        // ✅ يملأ السقف الافتراضي (2) بمُرسِلَين مختلفَين أولاً كي يُجبَر S3 على الانتظار بالطابور
        stage.handleGiftSent(makeEvt({ eventId: 'e1', sender: { id: 'S1' }, gift: { id: 'g1' } }));
        stage.handleGiftSent(makeEvt({ eventId: 'e2', sender: { id: 'S2' }, gift: { id: 'g2' } }));
        stage.handleGiftSent(makeEvt({ eventId: 'e3', sender: { id: 'S3' }, gift: { id: 'g3' }, qty: 5 }));
        expect(stage._laneQueue).toHaveLength(1);

        // 🎯 S3 يُرسِل نفس الهدية مرة ثانية وهو لا يزال بالطابور فقط — لا onLaneShow/onLaneMerge
        stage.handleGiftSent(makeEvt({ eventId: 'e4', sender: { id: 'S3' }, gift: { id: 'g3' }, qty: 7 }));
        expect(stage._laneQueue).toHaveLength(1); // لا صفّ ثانٍ مكرَّر — نفس العنصر تحدَّث فقط
        expect(stage._laneQueue[0].count).toBe(12); // 5 + 7 مُجمَّعة
        expect(onLaneShow).toHaveBeenCalledTimes(2); // S1/S2 فقط — S3 لم يظهر بعد إطلاقاً
        expect(onLaneMerge).not.toHaveBeenCalled(); // لا عنصر DOM لـS3 ليُحدَّث أصلاً وهو بالطابور

        // ✅ حين يأتي دور S3 فعلياً (أحد الظاهرَين ينتهي)، يظهر بالعدّاد المُجمَّع الصحيح (12) لا الأول (5)
        stage.laneExpire(stage._laneVisible[0]);
        const s3Item = onLaneShow.mock.calls[2][0];
        expect(s3Item.sender.id).toBe('S3');
        expect(s3Item.count).toBe(12);
    });
});

describe('GiftStage — تأثير المقعد (هدية مُعلَّمة من الأدمن مثل "تاج")', () => {
    test('gift.seatEffect موجودة: onSeatEffect تُستدعى مرة لكل مستلم', () => {
        const onSeatEffect = jest.fn();
        const stage = new GiftStage({ onSeatEffect, ...makeProcHooks() });
        stage.handleGiftSent(makeEvt({
            eventId: 'crown-1', gift: { id: 'crown', seatEffect: '👑' },
            receivers: [{ id: 'r1' }, { id: 'r2' }]
        }));
        expect(onSeatEffect).toHaveBeenCalledTimes(2);
    });

    test('gift.seatEffect غير موجودة: onSeatEffect لا تُستدعى إطلاقاً', () => {
        const onSeatEffect = jest.fn();
        const stage = new GiftStage({ onSeatEffect, ...makeProcHooks() });
        stage.handleGiftSent(makeEvt({ eventId: 'no-crown', gift: { id: 'rose' } }));
        expect(onSeatEffect).not.toHaveBeenCalled();
    });
});
