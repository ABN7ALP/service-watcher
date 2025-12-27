const User = require('../models/User');

// إرسال طلب صداقة
exports.sendFriendRequest = async (req, res) => {
    try {
        const senderId = req.user.id;
        const receiverId = req.params.userId;

        if (senderId === receiverId) {
            return res.status(400).json({ message: 'لا يمكنك إرسال طلب صداقة لنفسك.' });
        }

        const sender = await User.findById(senderId);
        const receiver = await User.findById(receiverId);

        if (!receiver) {
            return res.status(404).json({ message: 'المستخدم غير موجود.' });
        }
        if (sender.friends.includes(receiverId) || receiver.friends.includes(senderId)) {
            return res.status(400).json({ message: 'أنتم أصدقاء بالفعل.' });
        }
        if (sender.friendRequestsSent.includes(receiverId) || receiver.friendRequestsReceived.includes(senderId)) {
            return res.status(400).json({ message: 'لقد أرسلت طلب صداقة بالفعل.' });
        }

        // إضافة الطلب
        await User.findByIdAndUpdate(senderId, { $addToSet: { friendRequestsSent: receiverId } });
        await User.findByIdAndUpdate(receiverId, { $addToSet: { friendRequestsReceived: senderId } });

        res.status(200).json({ message: 'تم إرسال طلب الصداقة بنجاح.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};

// قبول طلب صداقة
exports.acceptFriendRequest = async (req, res) => {
    try {
        const accepterId = req.user.id; // الشخص الذي يقبل الطلب
        const senderId = req.params.userId;   // الشخص الذي أرسل الطلب

        // تحديث كلا المستخدمين في نفس الوقت
        await Promise.all([
            User.findByIdAndUpdate(accepterId, {
                $addToSet: { friends: senderId }, // إضافة الصديق الجديد
                $pull: { friendRequestsReceived: senderId } // حذف الطلب من قائمة الطلبات المستلمة
            }),
            User.findByIdAndUpdate(senderId, {
                $addToSet: { friends: accepterId }, // إضافة الصديق الجديد للطرف الآخر
                $pull: { friendRequestsSent: accepterId } // حذف الطلب من قائمة الطلبات المرسلة
            })
        ]);

        res.status(200).json({ message: 'تم قبول طلب الصداقة.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};

// رفض أو إلغاء طلب صداقة
exports.rejectOrCancelRequest = async (req, res) => {
    try {
        const selfId = req.user.id;
        const otherId = req.params.userId;

        // تحديث كلا المستخدمين
        await Promise.all([
            User.findByIdAndUpdate(selfId, {
                $pull: { friendRequestsReceived: otherId, friendRequestsSent: otherId }
            }),
            User.findByIdAndUpdate(otherId, {
                $pull: { friendRequestsReceived: selfId, friendRequestsSent: selfId }
            })
        ]);

        res.status(200).json({ message: 'تم إلغاء طلب الصداقة.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};

// حذف صديق
exports.removeFriend = async (req, res) => {
    try {
        const selfId = req.user.id;
        const friendId = req.params.userId;

        await Promise.all([
            User.findByIdAndUpdate(selfId, { $pull: { friends: friendId } }),
            User.findByIdAndUpdate(friendId, { $pull: { friends: selfId } })
        ]);

        res.status(200).json({ message: 'تم حذف الصديق.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في الخادم.' });
    }
};
