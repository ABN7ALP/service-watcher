const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Battle = require('../models/Battle');

// --- Middleware للتحقق من توكن المستخدم ---
const verifySocketToken = async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error'));
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const currentUser = await User.findById(decoded.id);
        if (!currentUser) {
            return next(new Error('Authentication error'));
        }
        socket.user = currentUser;
        next();
    } catch (err) {
        return next(new Error('Authentication error'));
    }
};

// --- الدوال المساعدة لمنطق اللعبة ---
// --- استبدل دالة startGame بالكامل ---
async function startGame(io, battleId) {
    try {
        console.log(`[SERVER LOG] 1. Attempting to start game for battle: ${battleId}`);
        const battle = await Battle.findById(battleId);
        if (!battle || battle.status !== 'in-progress') return;

        const initialScores = {};
        battle.players.forEach(playerId => {
            initialScores[playerId.toString()] = 0;
        });
        
        battle.gameState.scores = initialScores;
        battle.gameState.timer = 10; // فقط نحدد المدة
        
        battle.markModified('gameState'); 
        await battle.save();
        console.log(`[SERVER LOG] 2. Game state initialized and saved.`);

        const updatedBattle = await Battle.findById(battleId);
        console.log(`[SERVER LOG] 3. Sending 'gameStarted' with gameState:`, JSON.stringify(updatedBattle.gameState, null, 2));
        io.to(battleId).emit('gameStarted', { gameState: updatedBattle.toObject().gameState });


        // --- ✅✅ الإصلاح الرئيسي: الخادم يحدد متى تنتهي اللعبة فقط ✅✅ ---
        // لن نقوم بتحديث قاعدة البيانات كل ثانية بعد الآن
        setTimeout(() => {
            console.log(`[SERVER LOG] 7. Game time is up. Ending battle ${battleId}`);
            endBattle(io, battleId);
        }, 10000); // 10 ثوانٍ

    } catch (error) {
        console.error(`[SERVER ERROR] Error in startGame:`, error);
    }
}


// --- استبدل دالة endBattle بالكامل في socketService.js ---
// --- استبدل دالة endBattle بالكامل في socketService.js ---
async function endBattle(io, battleId) {
    try {
        const battle = await Battle.findById(battleId).populate('players');
        if (!battle || battle.status !== 'in-progress') return;

        console.log(`[END BATTLE] Ending battle ${battleId}`);

        const scores = battle.gameState.scores;
        const playerIds = Object.keys(scores);
        
        let winnerId = null;
        let loserId = null;

        if (playerIds.length === 2) {
            if (scores[playerIds[0]] > scores[playerIds[1]]) {
                winnerId = playerIds[0];
                loserId = playerIds[1];
            } else if (scores[playerIds[1]] > scores[playerIds[0]]) {
                winnerId = playerIds[1];
                loserId = playerIds[0];
            }
        }

        const totalPot = battle.betAmount * battle.players.length;
        const commissionRate = battle.type === '1v1' ? 0.10 : 0.05;
        const commission = totalPot * commissionRate;
        const finalPot = totalPot - commission;

        if (winnerId) {
            console.log(`[END BATTLE] Winner is ${winnerId}, Loser is ${loserId}`);
            const winnerUser = await User.findById(winnerId);
            if (winnerUser) {
                winnerUser.balance += finalPot;
                await winnerUser.save();
                // --- ✅ الإصلاح: إرسال تحديث الرصيد بشكل فوري ---
                if (winnerUser.socketId) {
                    io.to(winnerUser.socketId).emit('balanceUpdate', { newBalance: winnerUser.balance });
                    console.log(`[END BATTLE] Sent balance update to winner ${winnerUser.username}`);
                }
                // --- ✅ منح 10 XP للفائز ---
                await addExperience(io, winnerId, 0, 'win'); 
            }
            
            if (loserId) {
                // --- ✅ منح XP للخاسر بناءً على قيمة الرهان ---
                await addExperience(io, loserId, battle.betAmount, 'loss');
            }

        } else { // في حالة التعادل
            console.log(`[END BATTLE] Battle is a draw.`);
            for (const player of battle.players) {
                player.balance += battle.betAmount;
                await player.save();
                // --- ✅ الإصلاح: إرسال تحديث الرصيد في حالة التعادل أيضًا ---
                if (player.socketId) {
                    io.to(player.socketId).emit('balanceUpdate', { newBalance: player.balance });
                    console.log(`[END BATTLE] Sent balance update to ${player.username} (draw)`);
                }
                // منح نقاط رمزية للتعادل
                await addExperience(io, player._id, 0, 'win'); 
            }
        }

        battle.status = 'completed';
        await battle.save();

        // --- ✅ الإصلاح: إرسال حدث انتهاء اللعبة إلى الغرفة بأكملها ---
        // هذا هو ما يجعل النافذة تختفي عند الجميع
        io.to(battleId).emit('gameEnded', { battle: battle.toObject(), winnerId });
        console.log(`[END BATTLE] Sent 'gameEnded' event to room ${battleId}`);

    } catch (error) {
        console.error(`[SERVER ERROR] in endBattle for battle ${battleId}:`, error);
    }
}


