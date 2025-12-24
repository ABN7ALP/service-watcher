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

// استبدل دالة joinBattle بالكامل بهذا الكود
// --- استبدل دالة joinBattle بالكامل ---
exports.joinBattle = async (req, res, next) => {
    try {
        const battleId = req.params.id;
        const userId = req.user.id;
        const { password } = req.body; // ✅ الحصول على كلمة المرور من الطلب

        const battle = await Battle.findById(battleId);
        const user = await User.findById(userId);

        if (!battle) {
            return res.status(404).json({ status: 'fail', message: 'لم يتم العثور على هذا التحدي.' });
        }

        // --- ✅ بداية منطق التحقق من كلمة المرور ---
        if (battle.isPrivate) {
            if (!password || password !== battle.password) {
                return res.status(401).json({ status: 'fail', message: 'كلمة المرور غير صحيحة.' });
            }
        }
        // --- 🔚 نهاية منطق التحقق ---

        if (battle.status !== 'waiting') {
            return res.status(400).json({ status: 'fail', message: 'هذا التحدي لم يعد متاحاً للانضمام.' });
        }
        if (battle.players.includes(userId)) {
            return res.status(400).json({ status: 'fail', message: 'أنت منضم بالفعل.' });
        }
        if (battle.players.length >= battle.maxPlayers) {
            return res.status(400).json({ status: 'fail', message: 'هذا التحدي مكتمل العدد.' });
        }
        if (user.balance < battle.betAmount) {
            return res.status(400).json({ status: 'fail', message: 'رصيدك غير كافٍ.' });
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
            
            await battle.save();
            
            if (io.startBattleCountdown) {
                io.startBattleCountdown(battle._id.toString());
            }
        } else {
            await battle.save();
        }
        
        const updatedBattle = await Battle.findById(battle.id).populate('players', 'username profileImage');
        io.emit('battleUpdate', updatedBattle);

        if (user.socketId) {
            io.to(user.socketId).emit('balanceUpdate', { newBalance: user.balance });
        }

        res.status(200).json({ status: 'success', data: { battle: updatedBattle } });

    } catch (error) {
        console.error("Error in joinBattle:", error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم.' });
    }
};
