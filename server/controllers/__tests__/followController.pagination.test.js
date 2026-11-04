// ملف: followController.pagination.test.js
// 🛡️ feat/follow-v2: ترقيم قائمة "متابِعين" بالمؤشّر (cursor) — 20 بالصفحة. يُثبِت: الصفحة
// الأولى تُعيد أحدث 20 (بالترتيب الزمني تنازلياً) + nextCursor صالح، والصفحة الثانية (بنفس
// المؤشّر) تُكمل بالضبط من حيث انتهت الأولى بلا تكرار أو تخطٍّ، وتُعيد nextCursor=null عند
// النهاية الحقيقية — تماماً كما يتطلبه حساب حقيقي بمئات المتابِعين (راجع طلب المهمة الأصلي).
const mongoose = require('mongoose');
const User = require('../../models/User');
const Follow = require('../../models/Follow');
const followController = require('../followController');

function oid(n) { return String(n).padStart(24, '0'); }

function makeFindChain(rows) {
    let limitN = null;
    const chain = {
        sort: () => chain,
        limit: (n) => { limitN = n; return chain; },
        select: () => chain,
        lean: () => Promise.resolve(limitN != null ? rows.slice(0, limitN) : rows)
    };
    return chain;
}

function wireMocks({ targetId, edges, usersById }) {
    jest.spyOn(User, 'exists').mockResolvedValue(true);

    jest.spyOn(Follow, 'find').mockImplementation((filter) => {
        // getRelationStates: "أتابعه" — follower ثابت + followee:{$in:...}
        if (filter.followee && filter.followee.$in) {
            const ids = filter.followee.$in.map(String);
            const matches = edges.filter(e => String(e.follower) === String(filter.follower) && ids.includes(String(e.followee)));
            return makeFindChain(matches.map(e => ({ followee: e.followee })));
        }
        // getRelationStates: "يتابعني" — followee ثابت + follower:{$in:...}
        if (filter.follower && filter.follower.$in) {
            const ids = filter.follower.$in.map(String);
            const matches = edges.filter(e => String(e.followee) === String(filter.followee) && ids.includes(String(e.follower)));
            return makeFindChain(matches.map(e => ({ follower: e.follower })));
        }
        // الاستعلام الأساسي لقائمة "متابِعين" — followee = targetId، مُرقَّم بالمؤشّر اختيارياً
        let matches = edges.filter(e => String(e.followee) === String(filter.followee));
        if (filter.$or) {
            matches = matches.filter(e => filter.$or.some(cond => {
                if (cond.createdAt && cond.createdAt.$lt) return e.createdAt.getTime() < cond.createdAt.$lt.getTime();
                if (cond.createdAt instanceof Date && cond._id && cond._id.$lt) {
                    return e.createdAt.getTime() === cond.createdAt.getTime() && String(e._id) < String(cond._id.$lt);
                }
                return false;
            }));
        }
        matches = [...matches].sort((a, b) => {
            const diff = b.createdAt.getTime() - a.createdAt.getTime();
            if (diff !== 0) return diff;
            return String(b._id) > String(a._id) ? 1 : -1;
        });
        return makeFindChain(matches);
    });

    jest.spyOn(User, 'findById').mockImplementation(() => ({ select: () => Promise.resolve(null) }));
    jest.spyOn(User, 'find').mockImplementation((filter) => ({
        select: () => ({
            lean: () => Promise.resolve(
                filter._id.$in.map(String).map(id => usersById.get(id)).filter(Boolean)
            )
        })
    }));
}

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
function mockReq(targetId, viewerId, cursor) {
    return { params: { id: targetId }, query: cursor ? { cursor } : {}, user: { id: viewerId } };
}

describe('getFollowersList — ترقيم بالمؤشّر (cursor pagination)، 20 بالصفحة', () => {
    afterEach(() => jest.restoreAllMocks());

    test('حساب بـ35 متابِعاً: الصفحة الأولى تُعيد أحدث 20 + nextCursor، الثانية تُكمل بالضبط 15 الباقين بلا تكرار/تخطٍّ وnextCursor=null', async () => {
        const targetId = oid(1);
        const viewerId = oid(2);
        const TOTAL = 35;
        // ✅ createdAt تنازلي مع تقدّم الفهرس (follower 0 هو الأقدم، 34 هو الأحدث) — نفس ترتيب
        // العرض المتوقَّع (الأحدث أولاً)
        const baseTime = new Date('2026-01-01T00:00:00Z').getTime();
        const edges = Array.from({ length: TOTAL }, (_, i) => ({
            _id: oid(1000 + i), follower: oid(3000 + i), followee: targetId,
            createdAt: new Date(baseTime + i * 1000)
        }));
        const usersById = new Map(edges.map(e => [String(e.follower), {
            _id: e.follower, username: `user${e.follower}`, profileImage: '', customId: '1', level: 1, activeFrameClass: ''
        }]));
        wireMocks({ targetId, edges, usersById });

        const res1 = mockRes();
        await followController.getFollowersList(mockReq(targetId, viewerId), res1);
        const body1 = res1.json.mock.calls[0][0];
        expect(body1.status).toBe('success');
        expect(body1.data.users).toHaveLength(20);
        expect(body1.data.nextCursor).not.toBeNull();
        // ✅ الأحدث أولاً: follower34 (i=34, الأحدث) يجب أن يكون أول صف
        expect(body1.data.users[0]._id).toBe(oid(3034));
        expect(body1.data.users[19]._id).toBe(oid(3015)); // أول 20 = الفهارس 34 نزولاً إلى 15

        const res2 = mockRes();
        await followController.getFollowersList(mockReq(targetId, viewerId, body1.data.nextCursor), res2);
        const body2 = res2.json.mock.calls[0][0];
        expect(body2.status).toBe('success');
        expect(body2.data.users).toHaveLength(15); // 35 - 20 = 15 بالضبط، لا تكرار ولا نقص
        expect(body2.data.nextCursor).toBeNull(); // ✅ نهاية حقيقية
        expect(body2.data.users[0]._id).toBe(oid(3014)); // تواصل مباشر من حيث انتهت الأولى
        expect(body2.data.users[14]._id).toBe(oid(3000)); // الأقدم أخيراً

        // ✅ لا تداخل بين الصفحتين (مجموع المعرّفات الفريدة = 35 بالضبط)
        const allIds = new Set([...body1.data.users, ...body2.data.users].map(u => u._id));
        expect(allIds.size).toBe(35);
    });

    test('حساب بأقل من 20 متابِعاً: صفحة واحدة فقط، nextCursor=null', async () => {
        const targetId = oid(1);
        const viewerId = oid(2);
        const edges = Array.from({ length: 7 }, (_, i) => ({
            _id: oid(1000 + i), follower: oid(3000 + i), followee: targetId,
            createdAt: new Date(Date.now() + i * 1000)
        }));
        const usersById = new Map(edges.map(e => [String(e.follower), {
            _id: e.follower, username: `user${e.follower}`, profileImage: '', customId: '1', level: 1, activeFrameClass: ''
        }]));
        wireMocks({ targetId, edges, usersById });

        const res = mockRes();
        await followController.getFollowersList(mockReq(targetId, viewerId), res);
        const body = res.json.mock.calls[0][0];
        expect(body.data.users).toHaveLength(7);
        expect(body.data.nextCursor).toBeNull();
    });
});
