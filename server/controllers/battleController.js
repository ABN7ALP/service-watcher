// استبدل كل محتوى الملف بهذا الكود
const Battle = require('../models/Battle');
const User = require('../models/User');
//const { addExperience } = require('../utils/experienceManager'); // ✅ 1. استيراد الدالة

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

         // 🛡️ تحقق صارم من المبلغ قبل أي شيء (يمنع القيم السالبة أو غير الرقمية من العميل)
        const { parseMoneyInput } = require('../utils/money');
        const numBet = parseMoneyInput(betAmount, { min: 1, max: 1000 });
        if (numBet === null) {
            return res.status(400).json({ status: 'fail', message: 'مبلغ غير صالح.' });
        }

        // ✅ خصم ذرّي أولاً: الشرط والخصم عملية واحدة داخل قاعدة البيانات
        const creator = await User.findOneAndUpdate(
            { _id: creatorId, balance: { $gte: numBet } },
            { $inc: { balance: -numBet } },
            { new: true }
        );

        if (!creator) {
            return res.status(400).json({ status: 'fail', message: 'رصيدك غير كافٍ لإنشاء هذا التحدي.' });
        }

        // ✅ ننشئ التحدي بعد الخصم — وإن فشل الإنشاء نُعيد المبلغ فوراً
        let newBattle;
        try {
            newBattle = await Battle.create({
                type,
                betAmount: numBet,
                isPrivate,
                password,
                players: [creatorId], // المنشئ ينضم تلقائيًا
            });
        } catch (createErr) {
            await User.findByIdAndUpdate(creatorId, { $inc: { balance: numBet } });
            console.error('[ERROR] createBattle failed, refunded creator:', createErr);
            return res.status(500).json({ status: 'fail', message: 'تعذّر إنشاء التحدي، وأُعيد المبلغ إلى رصيدك.' });
        }

        const populatedBattle = await Battle.findById(newBattle._id).populate('players', 'username profileImage');

        const io = req.app.get('socketio');
        io.emit('newBattle', populatedBattle); // إشعار بوجود تحدي جديد
        //await addExperience(io, creatorId, betAmount);
        
        
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
        let user = await User.findById(userId);

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
               // ✅ حجز المقعد ذرّياً أولاً: نضيف اللاعب فقط إذا كان التحدي ما زال في الانتظار،
        // ولم يكن منضماً مسبقاً، ولم يكتمل العدد ($size يضمن العدد لحظة الكتابة نفسها).
        // هذا يمنع تجاوز الحد الأقصى عند تزامن طلبين على آخر مقعد.
        const seatTaken = await Battle.findOneAndUpdate(
            {
                _id: battleId,
                status: 'waiting',
                players: { $ne: userId, $not: { $size: battle.maxPlayers } }
            },
            { $push: { players: userId } },
            { new: true }
        );

        if (!seatTaken) {
            return res.status(400).json({ status: 'fail', message: 'تعذّر الانضمام: التحدي مكتمل أو لم يعد متاحاً.' });
        }

        // ✅ خصم الرصيد ذرّياً — وإن لم يكفِ الرصيد نتراجع عن حجز المقعد فوراً
        user = await User.findOneAndUpdate(
            { _id: userId, balance: { $gte: battle.betAmount } },
            { $inc: { balance: -battle.betAmount } },
            { new: true }
        );

        if (!user) {
            await Battle.findByIdAndUpdate(battleId, { $pull: { players: userId } });
            return res.status(400).json({ status: 'fail', message: 'رصيدك غير كافٍ.' });
        }

        // نعمل على النسخة المحدّثة التي تحوي اللاعب الجديد فعلياً
        battle.players = seatTaken.players;

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
