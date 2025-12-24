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
async function startGame(io, battleId) {
    try {
        let battle = await Battle.findById(battleId);
        if (!battle || battle.status !== 'in-progress') return;

        // ⚠️ التصحيح: يجب أن ننشئ Map جديد لـ gameState
        const initialScores = {};
        battle.players.forEach(playerId => {
            initialScores[playerId.toString()] = 0;
        });
        
        // ⚠️ التصحيح المهم: إعادة تعيين gameState كاملة
        battle.gameState = new Map([
            ['scores', initialScores],
            ['timer', 10],
            ['gameType', 'fastest-clicker']
        ]);
        
        await battle.save();

        console.log(`🎮 Game started for battle ${battleId}`);
        console.log('📊 Initial gameState:', battle.gameState.toObject());

        // إرسال حدث بدء اللعبة
        io.to(battleId).emit('gameStarted', { 
            gameState: battle.gameState.toObject() 
        });

        // المؤقت
        const gameTimerInterval = setInterval(async () => {
            const currentBattle = await Battle.findById(battleId);
            if (!currentBattle) {
                clearInterval(gameTimerInterval);
                return;
            }
            
            const newTime = (currentBattle.gameState.get('timer') || 0) - 1;
            
            if (newTime >= 0) {
                currentBattle.gameState.set('timer', newTime);
                await currentBattle.save();
                
                // ⚠️ التصحيح: إرسال gameState بأحدث البيانات
                io.to(battleId).emit('gameStateUpdate', currentBattle.gameState.toObject());
            } else {
                clearInterval(gameTimerInterval);
                await endBattle(io, battleId);
            }
        }, 1000);
    } catch (error) {
        console.error(`Error in startGame for battle ${battleId}:`, error);
    }
}

async function endBattle(io, battleId) {
    try {
        const battle = await Battle.findById(battleId).populate('players');
        if (!battle || battle.status !== 'in-progress') return;

        const scores = battle.gameState.get('scores');
        const playerIds = Object.keys(scores);
        
        let winnerId = null;
        if (playerIds.length === 2) {
            if (scores[playerIds[0]] > scores[playerIds[1]]) {
                winnerId = playerIds[0];
            } else if (scores[playerIds[1]] > scores[playerIds[0]]) {
                winnerId = playerIds[1];
            }
        }

        const totalPot = battle.betAmount * battle.players.length;

        if (winnerId) {
            battle.winner = battle.teams.teamA.includes(winnerId) ? 'teamA' : 'teamB';
            const winnerUser = await User.findById(winnerId);
            if (winnerUser) {
                winnerUser.balance += totalPot;
                await winnerUser.save();
                if (winnerUser.socketId) {
                    io.to(winnerUser.socketId).emit('balanceUpdate', { newBalance: winnerUser.balance });
                }
            }
        } else {
            battle.winner = 'draw';
            for (const player of battle.players) {
                player.balance += battle.betAmount;
                await player.save();
                if (player.socketId) {
                    io.to(player.socketId).emit('balanceUpdate', { newBalance: player.balance });
                }
            }
        }

        battle.status = 'completed';
        await battle.save();

        io.to(battleId).emit('gameEnded', { battle: battle.toObject(), winnerId });
        console.log(`✅ Game ended for battle ${battleId}. Winner: ${winnerId || 'Draw'}`);
    } catch (error) {
        console.error(`Error in endBattle for battle ${battleId}:`, error);
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

        socket.on('sendMessage', async (messageData) => {
            try {
                if (!messageData.message || messageData.message.trim() === '' || !socket.user) return;
                const newMessage = await Message.create({ content: messageData.message, sender: socket.user.id });
                const finalMessage = {
                    id: newMessage._id,
                    message: newMessage.content,
                    sender: { id: socket.user.id, username: socket.user.username, profileImage: socket.user.profileImage },
                    timestamp: newMessage.createdAt
                };
                io.to('public-room').emit('newMessage', finalMessage);
            } catch (error) {
                console.error('Error handling sendMessage:', error);
            }
        });

        // ==========================================================
        // ===== ✅✅ هذا هو الكود المصحح الذي يجب أن يعمل ✅✅ =====
        // ==========================================================
socket.on('playerClick', async ({ battleId }) => {
    try {
        console.log(`🖱️ Click event from ${socket.user.id} for battle ${battleId}`);
        
        let battle = await Battle.findById(battleId);
        if (!battle) {
            console.log('❌ Battle not found');
            return;
        }
        
        if (battle.status !== 'in-progress') {
            console.log('❌ Battle not in progress');
            return;
        }
        
        const timer = battle.gameState.get('timer') || 0;
        if (timer <= 0) {
            console.log('❌ Game timer finished');
            return;
        }

        // ⚠️ التصحيح: التعامل مع gameState كـ Map
        const scores = battle.gameState.get('scores') || {};
        const userId = socket.user.id.toString();
        
        // تحديث النقاط
        const updatedScores = { ...scores };
        updatedScores[userId] = (updatedScores[userId] || 0) + 1;
        
        // ⚠️ التصحيح: تعيين القيمة الجديدة في Map
        battle.gameState.set('scores', updatedScores);
        
        await battle.save();
        
        console.log('📊 Updated scores:', updatedScores);
        console.log('📊 Full gameState:', battle.gameState.toObject());

        // إرسال التحديث للجميع
        io.to(battleId).emit('gameStateUpdate', battle.gameState.toObject());

    } catch (error) {
        console.error('❌ Error in playerClick:', error);
    }
});
        // ==========================================================
        // ==========================================================

        socket.on('disconnect', () => {
            console.log(`🔴 User disconnected: ${socket.id} | UserID: ${socket.user.username}`);
        });
    });

    return io;
};

module.exports = initializeSocket;
