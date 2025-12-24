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
exports.joinBattle = async (req, res, next) => {
    try {
        const battleId = req.params.id;
        const userId = req.user.id;

        const battle = await Battle.findById(battleId);
        const user = await User.findById(userId);

        // ... (كل عمليات التحقق تبقى كما هي)
        if (!battle || battle.status !== 'waiting' || battle.players.length >= battle.maxPlayers || user.balance < battle.betAmount) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكن الانضمام لهذا التحدي.' });
        }

        user.balance -= battle.betAmount;
        await user.save();

        battle.players.push(userId);

        const io = req.app.get('socketio');

        if (battle.players.length === battle.maxPlayers) {
            // عند بدء اللعبة (عند اكتمال اللاعبين):
battle.status = 'in-progress';

// ⚠️ التصحيح: تهيئة gameState بشكل صحيح
const initialScores = {};
battle.players.forEach(playerId => {
    initialScores[playerId.toString()] = 0;
});

battle.gameState = new Map([
    ['scores', initialScores],
    ['timer', 10],
    ['gameType', 'fastest-clicker']
]);

await battle.save();
console.log(`🎮 Battle ${battle._id} started with gameState:`, battle.gameState.toObject());
            
            // --- ✅✅ التغيير الرئيسي هنا ✅✅ ---
            // بدلاً من إرسال حدث، سنستدعي الدالة مباشرة
            // تأكد من أن io متاح هنا
            if (io.startBattleCountdown) {
                io.startBattleCountdown(battle._id.toString());
            } else {
                console.error("❌ io.startBattleCountdown is not a function. Make sure it's attached to the io instance.");
            }
            // --- نهاية التغيير ---
        }
        
        // ملاحظة: لا تقم بالحفظ مرة أخرى هنا، فقد تم الحفظ بالفعل في الأعلى
        // await battle.save(); 
        
        const updatedBattle = await Battle.findById(battle.id).populate('players', 'username profileImage');

        io.emit('battleUpdate', updatedBattle);

        if (user.socketId) {
            io.to(user.socketId).emit('balanceUpdate', { newBalance: user.balance });
        }

        res.status(200).json({ status: 'success', data: { battle: updatedBattle } });

    } catch (error) {
        console.error("Error in joinBattle:", error); // ✅ إضافة تسجيل خطأ أفضل
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم.' });
    }
};
