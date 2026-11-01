// 🛡️ مراجعة الأمان v2 (البند 2) — رمز السحب: يختبر القفل الذري بعد 5 محاولات خاطئة (بما فيها
// محاولات متزامنة حقيقية لا تتفلّت من العدّاد)، الحجز قبل bcrypt (لا مقارنة bcrypt تتجاوز الحد
// حتى بتزامن حقيقي)، القفل النهائي بعد 3 أحداث قفل خلال 24 ساعة، وإعادة التعيين (كلمة سر + كود).
// نفس نمط jest.spyOn() على static الحقيقي بمحاكاة بالذاكرة المعتمد بهذا المشروع (لا
// mongodb-memory-server — يُعلّق هنا بسبب setInterval حيّ بـsocketService.js لو استُورد بسلسلة الاستيراد)
const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const SystemSettings = require('../../models/SystemSettings');
const botMessenger = require('../botMessenger');
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
        withdrawalPinHardLocked: false, withdrawalPinLockoutHistory: [],
        withdrawalBlockedUntil: null, payoutShamCashWallet: null, payoutWalletChangedAt: null,
        isEmailVerified: false, pinResetCodeHash: null, pinResetCodeExpiresAt: null, pinResetAttempts: 0,
        ...overrides
    };
    db.set(user._id, user);
    return user;
}

// ✅ مطابقة فلتر عامة تدعم $ne/$lte/$lt/$gt (قد تجتمعان بنفس الحقل) و$or متداخل — تحاكي فقط ما
// يستخدمه withdrawalPinService.js فعلياً، لا محرّك استعلام Mongo كامل
function matchesFilter(row, filter) {
    for (const [field, cond] of Object.entries(filter)) {
        if (field === '_id') continue;
        if (field === '$or') {
            if (!cond.some((sub) => matchesFilter(row, sub))) return false;
            continue;
        }
        if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
            if ('$ne' in cond && row[field] === cond.$ne) return false;
            if ('$lte' in cond) {
                if (row[field] === null || row[field] === undefined) return false;
                if (!(row[field] <= cond.$lte)) return false;
            }
            if ('$lt' in cond) {
                if (row[field] === null || row[field] === undefined) return false;
                if (!(row[field] < cond.$lt)) return false;
            }
            if ('$gt' in cond) {
                if (row[field] === null || row[field] === undefined) return false;
                if (!(row[field] > cond.$gt)) return false;
            }
        } else if (row[field] !== cond) {
            return false;
        }
    }
    return true;
}

function applyUpdate(row, update) {
    if (update.$inc) for (const k of Object.keys(update.$inc)) row[k] = (row[k] || 0) + update.$inc[k];
    if (update.$set) Object.assign(row, update.$set);
    if (update.$push) {
        for (const [field, pushVal] of Object.entries(update.$push)) {
            if (!Array.isArray(row[field])) row[field] = [];
            if (pushVal && typeof pushVal === 'object' && '$each' in pushVal) {
                row[field] = row[field].concat(pushVal.$each);
                if ('$slice' in pushVal) {
                    const n = pushVal.$slice;
                    row[field] = n < 0 ? row[field].slice(n) : row[field].slice(0, n);
                }
            } else {
                row[field] = row[field].concat([pushVal]);
            }
        }
    }
}

