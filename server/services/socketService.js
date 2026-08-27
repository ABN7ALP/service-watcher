const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Battle = require('../models/Battle');
const { addExperience } = require('../utils/experienceManager'); // ✅✅✅ أضف هذا السطر هنا

// =================================================
// ✅ نظام CACHE محسّن مع TTL أقصر وتنظيف تلقائي
// =================================================

const blockCache = new Map();
const CACHE_TTL = 30 * 1000; // ⬅️ 30 ثانية فقط (بدل 5 دقائق)

/**
 * ✅ التحقق من الحظر مع تنقية البيانات أولاً
 */
async function checkIfBlocked(senderId, receiverId) {
    // 1. نفس المستخدم
    if (senderId === receiverId) return false;
    
    const cacheKey = `${senderId}-${receiverId}`;
    const reverseKey = `${receiverId}-${senderId}`;
    
    // 2. التحقق من Cache أولاً
    if (blockCache.has(cacheKey)) {
        const cached = blockCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.isBlocked;
        }
        blockCache.delete(cacheKey);
    }
    
    // 3. جلب من قاعدة البيانات
    try {
        const [sender, receiver] = await Promise.all([
            User.findById(senderId).select('blockedUsers blockedBy').lean(),
            User.findById(receiverId).select('blockedUsers blockedBy').lean()
        ]);
        
        if (!sender || !receiver) return false;
        
        // 4. التحقق من الحظر المتبادل
        const senderBlockedUsers = sender.blockedUsers?.map(id => id.toString()) || [];
        const receiverBlockedUsers = receiver.blockedUsers?.map(id => id.toString()) || [];
        
        const isBlocked = 
            senderBlockedUsers.includes(receiverId) || 
            receiverBlockedUsers.includes(senderId);
        
        // 5. حفظ في Cache
        blockCache.set(cacheKey, { isBlocked, timestamp: Date.now() });
        blockCache.set(reverseKey, { isBlocked, timestamp: Date.now() });
        
        return isBlocked;
        
    } catch (error) {
        console.error('[BLOCK CHECK ERROR]:', error.message);
        return false;
    }
}

/**
 * ✅ تنظيف Cache شامل
 */
function clearBlockCache(userId1, userId2) {
    const keys = Array.from(blockCache.keys());
    let deletedCount = 0;
    
    keys.forEach(key => {
        const [id1, id2] = key.split('-');
        if (id1 === userId1 || id2 === userId1 || id1 === userId2 || id2 === userId2) {
            blockCache.delete(key);
            deletedCount++;
        }
    });
    
    console.log(`[BLOCK CACHE] Cleared ${deletedCount} entries for ${userId1}/${userId2}`);
}

// تنظيف كل 30 ثانية
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of blockCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            blockCache.delete(key);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`[AUTO CLEAN] Removed ${cleaned} expired cache entries`);
    }
}, 30 * 1000);


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


// 📨 مستمع لإرسال رسالة خاصة
socket.on('sendPrivateMessage', async (messageData) => {
    console.log(`[PRIVATE CHAT] Message from ${socket.user.id}:`, messageData?.content?.substring(0, 30) || 'non-text');
    
    try {
        // التحقق من الحظر أولاً
        const isBlocked = await checkIfBlocked(socket.user.id, messageData.receiverId);
        
        if (isBlocked) {
            socket.emit('privateMessageError', {
                error: 'لا يمكنك مراسلة مستخدم حظرك أو حظرته'
            });
            return;
        }

        // هنا سيتم التعامل مع الرسالة عبر API
        // سيتم إرسالها عبر HTTP API وليس مباشرة عبر Socket
        // للحفاظ على التسجيل في قاعدة البيانات
        
    } catch (error) {
        console.error('[PRIVATE CHAT ERROR]:', error);
        socket.emit('privateMessageError', {
            error: 'حدث خطأ أثناء إرسال الرسالة'
        });
    }
});

// 📩 مستمع لتسليم رسالة خاصة
socket.on('privateMessageDelivered', async ({ messageId }) => {
    try {
        // تحديث حالة الرسالة في قاعدة البيانات
        // سيتم التعامل معها عبر API
    } catch (error) {
        console.error('[DELIVERY ERROR]:', error);
    }
});

