// ملف: fanClubController.roomPerks.test.js
// 🛡️ feat/fanclub-v2-ui: (1) assertFanClubExclusiveGiftEligible — نقطة الفحص الوحيدة لهدية
// النادي الحصرية (Lv.13+) تُستدعى من كل مسار إرسال هدية حقيقي بـgiftController.js؛ تثبت
// رفضها لغير العضو/المستوى 12/العضوية غير النشطة/الحساب المرتبط، وقبولها للعضو المؤهّل فعلاً.
// (2) getFanClubBadgeMap — الدفعة الواحدة التي تُرفَق بلقطة المقعد/الدردشة/المشاهدين (لا طلب
// منفصل لكل مستخدم)، تثبت شكل الشارة الصحيح واستبعاد المالك نفسه ومن ليس عضواً.
const mongoose = require('mongoose');
const FanClubMembership = require('../../models/FanClubMembership');
const User = require('../../models/User');
const Gift = require('../../models/Gift');
const linkageService = require('../../utils/linkageService');
const fanClubController = require('../fanClubController');

function oid(n) { return String(n).padStart(24, '0'); }

const OWNER = oid(1);
const MEMBER = oid(2);

describe('assertFanClubExclusiveGiftEligible — هدية النادي الحصرية (Lv.13+)', () => {
    afterEach(() => jest.restoreAllMocks());

    const exclusiveGift = { isFanClubExclusive: true };

    test('هدية عادية (isFanClubExclusive غير مضبوط) — لا تفعل شيئاً، لا استعلام إطلاقاً', async () => {
        const findOneSpy = jest.spyOn(FanClubMembership, 'findOne');
        const areLinkedSpy = jest.spyOn(linkageService, 'areLinked');
        await expect(fanClubController.assertFanClubExclusiveGiftEligible({ isFanClubExclusive: false }, MEMBER, OWNER)).resolves.toBeUndefined();
        expect(findOneSpy).not.toHaveBeenCalled();
        expect(areLinkedSpy).not.toHaveBeenCalled();
    });

    test('ترفض من ليس عضواً بالنادي أصلاً', async () => {
        jest.spyOn(linkageService, 'areLinked').mockResolvedValue(false);
        jest.spyOn(FanClubMembership, 'findOne').mockReturnValue({ select: () => Promise.resolve(null) });
        await expect(fanClubController.assertFanClubExclusiveGiftEligible(exclusiveGift, MEMBER, OWNER))
            .rejects.toMatchObject({ code: 'FAN_CLUB_EXCLUSIVE_DENIED' });
    });

    test('ترفض عضواً بالمستوى 12 (تحت عتبة 13)', async () => {
        jest.spyOn(linkageService, 'areLinked').mockResolvedValue(false);
        // Lv.12 = عتبة 90,000 بالضبط (lastThreshold قبل الانتقال لـLv.13 عند 130,000)
        jest.spyOn(FanClubMembership, 'findOne').mockReturnValue({ select: () => Promise.resolve({ points: 90000, lastPointAt: new Date() }) });
        await expect(fanClubController.assertFanClubExclusiveGiftEligible(exclusiveGift, MEMBER, OWNER))
            .rejects.toMatchObject({ code: 'FAN_CLUB_EXCLUSIVE_DENIED' });
    });

    test('ترفض عضواً بالمستوى 13+ لكن عضويته غير نشطة (lastPointAt > 7 أيام)', async () => {
        jest.spyOn(linkageService, 'areLinked').mockResolvedValue(false);
        const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        jest.spyOn(FanClubMembership, 'findOne').mockReturnValue({ select: () => Promise.resolve({ points: 200000, lastPointAt: eightDaysAgo }) });
        await expect(fanClubController.assertFanClubExclusiveGiftEligible(exclusiveGift, MEMBER, OWNER))
            .rejects.toMatchObject({ code: 'FAN_CLUB_EXCLUSIVE_DENIED' });
    });

    test('ترفض حساباً مرتبطاً بالمالك — حتى لو عضو فعلياً بمستوى عالٍ ونشط', async () => {
        jest.spyOn(linkageService, 'areLinked').mockResolvedValue(true);
        const findOneSpy = jest.spyOn(FanClubMembership, 'findOne');
        await expect(fanClubController.assertFanClubExclusiveGiftEligible(exclusiveGift, MEMBER, OWNER))
            .rejects.toMatchObject({ code: 'FAN_CLUB_EXCLUSIVE_DENIED' });
        // ✅ الربط يُفحَص أولاً — لا حاجة لقراءة العضوية إطلاقاً لحساب مرفوض أصلاً بسبب الربط
        expect(findOneSpy).not.toHaveBeenCalled();
    });

    test('ترفض المرسل لو كان هو نفسه المُستلِم (ownerId === senderId)', async () => {
        await expect(fanClubController.assertFanClubExclusiveGiftEligible(exclusiveGift, OWNER, OWNER))
            .rejects.toMatchObject({ code: 'FAN_CLUB_EXCLUSIVE_DENIED' });
    });

    test('تقبل عضواً نشطاً بمستوى 13+ فعلياً — بلا رمي أي خطأ', async () => {
        jest.spyOn(linkageService, 'areLinked').mockResolvedValue(false);
        jest.spyOn(FanClubMembership, 'findOne').mockReturnValue({ select: () => Promise.resolve({ points: 200000, lastPointAt: new Date() }) });
        await expect(fanClubController.assertFanClubExclusiveGiftEligible(exclusiveGift, MEMBER, OWNER)).resolves.toBeUndefined();
    });
});

