// ملف: walletReconciliationJob.test.js
// 🛡️ صحة المحفظة (feat/wallet-ledger-v1): يختبر أن sum(ledger) لكل (مستخدم، محفظة) يُقارَن
// بالضبط بالرصيد المخزَّن على User، وأن أي تعارض يُكتَب (summary + mismatch docs) ويُنتج
// AdminLog حرجاً، وأن الحالة السليمة (بلا تعارضات) لا تُنتج أي AdminLog. حساب الالتزام
// (beans_w × نسبة الدفع ÷ coinsPerUsd) يُختبَر بفترتي الإطلاق/الأساس معاً.

jest.mock('../botMessenger', () => ({ getBotUser: jest.fn().mockResolvedValue('bot1') }));

const User = require('../../models/User');
const LedgerEntry = require('../../models/LedgerEntry');
const SystemSettings = require('../../models/SystemSettings');
const AdminLog = require('../../models/AdminLog');
const WalletReconciliation = require('../../models/WalletReconciliation');
const { runWalletReconciliation } = require('../walletReconciliationJob');

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.lean = () => p;
    return p;
}

function wireMocks({ users, ledgerSums, settings, wrDb }) {
    jest.spyOn(User, 'find').mockImplementation(() => chainable(users));
    jest.spyOn(LedgerEntry, 'aggregate').mockImplementation(([stage]) => {
        // ✅ نفس الدالة تُستدعى مرتين بمعنيين مختلفين تماماً — نُميّز بينهما بوجود $match (نقد
        // مُستلَم فقط) أو $group مباشرة (مجموع كل القيود حسب مستخدم+محفظة)
        if (stage.$match) {
            const matching = ledgerSums.rawEntries.filter(e => e.wallet === stage.$match.wallet && e.type === stage.$match.type);
            const total = matching.reduce((s, e) => s + e.delta, 0);
            return Promise.resolve([{ _id: null, total }]);
        }
        return Promise.resolve(ledgerSums.grouped);
    });
    jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue(settings);
    jest.spyOn(AdminLog, 'logAction').mockResolvedValue({});
    jest.spyOn(WalletReconciliation, 'deleteMany').mockResolvedValue({});
    jest.spyOn(WalletReconciliation, 'insertMany').mockImplementation((docs) => {
        wrDb.push(...docs);
        return Promise.resolve(docs);
    });
}

function defaultSettings(overrides = {}) {
    return {
        coinsPerUsd: 1000,
        payoutLaunchPct: 70,
        payoutLaunchEndsAt: new Date(Date.now() - 1000), // ✅ بعد فترة الإطلاق افتراضياً
        payoutBasePct: 65,
        ...overrides
    };
}