// 👁️ مستمع لقراءة رسالة خاصة
socket.on('privateMessageSeen', async ({ messageId }) => {
    try {
        // تحديث حالة الرسالة في قاعدة البيانات
        // سيتم التعامل معها عبر API
    } catch (error) {
        console.error('[SEEN ERROR]:', error);
    }
});
        
        // --- استبدل مستمع 'sendMessage' بهذا الكود التشخيصي ---
/// ✅ مستمع sendMessage (نظيف + شغال)
socket.on('sendMessage', async (messageData) => {
    console.log(
        `[MESSAGE] User ${socket.user.id} sending: "${messageData?.message?.substring(0, 30) || ''}"`
    );

    try {
        if (!messageData || !messageData.message) return;
        if (messageData.message.trim() === '') return;
        if (messageData.message.length > 300) return;

        // 1️⃣ إنشاء الرسالة
        const newMessageData = {
            content: messageData.message,
            sender: socket.user.id,
        };

        if (messageData.replyTo) {
            newMessageData.replyTo = messageData.replyTo;
        }

        const newMessage = await Message.create(newMessageData);

        // 2️⃣ جلب الرسالة مع populate
                const populatedMessage = await Message.findById(newMessage._id)
            .populate('sender', 'username profileImage activeBubbleSkinClass')
            .populate({
                path: 'replyTo',
                populate: {
                    path: 'sender',
                    select: 'username',
                },
            });

        if (!populatedMessage) return;

        // 3️⃣ جلب الغرفة
        const room = io.sockets.adapter.rooms.get('public-room');
        if (!room) return;

        const socketsInRoom = Array.from(room);
        const senderId = socket.user.id.toString();

        console.log(`[MESSAGE] ${senderId} -> ${socketsInRoom.length} users`);

        // 4️⃣ إرسال الرسالة مع التحقق من الحظر
        for (const socketId of socketsInRoom) {
            const receiverSocket = io.sockets.sockets.get(socketId);
            if (!receiverSocket || !receiverSocket.user) continue;

            const receiverId = receiverSocket.user.id.toString();
            const isBlocked = await checkIfBlocked(senderId, receiverId);

            if (!isBlocked) {
                receiverSocket.emit(
                    'newMessage',
                    populatedMessage.toObject()
                );
            }
        }

        // 5️⃣ تنظيف الرسائل القديمة
        const fiftiethMessage = await Message.findOne()
            .sort({ createdAt: -1 })
            .skip(50);

        if (fiftiethMessage) {
            const messagesToDelete = await Message.find({
                createdAt: { $lte: fiftiethMessage.createdAt },
            }).select('_id');

            const idsToDelete = messagesToDelete.map(m => m._id.toString());

            if (idsToDelete.length > 0) {
                const result = await Message.deleteMany({
                    _id: { $in: idsToDelete },
                });

                console.log(
                    `[CHAT CLEANUP] Deleted ${result.deletedCount} messages`
                );

                // إعلام المستخدمين
                for (const socketId of socketsInRoom) {
                    const receiverSocket =
                        io.sockets.sockets.get(socketId);

                    if (!receiverSocket || !receiverSocket.user) continue;

                    const receiverId =
                        receiverSocket.user.id.toString();
                    const isBlocked = await checkIfBlocked(
                        senderId,
                        receiverId
                    );

                    if (!isBlocked) {
                        receiverSocket.emit('chatCleanup', { idsToDelete });
                    }
                }
            }
        }
    } catch (error) {
        console.error('[CHAT SERVER ERROR] sendMessage:', error);
    }
});


  // 📍 أضف هذا المستمع في socketService.js
