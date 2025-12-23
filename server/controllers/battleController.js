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
    try {
        const battleId = req.params.id;
        const userId = req.user.id;

        // 1. البحث عن التحدي والمستخدم في نفس الوقت لزيادة الكفاءة
        const battle = await Battle.findById(battleId);
        const user = await User.findById(userId);

        // 2. التحقق من وجود التحدي والمستخدم
        if (!battle) {
            return res.status(404).json({ status: 'fail', message: 'لم يتم العثور على هذا التحدي.' });
        }
        if (!user) {
            return res.status(404).json({ status: 'fail', message: 'لم يتم العثور على المستخدم.' });
        }

        // 3. التحقق من حالة التحدي (يجب أن يكون في الانتظار)
        if (battle.status !== 'waiting') {
            return res.status(400).json({ status: 'fail', message: 'هذا التحدي لم يعد متاحاً للانضمام.' });
        }

        // 4. التحقق من أن اللاعب ليس منضماً بالفعل
        if (battle.players.includes(userId)) {
            return res.status(400).json({ status: 'fail', message: 'أنت منضم بالفعل إلى هذا التحدي.' });
        }

        // 5. التحقق من اكتمال عدد اللاعبين
        if (battle.players.length >= battle.maxPlayers) {
            return res.status(400).json({ status: 'fail', message: 'هذا التحدي مكتمل العدد.' });
        }

        // 6. التحقق من أن المستخدم يملك رصيداً كافياً للرهان
        if (user.balance < battle.betAmount) {
            return res.status(400).json({ status: 'fail', message: 'رصيدك غير كافٍ للانضمام لهذا التحدي.' });
        }

        // --- بداية التغييرات الهامة ---

        // 7. خصم مبلغ الرهان من رصيد اللاعب
        user.balance -= battle.betAmount;
        await user.save();

        // 8. إضافة اللاعب إلى قائمة اللاعبين في التحدي
        battle.players.push(userId);

        // 9. التحقق إذا اكتمل عدد اللاعبين بعد انضمام اللاعب الحالي
        if (battle.players.length === battle.maxPlayers) {
            battle.status = 'in-progress'; // تغيير حالة التحدي إلى "قيد التنفيذ"
            // (هنا يمكنك لاحقاً إضافة منطق توزيع الفرق عشوائياً)
        }

        // 10. حفظ التغييرات في التحدي
        await battle.save();
        
        // 11. جلب بيانات التحدي المحدثة مع تفاصيل اللاعبين
        const updatedBattle = await Battle.findById(battle.id).populate('players', 'username profileImage');

        // 12. بث التحديث إلى جميع العملاء عبر Socket.IO
        const io = req.app.get('socketio'); // الحصول على نسخة io
        io.emit('battleUpdate', updatedBattle);

        // 13. إرسال إشعار للاعب الذي انضم بتحديث رصيده
        const userSocketId = user.socketId;
        if (userSocketId) {
            io.to(userSocketId).emit('balanceUpdate', { newBalance: user.balance });
        }

        // --- نهاية التغييرات الهامة ---

        res.status(200).json({
            status: 'success',
            message: 'تم الانضمام للتحدي بنجاح.',
            data: {
                battle: updatedBattle
            }
        });

    } catch (error) {
        console.error('Error in joinBattle:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم.' });
    }
};
