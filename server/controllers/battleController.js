// استبدل كل محتوى الملف بهذا الكود
const Battle = require('../models/Battle');
const User = require('../models/User');

exports.getAvailableBattles = async (req, res, next) => {
    try {
        const battles = await Battle.find({ status: 'waiting' })
            .populate('players', 'username profileImage')
            .sort('-createdAt');
        res.status(200).json({
            status: 'success',
            results: battles.length,
            data: { battles }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
};

exports.createBattle = async (req, res, next) => {
    try {
        const { type, betAmount, isPrivate, password } = req.body;
        const creatorId = req.user.id;

        const creator = await User.findById(creatorId);
        if (creator.balance < betAmount) {
            return res.status(400).json({ status: 'fail', message: 'رصيدك غير كافٍ لإنشاء هذا التحدي.' });
        }

        const newBattle = await Battle.create({
            type,
            betAmount,
            isPrivate,
            password,
            players: [creatorId], // المنشئ ينضم تلقائيًا
        });
        
        // خصم الرصيد من المنشئ
        creator.balance -= betAmount;
        await creator.save();

        const populatedBattle = await Battle.findById(newBattle._id).populate('players', 'username profileImage');

        const io = req.app.get('socketio');
        io.emit('newBattle', populatedBattle); // إشعار بوجود تحدي جديد
        
        // تحديث رصيد المنشئ
        if (creator.socketId) {
            io.to(creator.socketId).emit('balanceUpdate', { newBalance: creator.balance });
        }

        res.status(201).json({
            status: 'success',
            data: { battle: populatedBattle }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.joinBattle = async (req, res, next) => {
    try {
        const battleId = req.params.id;
        const userId = req.user.id;

        const battle = await Battle.findById(battleId);
        const user = await User.findById(userId);

        if (!battle || battle.status !== 'waiting' || battle.players.length >= battle.maxPlayers || user.balance < battle.betAmount) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكن الانضمام لهذا التحدي.' });
        }

        user.balance -= battle.betAmount;
        await user.save();

        battle.players.push(userId);

        const io = req.app.get('socketio');

        if (battle.players.length === battle.maxPlayers) {
            battle.status = 'in-progress';
            const shuffledPlayers = [...battle.players].sort(() => 0.5 - Math.random());
            const midIndex = Math.ceil(shuffledPlayers.length / 2);
            battle.teams.teamA = shuffledPlayers.slice(0, midIndex);
            battle.teams.teamB = shuffledPlayers.slice(midIndex);
            
            await battle.save(); // حفظ الحالة قبل إرسالها
            
            // ✅ إطلاق حدث بدء العد التنازلي للعبة
            io.emit('startBattleCountdown', battle._id.toString());
        }
        
        await battle.save();
        
        const updatedBattle = await Battle.findById(battle.id).populate('players', 'username profileImage');

        io.emit('battleUpdate', updatedBattle);

        if (user.socketId) {
            io.to(user.socketId).emit('balanceUpdate', { newBalance: user.balance });
        }

        res.status(200).json({ status: 'success', data: { battle: updatedBattle } });

    } catch (error) {
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم.' });
    }
};