socket.on('removeFriendRequest', async (data) => {
    try {
        const userId = socket.user.id;
        const friendId = data.friendId;
        
        console.log(`[SOCKET REMOVE FRIEND] ${userId} removing ${friendId}`);
        
        // 1. إزالة الصداقة من كلا الطرفين
        await Promise.all([
            User.findByIdAndUpdate(userId, {
                $pull: { 
                    friends: friendId,
                    friendRequestsSent: friendId,
                    friendRequestsReceived: friendId 
                }
            }),
            User.findByIdAndUpdate(friendId, {
                $pull: { 
                    friends: userId,
                    friendRequestsSent: userId,
                    friendRequestsReceived: userId 
                }
            })
        ]);
        
        // 2. جلب البيانات المحدثة
        const [updatedUser, updatedFriend] = await Promise.all([
            User.findById(userId).select('friends').lean(),
            User.findById(friendId).select('friends socketId').lean()
        ]);
        
        // 3. إرسال إشعار للمستخدم الحالي
        socket.emit('friendshipUpdate', {
            action: 'friend_removed_via_socket',
            friendId: friendId,
            timestamp: new Date().toISOString(),
            newFriendsCount: updatedUser.friends ? updatedUser.friends.length : 0
        });
        
        // 4. إرسال إشعار للصديق المزال (إذا كان متصلاً)
        const io = socket.server;
        if (updatedFriend.socketId) {
            io.to(updatedFriend.socketId).emit('friendshipUpdate', {
                action: 'friend_removed_by_other_via_socket',
                userId: userId,
                timestamp: new Date().toISOString(),
                newFriendsCount: updatedFriend.friends ? updatedFriend.friends.length : 0
            });
        }
        
        console.log(`[SOCKET REMOVE FRIEND] Successfully removed friendship between ${userId} and ${friendId}`);
        
    } catch (error) {
        console.error('[SOCKET ERROR] in removeFriendRequest:', error);
        socket.emit('friendshipError', {
            action: 'remove_friend',
            error: error.message
        });
    }
});      

// =================================================
// ✅ مستمعات إضافية لنظام الحظر
// =================================================

// 1. مستمع لتنظيف Cache عند الحظر
socket.on('clearBlockCache', ({ userId, targetUserId }) => {
    try {
        clearBlockCache(userId, targetUserId);
        console.log(`[CACHE CLEAR] Socket event for ${userId}<->${targetUserId}`);
    } catch (error) {
        console.error('[CACHE CLEAR ERROR]:', error);
    }
});

// 2. مستمع لفرض تنظيف Cache (للمستخدم المحظور)
socket.on('forceClearBlockCache', ({ blockedBy, forceAll = false }) => {
    try {
        console.log(`[FORCE CLEAR] User ${socket.user.id} clearing cache for block with ${blockedBy}`);
        
        // تنظيف مباشر
        clearBlockCache(socket.user.id, blockedBy);
        
        // إذا طُلب تنظيف الكل
        if (forceAll) {
            const userPrefix = `${socket.user.id}-`;
            for (const key of blockCache.keys()) {
                if (key.startsWith(userPrefix) || key.includes(`-${socket.user.id}`)) {
                    blockCache.delete(key);
                }
            }
            console.log(`[FORCE CLEAR ALL] Cleared all cache for user ${socket.user.id}`);
        }
        
    } catch (error) {
        console.error('[FORCE CLEAR ERROR]:', error);
    }
});

// 3. مستمع لتحديث بيانات الحظر
socket.on('refreshBlockData', async () => {
    try {
        const userId = socket.user.id;
        console.log(`[REFRESH BLOCK] User ${userId} refreshing block data`);
        
        // جلب أحدث بيانات الحظر
        const user = await User.findById(userId).select('blockedUsers blockedBy').lean();
        
        if (user) {
            // تنظيف cache القديم
            const blockedIds = [...(user.blockedUsers || []), ...(user.blockedBy || [])];
            
            for (const blockedId of blockedIds) {
                clearBlockCache(userId, blockedId.toString());
            }
            
            socket.emit('blockDataRefreshed', {
                blockedUsers: user.blockedUsers || [],
                blockedBy: user.blockedBy || []
            });
        }
        
    } catch (error) {
        console.error('[REFRESH BLOCK ERROR]:', error);
    }
});



// ✅ مستمع جديد: تنظيف Cache عند الحظر/فك الحظر
socket.on('clearBlockCache', ({ userId, targetUserId }) => {
    try {
        clearBlockCache(userId, targetUserId);
        console.log(`[SOCKET] Block cache cleared for ${userId} and ${targetUserId}`);
    } catch (error) {
        console.error('[SOCKET] Error clearing block cache:', error);
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
