// ملف: socketService.fanClubEntranceDedup.test.js
// 🛡️ feat/fanclub-final: إعلان دخول نادي المعجبين المميّز يجب أن يظهر مرة واحدة فقط لكل دخول
// حقيقي، ولا يتكرر عند إعادة الاتصال (انقطاع شبكة قصير/تحديث الصفحة) خلال دقيقتين من آخر
// إعلان بنفس الغرفة — لكنه يجب أن يظهر مجدداً بعد مرور تلك النافذة فعلياً. يُختبَر مباشرة
// كدالة خالصة (مُصدَّرة فقط لهذا الاختبار — راجع تعليقها بـsocketService.js)، نفس أسلوب
// socketService.roomEventRateLimit.test.js المجاور بالضبط
jest.useFakeTimers();

const socketService = require('../socketService');
const { shouldAnnounceFanClubEntrance } = socketService;

describe('shouldAnnounceFanClubEntrance — نافذة عدم تكرار دقيقتين لكل (غرفة، مستخدم)', () => {
    test('أول دخول حقيقي: يُعلَن عنه', () => {
        expect(shouldAnnounceFanClubEntrance('room1', 'user1')).toBe(true);
    });

    test('إعادة اتصال فورية (نفس اللحظة) لنفس الغرفة والمستخدم: لا يتكرر الإعلان', () => {
        const roomId = 'room2', userId = 'user2';
        expect(shouldAnnounceFanClubEntrance(roomId, userId)).toBe(true);
        expect(shouldAnnounceFanClubEntrance(roomId, userId)).toBe(false);
        expect(shouldAnnounceFanClubEntrance(roomId, userId)).toBe(false);
    });

    test('إعادة اتصال بعد دقيقة واحدة فقط (ضمن نافذة الدقيقتين): لا يتكرر الإعلان', () => {
        const roomId = 'room3', userId = 'user3';
        expect(shouldAnnounceFanClubEntrance(roomId, userId)).toBe(true);
        jest.advanceTimersByTime(60 * 1000);
        expect(shouldAnnounceFanClubEntrance(roomId, userId)).toBe(false);
    });

    test('بعد مرور أكثر من دقيقتين فعلياً: يُعلَن عنه مجدداً (دخول حقيقي جديد)', () => {
        const roomId = 'room4', userId = 'user4';
        expect(shouldAnnounceFanClubEntrance(roomId, userId)).toBe(true);
        jest.advanceTimersByTime(2 * 60 * 1000 + 1);
        expect(shouldAnnounceFanClubEntrance(roomId, userId)).toBe(true);
    });

    test('المفتاح مُركَّب (غرفة × مستخدم) — نفس المستخدم بغرفة أخرى يُعلَن عنه باستقلال تام', () => {
        const userId = 'user5';
        expect(shouldAnnounceFanClubEntrance('roomA', userId)).toBe(true);
        expect(shouldAnnounceFanClubEntrance('roomB', userId)).toBe(true); // ✅ غرفة مختلفة، لا علاقة بالأولى
    });

    test('نفس الغرفة بمستخدمين مختلفين — كل واحد مستقل تماماً عن الآخر', () => {
        const roomId = 'roomC';
        expect(shouldAnnounceFanClubEntrance(roomId, 'userX')).toBe(true);
        expect(shouldAnnounceFanClubEntrance(roomId, 'userY')).toBe(true); // ✅ مستخدم مختلف، لا يتأثر بإعلان userX
    });
});