// ✅ لا read-then-write: كل استدعاء يقرأ row الحالي من db مباشرة ويكتب بخطوة واحدة متزامنة —
// نفس ذرّية $inc/$push الحقيقية بالخادم الحيّ، لا لقطة محلية قديمة قد تُفقَد بتزامن حقيقي
function wireMocks(db) {
    jest.spyOn(User, 'findById').mockImplementation((id) => chainable(db.get(String(id)) || null));
    jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.get(String(filter._id));
        if (!row || !matchesFilter(row, filter)) return chainable(null);
        applyUpdate(row, update);
        return chainable({ ...row });
    });
    jest.spyOn(User, 'updateOne').mockImplementation((filter, update) => {
        const row = db.get(String(filter._id));
        if (!row || !matchesFilter(row, filter)) return Promise.resolve({ matchedCount: 0 });
        applyUpdate(row, update);
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

describe('verifyWithdrawalPin — الحجز الذرّي قبل bcrypt، والقفل بعد 5 محاولات خاطئة', () => {
    test('رمز صحيح ينجح ويصفّر العدّاد', async () => {
        const db = makeDb();
        const user = seedUser(db, { withdrawalPin: await bcrypt.hash('1234', 4), withdrawalPinFailedAttempts: 2 });
        wireMocks(db);

        const result = await pinService.verifyWithdrawalPin('u1', '1234');
        expect(result.ok).toBe(true);
        expect(user.withdrawalPinFailedAttempts).toBe(0);
    });

    test('5 محاولات خاطئة متتالية تقفل الرمز 30 دقيقة دون مقارنة bcrypt بالمحاولة الخامسة، والسادسة (رمز صحيح) تُرفض أيضاً', async () => {
        const db = makeDb();
        const user = seedUser(db, { withdrawalPin: await bcrypt.hash('1234', 4) });
        wireMocks(db);
        const compareSpy = jest.spyOn(bcrypt, 'compare');

        let last;
        for (let i = 0; i < 5; i++) {
            last = await pinService.verifyWithdrawalPin('u1', '0000');
        }
        expect(last.code).toBe('LOCKED_NOW');
        expect(user.withdrawalPinLockedUntil).toBeTruthy();
        // ✅ المحاولة الخامسة تُقفَل فور بلوغ العدّاد الحد — بلا أي مقارنة bcrypt لها (4 فقط للمحاولات 1-4)
        expect(compareSpy).toHaveBeenCalledTimes(4);

        const afterLock = await pinService.verifyWithdrawalPin('u1', '1234'); // الرمز الصحيح نفسه
        expect(afterLock.ok).toBe(false);
        expect(afterLock.code).toBe('LOCKED');
        expect(user.withdrawalPinFailedAttempts).toBe(5); // ✅ لم يُستهلَك من العدّاد وهو مقفل
        expect(compareSpy).toHaveBeenCalledTimes(4); // ✅ لم تُضَف مقارنة جديدة أثناء القفل
    });

    test('20 محاولة خاطئة متزامنة حقيقية: bcrypt لا يُستدعى أكثر من 4 مرات، ودورة قفل واحدة فقط رغم الانفجار', async () => {
        const db = makeDb();
        const user = seedUser(db, { withdrawalPin: await bcrypt.hash('1234', 4) });
        wireMocks(db);
        const compareSpy = jest.spyOn(bcrypt, 'compare');

        // 🛡️ هذا بالضبط الثغرة المُصلَحة: لو كان الفحص (مقفل؟) ومقارنة bcrypt عمليتين منفصلتين
        // عن الحجز الذرّي، 20 طلباً متزامناً كانت ستُنفِّذ حتى 20 مقارنة bcrypt بالتوازي (تمكين
        // تخمين فعلي يفوق الحد بكثير لرمز 4 أرقام = 10,000 احتمال فقط). العدّاد النهائي قد يتجاوز
        // 5 فعلياً (حجوزات إضافية تمرّ قبل أن يُنفَّذ القفل نفسه — غير حرج أمنياً لأن لا مقارنة
        // bcrypt تحدث لأي منها) — الخاصية الأمنية المضمونة هي bcrypt فقط، لا قيمة العدّاد بالضبط
        const results = await Promise.all(Array.from({ length: 20 }, () => pinService.verifyWithdrawalPin('u1', 'wrong')));

        expect(user.withdrawalPinFailedAttempts).toBeGreaterThanOrEqual(5);
        expect(user.withdrawalPinLockedUntil).toBeTruthy();
        expect(compareSpy.mock.calls.length).toBeLessThanOrEqual(4); // ✅ جوهر الإصلاح — لا تُستدعى إطلاقاً عند بلوغ/تجاوز الحد
        // ✅ دورة قفل واحدة فقط سُجِّلت رغم 20 طلباً متزامناً (=== لا >= بمنطق القفل يمنع التكرار)
        expect(user.withdrawalPinLockoutHistory.length).toBe(1);
        expect(results.every(r => r.ok === false)).toBe(true);
    });

    test('قفل منتهي: محاولة جديدة تُصفِّر العدّاد لـ1 (لا تستمر من القيمة القديمة)', async () => {
        const db = makeDb();
        const user = seedUser(db, {
            withdrawalPin: await bcrypt.hash('1234', 4),
            withdrawalPinFailedAttempts: 5,
            withdrawalPinLockedUntil: new Date(Date.now() - 1000) // منتهي فعلاً
        });
        wireMocks(db);

        const result = await pinService.verifyWithdrawalPin('u1', 'wrong');
        expect(result.code).toBe('WRONG');
        expect(user.withdrawalPinFailedAttempts).toBe(1);
        expect(user.withdrawalPinLockedUntil).toBeNull();
    });

    test('مستخدم غير مقفل أصلاً: المحاولات المتكررة تتراكم فعلياً (خطوة التطبيع لا تُصفِّره خطأً)', async () => {
        const db = makeDb();
        const user = seedUser(db, { withdrawalPin: await bcrypt.hash('1234', 4) });
        wireMocks(db);

        await pinService.verifyWithdrawalPin('u1', 'wrong');
        await pinService.verifyWithdrawalPin('u1', 'wrong');
        const third = await pinService.verifyWithdrawalPin('u1', 'wrong');
        expect(third.remainingAttempts).toBe(2); // 5 - 3
        expect(user.withdrawalPinFailedAttempts).toBe(3);
    });

    test('3 أحداث قفل خلال 24 ساعة ⇐ قفل نهائي (hardLocked) + تنبيه بوت، ولا يرتفع بمرور الوقت', async () => {
        const db = makeDb();
        const user = seedUser(db, { withdrawalPin: await bcrypt.hash('1234', 4) });
        wireMocks(db);
        const botSpy = jest.spyOn(botMessenger, 'sendBotMessage').mockResolvedValue(null);
        const fakeIo = {};

        // دورتا قفل سابقتان (ضمن آخر 24 ساعة)
        user.withdrawalPinLockoutHistory = [new Date(Date.now() - 3600000), new Date(Date.now() - 7200000)];

        let last;
        for (let i = 0; i < 5; i++) {
            last = await pinService.verifyWithdrawalPin('u1', 'wrong', fakeIo);
        }
        expect(last.code).toBe('HARD_LOCKED');
        expect(user.withdrawalPinHardLocked).toBe(true);
        expect(botSpy).toHaveBeenCalledTimes(1);
        expect(botSpy).toHaveBeenCalledWith(fakeIo, 'u1', expect.stringContaining('نهائياً'));

        // ✅ حتى بعد انتهاء مهلة الـ30 دقيقة، القفل النهائي لا يرتفع تلقائياً أبداً
        user.withdrawalPinLockedUntil = new Date(Date.now() - 1000);
        const stillLocked = await pinService.verifyWithdrawalPin('u1', '1234', fakeIo); // الرمز الصحيح فعلاً
        expect(stillLocked.ok).toBe(false);
        expect(stillLocked.code).toBe('HARD_LOCKED');
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

    // 🛡️ مراجعة أمنية (نفس ثغرة verifyWithdrawalPin): بدون الحجز الذرّي، 20 طلباً متزامناً بكود
    // خاطئ كانت ستعبر فحص "العدّاد < الحد" معاً فتتجاوز RESET_CODE_MAX_ATTEMPTS تماماً من المحاولات
    // الفعلية المسموحة (كود 6 أرقام = 1,000,000 احتمال). الآن: العدّاد لا يتجاوز الحد أبداً
    test('20 محاولة خاطئة متزامنة حقيقية لإعادة التعيين: العدّاد لا يتجاوز الحد رغم الانفجار', async () => {
        const db = makeDb();
        const user = seedUser(db, { isEmailVerified: true });
        wireMocks(db);
        await pinService.requestPinResetCode('u1');

        const results = await Promise.all(Array.from({ length: 20 }, () => pinService.verifyPinResetCode('u1', '000000', '1111')));

        expect(user.pinResetAttempts).toBeLessThanOrEqual(5);
        expect(results.every(r => r.ok === false)).toBe(true);
        expect(results.filter(r => r.code === 'TOO_MANY_ATTEMPTS').length).toBeGreaterThanOrEqual(15);
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
