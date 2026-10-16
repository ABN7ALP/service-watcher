// ملف: giftController.seatDuelScore.test.js
// ✅ يختبر applyGiftToActiveSeatChallenge (الجزء 4، بند 10: "نقاط كل مشارك تُحسب في الخادم
// من الهدايا المرسلة له خلال التحدي") — نفس استراتيجية محاكاة Mongoose المستخدَمة بكل اختبارات
// هذا المشروع (بلا قاعدة بيانات حقيقية). jest.useFakeTimers() قبل require لنفس السبب الموثَّق
// بـgiftController.pkScore.test.js (مؤقّت تنظيف محدِّد المعدّل العام يُسجَّل لحظة الاستيراد)
jest.useFakeTimers();

const SeatChallenge = require('../../models/SeatChallenge');
const { applyGiftToActiveSeatChallenge } = require('../giftController');

function makeIo() {
    const emitted = [];
    return {
        emitted,
        to(room) { return { emit: (event, payload) => emitted.push({ room, event, payload }) }; }
    };
}

function makeChallengeDoc(state) {
    return {
        _id: state._id,
        room: state.room,
        scoreA: state.scoreA,
        scoreB: state.scoreB,
        participants: state.participants,
        topSupporters: async (team) => {
            const map = team === 'A' ? state.supportersA : state.supportersB;
            return Array.from(map.entries())
                .map(([userId, d]) => ({ userId, username: d.username, profileImage: d.profileImage, points: d.points }))
                .sort((a, b) => b.points - a.points);
        }
    };
}

// ✅ يحاكي findOneAndUpdate بتفسير بسيط لمسارات $inc/$set النقطية (participants.N.score،
// supportersX.uid.points...) على حالة بالذاكرة — يكفي تماماً لاختبار منطق الفرع الصِرف
function applyPathIncSet(state, update) {
    if (update.$inc) {
        for (const [path, delta] of Object.entries(update.$inc)) {
            setPath(state, path, (getPath(state, path) || 0) + delta);
        }
    }
    if (update.$set) {
        for (const [path, value] of Object.entries(update.$set)) {
            setPath(state, path, value);
        }
    }
}
function getPath(obj, path) {
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
        if (cur instanceof Map) cur = cur.get(p);
        else cur = cur?.[p];
        if (cur === undefined) return undefined;
    }
    return cur;
}
function setPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        let next = cur instanceof Map ? cur.get(p) : cur[p];
        if (next === undefined) {
            next = (i === parts.length - 2 && /^supporters/.test(parts[0])) ? {} : (parts[i + 1].match(/^\d+$/) ? [] : {});
            if (cur instanceof Map) cur.set(p, next); else cur[p] = next;
        }
        cur = next;
    }
    const last = parts[parts.length - 1];
    if (cur instanceof Map) cur.set(last, value); else cur[last] = value;
}

function mockChallenge(challengeId, roomId, participants) {
    const state = {
        _id: challengeId, room: roomId, scoreA: 0, scoreB: 0,
        participants: participants.map(p => ({ ...p, score: 0 })),
        supportersA: new Map(), supportersB: new Map()
    };
    jest.spyOn(SeatChallenge, 'findOne').mockImplementation(({ room, 'participants.user': uid }) => {
        if (room !== roomId) return Promise.resolve(null);
        if (!state.participants.some(p => p.user === uid)) return Promise.resolve(null);
        return Promise.resolve(makeChallengeDoc(state));
    });
    jest.spyOn(SeatChallenge, 'findOneAndUpdate').mockImplementation((filter, update) => {
        if (filter._id !== challengeId || filter.status !== 'active') return Promise.resolve(null);
        applyPathIncSet(state, update);
        return Promise.resolve(makeChallengeDoc(state));
    });
    return state;
}

