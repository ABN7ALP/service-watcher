// ملف: fanClubController.leave.test.js
// 🛡️ fanclub-v2: مغادرة النادي — تحذف العضوية وتقدّمها اليومي/الأسبوعي، وتُنقِص عدّادي المالك
// ضمن معاملة واحدة. نفس استراتيجية adminController.moneyRaceAtomicity.test.js (jest.spyOn على
// نماذج Mongoose حقيقية بمحاكاة ذاكرة JS، لا قاعدة بيانات حقيقية).
const mongoose = require('mongoose');
const User = require('../../models/User');
const FanClubMembership = require('../../models/FanClubMembership');
const FanClubWeekly = require('../../models/FanClubWeekly');
const FanClubDailyProgress = require('../../models/FanClubDailyProgress');
const fanClubController = require('../fanClubController');

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.session = () => p;
    return p;
}

function makeDb() {
    return { users: new Map(), memberships: [] };
}
function seedUser(db, overrides) {
    const user = { _id: '111111111111111111111111', fanClub: { memberCount: 0, activeCount: 0 }, ...overrides };
    db.users.set(user._id, user);
    return user;
}

function wireMocks(db) {
    jest.spyOn(User, 'findById').mockImplementation((id) => chainable(db.users.get(String(id)) || null));
    jest.spyOn(User, 'updateOne').mockImplementation((filter, update) => {
        const row = db.users.get(String(filter._id));
        if (!row) return Promise.resolve({ matchedCount: 0 });
        if (update.$inc) for (const [path, delta] of Object.entries(update.$inc)) {
            const parts = path.split('.'); let obj = row;
            for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
            obj[parts[parts.length - 1]] = (obj[parts[parts.length - 1]] || 0) + delta;
        }
        return Promise.resolve({ matchedCount: 1 });
    });
    jest.spyOn(FanClubMembership, 'findOneAndDelete').mockImplementation((filter) => {
        const idx = db.memberships.findIndex(m => String(m.owner) === String(filter.owner) && String(m.member) === String(filter.member));
        if (idx === -1) return chainable(null);
        const [removed] = db.memberships.splice(idx, 1);
        return chainable(removed);
    });
    jest.spyOn(FanClubDailyProgress, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    jest.spyOn(FanClubWeekly, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    jest.spyOn(mongoose, 'startSession').mockImplementation(async () => ({
        withTransaction: async (fn) => { await fn(); },
        endSession: async () => {}
    }));
}

function mockRes() { return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }; }
function mockReq(ownerId, memberId) {
    return { params: { ownerId }, user: { id: memberId }, app: { get: () => ({ to: () => ({ emit: () => {} }), emit: () => {} }) } };
}

const OWNER = '111111111111111111111111';
const MEMBER = '222222222222222222222222';

describe('leaveFanClub', () => {
    afterEach(() => jest.restoreAllMocks());

    test('عضو نشط يغادر — العضوية تُحذَف، memberCount وactiveCount يُنقَصان معاً', async () => {
        const db = makeDb();
        const owner = seedUser(db, { fanClub: { memberCount: 1, activeCount: 1 } });
        db.memberships.push({ owner: OWNER, member: MEMBER, points: 500, lastPointAt: new Date() });
        wireMocks(db);

        const res = mockRes();
        await fanClubController.leaveFanClub(mockReq(OWNER, MEMBER), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(db.memberships).toHaveLength(0);
        expect(owner.fanClub.memberCount).toBe(0);
        expect(owner.fanClub.activeCount).toBe(0);
    });

    test('عضو غير نشط (آخر نقطة منذ أكثر من 7 أيام) يغادر — memberCount يُنقَص، activeCount لا يتأثر', async () => {
        const db = makeDb();
        const owner = seedUser(db, { fanClub: { memberCount: 1, activeCount: 0 } }); // ✅ لم يكن مُحتسَباً نشطاً أصلاً
        const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        db.memberships.push({ owner: OWNER, member: MEMBER, points: 500, lastPointAt: eightDaysAgo });
        wireMocks(db);

        const res = mockRes();
        await fanClubController.leaveFanClub(mockReq(OWNER, MEMBER), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(owner.fanClub.memberCount).toBe(0);
        expect(owner.fanClub.activeCount).toBe(0); // ✅ لم يُنقَص دون الصفر
    });

    test('ليس عضواً أصلاً — idempotent، لا خطأ، لا لمس للعدّادات', async () => {
        const db = makeDb();
        const owner = seedUser(db, { fanClub: { memberCount: 0, activeCount: 0 } });
        wireMocks(db);

        const res = mockRes();
        await fanClubController.leaveFanClub(mockReq(OWNER, MEMBER), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ status: 'success', data: { left: false } });
        expect(owner.fanClub.memberCount).toBe(0);
    });
});
