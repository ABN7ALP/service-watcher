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
        const battleForEmit = await Battle.findById(newBattle._id).populate('players', 'username profileImage');
        req.io.emit('newBattle', battleForEmit);
        
        req.io.to(user.socketId).emit('balanceUpdate', { newBalance: user.balance });
        

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


// ✅ --- دالة جديدة للانضمام إلى تحدي ---
exports.joinBattle = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const battleId = req.params.id;
        const userId = req.user.id;

        const battle = await Battle.findById(battleId).session(session);
        const user = await User.findById(userId).session(session);

        // --- سلسلة من التحققات لضمان سلامة العملية ---
        if (!battle) {
            return res.status(404).json({ status: 'fail', message: 'التحدي لم يعد موجوداً' });
        }
        if (battle.status !== 'waiting') {
            return res.status(400).json({ status: 'fail', message: 'لا يمكن الانضمام لهذا التحدي، لقد بدأ بالفعل أو اكتمل' });
        }
        if (battle.players.includes(userId)) {
            return res.status(400).json({ status: 'fail', message: 'أنت منضم بالفعل لهذا التحدي' });
        }
        if (user.balance < battle.betAmount) {
            return res.status(400).json({ status: 'fail', message: 'رصيدك غير كافٍ للانضمام' });
        }
        if (battle.players.length >= battle.maxPlayers) {
            return res.status(400).json({ status: 'fail', message: 'هذا التحدي مكتمل' });
        }

        // --- تنفيذ منطق الانضمام ---
        // 1. خصم الرصيد من اللاعب المنضم
        user.balance -= battle.betAmount;
        await user.save({ session });

        // 2. إضافة اللاعب إلى قائمة اللاعبين والفريق المناسب
        battle.players.push(userId);
        // توزيع اللاعبين بالتناوب على الفرق
        if (battle.teams.teamA.length <= battle.teams.teamB.length) {
            battle.teams.teamA.push(userId);
        } else {
            battle.teams.teamB.push(userId);
        }

        // 3. التحقق إذا اكتمل عدد اللاعبين لبدء التحدي
        if (battle.players.length === battle.maxPlayers) {
            battle.status = 'in-progress'; // تغيير الحالة إلى "قيد التنفيذ"
            // (لاحقاً: سنقوم ببث حدث بدء التحدي هنا)
        }

        await battle.save({ session });
        await session.commitTransaction();

        // (لاحقاً: سنقوم ببث تحديث حالة التحدي عبر Socket.IO)
        // req.app.get('io').emit('battleUpdate', battle);
        const updatedBattle = await Battle.findById(battle._id).populate('players', 'username profileImage');
        req.io.emit('battleUpdate', updatedBattle);
        
        req.io.to(user.socketId).emit('balanceUpdate', { newBalance: user.balance });
        

        res.status(200).json({
            status: 'success',
            message: 'تم الانضمام إلى التحدي بنجاح!',
            data: { battle },
        });

    } catch (error) {
        await session.abortTransaction();
        next(error);
    } finally {
        session.endSession();
    }
};
