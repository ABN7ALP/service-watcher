// ملف: giftController.buildGiftWalletEntries.test.js
// 🛡️ دفتر الأستاذ (feat/wallet-ledger-v1): يختبر مباشرة النواة المشتركة التي تمر منها كل
// مسارات الإهداء (REST الفردي، gift:combo، الدفعة، الهدية العامة، القفاز) — ترتيب الإنفاق
// (بونص أولاً)، تقسيم beans_w/beans_p حسب مصدر التمويل بالضبط، "الحسابات المرتبطة تصل
// beans_p دوماً" بصرف النظر عن المصدر، والتوزيع الدقيق بلا تسرّب تقريب على عدّة مستلمين معاً.
// محاكاة computeCoinSpendSplit وحدها (jest.spyOn) — لا حاجة لقاعدة بيانات أو معاملة حقيقية،
// الدالة المُختبَرة لا تكتب شيئاً بنفسها، فقط تبني مصفوفة entries
//
// 🐛 jest.useFakeTimers() قبل require('../giftController') — الملف يحمّل setInterval حقيقي
// (تنظيف محدِّد معدّل الهدايا) غير مرتبط بهذا الاختبار عند الاستيراد نفسه؛ نفس سبب
// giftController.pkScore.test.js المجاور بالضبط
jest.useFakeTimers();
jest.mock('../../utils/botMessenger', () => ({ sendBotMessage: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../fanClubController', () => ({ awardFanPoints: jest.fn() }));

const walletService = require('../../utils/walletService');
const { buildGiftWalletEntries } = require('../giftController');

function mockSplit(fromBonus, fromPaid) {
    jest.spyOn(walletService, 'computeCoinSpendSplit').mockResolvedValue({ fromBonus, fromPaid });
}

describe('buildGiftWalletEntries — ترتيب الإنفاق وتقسيم beans_w/beans_p', () => {
    afterEach(() => jest.restoreAllMocks());

    test('تمويل كامل من المدفوع (fromPaid فقط): خصم coins_paid، استلام beans_w كاملة (غير مرتبطين)', async () => {
        mockSplit(0, 300);
        const entries = await buildGiftWalletEntries({
            senderId: 's1', receiverIds: ['r1'], totalCost: 300, session: {}, idemBase: 'tx1', linkedFlags: [false]
        });

        expect(entries).toEqual([
            { user: 's1', wallet: 'coins_paid', delta: -300, type: 'gift_send', refType: 'GiftLog', refId: 'tx1', idempotencyKey: 'tx1:send-paid' },
            { user: 'r1', wallet: 'beans_w', delta: 300, type: 'gift_receive', refType: 'GiftLog', refId: 'tx1', idempotencyKey: 'tx1:recv-w-0' }
        ]);
    });

    test('تمويل كامل من البونص (fromBonus فقط): خصم coins_bonus، استلام beans_p كاملة (غير مرتبطين)', async () => {
        mockSplit(300, 0);
        const entries = await buildGiftWalletEntries({
            senderId: 's1', receiverIds: ['r1'], totalCost: 300, session: {}, idemBase: 'tx1', linkedFlags: [false]
        });

        expect(entries).toEqual([
            { user: 's1', wallet: 'coins_bonus', delta: -300, type: 'gift_send', refType: 'GiftLog', refId: 'tx1', idempotencyKey: 'tx1:send-bonus' },
            { user: 'r1', wallet: 'beans_p', delta: 300, type: 'gift_receive', refType: 'GiftLog', refId: 'tx1', idempotencyKey: 'tx1:recv-p-0' }
        ]);
    });

    test('تمويل مختلط (بونص جزئي + مدفوع جزئي): خصمان للمرسل، تقسيم مطابق بالضبط للمستلم (غير مرتبطين)', async () => {
        mockSplit(100, 200);
        const entries = await buildGiftWalletEntries({
            senderId: 's1', receiverIds: ['r1'], totalCost: 300, session: {}, idemBase: 'tx1', linkedFlags: [false]
        });

        const senderEntries = entries.filter(e => e.user === 's1');
        const receiverEntries = entries.filter(e => e.user === 'r1');
        expect(senderEntries).toEqual(expect.arrayContaining([
            { user: 's1', wallet: 'coins_bonus', delta: -100, type: 'gift_send', refType: 'GiftLog', refId: 'tx1', idempotencyKey: 'tx1:send-bonus' },
            { user: 's1', wallet: 'coins_paid', delta: -200, type: 'gift_send', refType: 'GiftLog', refId: 'tx1', idempotencyKey: 'tx1:send-paid' }
        ]));
        expect(receiverEntries).toEqual(expect.arrayContaining([
            { user: 'r1', wallet: 'beans_w', delta: 200, type: 'gift_receive', refType: 'GiftLog', refId: 'tx1', idempotencyKey: 'tx1:recv-w-0' },
            { user: 'r1', wallet: 'beans_p', delta: 100, type: 'gift_receive', refType: 'GiftLog', refId: 'tx1', idempotencyKey: 'tx1:recv-p-0' }
        ]));
        // ✅ المجموع المُستلَم = التكلفة الكلية بالضبط، بلا أي تسرّب
        const receivedTotal = receiverEntries.reduce((s, e) => s + e.delta, 0);
        expect(receivedTotal).toBe(300);
    });

    test('حسابان مرتبطان (areLinked=true): القيمة الكاملة (بونص+مدفوع معاً) تذهب beans_p — بلا أي beans_w إطلاقاً', async () => {
        mockSplit(100, 200); // ✅ نفس التمويل المختلط أعلاه، لكن المستلم مرتبط بالمرسل هذي المرة
        const entries = await buildGiftWalletEntries({
            senderId: 's1', receiverIds: ['r1'], totalCost: 300, session: {}, idemBase: 'tx1', linkedFlags: [true]
        });

        const receiverEntries = entries.filter(e => e.user === 'r1');
        expect(receiverEntries).toEqual([
            { user: 'r1', wallet: 'beans_p', delta: 300, type: 'gift_receive', refType: 'GiftLog', refId: 'tx1', idempotencyKey: 'tx1:recv-linked-0', meta: { linked: true } }
        ]);
        expect(receiverEntries.some(e => e.wallet === 'beans_w')).toBe(false); // ✅ لا أي مبلغ قابل للسحب رغم أن نصفه كان "مدفوعاً" أصلاً
    });

    test('3 مستلمين، تمويل مختلط، أحدهم مرتبط فقط: كل مستلم يُعامَل بقاعدته الخاصة بلا تداخل', async () => {
        mockSplit(30, 60); // المجموع 90 على 3 مستلمين: 10 بونص + 20 مدفوع لكل واحد بالتساوي
        const entries = await buildGiftWalletEntries({
            senderId: 's1', receiverIds: ['r1', 'r2', 'r3'], totalCost: 90, session: {}, idemBase: 'tx1',
            linkedFlags: [false, true, false]
        });

        const byReceiver = (id) => entries.filter(e => e.user === id);
        expect(byReceiver('r1')).toEqual(expect.arrayContaining([
            { user: 'r1', wallet: 'beans_w', delta: 20, type: 'gift_receive', refType: 'GiftLog', refId: 'tx1', idempotencyKey: 'tx1:recv-w-0' },
            { user: 'r1', wallet: 'beans_p', delta: 10, type: 'gift_receive', refType: 'GiftLog', refId: 'tx1', idempotencyKey: 'tx1:recv-p-0' }
        ]));
        expect(byReceiver('r2')).toEqual([
            { user: 'r2', wallet: 'beans_p', delta: 30, type: 'gift_receive', refType: 'GiftLog', refId: 'tx1', idempotencyKey: 'tx1:recv-linked-1', meta: { linked: true } }
        ]);
        expect(byReceiver('r3')).toEqual(expect.arrayContaining([
            { user: 'r3', wallet: 'beans_w', delta: 20, type: 'gift_receive', refType: 'GiftLog', refId: 'tx1', idempotencyKey: 'tx1:recv-w-2' },
            { user: 'r3', wallet: 'beans_p', delta: 10, type: 'gift_receive', refType: 'GiftLog', refId: 'tx1', idempotencyKey: 'tx1:recv-p-2' }
        ]));
    });

    test('توزيع لا يقبل القسمة بالتساوي (7 مستلمين): مجموع كل الحصص المُستلَمة = التكلفة الكلية بالضبط بلا أي تسرّب تقريب', async () => {
        mockSplit(0, 100); // 100 على 7 مستلمين: 14×6 + 16 = 100 (توزيع distributeExact القائم)
        const receiverIds = Array.from({ length: 7 }, (_, i) => `r${i}`);
        const entries = await buildGiftWalletEntries({
            senderId: 's1', receiverIds, totalCost: 100, session: {}, idemBase: 'tx1',
            linkedFlags: receiverIds.map(() => false)
        });

        const receiverEntries = entries.filter(e => e.user !== 's1');
        const total = receiverEntries.reduce((s, e) => s + e.delta, 0);
        expect(total).toBe(100); // ✅ لا تسرّب إطلاقاً بصرف النظر عن عدم القسمة الصحيحة
        expect(receiverEntries.every(e => e.wallet === 'beans_w')).toBe(true);
    });

    test('رصيد غير كافٍ: INSUFFICIENT_FUNDS من walletService تُترجَم لعقد INSUFFICIENT القديم {balance,needed}', async () => {
        jest.spyOn(walletService, 'computeCoinSpendSplit').mockRejectedValue(
            Object.assign(new Error('رصيد غير كافٍ'), { code: 'INSUFFICIENT_FUNDS', balance: 50, needed: 300 })
        );

        await expect(buildGiftWalletEntries({
            senderId: 's1', receiverIds: ['r1'], totalCost: 300, session: {}, idemBase: 'tx1', linkedFlags: [false]
        })).rejects.toMatchObject({ code: 'INSUFFICIENT', balance: 50, needed: 300 });
    });

    test('خطأ آخر غير INSUFFICIENT_FUNDS (مثل USER_NOT_FOUND) يُعاد رميه بلا أي ترجمة', async () => {
        jest.spyOn(walletService, 'computeCoinSpendSplit').mockRejectedValue(
            Object.assign(new Error('المستخدم غير موجود'), { code: 'USER_NOT_FOUND' })
        );

        await expect(buildGiftWalletEntries({
            senderId: 's1', receiverIds: ['r1'], totalCost: 300, session: {}, idemBase: 'tx1', linkedFlags: [false]
        })).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    });
});
