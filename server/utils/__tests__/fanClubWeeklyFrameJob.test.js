// ملف: fanClubWeeklyFrameJob.test.js
// 🛡️ مراجعة PR (gifts-visibility-frames-perf — البند 1): كانت حالة "آخر أسبوع تمت معالجته"
// محفوظة بمتغيّر JS محلي فقط، فيُعاد تشغيل المنح بالكامل بعد كل نشر/إعادة تشغيل للسيرفر —
// بما في ذلك فرض إعادة تفعيل إطار المساهم حتى لو بدّله المستخدم فعلياً لإطار آخر. يثبت هذا
// الملف: (أ) نداء ثانٍ لنفس الأسبوع لا يُعيد المعالجة إطلاقاً (الحجز الذرّي بـJobRun)، (ب) نفس
// الضمان يبقى صحيحاً بعد "إعادة تشغيل" حقيقية (jest.resetModules — أي متغيّر ذاكرة محلي
// بالوحدة القديمة يضيع، فقط حجز قاعدة البيانات يبقى)، (ج) لا فرض تفعيل أبداً فوق اختيار
// المستخدم اليدوي لإطار آخر، حتى بأول تشغيل.
//
// نفس استراتيجية الاختبار الثابتة بهذا المشروع (راجع frameController.race.test.js المجاور):
// jest.spyOn على نماذج Mongoose الحقيقية بمحاكاة حالة بذاكرة JS — لا قاعدة بيانات حقيقية.
// محاكاة JobRun.create تُطبِّق فهرس unique(job, weekStart) حقيقياً: إدراج ثانٍ لنفس المفتاح
// يُرفض بخطأ E11000 بالضبط كما يفعل Mongo الحقيقي.

