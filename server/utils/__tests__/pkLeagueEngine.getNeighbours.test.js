// ملف: pkLeagueEngine.getNeighbours.test.js
// ✅ شكل مصفوفة الجيران يجب أن يطابق تماماً ما تتوقّعه حركة السلّم بالنموذج الإلزامي:
// "تحسّنت" (improved) → 3 جيران حقيقيون بلا صفّي الاصطناعي؛ غير ذلك → جارّان فقط + صفّي
// الاصطناعي (me:true) بالرتبة الجديدة. يُحاكى PkStanding.find/VoiceRoom.findById كاملاً

const PkStanding = require('../../models/PkStanding');
const VoiceRoom = require('../../models/VoiceRoom');
const { getNeighbours } = require('../pkLeagueEngine');

function mockPkStandingFind(rows) {
    const chain = {
        sort: jest.fn(() => chain),
        skip: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        populate: jest.fn(() => chain),
        lean: jest.fn(() => Promise.resolve(rows))
    };
    jest.spyOn(PkStanding, 'find').mockReturnValue(chain);
    return chain;
}

function mockVoiceRoomFindById(doc) {
    jest.spyOn(VoiceRoom, 'findById').mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(doc) })
    });
}

describe('pkLeagueEngine.getNeighbours', () => {
    afterEach(() => jest.restoreAllMocks());

    test('improved=true: 3 جيران حقيقيون، بلا صفّي الاصطناعي، وskip=rankAfter-2', async () => {
        const chain = mockPkStandingFind([
            { room: { name: 'غرفة القمر', coverImage: 'a.jpg' }, lp: 19610 },
            { room: { name: 'سهرة الشام', coverImage: 'b.jpg' }, lp: 19470 },
            { room: { name: 'ليالي حلب', coverImage: 'c.jpg' }, lp: 19330 }
        ]);

        const neighbours = await getNeighbours('season_1', 'my_room', 190, true, { lp: 19480 });

        expect(chain.skip).toHaveBeenCalledWith(188);
        expect(chain.limit).toHaveBeenCalledWith(3);
        expect(neighbours).toEqual([
            { r: 189, n: 'غرفة القمر', s: 19610, img: 'a.jpg' },
            { r: 190, n: 'سهرة الشام', s: 19470, img: 'b.jpg' },
            { r: 191, n: 'ليالي حلب', s: 19330, img: 'c.jpg' }
        ]);
        expect(neighbours.some(n => n.me)).toBe(false);
    });

    test('improved=false: جارّان فقط + صفّي الاصطناعي (me:true) بالرتبة الجديدة، وskip=rankAfter-3', async () => {
        const chain = mockPkStandingFind([
            { room: { name: 'دار الكرم', coverImage: 'x.jpg' }, lp: 24990 },
            { room: { name: 'نجوم الليل', coverImage: 'y.jpg' }, lp: 24880 }
        ]);
        mockVoiceRoomFindById({ name: 'غرفة الأساطير', coverImage: 'z.jpg' });

        const neighbours = await getNeighbours('season_1', 'my_room', 163, false, { lp: 24810 });

        expect(chain.skip).toHaveBeenCalledWith(160);
        expect(chain.limit).toHaveBeenCalledWith(2);
        expect(neighbours).toHaveLength(3);
        expect(neighbours[0]).toEqual({ r: 161, n: 'دار الكرم', s: 24990, img: 'x.jpg' });
        expect(neighbours[1]).toEqual({ r: 162, n: 'نجوم الليل', s: 24880, img: 'y.jpg' });
        expect(neighbours[2]).toEqual({ r: 163, n: 'غرفة الأساطير', s: 24810, img: 'z.jpg', me: true });
    });

    test('skip لا يُصبح سالباً أبداً حتى برتبة أولى', async () => {
        const chain = mockPkStandingFind([]);
        mockVoiceRoomFindById({ name: 'غرفتي', coverImage: '' });
        await getNeighbours('season_1', 'my_room', 1, true, { lp: 500 });
        expect(chain.skip).toHaveBeenCalledWith(0);
    });

    test('صفّ بغرفة محذوفة (room:null) يُستثنى بأمان بلا كسر النتيجة', async () => {
        mockPkStandingFind([
            { room: { name: 'موجودة', coverImage: 'ok.jpg' }, lp: 100 },
            { room: null, lp: 90 }
        ]);
        const neighbours = await getNeighbours('season_1', 'my_room', 5, true, { lp: 80 });
        expect(neighbours).toHaveLength(1);
        expect(neighbours[0].n).toBe('موجودة');
    });
});