describe('getFanClubBadgeMap — دفعة واحدة لشارات نادي المعجبين (مقعد/دردشة/مشاهدون)', () => {
    afterEach(() => jest.restoreAllMocks());

    test('لا معرّفات/لا مالك — Map فاضية بلا أي استعلام', async () => {
        const findSpy = jest.spyOn(FanClubMembership, 'find');
        expect(await fanClubController.getFanClubBadgeMap(OWNER, [])).toEqual(new Map());
        expect(await fanClubController.getFanClubBadgeMap(null, [MEMBER])).toEqual(new Map());
        expect(findSpy).not.toHaveBeenCalled();
    });

    test('يستبعد المالك نفسه من قائمة المعرّفات المطلوب فحصها (لا يُفحَص كعضو بناديه هو)', async () => {
        const findSpy = jest.spyOn(FanClubMembership, 'find').mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
        await fanClubController.getFanClubBadgeMap(OWNER, [OWNER, MEMBER]);
        expect(findSpy).toHaveBeenCalledWith({ owner: OWNER, member: { $in: [MEMBER] } });
    });

    test('لا عضو حقيقي بين المعرّفات — Map فاضية، ولا يُستعلَم عن اسم النادي إطلاقاً (تحسين أداء)', async () => {
        jest.spyOn(FanClubMembership, 'find').mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
        const userFindSpy = jest.spyOn(User, 'findById');
        const map = await fanClubController.getFanClubBadgeMap(OWNER, [MEMBER]);
        expect(map.size).toBe(0);
        expect(userFindSpy).not.toHaveBeenCalled();
    });

    test('عضو حقيقي — يُعيد شارة كاملة (مستوى/فئة/تدرّج/اسم نادٍ/نشط) من نقاط العضوية الحقيقية', async () => {
        const now = new Date();
        jest.spyOn(FanClubMembership, 'find').mockReturnValue({
            select: () => ({ lean: () => Promise.resolve([{ member: MEMBER, points: 150000, lastPointAt: now }]) })
        });
        jest.spyOn(User, 'findById').mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ fanClub: { name: 'عشّاق الطرب' } }) }) });

        const map = await fanClubController.getFanClubBadgeMap(OWNER, [MEMBER]);
        const badge = map.get(MEMBER);
        expect(badge).toBeDefined();
        expect(badge.level).toBe(13); // 150,000 نقطة تقع بين عتبتَي المستوى 13 (130,000) و14 (180,000)
        expect(badge.tierName).toBe('بلاتيني');
        expect(badge.clubName).toBe('عشّاق الطرب');
        expect(badge.active).toBe(true);
    });

    test('عضو غير نشط (lastPointAt > 7 أيام) — active:false بالشارة، لا يُستبعَد من الـMap', async () => {
        const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        jest.spyOn(FanClubMembership, 'find').mockReturnValue({
            select: () => ({ lean: () => Promise.resolve([{ member: MEMBER, points: 500, lastPointAt: eightDaysAgo }]) })
        });
        jest.spyOn(User, 'findById').mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ fanClub: {} }) }) });

        const map = await fanClubController.getFanClubBadgeMap(OWNER, [MEMBER]);
        expect(map.get(MEMBER).active).toBe(false);
    });
});
