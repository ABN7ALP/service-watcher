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
        console.log(`[SERVER LOG] 1. Attempting to start game for battle: ${battleId}`);
        const battle = await Battle.findById(battleId);
        if (!battle || battle.status !== 'in-progress') {
            console.error(`[SERVER ERROR] 1.1. Battle not found or not in progress.`);
            return;
        }

        const initialScores = {};
        battle.players.forEach(playerId => {
            initialScores[playerId.toString()] = 0;
        });
        
        battle.gameState.scores = initialScores;
        battle.gameState.timer = 10;
        
        battle.markModified('gameState'); 
        await battle.save();
        console.log(`[SERVER LOG] 2. Game state initialized and saved. Timer: 10, Scores:`, initialScores);

        const updatedBattle = await Battle.findById(battleId);
        console.log(`[SERVER LOG] 3. Sending 'gameStarted' with gameState:`, JSON.stringify(updatedBattle.gameState, null, 2));
        io.to(battleId).emit('gameStarted', { gameState: updatedBattle.gameState });

        const gameTimerInterval = setInterval(async () => {
            const currentBattle = await Battle.findById(battleId);
            if (!currentBattle || currentBattle.status !== 'in-progress') {
                clearInterval(gameTimerInterval);
                return;
            }
            
            currentBattle.gameState.timer -= 1;
            
            if (currentBattle.gameState.timer >= 0) {
                currentBattle.markModified('gameState');
                await currentBattle.save();
                io.to(battleId).emit('gameStateUpdate', currentBattle.gameState);
            } else {
                clearInterval(gameTimerInterval);
                await endBattle(io, battleId);
            }
        }, 1000);
    } catch (error) {
        console.error(`[SERVER ERROR] Error in startGame:`, error);
    }
}

async function endBattle(io, battleId) {
    try {
        const battle = await Battle.findById(battleId).populate('players');
        if (!battle || battle.status !== 'in-progress') return;

        const scores = battle.gameState.scores;
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
            const winnerUser = await User.findById(winnerId);
            if (winnerUser) {
                winnerUser.balance += totalPot;
                await winnerUser.save();
                if (winnerUser.socketId) {
                    io.to(winnerUser.socketId).emit('balanceUpdate', { newBalance: winnerUser.balance });
                }
            }
        } else {
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
            // ... (منطق الرسائل يبقى كما هو)
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
                io.to(battleId).emit('gameStateUpdate', updatedBattle.gameState);
        
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
