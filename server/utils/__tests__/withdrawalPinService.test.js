// 🛡️ مراجعة الأمان v2 (البند 2) — رمز السحب: يختبر القفل الذري بعد 5 محاولات خاطئة (بما فيها
// محاولات متزامنة حقيقية لا تتفلّت من العدّاد)، وإعادة التعيين (كلمة سر + كود)، وأن إعادة
// التعيين/التغيير يُطبّقان حظر withdrawalPinPostResetBlockHours. نفس نمط jest.spyOn() على
// static الحقيقي بمحاكاة بالذاكرة المعتمد بهذا المشروع (لا mongodb-memory-server — يُعلّق هنا
// بسبب setInterval حيّ بـsocketService.js لو استُورد بسلسلة الاستيراد)
const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const SystemSettings = require('../../models/SystemSettings');
const pinService = require('../withdrawalPinService');

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    return p;
}

function makeDb() { return new Map(); }
function seedUser(db, overrides) {
    const user = {
        _id: 'u1', withdrawalPin: null, withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null,
        withdrawalBlockedUntil: null, payoutShamCashWallet: null, payoutWalletChangedAt: null,
        isEmailVerified: false, pinResetCodeHash: null, pinResetCodeExpiresAt: null, pinResetAttempts: 0,
        ...overrides
    };
    db.set(user._id, user);
    return user;
}

// ✅ لا read-then-write: كل استدعاء يقرأ row الحالي من db مباشرة ويكتب بخطوة واحدة متزامنة —
// نفس ذرّية $inc الحقيقية بالخادم الحيّ، لا لقطة محلية قديمة قد تُفقَد بتزامن حقيقي
function wireMocks(db) {
    jest.spyOn(User, 'findById').mockImplementation((id) => chainable(db.get(String(id)) || null));
    jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.get(String(filter._id));
        if (!row) return chainable(null);
        for (const [field, cond] of Object.entries(filter)) {
            if (field === '_id') continue;
            if (row[field] !== cond) return chainable(null);
        }
        if (update.$inc) for (const k of Object.keys(update.$inc)) row[k] = (row[k] || 0) + update.$inc[k];
        if (update.$set) Object.assign(row, update.$set);
        return chainable({ ...row });
    });
    jest.spyOn(User, 'updateOne').mockImplementation((filter, update) => {
        const row = db.get(String(filter._id));
        if (!row) return Promise.resolve({ matchedCount: 0 });
        if (update.$set) Object.assign(row, update.$set);
        return Promise.resolve({ matchedCount: 1 });
    });
    jest.spyOn(SystemSettings, 'getSettings').mockResolvedValue({ withdrawalPinPostResetBlockHours: 24 });
}

afterEach(() => jest.restoreAllMocks());

describe('setInitialWithdrawalPin', () => {
    test('ينشئ الرمز أول مرة', async () => {
        const db = makeDb();
        const user = seedUser(db, {});
        wireMocks(db);

        const result = await pinService.setInitialWithdrawalPin('u1', '1234');
        expect(result.ok).toBe(true);
        expect(user.withdrawalPin).toBeTruthy();
    });

    test('يرفض الإنشاء لو يملك رمزاً فعلاً (ذرّي بشرط withdrawalPin:null)', async () => {
        const db = makeDb();
        seedUser(db, { withdrawalPin: await bcrypt.hash('9999', 4) });
        wireMocks(db);

        const result = await pinService.setInitialWithdrawalPin('u1', '1234');
        expect(result.ok).toBe(false);
        expect(result.code).toBe('ALREADY_SET');
    });
});

describe('verifyWithdrawalPin — القفل الذري بعد 5 محاولات خاطئة', () => {
    test('رمز صحيح ينجح ويصفّر العدّاد', async () => {
        const db = makeDb();
        const user = seedUser(db, { withdrawalPin: await bcrypt.hash('1234', 4), withdrawalPinFailedAttempts: 2 });
        wireMocks(db);

        const result = await pinService.verifyWithdrawalPin('u1', '1234');
        expect(result.ok).toBe(true);
        expect(user.withdrawalPinFailedAttempts).toBe(0);
    });

    test('5 محاولات خاطئة متتالية تقفل الرمز 30 دقيقة، والمحاولة السادسة (برمز صحيح) تُرفض أيضاً', async () => {
        const db = makeDb();
        const user = seedUser(db, { withdrawalPin: await bcrypt.hash('1234', 4) });
        wireMocks(db);

        let last;
        for (let i = 0; i < 5; i++) {
            last = await pinService.verifyWithdrawalPin('u1', '0000');
        }
        expect(last.code).toBe('LOCKED_NOW');
        expect(user.withdrawalPinLockedUntil).toBeTruthy();

        const afterLock = await pinService.verifyWithdrawalPin('u1', '1234'); // الرمز الصحيح نفسه
        expect(afterLock.ok).toBe(false);
        expect(afterLock.code).toBe('LOCKED');
        expect(user.withdrawalPinFailedAttempts).toBe(5); // ✅ لم يُستهلَك من العدّاد وهو مقفل
    });

    test('محاولات خاطئة متزامنة حقيقية: العدّاد يصل بدقة لعدد المحاولات، لا يُفقَد تحديث بالتزامن', async () => {
        const db = makeDb();
        const user = seedUser(db, { withdrawalPin: await bcrypt.hash('1234', 4) });
        wireMocks(db);

        // ✅ 5 محاولات خاطئة بالتوازي الحقيقي (Promise.all) — لو كان المنطق "قراءة ثم حفظ"
        // (غير ذرّي) بدل $inc مباشر، بعض الزيادات تضيع فيُصبح العدّاد أقل من 5 والقفل لا يُفعَّل
        const results = await Promise.all(Array.from({ length: 5 }, () => pinService.verifyWithdrawalPin('u1', 'wrong')));

        expect(user.withdrawalPinFailedAttempts).toBe(5);
        expect(user.withdrawalPinLockedUntil).toBeTruthy();
        expect(results.filter(r => r.code === 'LOCKED_NOW').length).toBe(1); // آخر محاولة بلغت الحد فقفلت
    });
});

