// ملف: fanClubController.join.test.js
// 🛡️ fanclub-v2: الانضمام يُعاد بناؤه على مسار المحفظة الحقيقي (buildGiftWalletEntries +
// walletService.post) ضمن معاملة واحدة تضمّ أيضاً إنشاء FanClubMembership وGiftLog وزيادة
// عدّادي المالك. نفس استراتيجية adminController.moneyRaceAtomicity.test.js المجاور بالضبط
// (لا snapshot شامل عند بداية كل معاملة — يُصبح قديماً إن التزمت معاملة أخرى بالتزامن حقاً،
// فيُرجِع تراجع المعاملة الفاشلة قيماً قديمة فوق تعديل صحيح لمعاملة فائزة): AsyncLocalStorage
// يُسجِّل تراجع كل معاملة لِما عدّلته هي فعلاً فقط، حتى مع تشابك awaitين حقيقيين بـPromise.all.
// 🐛 jest.useFakeTimers() قبل أول require('../giftController') (يحدث متأخراً هنا، داخل
// joinFanClub نفسها وقت التنفيذ لا عند تحميل هذا الملف) — نفس سبب الملفات المجاورة بالضبط
// (setInterval حقيقي لتنظيف محدِّد معدّل الهدايا عند استيراد giftController نفسه)
jest.useFakeTimers();
jest.mock('../../utils/experienceManager', () => ({
    addGiftExperience: jest.fn().mockResolvedValue(null)
}));

const mongoose = require('mongoose');
const User = require('../../models/User');
const Gift = require('../../models/Gift');
const GiftLog = require('../../models/GiftLog');
const Follow = require('../../models/Follow');
const FanClubMembership = require('../../models/FanClubMembership');
const FanClubWeekly = require('../../models/FanClubWeekly');
const LedgerEntry = require('../../models/LedgerEntry');
const linkageService = require('../../utils/linkageService');
const fanClubController = require('../fanClubController');

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.session = () => p;
    return p;
}

function makeDb() {
    return { users: new Map(), gifts: new Map(), giftLogs: [], memberships: [], _locks: new Map() };
}
function seedUser(db, overrides) {
    const { coins, ...rest } = overrides;
    const user = {
        _id: 'u_default', isBot: false, socketId: null, username: 'User', profileImage: '',
        walletCoinsPaid: coins !== undefined ? coins : 0, walletCoinsBonus: 0,
        walletBeansW: 0, walletBeansP: 0, walletUsdCents: 0,
        fanClub: { memberCount: 0 },
        ...rest
    };
    user.coins = user.walletCoinsPaid + user.walletCoinsBonus;
    db.users.set(user._id, user);
    return user;
}

// 🛡️ نفس هيكل المحاكاة الكامل بـfollowController.race.test.js المجاور بالضبط (قفل وثيقة لكل
// معاملة حيّة + إعادة محاولة withTransaction تلقائياً عند تضارب كتابة حقيقي كود 112) — لازم
// هنا تحديداً لأن معاملتي الانضمام المتنازعتين تلمسان نفس وثيقة العضو (الخصم) ونفس زوج
// (owner,member) معاً؛ snapshot/undo بسيط بلا قفل كان يسمح لكلتا المعاملتين بخصم الرصيد معاً
// قبل اكتشاف التعارض، فيُسقِط تراجع الخاسرة خصم الفائزة أيضاً بالخطأ (نفس العلّة الموصوفة
// بتعليق الملف المجاور تماماً)
const { AsyncLocalStorage } = require('async_hooks');
const txContext = new AsyncLocalStorage();
function recordUndo(ctx, undoFn) { if (ctx) ctx.undo.push(undoFn); }
function acquireLock(db, lockId) {
    const ctx = txContext.getStore();
    if (!ctx) return;
    const holder = db._locks.get(lockId);
    if (holder && holder !== ctx) throw Object.assign(new Error('Write conflict'), { code: 112 });
    if (!holder) { db._locks.set(lockId, ctx); ctx.locks.push(lockId); }
}

