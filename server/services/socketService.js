// استبدل كل محتوى الملف بهذا الكود
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Battle = require('../models/Battle'); // ✅ استيراد نموذج التحدي

// --- Middleware للتحقق من التوكن (لا تغيير هنا) ---
const verifySocketToken = async (socket, next) => {
    // ... (الكود الحالي بدون أي تغيير)
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


const initializeSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.use(verifySocketToken);
    
    io.on('connection', async (socket) => {
        console.log(`🟢 User connected: ${socket.id} | UserID: ${socket.user.username}`);
        
        try {
            await User.findByIdAndUpdate(socket.user.id, { socketId: socket.id });
        } catch (error) {
            console.error("Failed to update socketId:", error);
        }

        // الانضمام إلى الغرفة العامة
        socket.join('public-room');

        // --- معالجة إرسال الرسائل (لا تغيير هنا) ---
        socket.on('sendMessage', async (messageData) => {
            // ... (الكود الحالي بدون أي تغيير)
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

        // --- ✅✅ بداية منطق اللعبة الجديد ✅✅ ---

        // عند اكتمال التحدي، يبدأ العد التنازلي
        socket.on('startBattleCountdown', async (battleId) => {
            const battle = await Battle.findById(battleId).populate('players');
            if (!battle || battle.status !== 'in-progress') return;

            // الانضمام إلى غرفة خاصة بالتحدي
            battle.players.forEach(player => {
                if (player.socketId) {
                    io.sockets.sockets.get(player.socketId)?.join(battleId);
                }
            });

            // بدء العد التنازلي
            let countdown = 3;
            const countdownInterval = setInterval(() => {
                io.to(battleId).emit('battleCountdown', { countdown });
                countdown--;
                if (countdown < 0) {
                    clearInterval(countdownInterval);
                    // بدء اللعبة الفعلية
                    startGame(battleId);
                }
            }, 1000);
        });

        // عند نقر اللاعب على الزر
        socket.on('playerClick', async ({ battleId }) => {
            const battle = await Battle.findById(battleId);
            // التأكد من أن اللعبة لا تزال جارية
            if (!battle || battle.status !== 'in-progress' || (battle.gameState.get('timer') || 0) <= 0) return;

            const playerField = `scores.${socket.user.id}`;
            battle.gameState.set(playerField, (battle.gameState.get(playerField) || 0) + 1);
            await battle.save();

            // إرسال الحالة المحدثة للاعبين في الغرفة
            io.to(battleId).emit('gameStateUpdate', battle.gameState);
        });

        // --- 🔚 نهاية منطق اللعبة الجديد 🔚 ---

        socket.on('disconnect', () => {
            console.log(`🔴 User disconnected: ${socket.id} | UserID: ${socket.user.username}`);
        });
    });

    // --- ✅✅ دوال مساعدة لمنطق اللعبة ✅✅ ---

    async function startGame(battleId) {
        const battle = await Battle.findById(battleId);
        if (!battle) return;

        // تهيئة حالة اللعبة
        const initialScores = {};
        battle.players.forEach(playerId => {
            initialScores[playerId.toString()] = 0;
        });
        
        battle.gameState.set('scores', initialScores);
        battle.gameState.set('timer', 10); // مدة اللعبة 10 ثوانٍ
        await battle.save();

        io.to(battleId).emit('gameStarted', { gameState: battle.gameState });

        // بدء مؤقت اللعبة
        const gameTimerInterval = setInterval(async () => {
            const currentBattle = await Battle.findById(battleId);
            const newTime = (currentBattle.gameState.get('timer') || 0) - 1;
            
            if (newTime >= 0) {
                currentBattle.gameState.set('timer', newTime);
                await currentBattle.save();
                io.to(battleId).emit('gameStateUpdate', currentBattle.gameState);
            } else {
                clearInterval(gameTimerInterval);
                // إنهاء اللعبة
                await endBattle(battleId);
            }
        }, 1000);
    }

    async function endBattle(battleId) {
        const battle = await Battle.findById(battleId).populate('players');
        if (!battle || battle.status !== 'in-progress') return;

        const scores = battle.gameState.get('scores');
        const players = Object.keys(scores);
        
        // تحديد الفائز
        let winnerId = null;
        if (scores[players[0]] > scores[players[1]]) {
            winnerId = players[0];
        } else if (scores[players[1]] > scores[players[0]]) {
            winnerId = players[1];
        } // في حالة التعادل، لا يوجد فائز

        const totalPot = battle.betAmount * battle.players.length;

        if (winnerId) {
            // يوجد فائز
            battle.winner = battle.teams.teamA.includes(winnerId) ? 'teamA' : 'teamB';
            const winnerUser = await User.findById(winnerId);
            winnerUser.balance += totalPot;
            await winnerUser.save();
            
            // إرسال تحديث الرصيد للفائز
            if (winnerUser.socketId) {
                io.to(winnerUser.socketId).emit('balanceUpdate', { newBalance: winnerUser.balance });
            }
        } else {
            // تعادل
            battle.winner = 'draw';
            for (const player of battle.players) {
                player.balance += battle.betAmount; // إعادة الرهان
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
    }

    return io;
};

module.exports = initializeSocket;