async function flushMicrotasks() {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('giftController.applyGiftToActiveSeatChallenge', () => {
    afterEach(() => jest.restoreAllMocks());

    test('يضيف قيمة الهدية لنقاط المستلِم الفردية ولفريقه، ويسجّل المُرسِل داعماً لذلك الفريق', async () => {
        const io = makeIo();
        const state = mockChallenge('dc_1', 'room_1', [
            { user: 'p1', team: 'A' }, { user: 'p2', team: 'A' },
            { user: 'p3', team: 'B' }, { user: 'p4', team: 'B' }
        ]);
        const sender = { _id: 'sender_1', username: 'مُرسِل', profileImage: 'https://x/a.png' };

        await applyGiftToActiveSeatChallenge(io, 'room_1', 'p1', 300, sender);
        await flushMicrotasks();

        expect(state.scoreA).toBe(300);
        expect(state.scoreB).toBe(0);
        expect(state.participants.find(p => p.user === 'p1').score).toBe(300);
        expect(state.participants.find(p => p.user === 'p2').score).toBe(0);
        expect(state.supportersA.get('sender_1').points).toBe(300);
        expect(state.supportersA.get('sender_1').username).toBe('مُرسِل');
    });

    test('مستلمون بفريقين مختلفين يُحسَبان بشكل مستقل تماماً (لا تجميع خاطئ)', async () => {
        const io = makeIo();
        const state = mockChallenge('dc_2', 'room_2', [
            { user: 'p1', team: 'A' }, { user: 'p3', team: 'B' }
        ]);
        await applyGiftToActiveSeatChallenge(io, 'room_2', 'p1', 100, null);
        await applyGiftToActiveSeatChallenge(io, 'room_2', 'p3', 70, null);
        await flushMicrotasks();

        expect(state.scoreA).toBe(100);
        expect(state.scoreB).toBe(70);
        expect(state.participants.find(p => p.user === 'p1').score).toBe(100);
        expect(state.participants.find(p => p.user === 'p3').score).toBe(70);
    });

    test('مستلم ليس طرفاً بالتحدي النشط — يُتجاهَل بصمت بلا أي بثّ', async () => {
        const io = makeIo();
        mockChallenge('dc_3', 'room_3', [{ user: 'p1', team: 'A' }, { user: 'p2', team: 'B' }]);
        await applyGiftToActiveSeatChallenge(io, 'room_3', 'stranger', 50, null);
        await flushMicrotasks();
        expect(io.emitted).toHaveLength(0);
    });

    test('يبثّ seat-duel:score بنقاط كل مشارك + أفضل الداعمين لكل فريق (حافة أمامية فورية)', async () => {
        const io = makeIo();
        mockChallenge('dc_4', 'room_4', [{ user: 'p1', team: 'A' }, { user: 'p2', team: 'B' }]);
        const sender = { _id: 's1', username: 'أحمد', profileImage: 'https://x/a.png' };
        await applyGiftToActiveSeatChallenge(io, 'room_4', 'p1', 250, sender);
        await flushMicrotasks();

        const scoreEvents = io.emitted.filter(e => e.event === 'seat-duel:score');
        expect(scoreEvents).toHaveLength(1);
        const payload = scoreEvents[0].payload;
        expect(payload.scoreA).toBe(250);
        expect(payload.participants.find(p => p.userId === 'p1').score).toBe(250);
        expect(payload.topFans.A[0]).toMatchObject({ userId: 's1', points: 250 });
    });

    test('هدايا متسارعة لنفس التحدي داخل نافذة 300ms تُبثّ مرّة واحدة فقط بأحدث الأرقام', async () => {
        const io = makeIo();
        const state = mockChallenge('dc_5', 'room_5', [{ user: 'p1', team: 'A' }]);
        await applyGiftToActiveSeatChallenge(io, 'room_5', 'p1', 100, null); // حافة أمامية
        await flushMicrotasks();
        io.emitted.length = 0;

        await applyGiftToActiveSeatChallenge(io, 'room_5', 'p1', 50, null);
        await applyGiftToActiveSeatChallenge(io, 'room_5', 'p1', 30, null);
        await flushMicrotasks();
        expect(io.emitted.filter(e => e.event === 'seat-duel:score')).toHaveLength(0);

        await jest.advanceTimersByTimeAsync(300);
        await flushMicrotasks();
        const events = io.emitted.filter(e => e.event === 'seat-duel:score');
        expect(events).toHaveLength(1);
        expect(events[0].payload.scoreA).toBe(180);
        expect(state.scoreA).toBe(180);
    });
});
