const Battle = require('../models/Battle');
const User = require('../models/User');
const mongoose = require('mongoose');

// --- إنشاء تحدي جديد ---
exports.createBattle = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { type, betAmount, isPrivate, password } = req.body;
        const creatorId = req.user.id;

        // التحقق من صحة البيانات
        if (!['1v1', '2v2', '4v4'].includes(type) || !betAmount || betAmount <= 0) {
            return res.status(400).json({ status: 'fail', message: 'بيانات التحدي غير صالحة' });
        }

        const user = await User.findById(creatorId).session(session);

        // التحقق من رصيد المستخدم
        if (user.balance < betAmount) {
            return res.status(400).json({ status: 'fail', message: 'رصيدك غير كافٍ لإنشاء هذا التحدي' });
        }

        // خصم مبلغ الرهان من رصيد المنشئ
        user.balance -= betAmount;
        await user.save({ session });

        // إنشاء التحدي الجديد
        const newBattle = new Battle({
            type,
            betAmount,
            isPrivate: isPrivate || false,
            password: isPrivate ? password : null,
            players: [creatorId],
            teams: { teamA: [creatorId], teamB: [] },
        });
        await newBattle.save({ session });

        await session.commitTransaction();
        
        // (لاحقاً: سنقوم ببث هذا التحدي عبر Socket.IO)
        // req.app.get('io').emit('newBattle', newBattle);

        res.status(201).json({
            status: 'success',
            message: 'تم إنشاء التحدي بنجاح!',
            data: { battle: newBattle },
        });

    } catch (error) {
        await session.abortTransaction();
        next(error);
    } finally {
        session.endSession();
    }
};

// --- جلب كل التحديات المتاحة ---
exports.getAvailableBattles = async (req, res, next) => {
    try {
        const battles = await Battle.find({
            status: 'waiting', // فقط التحديات التي تنتظر لاعبين
            isPrivate: false,  // فقط التحديات العامة
        })
        .populate('players', 'username profileImage level')
        .sort('-createdAt');

        res.status(200).json({
            status: 'success',
            results: battles.length,
            data: { battles },
        });
    } catch (error) {
        next(error);
    }
};