describe('changeWithdrawalPin', () => {
    test('يتطلّب الرمز الحالي الصحيح، ويُطبّق حظر السحب (withdrawalPinPostResetBlockHours)', async () => {
        const db = makeDb();
        const user = seedUser(db, { withdrawalPin: await bcrypt.hash('1234', 4) });
        wireMocks(db);

        const wrong = await pinService.changeWithdrawalPin('u1', '0000', '5678');
        expect(wrong.ok).toBe(false);

        const ok = await pinService.changeWithdrawalPin('u1', '1234', '5678');
        expect(ok.ok).toBe(true);
        expect(user.withdrawalBlockedUntil).toBeTruthy();
        expect(new Date(user.withdrawalBlockedUntil).getTime()).toBeGreaterThan(Date.now() + 23 * 3600000);

        const verifyNew = await pinService.verifyWithdrawalPin('u1', '5678');
        expect(verifyNew.ok).toBe(true);
    });
});

describe('requestPinResetCode / verifyPinResetCode — "نسيت الرمز"', () => {
    test('بريد غير مفعَّل (isEmailVerified:false) → EMAIL_NOT_VERIFIED، لا كود يُرسَل', async () => {
        const db = makeDb();
        seedUser(db, { isEmailVerified: false });
        wireMocks(db);

        const result = await pinService.requestPinResetCode('u1');
        expect(result.ok).toBe(false);
        expect(result.code).toBe('EMAIL_NOT_VERIFIED');
    });

    test('بريد مفعَّل: كود صحيح ضمن 10 دقائق يُعيد تعيين الرمز ويُطبّق حظر السحب', async () => {
        const db = makeDb();
        const user = seedUser(db, { isEmailVerified: true, email: 'a@b.com' });
        wireMocks(db);

        const req = await pinService.requestPinResetCode('u1');
        expect(req.ok).toBe(true);
        expect(user.pinResetCodeHash).toBeTruthy();

        const result = await pinService.verifyPinResetCode('u1', req.code, '4321');
        expect(result.ok).toBe(true);
        expect(user.pinResetCodeHash).toBeNull();
        expect(user.withdrawalBlockedUntil).toBeTruthy();

        const verifyNew = await pinService.verifyWithdrawalPin('u1', '4321');
        expect(verifyNew.ok).toBe(true);
    });

    test('كود خاطئ 5 مرات → TOO_MANY_ATTEMPTS، وكود منتهي الصلاحية يُرفض', async () => {
        const db = makeDb();
        const user = seedUser(db, { isEmailVerified: true });
        wireMocks(db);
        await pinService.requestPinResetCode('u1');

        let last;
        for (let i = 0; i < 5; i++) {
            last = await pinService.verifyPinResetCode('u1', '000000', '1111');
        }
        expect(last.code).toBe('TOO_MANY_ATTEMPTS');

        user.pinResetAttempts = 0;
        user.pinResetCodeExpiresAt = new Date(Date.now() - 1000); // منتهي الصلاحية
        const expired = await pinService.verifyPinResetCode('u1', '123456', '1111');
        expect(expired.code).toBe('CODE_EXPIRED');
    });

    test('نفس الكود لا يُستخدَم مرتين (يُصفَّر pinResetCodeHash بعد النجاح)', async () => {
        const db = makeDb();
        const user = seedUser(db, { isEmailVerified: true });
        wireMocks(db);
        const req = await pinService.requestPinResetCode('u1');

        const first = await pinService.verifyPinResetCode('u1', req.code, '1111');
        expect(first.ok).toBe(true);

        const second = await pinService.verifyPinResetCode('u1', req.code, '2222');
        expect(second.ok).toBe(false);
        expect(second.code).toBe('NO_PENDING_RESET');
    });
});

describe('changePayoutWallet', () => {
    test('يتطلّب الرمز الصحيح، ويضبط payoutWalletChangedAt (حظر 48 ساعة)', async () => {
        const db = makeDb();
        const user = seedUser(db, { withdrawalPin: await bcrypt.hash('1234', 4) });
        wireMocks(db);

        const wrong = await pinService.changePayoutWallet('u1', '0000', 'wallet-new');
        expect(wrong.ok).toBe(false);
        expect(user.payoutShamCashWallet).toBeNull();

        const ok = await pinService.changePayoutWallet('u1', '1234', 'wallet-new');
        expect(ok.ok).toBe(true);
        expect(user.payoutShamCashWallet).toBe('wallet-new');

        const block = pinService.isWithdrawalBlocked(user);
        expect(block.blocked).toBe(true);
        expect(block.reason).toBe('WALLET_CHANGE_HOLD');
    });
});
