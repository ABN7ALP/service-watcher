const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Battle = require('../models/Battle');

// --- Middleware للتحقق من توكن المستخدم (لا تغيير هنا) ---
const verifySocketToken = async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
        console.error('Socket Auth Error: No token provided.');
        return next(new Error('Authentication error'));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const currentUser = await User.findById(decoded.id);

        if (!currentUser) {
            console.error('Socket Auth Error: User not found.');
            return next(new Error('Authentication error'));
        }
        socket.user = currentUser;
        next();

    } catch (err) {
        console.error('Socket Auth Error: Invalid token.', err.message);
        return next(new Error('Authentication error'));
    }
};

// --- الدوال المساعدة لمنطق اللعبة (تم إخراجها لتكون مستقلة) ---

async function startGame(io, battleId) {
    try {
        const battle = await Battle.findById(battleId);
        if (!battle || battle.status !== 'in-progress') return;

        const initialScores = {};
        battle.players.forEach(playerId => {
            initialScores[playerId.toString()] = 0;
        });
        
        battle.gameState.set('scores', initialScores);
        battle.gameState.set('timer', 10);
        await battle.save();

        io.to(battleId).emit('gameStarted', { gameState: battle.gameState });

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
                io.to(battleId).emit('gameStateUpdate', currentBattle.gameState);
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
        if (playerIds.length === 2) { // منطق الفوز حاليًا لـ 1v1 فقط
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

        io.to(battleId).emit('gameEnded', { battle, winnerId });
        console.log(`✅ Game ended for battle ${battleId}. Winner: ${winnerId || 'Draw'}`);
    } catch (error) {
        console.error(`Error in endBattle for battle ${battleId}:`, error);
    }
}


// --- دالة التهيئة الرئيسية ---
const initializeSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    // دالة لبدء العد التنازلي للعبة (مرفقة بكائن io)
    io.startBattleCountdown = async (battleId) => {
        try {
            const battle = await Battle.findById(battleId).populate('players');
            if (!battle || battle.status !== 'in-progress') return;

            battle.players.forEach(player => {
                if (player.socketId && io.sockets.sockets.get(player.socketId)) {
                    io.sockets.sockets.get(player.socketId).join(battleId);
                    console.log(`🟢 Player ${player.username} joined battle room ${battleId}`);
                }
            });

            let countdown = 3;
            const countdownInterval = setInterval(() => {
                console.log(`⏳ Countdown for battle ${battleId}: ${countdown}`);
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

    // تطبيق middleware المصادقة على كل الاتصالات الجديدة
    io.use(verifySocketToken);
    
    // معالج الاتصالات الجديدة
    io.on('connection', async (socket) => {
        console.log(`🟢 User connected: ${socket.id} | UserID: ${socket.user.username}`);
        
        try {
            await User.findByIdAndUpdate(socket.user.id, { socketId: socket.id });
        } catch (error) {
            console.error("Failed to update socketId:", error);
        }

        socket.join('public-room');

        // معالجة إرسال الرسائل
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

        // معالجة نقرات اللاعب
socket.on('playerClick', async ({ battleId }) => {
    try {
        const battle = await Battle.findById(battleId);
        if (!battle || battle.status !== 'in-progress' || (battle.gameState.get('timer') || 0) <= 0) return;

        const playerField = `scores.${socket.user.id}`;
        const currentScore = battle.gameState.get(playerField) || 0;
        battle.gameState.set(playerField, currentScore + 1);
        
        await battle.save();

        io.to(battleId).emit('gameStateUpdate', battle.gameState);
    } catch (error) {
        console.error('Error in playerClick:', error);
    }
});


        // معالجة انقطاع الاتصال
        socket.on('disconnect', () => {
            console.log(`🔴 User disconnected: ${socket.id} | UserID: ${socket.user.username}`);
        });
    });

    return io;
};

module.exports = initializeSocket;