// --- دالة التهيئة الرئيسية ---
const initializeSocket = (server) => {
    const io = new Server(server, {
        cors: { origin: "*", methods: ["GET", "POST"] }
    });

    io.startBattleCountdown = async (battleId) => {
        try {
            const battle = await Battle.findById(battleId).populate('players');
            if (!battle || battle.status !== 'in-progress') return;

            battle.players.forEach(player => {
                if (player.socketId && io.sockets.sockets.get(player.socketId)) {
                    io.sockets.sockets.get(player.socketId).join(battleId);
                }
            });

            let countdown = 3;
            const countdownInterval = setInterval(() => {
                io.to(battleId).emit('battleCountdown', { countdown, battleId });
                countdown--;
                if (countdown < 0) {
                    clearInterval(countdownInterval);
                    startGame(io, battleId);
                }
            }, 1000);
        } catch (error) {
            console.error("Error in startBattleCountdown:", error);
        }
    };

    io.use(verifySocketToken);
    
    io.on('connection', async (socket) => {
        console.log(`🟢 User connected: ${socket.id} | UserID: ${socket.user.username}`);
        
        try {
            await User.findByIdAndUpdate(socket.user.id, { socketId: socket.id });
        } catch (error) {
            console.error("Failed to update socketId:", error);
        }

        socket.join('public-room');

        // --- استبدل مستمع 'sendMessage' بهذا الكود التشخيصي ---
// --- استبدل مستمع 'sendMessage' بهذا ---
socket.on('sendMessage', async (messageData) => {
    try {
        if (!messageData || !messageData.message || messageData.message.trim() === '') return;
        if (messageData.message.length > 300) return;

        // إنشاء كائن الرسالة الجديدة
        const newMessageData = {
            content: messageData.message,
            sender: socket.user.id,
        };
        // إضافة الرد إذا كان موجودًا
        if (messageData.replyTo) {
            newMessageData.replyTo = messageData.replyTo;
        }

        const newMessage = await Message.create(newMessageData);

        // جلب الرسالة مع كل البيانات اللازمة (المرسل والرسالة المردود عليها)
        const populatedMessage = await Message.findById(newMessage._id)
            .populate('sender', 'username profileImage')
            .populate({
                path: 'replyTo',
                populate: {
                    path: 'sender',
                    select: 'username'
                }
            });
            
        if (!populatedMessage) return;

        io.to('public-room').emit('newMessage', populatedMessage.toObject());

        /* ===== تنظيف الرسائل القديمة ===== */
        try {
            const fiftiethMessage = await Message
                .findOne()
                .sort({ createdAt: -1 })
                .skip(50);

            if (fiftiethMessage) {
                const messagesToDelete = await Message.find({
                    createdAt: { $lte: fiftiethMessage.createdAt }
                }).select('_id');

                const idsToDelete = messagesToDelete.map(m => m._id.toString());

                if (idsToDelete.length > 0) {
                    const result = await Message.deleteMany({
                        _id: { $in: idsToDelete }
                    });

                    console.log(`[CHAT CLEANUP] Deleted ${result.deletedCount} messages`);
                    io.to('public-room').emit('chatCleanup', { idsToDelete });
                }
            }
        } catch (cleanupError) {
            console.error('[CHAT CLEANUP ERROR]', cleanupError);
        }

    } catch (error) {
        console.error('[CHAT SERVER ERROR] sendMessage:', error);
    }
});
        socket.on('playerClick', async ({ battleId }) => {
            try {
                console.log(`[SERVER LOG] 4. Received 'playerClick' from user ${socket.user.username} for battle ${battleId}`);
                const battle = await Battle.findById(battleId);
                if (!battle || battle.status !== 'in-progress' || battle.gameState.timer <= 0) {
                    console.error(`[SERVER ERROR] 4.1. Click rejected. Battle not found, not in progress, or timer is zero.`);
                    return;
                }
        
                const userId = socket.user.id.toString();
                if (!battle.gameState.scores) {
                    battle.gameState.scores = {};
                }
                
                battle.gameState.scores[userId] = (battle.gameState.scores[userId] || 0) + 1;
        
                battle.markModified('gameState');
                await battle.save();
                console.log(`[SERVER LOG] 5. Score updated for ${userId}. New score: ${battle.gameState.scores[userId]}`);
        
                const updatedBattle = await Battle.findById(battleId);
                console.log(`[SERVER LOG] 6. Sending 'gameStateUpdate' with gameState:`, JSON.stringify(updatedBattle.gameState, null, 2));
                io.to(battleId).emit('gameStateUpdate', updatedBattle.toObject().gameState);

        
            } catch (error) {
                console.error('[SERVER ERROR] Error in playerClick:', error);
            }
        });

        socket.on('disconnect', () => {
            console.log(`🔴 User disconnected: ${socket.id} | UserID: ${socket.user.username}`);
        });
    });

    return io;
};

module.exports = initializeSocket;