function wireMocks(db, claimed) {
    const FanClubMembership = require('../../models/FanClubMembership');
    const GiftLog = require('../../models/GiftLog');
    const User = require('../../models/User');
    const ProfileFrame = require('../../models/ProfileFrame');
    const JobRun = require('../../models/JobRun');

    jest.spyOn(FanClubMembership, 'distinct').mockResolvedValue(['owner1']);
    jest.spyOn(GiftLog, 'aggregate').mockResolvedValue([{ _id: 'owner1', topSender: 'winner1' }]);
    jest.spyOn(ProfileFrame, 'findOne').mockResolvedValue({
        _id: 'frame1', name: 'إطار المساهم', cssClass: 'profile-frame-contributor', previewImage: 'preview.png'
    });
    jest.spyOn(User, 'findById').mockImplementation((id) => ({
        select: () => Promise.resolve(db.users.get(String(id)))
    }));
    jest.spyOn(JobRun, 'create').mockImplementation(({ job, weekStart }) => {
        const key = `${job}:${weekStart.getTime()}`;
        if (claimed.has(key)) {
            return Promise.reject(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
        }
        claimed.add(key);
        return Promise.resolve({ job, weekStart });
    });

    return { FanClubMembership, GiftLog, User, ProfileFrame, JobRun };
}

function seedWinner(db, overrides) {
    const user = {
        _id: 'winner1', ownedFrames: [], activeFrame: null, activeFrameClass: null,
        activeFrameExpiresAt: null, socketId: null, ...overrides
    };
    user.save = jest.fn().mockResolvedValue(true);
    db.users.set(user._id, user);
    return user;
}

describe('fanClubWeeklyFrameJob — حجز ذرّي بقاعدة البيانات يمنع إعادة المعالجة', () => {
    let db, claimed, io;

    beforeEach(() => {
        db = { users: new Map() };
        claimed = new Set();
        io = { to: jest.fn(() => ({ emit: jest.fn() })) };
    });

    afterEach(() => jest.restoreAllMocks());

    test('نداء ثانٍ لنفس الأسبوع (نفس نسخة العملية) لا يُعيد المنح ولا يلمس الإطار النشط', async () => {
        const user = seedWinner(db);
        const mocks = wireMocks(db, claimed);
        const { grantWeeklyContributorFrames } = require('../fanClubWeeklyFrameJob');

        await grantWeeklyContributorFrames(io);
        expect(user.activeFrame).toBe('frame1'); // ✅ equip حقيقي — لا إطار نشط سابقاً
        const firstExpiry = user.activeFrameExpiresAt;
        expect(firstExpiry).toBeInstanceOf(Date);
        expect(user.save).toHaveBeenCalledTimes(1);

        await grantWeeklyContributorFrames(io); // فحص دوري ثانٍ خلال نفس الأسبوع (كل 30 دقيقة)

        expect(user.save).toHaveBeenCalledTimes(1); // ✅ لم يُستدعَ مرة ثانية إطلاقاً
        expect(user.activeFrameExpiresAt).toBe(firstExpiry); // ✅ لم تُصفَّر/تُمدَّد الصلاحية
        expect(mocks.ProfileFrame.findOne).toHaveBeenCalledTimes(1); // ✅ المعالجة لم تُعَد أصلاً
    });

    test('بعد "إعادة تشغيل" حقيقية للعملية — الحجز بقاعدة البيانات يمنع إعادة المنح ويحترم تبديل المستخدم', async () => {
        const user = seedWinner(db);
        wireMocks(db, claimed);
        const { grantWeeklyContributorFrames: grantBeforeRestart } = require('../fanClubWeeklyFrameJob');
        await grantBeforeRestart(io);

        // ✅ المستخدم يبدّل يدوياً لإطار آخر بعد الفوز الأول — يجب أن يبقى محترماً بعد "إعادة التشغيل"
        user.activeFrame = 'otherFrame';
        user.activeFrameClass = 'profile-frame-other';
        user.activeFrameExpiresAt = null;
        const ownedSnapshotBefore = JSON.stringify(user.ownedFrames);

        jest.resetModules(); // ✅ يُحاكي إعادة تشغيل العملية فعلياً: أي متغيّر JS محلي بالوحدة القديمة يضيع
        // نفس db ونفس claimed يُعاد تمريرهما — يُحاكيان استمرارية قاعدة البيانات الحقيقية عبر
        // إعادة التشغيل (لا الحالة بالذاكرة، التي تضيع فعلاً بعد resetModules أعلاه)
        const mocksAfterRestart = wireMocks(db, claimed);
        const { grantWeeklyContributorFrames: grantAfterRestart } = require('../fanClubWeeklyFrameJob');

        await grantAfterRestart(io);

        expect(mocksAfterRestart.ProfileFrame.findOne).not.toHaveBeenCalled(); // ✅ الحجز رُفض فوراً، لا معالجة أصلاً
        expect(user.activeFrame).toBe('otherFrame'); // ✅ لم يُفرَض إعادة تفعيل إطار المساهم فوق اختياره
        expect(user.activeFrameClass).toBe('profile-frame-other');
        expect(JSON.stringify(user.ownedFrames)).toBe(ownedSnapshotBefore); // ✅ لا تمديد صلاحية إضافي
    });

    test('مستخدم يرتدي إطاراً آخر مسبقاً: المنح يُضيف/يُمدِّد الملكية فقط، بلا أي فرض تفعيل', async () => {
        const user = seedWinner(db, { activeFrame: 'manualFrame', activeFrameClass: 'profile-frame-manual', activeFrameExpiresAt: null });
        wireMocks(db, claimed);
        const { grantWeeklyContributorFrames } = require('../fanClubWeeklyFrameJob');

        await grantWeeklyContributorFrames(io);

        expect(user.ownedFrames).toHaveLength(1); // ✅ يملك الإطار فعلاً الآن
        expect(user.ownedFrames[0].frame).toBe('frame1');
        expect(user.activeFrame).toBe('manualFrame'); // ✅ لم يُفرَض تفعيله — اختيار المستخدم محترم
        expect(user.activeFrameClass).toBe('profile-frame-manual');
    });
});