describe('runWalletReconciliation', () => {
    afterEach(() => jest.restoreAllMocks());

    test('كل الأرصدة تطابق دفتر الأستاذ: 0 تعارض، لا AdminLog، summary محفوظ', async () => {
        const users = [{ _id: 'u1', walletCoinsPaid: 100, walletCoinsBonus: 0, walletBeansW: 0, walletBeansP: 0, walletUsdCents: 0 }];
        const grouped = [{ _id: { user: 'u1', wallet: 'coins_paid' }, total: 100 }];
        const wrDb = [];
        wireMocks({ users, ledgerSums: { grouped, rawEntries: [] }, settings: defaultSettings(), wrDb });

        const result = await runWalletReconciliation();

        expect(result.mismatchCount).toBe(0);
        expect(result.usersChecked).toBe(1);
        expect(AdminLog.logAction).not.toHaveBeenCalled();
        expect(wrDb.find(d => d.type === 'summary').mismatchCount).toBe(0);
        expect(wrDb.filter(d => d.type === 'mismatch')).toHaveLength(0);
    });

    test('تعارض حقيقي (رصيد مخزَّن يفوق دفتر الأستاذ): يُكتَب mismatch + AdminLog حرج', async () => {
        const users = [{ _id: 'u1', walletCoinsPaid: 150, walletCoinsBonus: 0, walletBeansW: 0, walletBeansP: 0, walletUsdCents: 0 }];
        // ✅ دفتر الأستاذ يقول 100، لكن الرصيد المخزَّن 150 — تلاعب أو خلل، 50 "ظهرت من العدم"
        const grouped = [{ _id: { user: 'u1', wallet: 'coins_paid' }, total: 100 }];
        const wrDb = [];
        wireMocks({ users, ledgerSums: { grouped, rawEntries: [] }, settings: defaultSettings(), wrDb });

        const result = await runWalletReconciliation();

        expect(result.mismatchCount).toBe(1);
        const mismatch = wrDb.find(d => d.type === 'mismatch');
        expect(mismatch.wallet).toBe('coins_paid');
        expect(mismatch.ledgerSum).toBe(100);
        expect(mismatch.cachedBalance).toBe(150);
        expect(mismatch.diff).toBe(50);

        expect(AdminLog.logAction).toHaveBeenCalledWith(expect.objectContaining({
            admin: 'bot1', severity: 'critical', isAutomated: true,
            details: expect.objectContaining({ action: 'wallet_reconciliation_mismatch', mismatchCount: 1 })
        }));
    });

    test('مستخدم بمحفظة لا قيود لها إطلاقاً بدفتر الأستاذ لكن رصيدها المخزَّن صفر: لا تعارض', async () => {
        const users = [{ _id: 'u1', walletCoinsPaid: 0, walletCoinsBonus: 0, walletBeansW: 0, walletBeansP: 0, walletUsdCents: 0 }];
        const wrDb = [];
        wireMocks({ users, ledgerSums: { grouped: [], rawEntries: [] }, settings: defaultSettings(), wrDb });

        const result = await runWalletReconciliation();

        expect(result.mismatchCount).toBe(0);
    });

    test('الالتزام: beans_w × نسبة الدفع الأساسية ÷ coinsPerUsd (بعد فترة الإطلاق)', async () => {
        const users = [{ _id: 'u1', walletCoinsPaid: 0, walletCoinsBonus: 0, walletBeansW: 1000, walletBeansP: 500, walletUsdCents: 0 }];
        const grouped = [{ _id: { user: 'u1', wallet: 'beans_w' }, total: 1000 }];
        const wrDb = [];
        wireMocks({ users, ledgerSums: { grouped, rawEntries: [] }, settings: defaultSettings(), wrDb });

        const result = await runWalletReconciliation();

        // 1000 بينز × 65% ÷ 1000 كوينز/دولار = 0.65$ — beans_p (500) لا تدخل الحساب إطلاقاً
        expect(result.liabilityUsd).toBeCloseTo(0.65, 2);
    });

    test('الالتزام أثناء فترة الإطلاق: نسبة الإطلاق تُستخدَم بدل الأساسية', async () => {
        const users = [{ _id: 'u1', walletCoinsPaid: 0, walletCoinsBonus: 0, walletBeansW: 1000, walletBeansP: 0, walletUsdCents: 0 }];
        const grouped = [{ _id: { user: 'u1', wallet: 'beans_w' }, total: 1000 }];
        const wrDb = [];
        wireMocks({
            users, ledgerSums: { grouped, rawEntries: [] },
            settings: defaultSettings({ payoutLaunchEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24) }),
            wrDb
        });

        const result = await runWalletReconciliation();

        expect(result.liabilityUsd).toBeCloseTo(0.70, 2); // 1000 × 70% ÷ 1000
    });

    test('النقد المُستلَم فعلياً: مجموع قيود usd_cents من نوع deposit فقط', async () => {
        const users = [{ _id: 'u1', walletCoinsPaid: 0, walletCoinsBonus: 0, walletBeansW: 0, walletBeansP: 0, walletUsdCents: 0 }];
        const rawEntries = [
            { wallet: 'usd_cents', type: 'deposit', delta: 500 }, // 5$
            { wallet: 'usd_cents', type: 'deposit', delta: 300 }, // 3$
            { wallet: 'usd_cents', type: 'refund', delta: 100 }   // ✅ استرداد — لا يُحسَب كنقد "مُستلَم" جديد
        ];
        const wrDb = [];
        wireMocks({ users, ledgerSums: { grouped: [], rawEntries }, settings: defaultSettings(), wrDb });

        const result = await runWalletReconciliation();

        expect(result.cashReceivedUsd).toBeCloseTo(8, 2); // (500+300)/100
    });
});