function wireMocks(db) {
    jest.spyOn(User, 'findById').mockImplementation((id) => chainable(db.users.get(String(id)) || null));
    jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return Promise.resolve(null);
        acquireLock(db, `user:${row._id}`);
        for (const [field, cond] of Object.entries(filter)) {
            if (field === '_id') continue;
            if (cond && typeof cond.$gte === 'number' && (row[field] || 0) < cond.$gte) return Promise.resolve(null);
        }
        const before = { ...row };
        recordUndo(txContext.getStore(), () => Object.assign(row, before));
        if (update.$inc) for (const k of Object.keys(update.$inc)) row[k] = (row[k] || 0) + update.$inc[k];
        if (update.$set) Object.assign(row, update.$set);
        return Promise.resolve({ ...row });
    });
    jest.spyOn(User, 'updateOne').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return Promise.resolve({ matchedCount: 0 });
        acquireLock(db, `user:${row._id}`);
        const before = JSON.parse(JSON.stringify(row));
        recordUndo(txContext.getStore(), () => Object.assign(row, before));
        if (update.$inc) {
            for (const [path, delta] of Object.entries(update.$inc)) {
                // ✅ يدعم "fanClub.memberCount" (حقل متداخل) — تبسيط كافٍ لهذا الاختبار فقط
                const parts = path.split('.');
                let obj = row;
                for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
                const key = parts[parts.length - 1];
                obj[key] = (obj[key] || 0) + delta;
            }
        }
        if (update.$set) Object.assign(row, update.$set); // ✅ walletService.post يُزامن coins/balance بهذا
        return Promise.resolve({ matchedCount: 1 });
    });
    jest.spyOn(LedgerEntry, 'findOne').mockImplementation(() => chainable(null));
    jest.spyOn(LedgerEntry, 'create').mockImplementation((docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        return Promise.resolve(arr.map((d, i) => ({ ...d, _id: `ledger_${i}_${Math.random()}` })));
    });
    jest.spyOn(Gift, 'findOne').mockImplementation(() => chainable({ _id: 'rose1', name: 'وردة', imageUrl: 'rose.png' }));
    jest.spyOn(GiftLog, 'create').mockImplementation((docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        const created = arr.map((d, i) => ({ ...d, _id: `log_${db.giftLogs.length + i}` }));
        db.giftLogs.push(...created);
        recordUndo(txContext.getStore(), () => { for (const c of created) { const idx = db.giftLogs.indexOf(c); if (idx !== -1) db.giftLogs.splice(idx, 1); } });
        return Promise.resolve(created);
    });
    // ✅ فهرس فريد (owner, member) حقيقي — إدراج ثانٍ لنفس الزوج يُرفَض بـE11000 بالضبط كما يفعل
    // Mongo (لا يُعاد المحاولة لهذا الكود — المتصل (joinFanClub) يُعامله كحالة "عضو بالفعل" idempotent)
    jest.spyOn(FanClubMembership, 'create').mockImplementation((docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        const created = [];
        for (const d of arr) {
            const lockId = `fanclub:${d.owner}:${d.member}`;
            acquireLock(db, lockId);
            const exists = db.memberships.some(m => String(m.owner) === String(d.owner) && String(m.member) === String(d.member));
            if (exists) {
                const err = new Error('E11000 duplicate key');
                err.code = 11000;
                throw err;
            }
            const row = { ...d };
            db.memberships.push(row);
            created.push(row);
        }
        recordUndo(txContext.getStore(), () => { for (const c of created) { const idx = db.memberships.indexOf(c); if (idx !== -1) db.memberships.splice(idx, 1); } });
        return Promise.resolve(created);
    });
    // ✅ تتبّع حالة التزام منفصلة (نفس Follow.exists بالملف المجاور): عضوية أنشأتها معاملة أخرى
    // لا تزال قيد القفل = غير مُلتزَمة بعد = غير مرئية لي (عزل قراءة حقيقي، لا قراءة قذرة)
    jest.spyOn(FanClubMembership, 'exists').mockImplementation((filter) => {
        const row = db.memberships.find(m => String(m.owner) === String(filter.owner) && String(m.member) === String(filter.member));
        if (!row) return Promise.resolve(false);
        const lockHolder = db._locks.get(`fanclub:${filter.owner}:${filter.member}`);
        const ctx = txContext.getStore();
        if (lockHolder && lockHolder !== ctx) return Promise.resolve(false);
        return Promise.resolve(true);
    });
    jest.spyOn(FanClubWeekly, 'addPoints').mockResolvedValue(null);
    // ✅ نفس سلوك withTransaction الحقيقي: تضارب كتابة (112) يُعاد تنفيذ الدالة بالكامل تلقائياً
    jest.spyOn(mongoose, 'startSession').mockImplementation(async () => ({
        withTransaction: async (fn) => {
            for (let attempt = 0; attempt < 30; attempt++) {
                const ctx = { undo: [], locks: [] };
                try {
                    const result = await txContext.run(ctx, fn);
                    ctx.locks.forEach(lockId => db._locks.delete(lockId));
                    return result;
                } catch (error) {
                    for (let i = ctx.undo.length - 1; i >= 0; i--) ctx.undo[i]();
                    ctx.locks.forEach(lockId => db._locks.delete(lockId));
                    if (error.code === 112) continue;
                    throw error;
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
function makeFakeIo() {
    return { to: () => ({ emit: () => {} }), emit: () => {} };
}
function mockReq(ownerId, memberId) {
    return { params: { ownerId }, user: { id: memberId }, app: { get: () => makeFakeIo() } };
}

describe('joinFanClub — ذرّية الخصم + منع الانضمام المزدوج + متابعة/ربط', () => {
    afterEach(() => jest.restoreAllMocks());

    test('سباق نقرتين متزامنتين لنفس (مالك، عضو) — تُخصَم الكوينز مرة واحدة فقط', async () => {
        const db = makeDb();
        seedUser(db, { _id: '111111111111111111111111', isBot: false });
        const member = seedUser(db, { _id: '222222222222222222222222', coins: 1000 });
        wireMocks(db);
        jest.spyOn(Follow, 'exists').mockResolvedValue(true);
        jest.spyOn(linkageService, 'areLinked').mockResolvedValue(false);

        const res1 = mockRes(), res2 = mockRes();
        await Promise.all([
            fanClubController.joinFanClub(mockReq('111111111111111111111111', '222222222222222222222222'), res1),
            fanClubController.joinFanClub(mockReq('111111111111111111111111', '222222222222222222222222'), res2)
        ]);

        // ✅ خُصم 100 كوينز مرة واحدة بالضبط — لا مرتين
        expect(member.coins).toBe(1000 - 100);
        expect(db.memberships.filter(m => m.owner === '111111111111111111111111' && m.member === '222222222222222222222222')).toHaveLength(1);
        const statuses = [res1.status.mock.calls[0][0], res2.status.mock.calls[0][0]];
        expect(statuses.sort()).toEqual([200, 201]); // ناجح جديد (201) + "عضو بالفعل" (200)
    });

    test('حساب مرتبط بالمالك — يُرفَض قبل أي محاولة خصم، لا كوينز تُنفَق ولا عضوية تُنشأ', async () => {
        const db = makeDb();
        seedUser(db, { _id: '111111111111111111111111', isBot: false });
        const member = seedUser(db, { _id: '222222222222222222222222', coins: 1000 });
        wireMocks(db);
        jest.spyOn(Follow, 'exists').mockResolvedValue(true);
        jest.spyOn(linkageService, 'areLinked').mockResolvedValue(true); // ✅ مرتبط بالمالك

        const res = mockRes();
        await fanClubController.joinFanClub(mockReq('111111111111111111111111', '222222222222222222222222'), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(member.coins).toBe(1000);
        expect(db.memberships).toHaveLength(0);
    });

    test('لا يتابع صاحب النادي بعد — يُرفَض قبل أي محاولة خصم', async () => {
        const db = makeDb();
        seedUser(db, { _id: '111111111111111111111111', isBot: false });
        const member = seedUser(db, { _id: '222222222222222222222222', coins: 1000 });
        wireMocks(db);
        jest.spyOn(Follow, 'exists').mockResolvedValue(false); // ✅ لا متابعة
        jest.spyOn(linkageService, 'areLinked').mockResolvedValue(false);

        const res = mockRes();
        await fanClubController.joinFanClub(mockReq('111111111111111111111111', '222222222222222222222222'), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(member.coins).toBe(1000);
        expect(db.memberships).toHaveLength(0);
    });

    test('مسار سعيد: عدّاد المالك (memberCount) يُزاد ضمن المعاملة نفسها — activeCount لم يَعُد عدّاداً مخزَّناً (مراجعة #156)', async () => {
        const db = makeDb();
        const owner = seedUser(db, { _id: '111111111111111111111111', isBot: false });
        seedUser(db, { _id: '222222222222222222222222', coins: 1000 });
        wireMocks(db);
        jest.spyOn(Follow, 'exists').mockResolvedValue(true);
        jest.spyOn(linkageService, 'areLinked').mockResolvedValue(false);

        const res = mockRes();
        await fanClubController.joinFanClub(mockReq('111111111111111111111111', '222222222222222222222222'), res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(owner.fanClub.memberCount).toBe(1);
        expect(owner.fanClub.activeCount).toBeUndefined(); // ✅ لا يُكتَب إطلاقاً — يُحسَب حياً فقط
        expect(db.giftLogs).toHaveLength(1); // ✅ GiftLog داخل المعاملة نفسها (بند 8 بالمراجعة)
    });
});

describe('awardFanClubPoints (عبر awardFanPoints) — حساب مرتبط بالمالك يكسب صفر نقاط دوماً', () => {
    afterEach(() => jest.restoreAllMocks());

    test('هدية من حساب مرتبط بالمالك — لا زيادة نقاط إطلاقاً', async () => {
        jest.spyOn(linkageService, 'areLinked').mockResolvedValue(true);
        const findOneAndUpdateSpy = jest.spyOn(FanClubMembership, 'findOneAndUpdate');
        await fanClubController.awardFanPoints(null, '111111111111111111111111', '222222222222222222222222', 500);
        expect(findOneAndUpdateSpy).not.toHaveBeenCalled();
    });

    test('هدية من حساب غير مرتبط — تُضيف النقاط لعضوية موجودة', async () => {
        jest.spyOn(linkageService, 'areLinked').mockResolvedValue(false);
        jest.spyOn(FanClubMembership, 'findOneAndUpdate').mockResolvedValue({ points: 600, _id: 'm1' });
        jest.spyOn(FanClubWeekly, 'addPoints').mockResolvedValue(null);
        const membership = await fanClubController.awardFanPoints(null, '111111111111111111111111', '222222222222222222222222', 500);
        expect(membership.points).toBe(600);
        expect(FanClubWeekly.addPoints).toHaveBeenCalledWith('111111111111111111111111', '222222222222222222222222', expect.any(Date), 500);
    });
});
