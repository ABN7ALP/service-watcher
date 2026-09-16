const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Battle = require('../models/Battle');
const VoiceRoom = require('../models/VoiceRoom');
const RoomBattle = require('../models/RoomBattle');
const { addExperience } = require('../utils/experienceManager'); // ✅✅✅ أضف هذا السطر هنا

// =================================================
// ✅ نظام CACHE محسّن مع TTL أقصر وتنظيف تلقائي
// =================================================

const blockCache = new Map();
const CACHE_TTL = 30 * 1000; // ⬅️ 30 ثانية فقط (بدل 5 دقائق)

// =================================================
// ✅ قفل تسلسلي لكل مستخدم لعمليات المقعد الصوتي
// -------------------------------------------------
// بدون هذا القفل: لو ضغط المستخدم عدة مقاعد بسرعة (أو تأخرت الشبكة)، تنطلق عدة طلبات
// "join-voice-seat" بالتوازي لنفس المستخدم، وكل واحد يقرأ حالة قاعدة البيانات قبل أن
// يكتب الآخر تغييره — فتنجح كلها بحجز مقاعد مختلفة، ويظهر نفس المستخدم على عدة مقاعد
// بنفس اللحظة (عند كل من يشاهد الغرفة، وليس فقط عنده). القفل يضمن تنفيذ عمليات نفس
// المستخدم واحدة تلو الأخرى دائماً، بغض النظر عن عدد الطلبات المتزامنة الواردة.
const voiceSeatLocks = new Map(); // userId(string) → Promise لآخر عملية قيد التنفيذ

// ✅ محدد معدل بسيط لدردشة الغرف وتفاعلات الإيموجي (userId → آخر وقت إرسال بالميلي ثانية)
const roomChatRateLimit = new Map();

// ✅ محدد معدل لرسائل تفاوض WebRTC (عرض/رد/مرشّحات ICE) — سخي بما يكفي لعدة اتصالات
// متزامنة تتفاوض بنفس اللحظة (كل اتصال قد يحتاج عدة مرشّحات ICE)، ويمنع إغراق متعمّد فقط
const voiceSignalRateLimit = new Map(); // userId(string) → [timestamps]
const VOICE_SIGNAL_WINDOW_MS = 2000;
const VOICE_SIGNAL_MAX = 60;
function isVoiceSignalRateLimited(userId) {
    const now = Date.now();
    const key = userId.toString();
    const timestamps = (voiceSignalRateLimit.get(key) || []).filter(t => now - t < VOICE_SIGNAL_WINDOW_MS);
    timestamps.push(now);
    voiceSignalRateLimit.set(key, timestamps);
    return timestamps.length > VOICE_SIGNAL_MAX;
}

// ✅ حالة تشغيل الموسيقى الحيّة لكل غرفة (بالذاكرة — تكفي، لا تحتاج قاعدة بيانات)
// roomId → { url, title, startedAt(ms), isPlaying, pausedAt(seconds) }
const roomMusicState = new Map();

// ✅ دعوات المضيف لمقعد محدد — بانتظار قبول/رفض صاحب الدعوة قبل إجلاسه فعلياً (لم يعد
// إجلاساً فورياً كما سابقاً). المفتاح: `${roomId}:${targetUserId}`
// → { seatNumber, hostSocketId, expiresAt }
const pendingSeatInvites = new Map();
const SEAT_INVITE_TTL_MS = 25 * 1000;

// ✅ تهدئة 26 ثانية بعد رفض صريح لنفس الشخص بنفس الغرفة — يمنع إزعاجه بدعوة متكررة فوراً.
// نفس المفتاح: `${roomId}:${targetUserId}` → طابع وقت آخر رفض
const seatInviteDeclineCooldown = new Map();
const SEAT_INVITE_COOLDOWN_MS = 26 * 1000;
function withUserSeatLock(userId, fn) {
    const key = userId.toString();
    const previous = voiceSeatLocks.get(key) || Promise.resolve();
    const run = previous.catch(() => {}).then(fn);
    voiceSeatLocks.set(key, run.catch(() => {})); // نسخة "صامتة" فقط لتسلسل الطلب القادم بأمان
    return run;
}

// =================================================
// ✅ معارك PK بين غرفتين — منطق التحدي/البدء/الإنهاء بالكامل هنا (نفس أسلوب التحديات
// الفردية startGame/endBattle أعلاه)، معتمداً على مستند RoomBattle كمصدر حقيقة وحيد،
// والمؤقتات هنا فقط لجدولة الإنهاء التلقائي (لا تُخزَّن بها أي بيانات مصيرية).
// =================================================
const pendingChallengeTimers = new Map();  // battleId(string) → Timeout (انتهاء صلاحية طلب لم يُرَد عليه)
const activeBattleTimers = new Map();      // battleId(string) → Timeout (نهاية معركة فعلية)

function clearBattleTimer(map, battleId) {
    const key = battleId.toString();
    const t = map.get(key);
    if (t) { clearTimeout(t); map.delete(key); }
}

async function emitToBothRooms(io, roomAId, roomBId, event, payload) {
    io.to(`room-chat-${roomAId}`).emit(event, payload);
    io.to(`room-chat-${roomBId}`).emit(event, payload);
}

// ✅ ينهي معركة نشطة (تلقائياً عند انتهاء الوقت، أو دفاعياً لو استُدعيت الحالة بعد انتهاء الوقت فعلياً)
async function finalizeActiveBattle(io, battleId) {
    try {
        clearBattleTimer(activeBattleTimers, battleId);
        const battle = await RoomBattle.findOne({ _id: battleId, status: 'active' });
        if (!battle) return;

        let winner = 'draw';
        if (battle.scoreA > battle.scoreB) winner = 'A';
        else if (battle.scoreB > battle.scoreA) winner = 'B';

        battle.status = 'ended';
        battle.winner = winner;
        await battle.save();

        await emitToBothRooms(io, battle.roomA, battle.roomB, 'pk-battle-ended', {
            battleId: battle._id.toString(),
            roomA: battle.roomA.toString(),
            roomB: battle.roomB.toString(),
            scoreA: battle.scoreA,
            scoreB: battle.scoreB,
            winner
        });
    } catch (error) {
        console.error('[PK BATTLE] Finalize error:', error);
    }
}

// ✅ يبدأ معركة فعالة بعد قبول التحدي: يحدد وقت البداية/النهاية ويجدول الإنهاء التلقائي
async function activateBattle(io, battle) {
    const now = new Date();
    battle.status = 'active';
    battle.startedAt = now;
    battle.endsAt = new Date(now.getTime() + battle.durationSeconds * 1000);
    await battle.save();

    const timer = setTimeout(() => finalizeActiveBattle(io, battle._id), battle.durationSeconds * 1000);
    activeBattleTimers.set(battle._id.toString(), timer);

    const [roomA, roomB] = await Promise.all([
        VoiceRoom.findById(battle.roomA).select('name coverImage'),
        VoiceRoom.findById(battle.roomB).select('name coverImage')
    ]);

    await emitToBothRooms(io, battle.roomA, battle.roomB, 'pk-battle-started', {
        battleId: battle._id.toString(),
        roomA: { id: battle.roomA.toString(), name: roomA?.name || '', coverImage: roomA?.coverImage || null },
        roomB: { id: battle.roomB.toString(), name: roomB?.name || '', coverImage: roomB?.coverImage || null },
        scoreA: battle.scoreA,
        scoreB: battle.scoreB,
        durationSeconds: battle.durationSeconds,
        endsAt: battle.endsAt
    });
}

// ✅ ينهي طلب تحدٍ معلّق لم يُرَد عليه خلال المهلة (رفض ضمني)
async function expirePendingChallenge(io, battleId) {
    try {
        clearBattleTimer(pendingChallengeTimers, battleId);
        const battle = await RoomBattle.findOneAndUpdate(
            { _id: battleId, status: 'pending' },
            { $set: { status: 'expired' } },
            { new: true }
        );
        if (!battle) return;
        io.to(`room-chat-${battle.roomA}`).emit('pk-challenge-expired', { battleId: battle._id.toString(), roomB: battle.roomB.toString() });
    } catch (error) {
        console.error('[PK BATTLE] Expire error:', error);
    }
}

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

        // ✅ العمولة تُقرأ الآن من الإعداد المركزي (SystemSettings) القابل للتعديل من لوحة التحكم
        const SystemSettings = require('../models/SystemSettings');
        const settings = await SystemSettings.getSettings();
        let commissionRate = settings.battleCommissionRate;
        // 🛡️ حماية صارمة: أي قيمة غير رقمية أو خارج النطاق [0, 0.5] تُرجَع للافتراضي الآمن
        // (يمنع تحوّل finalPot إلى NaN وإفساد رصيد الفائز نهائياً)
        if (typeof commissionRate !== 'number' || isNaN(commissionRate) || commissionRate < 0 || commissionRate > 0.5) {
            commissionRate = 0.10;
        }
        // ✅ حساب مالي دقيق يمنع تراكم أخطاء Float
        const { mulMoney, subMoney } = require('../utils/money');
        const commission = mulMoney(totalPot, commissionRate);
        const finalPot = subMoney(totalPot, commission);

        if (winnerId) {
            console.log(`[END BATTLE] Winner is ${winnerId}, Loser is ${loserId}`);
                        // ✅ إضافة ذرّية ودقيقة للجائزة (تمنع فقدان الجائزة عند تزامن عمليات أخرى على الرصيد)
            const { addMoney } = require('../utils/money');
            const winnerUser = await User.findByIdAndUpdate(
                winnerId,
                { $inc: { balance: finalPot } },
                { new: true }
            );
            if (winnerUser) {
                // تطبيع الرصيد بعد الإضافة الذرّية لمنع تراكم كسور Float
                winnerUser.balance = addMoney(winnerUser.balance, 0);
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
             const { addMoney } = require('../utils/money');
            for (const player of battle.players) {
                // ✅ استرداد ذرّي: لا نكتب فوق مستند قديم قد يكون تغيّر أثناء المباراة
                const refreshed = await User.findByIdAndUpdate(
                    player._id,
                    { $inc: { balance: battle.betAmount } },
                    { new: true }
                );
                if (!refreshed) continue;

                refreshed.balance = addMoney(refreshed.balance, 0);
                await refreshed.save();

                if (refreshed.socketId) {
                    io.to(refreshed.socketId).emit('balanceUpdate', { newBalance: refreshed.balance });
                    console.log(`[END BATTLE] Sent balance update to ${refreshed.username} (draw)`);
                }
                await addExperience(io, player._id, 0, 'win'); 
            }
        }

        battle.status = 'completed';
        await battle.save();

                // ✅ تسجيل العمولة كمعاملة قابلة للتدقيق (فقط عند وجود فائز فعلي، لا في التعادل)
        if (winnerId && commission > 0) {
            try {
                const Transaction = require('../models/Transaction');
                await Transaction.create({
                    user: winnerId,
                    type: 'commission',
                    amount: commission,
                    currency: 'USD',
                    status: 'completed',
                    battle: battle._id,
                    description: `عمولة النظام ${(commissionRate * 100).toFixed(1)}% (${commission}$) من إجمالي ${totalPot}$ — تحدي ${battle.type}`
                });
            } catch (e) {
                // فشل التسجيل لا يجب أن يؤثر على توزيع الجوائز (تمّ قبله)
                console.error('[END BATTLE] Failed to record commission transaction:', e);
            }
        }

        // --- ✅ الإصلاح: إرسال حدث انتهاء اللعبة إلى الغرفة بأكملها ---
        // هذا هو ما يجعل النافذة تختفي عند الجميع
        io.to(battleId).emit('gameEnded', { battle: battle.toObject(), winnerId });
        console.log(`[END BATTLE] Sent 'gameEnded' event to room ${battleId}`);

    } catch (error) {
        console.error(`[SERVER ERROR] in endBattle for battle ${battleId}:`, error);
    }
}

// =================================================
// ✅ دورة حياة "بث" غرفة المستخدم — الغرفة تظهر بالتصفح فقط وقت يكون مضيفها مباشراً فعلياً.
// إنهاء البث (صراحة بزر ✕، أو تلقائياً عند انقطاع اتصال المضيف) نفس المسار بالضبط.
// =================================================
// ✅ من يشاهد الغرفة الآن فعلياً — مشتق مباشرة من عضوية قناة دردشتها بالسوكيت (كل من فتح
// شاشة الغرفة منضمّ لها أصلاً عبر join-room-chat)، فلا حاجة لتتبّع "حضور" منفصل بقاعدة البيانات
function getRoomViewers(io, roomId) {
    const channel = `room-chat-${roomId}`;
    const socketIds = io.sockets.adapter.rooms.get(channel);
    if (!socketIds) return [];
    const byUser = new Map(); // ✅ يمنع التكرار لو نفس المستخدم فاتح أكثر من تبويب/جهاز بنفس الوقت
    for (const socketId of socketIds) {
        const s = io.sockets.sockets.get(socketId);
        if (s?.user) byUser.set(s.user.id.toString(), { id: s.user.id.toString(), username: s.user.username, profileImage: s.user.profileImage });
    }
    return Array.from(byUser.values());
}

function broadcastRoomViewerCount(io, roomId) {
    const count = getRoomViewers(io, roomId).length;
    io.to(`room-chat-${roomId}`).emit('room-viewer-count', { roomId, count });
}

// ✅ يبحث عن socketId حيّ لمستخدم معيّن ضمن قناة دردشة غرفة معيّنة تحديداً — نفس منطق
// getRoomViewers لكن لهدف واحد محدد بدل قائمة كاملة
function findRoomMemberSocketId(io, roomId, userId) {
    const channel = `room-chat-${roomId}`;
    const socketIds = io.sockets.adapter.rooms.get(channel);
    if (!socketIds) return null;
    const target = userId.toString();
    for (const socketId of socketIds) {
        const s = io.sockets.sockets.get(socketId);
        if (s?.user && s.user.id.toString() === target) return socketId;
    }
    return null;
}
function isInRoomChannel(io, roomId, userId) {
    return !!findRoomMemberSocketId(io, roomId, userId);
}

async function endRoomBroadcastForHost(io, hostUser) {
    try {
        const room = await VoiceRoom.findOne({ host: hostUser._id, isOfficial: false, isLive: true });
        if (!room) return;
        const result = await VoiceRoom.endBroadcast(room._id);
        if (!result) return;

        // ✅ يوقف أي أغنية شغّالة فوراً عند انتهاء البث — بدونه كانت الأغنية/المشغّل العائم
        // يبقيان ظاهرين حتى إعادة تحميل الصفحة، وقد تُستأنف أغنية "قديمة" عند بث تالٍ لنفس الغرفة
        const roomIdStr = room._id.toString();
        if (roomMusicState.has(roomIdStr)) {
            roomMusicState.delete(roomIdStr);
            io.to(`room-chat-${roomIdStr}`).emit('room-music-state', null);
        }

        io.to(`room-chat-${room._id}`).emit('room-broadcast-ended', {
            roomId: room._id.toString(),
            hostUsername: hostUser.username,
            hostProfileImage: hostUser.profileImage,
            durationSeconds: result.durationSeconds,
            followerIds: result.room.followers.map(f => f.toString()) // ✅ يمكّن العميل من معرفة "أنا متابع؟" دون طلب REST إضافي (الغرفة عادت isLive:false فلن يقدر يجلبها)
        });
        // ✅ تختفي فوراً من قائمة تصفح الغرف عند كل من فتحها حالياً — نفس آلية الظهور الفوري
        io.emit('room-went-offline', { roomId: room._id.toString() });
    } catch (error) {
        console.error('[BROADCAST] End error:', error);
    }
}

// ✅ مهلة سماح قبل إنهاء البث تلقائياً عند انقطاع اتصال المضيف — بدونها: أي انقطاع عابر
// (الهاتف يقفل الشاشة، تبديل شبكة، تحميل الصفحة من جديد) كان يُنهي البث فوراً بلا داعٍ،
// رغم أن المضيف يعود بعد ثوانٍ قليلة فعلياً. الاتصال الجديد بنفس الهوية يُلغي المهلة تلقائياً.
// 🐛 رُفعت من 25 إلى 90 ثانية: Socket.IO نفسه قد يستغرق حتى ~45 ثانية (pingInterval+
// pingTimeout الافتراضيان) ليكتشف أصلاً أن الاتصال انقطع (خصوصاً مع تعليق تبويب الهاتف
// بالخلفية عند قفل الشاشة، وهو السيناريو الأكثر شيوعاً) — 25 ثانية إضافية فوق ذلك كانت
// غير كافية عملياً لأبسط الحالات (قفل شاشة عادي، مكالمة واردة، نفق/مصعد قصير)
const DISCONNECT_GRACE_MS = 90 * 1000;
const pendingBroadcastEndTimers = new Map(); // hostId(string) → Timeout

function cancelPendingBroadcastEnd(userId) {
    const key = userId.toString();
    const timer = pendingBroadcastEndTimers.get(key);
    if (timer) {
        clearTimeout(timer);
        pendingBroadcastEndTimers.delete(key);
    }
}

function scheduleBroadcastEndAfterDisconnect(io, hostUser) {
    const key = hostUser._id.toString();
    cancelPendingBroadcastEnd(key); // ✅ يمنع تراكم أكثر من مؤقّت لنفس المضيف
    const timer = setTimeout(() => {
        pendingBroadcastEndTimers.delete(key);
        endRoomBroadcastForHost(io, hostUser);
    }, DISCONNECT_GRACE_MS);
    pendingBroadcastEndTimers.set(key, timer);
}

// --- دالة التهيئة الرئيسية ---
const initializeSocket = (server) => {
        const io = new Server(server, {
        cors: {
            // ✅ نفس القائمة البيضاء المستخدمة في الـ API
            origin: (origin, callback) => {
                const allowed = (process.env.ALLOWED_ORIGINS || '')
                    .split(',').map(o => o.trim()).filter(Boolean);
                if (!origin || allowed.length === 0) return callback(null, true);
                if (allowed.includes(origin)) return callback(null, true);
                return callback(new Error('Not allowed by CORS'));
            },
            methods: ["GET", "POST"],
            credentials: true
        },
        // ✅ ميزة أصلية بمكتبة Socket.IO نفسها (v4.6+، لا تبعية جديدة): تستعيد تلقائياً عضوية
        // قنوات السوكيت (room-chat-<roomId> وغيرها) عند إعادة الاتصال خلال هذي المهلة، وتُعيد
        // بث أي أحداث فاتت السوكيت أثناء الانقطاع — طبقة حماية إضافية أصيلة تكمّل إعادة
        // الانضمام اليدوية بالعميل (rejoinRoomChatChannel)، لا تُغني عنها لأن الاسترداد قد
        // يفشل أحياناً (انقطاع أطول من المهلة، إعادة تشغيل السيرفر...)
        connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60 * 1000
        }
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
            await User.findByIdAndUpdate(socket.user.id, { socketId: socket.id, isOnline: true });
            io.emit('userOnlineStatus', { userId: socket.user.id.toString(), isOnline: true });
            cancelPendingBroadcastEnd(socket.user._id); // ✅ عاد بسرعة — يلغي مهلة إنهاء البث المجدولة إن وُجدت

            // ✅ تحويل كل الرسائل التي وصلته وهو غير متصل إلى "تم التسليم" فوراً + إعلام كل مُرسِل بذلك
            const PrivateMessage = require('../models/PrivateMessage');
            const undelivered = await PrivateMessage.find({ receiver: socket.user.id, 'status.delivered': false });
            if (undelivered.length > 0) {
                const ids = undelivered.map(m => m._id);
                await PrivateMessage.updateMany({ _id: { $in: ids } }, { $set: { 'status.delivered': true, 'status.deliveredAt': new Date() } });

                const senderIds = [...new Set(undelivered.map(m => m.sender.toString()))];
                const senders = await User.find({ _id: { $in: senderIds } }).select('socketId');
                const senderSocketMap = {};
                senders.forEach(s => { senderSocketMap[s._id.toString()] = s.socketId; });

                undelivered.forEach(m => {
                    const sSocketId = senderSocketMap[m.sender.toString()];
                    if (sSocketId) io.to(sSocketId).emit('messageStatusUpdated', { messageId: m._id, status: 'delivered', updatedAt: new Date() });
                });
            }
        } catch (error) {
            console.error("Failed to update socketId:", error);
        }

        socket.join('public-room');

        // ✅ مؤشر الكتابة (خاص وعام)
        socket.on('typing-start', ({ targetUserId, roomId }) => {
            if (targetUserId) {
                User.findById(targetUserId).select('socketId').then(u => {
                    if (u?.socketId) io.to(u.socketId).emit('userTyping', { userId: socket.user.id.toString(), username: socket.user.username, isTyping: true });
                });
            } else if (roomId === 'public') {
                socket.to('public-room').emit('publicUserTyping', { userId: socket.user.id.toString(), username: socket.user.username, isTyping: true });
            }
        });
        socket.on('typing-stop', ({ targetUserId, roomId }) => {
            if (targetUserId) {
                User.findById(targetUserId).select('socketId').then(u => {
                    if (u?.socketId) io.to(u.socketId).emit('userTyping', { userId: socket.user.id.toString(), isTyping: false });
                });
            } else if (roomId === 'public') {
                socket.to('public-room').emit('publicUserTyping', { userId: socket.user.id.toString(), isTyping: false });
            }
        });
        socket.on('recording-voice', ({ targetUserId, isRecording }) => {
            User.findById(targetUserId).select('socketId').then(u => {
                if (u?.socketId) io.to(u.socketId).emit('userRecordingVoice', { userId: socket.user.id.toString(), isRecording });
            });
        });


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
            .populate('sender', 'username profileImage activeBubbleSkinClass activeFrameClass')
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

        // =====================================================
        // ✅ نظام المقاعد الصوتية — حالة حقيقية بقاعدة البيانات
        // -----------------------------------------------------
        // كل عملية حجز/تحرير مقعد ذرّية (findOneAndUpdate بشرط واحد)
        // لمنع تصادم مستخدمَين يضغطان نفس المقعد بنفس اللحظة.
        // الهوية دائماً من socket.user الموثّق بالتوكن — أبداً من بيانات
        // يرسلها العميل — فلا يمكن لأي مستخدم انتحال جلوس شخص آخر.
        // =====================================================
        socket.on('join-voice-seat', ({ roomId, seatNumber, password }) => withUserSeatLock(socket.user._id, async () => {
            try {
                const VoiceRoom = require('../models/VoiceRoom');
                const seatNum = parseInt(seatNumber);
                const targetRoomId = roomId || 'main';

                const room = await VoiceRoom.resolveRoom(targetRoomId);
                if (!room) {
                    return socket.emit('seat-error', 'الغرفة غير موجودة أو أُغلقت');
                }

                if (!Number.isInteger(seatNum) || seatNum < 1 || seatNum > room.seatCount) {
                    return socket.emit('seat-error', 'رقم مقعد غير صالح');
                }

                const isAdminSeat = seatNum <= room.adminSeatCount;
                if (isAdminSeat && !socket.user.isAdmin) {
                    return socket.emit('seat-error', 'لا تملك صلاحية الجلوس على مقاعد الإدارة');
                }

                // 🛡️ الجلوس المباشر بضغطة واحدة صار حصرياً للمضيف/المسؤولين المساعدين — أي ضيف
                // آخر يرسل "رفع يد" (raise-hand) بدلاً من الجلوس الفوري، والمضيف يوافق أو يرفض.
                // ليس مجرد إخفاء زر بالواجهة: نفس القاعدة مُطبَّقة هنا مباشرة على مستوى السيرفر.
                if (targetRoomId !== 'main' && !room.canModerate(socket.user._id)) {
                    return socket.emit('seat-error', 'اضغط "رفع اليد" لطلب الصعود — الجلوس المباشر للمضيف والمسؤولين فقط');
                }

                // 🐛 إصلاح جوهري: مضيف الغرفة ثابت دائماً على مقعده رقم 1 (releaseUserSeatEverywhere
                // يستثني عمداً مقعده الخاص بغرفته المباشرة حتى لا ينقطع بثّه بالخطأ)، فكان بإمكانه
                // النقر على أي مقعد فاضٍ آخر بنفس غرفته والانضمام له أيضاً دون تحرير مقعده الأول —
                // يظهر مستنسخاً على أكثر من مقعد بنفس اللحظة. الرفض هنا صريح (وليس فقط بالواجهة).
                if (room.host && room.host.toString() === socket.user._id.toString() && !room.isOfficial) {
                    return socket.emit('seat-error', 'أنت مضيف هذي الغرفة — ثابت دائماً على مقعد 1');
                }

                // ✅ ملاحظة: كلمة مرور الغرفة الخاصة تُتحقق منها فقط عند "الدخول للغرفة" (getRoomById)
                // — من وصل لهذي النقطة فهو أصلاً دخل الغرفة بنجاح، فلا داعي لتكرار الطلب عند الجلوس.

                // 1) حرّر كل مقعد يشغله هذا المستخدم فعلياً عبر كل الغرف (لا يمكن الجلوس بغرفتين
                //    بنفس الوقت) بقاعدة البيانات وحدها — وليس بذاكرة هذا الاتصال تحديداً
                const released = await VoiceRoom.releaseUserSeatEverywhere(socket.user._id) || [];
                released.forEach(r => {
                    io.emit('user-left-seat', { roomId: r.roomId, seatNumber: r.seatNumber, userId: socket.user.id.toString() });
                });
                // ✅ ترحيل حالة الكتم: لو كان مكتوماً بمقعده القديم (أي غرفة كانت)، يبقى مكتوماً بالجديد
                const carryMuted = released.some(r => r.wasMuted);

                // 2) حاول حجز المقعد الجديد بنفس الغرفة الهدف — يفشل تلقائياً لو صار محجوزاً أو مقفلاً
                const updatedRoom = await VoiceRoom.findOneAndUpdate(
                    { _id: room._id, seats: { $elemMatch: { seatNumber: seatNum, user: null, isLocked: false } } },
                    {
                        $set: { 'seats.$.user': socket.user._id, 'seats.$.joinedAt': new Date(), 'seats.$.isMuted': carryMuted },
                        $pull: { handRaises: { user: socket.user._id } }, // ✅ صعد بنفسه — لا داعي تبقى يده مرفوعة بقائمة الانتظار
                        $currentDate: { lastActivityAt: true } // ✅ يغذّي ترتيب "الأكثر نشاطاً" بقائمة الغرف
                    },
                    { new: true }
                );

                if (!updatedRoom) {
                    socket.emit('seat-error', 'هذا المقعد محجوز بالفعل أو مقفل');
                    return;
                }

                io.emit('hand-raise-removed', { roomId: targetRoomId, userId: socket.user.id.toString() });
                io.emit('user-joined-seat', {
                    roomId: targetRoomId,
                    seatNumber: seatNum,
                    userId: socket.user.id.toString(),
                    username: socket.user.username,
                    profileImage: socket.user.profileImage,
                    activeFrameClass: socket.user.activeFrameClass,
                    isMuted: carryMuted
                });
            } catch (error) {
                console.error('[VOICE SEAT] Join seat error:', error);
                socket.emit('seat-error', 'حدث خطأ أثناء محاولة الجلوس');
            }
        }));

        socket.on('leave-voice-seat', () => withUserSeatLock(socket.user._id, async () => {
            try {
                const VoiceRoom = require('../models/VoiceRoom');

                // 🛡️ مضيف غرفته الخاصة (المباشرة) لا يقدر ينزل من مقعده — عليه إنهاء البث بدل ذلك
                // (host-end-broadcast)؛ هذا لا يشمل الغرفة الرسمية (host: null هناك أصلاً)
                const ownLiveRoom = await VoiceRoom.findOne({ host: socket.user._id, isOfficial: false, isLive: true, 'seats.user': socket.user._id });
                if (ownLiveRoom) {
                    return socket.emit('seat-error', 'أنت مضيف هذي الغرفة — أنهِ البث بدل النزول من المقعد');
                }

                const released = await VoiceRoom.releaseUserSeatEverywhere(socket.user._id) || [];
                released.forEach(r => {
                    io.emit('user-left-seat', { roomId: r.roomId, seatNumber: r.seatNumber, userId: socket.user.id.toString() });
                });
            } catch (error) {
                console.error('[VOICE SEAT] Leave seat error:', error);
            }
        }));

        // =====================================================
        // ✅ إشارات WebRTC للصوت الحي بين الجالسين على المقاعد — السيرفر لا يلمس الوسائط
        // إطلاقاً، فقط يُوصّل رسائل التفاوض (SDP/ICE) بين طرفين. 🛡️ لا يُرسِل الإشارة إلا لو
        // الطرفان كلاهما فعلياً بنفس قناة دردشة الغرفة — يمنع استخدام هذا كقناة إشارات
        // تعسفية بين أي مستخدمين (لا علاقة لهما بأي غرفة مشتركة)
        // =====================================================
        function relayVoiceSignal(eventName, { roomId, toUserId, payload }) {
            if (!roomId || !toUserId || !payload) return;
            if (isVoiceSignalRateLimited(socket.user._id)) return;
            if (!isInRoomChannel(io, roomId, socket.user._id) || !isInRoomChannel(io, roomId, toUserId)) return;
            const targetSocketId = findRoomMemberSocketId(io, roomId, toUserId);
            if (!targetSocketId) return;
            io.to(targetSocketId).emit(eventName, { roomId, fromUserId: socket.user.id.toString(), payload });
        }

        socket.on('voice-webrtc-offer', ({ roomId, toUserId, sdp }) => {
            relayVoiceSignal('voice-webrtc-offer', { roomId, toUserId, payload: sdp });
        });
        socket.on('voice-webrtc-answer', ({ roomId, toUserId, sdp }) => {
            relayVoiceSignal('voice-webrtc-answer', { roomId, toUserId, payload: sdp });
        });
        socket.on('voice-webrtc-ice-candidate', ({ roomId, toUserId, candidate }) => {
            relayVoiceSignal('voice-webrtc-ice-candidate', { roomId, toUserId, payload: candidate });
        });

        socket.on('toggle-mute', async ({ isMuted }) => {
            try {
                const VoiceRoom = require('../models/VoiceRoom');
                // ✅ يبحث عن مقعد المستخدم فعلياً بقاعدة البيانات بأي غرفة (بدل الرسمية فقط سابقاً)
                const updatedRoom = await VoiceRoom.findOneAndUpdate(
                    { 'seats.user': socket.user._id },
                    { $set: { 'seats.$.isMuted': !!isMuted } },
                    { new: true }
                );
                if (!updatedRoom) return; // المستخدم غير قاعد على أي مقعد حالياً — لا شيء لتحديثه
                const roomId = updatedRoom.slug === 'main' ? 'main' : updatedRoom._id.toString();
                io.emit('user-toggled-mute', { roomId, userId: socket.user.id.toString(), isMuted: !!isMuted });
            } catch (error) {
                console.error('[VOICE SEAT] Toggle mute error:', error);
            }
        });

        // =====================================================
        // ✅ صلاحيات المضيف/المسؤول المساعد داخل غرفته — كل عملية تتحقق من
        // canModerate() بالسيرفر أولاً (لا تكفي إخفاء الأزرار بالواجهة وحدها)
        // =====================================================
        socket.on('host-kick-seat', ({ roomId, seatNumber }) => withUserSeatLock(`host-${socket.user._id}`, async () => {
            try {
                const VoiceRoom = require('../models/VoiceRoom');
                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room || !room.canModerate(socket.user._id)) {
                    return socket.emit('seat-error', 'لا تملك صلاحية الإدارة بهذي الغرفة');
                }
                const seat = room.seats.find(s => s.seatNumber === parseInt(seatNumber));
                if (!seat || !seat.user) return;
                // 🛡️ لا يمكن لأي مسؤول (حتى نفسه) طرد المضيف من مقعده — المضيف ينهي البث بدل ذلك
                if (room.host && seat.user.toString() === room.host.toString()) {
                    return socket.emit('seat-error', 'لا يمكن طرد مضيف الغرفة من مقعده');
                }
                const kickedUserId = seat.user.toString();

                await VoiceRoom.updateOne(
                    { _id: room._id, 'seats.seatNumber': parseInt(seatNumber) },
                    { $set: { 'seats.$.user': null, 'seats.$.joinedAt': null, 'seats.$.isMuted': false } }
                );

                io.emit('user-left-seat', { roomId, seatNumber: parseInt(seatNumber), userId: kickedUserId });
                io.emit('you-were-kicked', { roomId, userId: kickedUserId }); // ✅ إشعار خاص للمطرود نفسه
            } catch (error) {
                console.error('[HOST ACTION] Kick error:', error);
            }
        }));

        socket.on('host-mute-seat', async ({ roomId, seatNumber, isMuted }) => {
            try {
                const VoiceRoom = require('../models/VoiceRoom');
                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room || !room.canModerate(socket.user._id)) {
                    return socket.emit('seat-error', 'لا تملك صلاحية الإدارة بهذي الغرفة');
                }
                const seat = room.seats.find(s => s.seatNumber === parseInt(seatNumber));
                if (!seat || !seat.user) return;

                await VoiceRoom.updateOne(
                    { _id: room._id, 'seats.seatNumber': parseInt(seatNumber) },
                    { $set: { 'seats.$.isMuted': !!isMuted } }
                );

                io.emit('user-toggled-mute', { roomId, userId: seat.user.toString(), isMuted: !!isMuted });
            } catch (error) {
                console.error('[HOST ACTION] Mute error:', error);
            }
        });

        socket.on('host-toggle-lock-seat', async ({ roomId, seatNumber }) => {
            try {
                const VoiceRoom = require('../models/VoiceRoom');
                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room || !room.canModerate(socket.user._id)) {
                    return socket.emit('seat-error', 'لا تملك صلاحية الإدارة بهذي الغرفة');
                }
                const seat = room.seats.find(s => s.seatNumber === parseInt(seatNumber));
                if (!seat) return;
                // 🛡️ قفل مقعد المضيف نفسه يعني طرده منه ضمنياً — ممنوع، هو ينهي البث بدل ذلك
                if (room.host && seat.user && seat.user.toString() === room.host.toString()) {
                    return socket.emit('seat-error', 'لا يمكن قفل مقعد المضيف');
                }
                const newLockState = !seat.isLocked;

                // ✅ لو المقعد مشغول وقفلناه، نطرد الجالس عليه أولاً (مقعد مقفل يجب أن يكون فاضياً)
                let kickedUserId = null;
                if (newLockState && seat.user) {
                    kickedUserId = seat.user.toString();
                    await VoiceRoom.updateOne(
                        { _id: room._id, 'seats.seatNumber': parseInt(seatNumber) },
                        { $set: { 'seats.$.user': null, 'seats.$.joinedAt': null, 'seats.$.isMuted': false, 'seats.$.isLocked': true } }
                    );
                } else {
                    await VoiceRoom.updateOne(
                        { _id: room._id, 'seats.seatNumber': parseInt(seatNumber) },
                        { $set: { 'seats.$.isLocked': newLockState } }
                    );
                }

                if (kickedUserId) {
                    io.emit('user-left-seat', { roomId, seatNumber: parseInt(seatNumber), userId: kickedUserId });
                    io.emit('you-were-kicked', { roomId, userId: kickedUserId });
                }
                io.emit('seat-lock-changed', { roomId, seatNumber: parseInt(seatNumber), isLocked: newLockState });
            } catch (error) {
                console.error('[HOST ACTION] Lock toggle error:', error);
            }
        });

        // ✅ تعيين/إلغاء مسؤول مساعد — المضيف فقط يملك هذي الصلاحية (وليس المسؤولون أنفسهم)
        socket.on('host-set-moderator', async ({ roomId, targetUserId, makeMod }) => {
            try {
                const mongoose = require('mongoose');
                const VoiceRoom = require('../models/VoiceRoom');
                if (!mongoose.Types.ObjectId.isValid(targetUserId)) return;

                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room || !room.host || room.host.toString() !== socket.user._id.toString()) {
                    return socket.emit('seat-error', 'المضيف فقط يقدر يعيّن مسؤولين مساعدين');
                }

                if (makeMod) {
                    await VoiceRoom.updateOne({ _id: room._id }, { $addToSet: { moderators: targetUserId } });
                } else {
                    await VoiceRoom.updateOne({ _id: room._id }, { $pull: { moderators: targetUserId } });
                }

                const finalRoomId = room.slug === 'main' ? 'main' : room._id.toString();
                io.emit('moderator-status-changed', { roomId: finalRoomId, userId: targetUserId, isModerator: !!makeMod });
            } catch (error) {
                console.error('[HOST ACTION] Set moderator error:', error);
            }
        });

        // =====================================================
        // ✅ بدء/إنهاء البث — المضيف فقط (وليس المسؤولون المساعدون؛ هذا قرار مصيري للغرفة)
        // =====================================================
        socket.on('host-start-broadcast', async ({ roomId }) => {
            try {
                const room = await VoiceRoom.startBroadcast(roomId, socket.user._id);
                if (!room) return; // ✅ ليس مضيف هذي الغرفة، أو الغرفة الرسمية — تجاهل صامت وآمن
                io.emit('user-joined-seat', {
                    roomId: room._id.toString(),
                    seatNumber: 1,
                    userId: socket.user.id.toString(),
                    username: socket.user.username,
                    profileImage: socket.user.profileImage,
                    activeFrameClass: socket.user.activeFrameClass,
                    isMuted: false
                });
                io.to(`room-chat-${room._id}`).emit('room-broadcast-started', { roomId: room._id.toString() });
                // ✅ تظهر فوراً بقائمة تصفح الغرف عند كل من فتحها حالياً — بلا حاجة لتنقل/تحديث صفحة
                io.emit('room-went-live', {
                    room: {
                        id: room._id.toString(),
                        name: room.name,
                        description: room.description,
                        coverImage: room.coverImage,
                        host: { _id: socket.user.id.toString(), username: socket.user.username, profileImage: socket.user.profileImage },
                        category: room.category,
                        seatCount: room.seatCount,
                        isOfficial: false,
                        isPrivate: room.isPrivate,
                        roomCode: room.roomCode,
                        occupied: 1,
                        createdAt: room.createdAt
                    }
                });
            } catch (error) {
                console.error('[BROADCAST] Start error:', error);
            }
        });

        socket.on('host-end-broadcast', async ({ roomId }) => {
            try {
                const room = await VoiceRoom.findOne({ _id: roomId, host: socket.user._id, isOfficial: false });
                if (!room) return socket.emit('seat-error', 'لست مضيف هذي الغرفة');
                cancelPendingBroadcastEnd(socket.user._id); // ✅ إنهاء صريح — لا داعي لمؤقّت مهلة قد يكون مجدولاً
                await endRoomBroadcastForHost(io, socket.user);
            } catch (error) {
                console.error('[BROADCAST] Explicit end error:', error);
            }
        });

        // ✅ متابعة/إلغاء متابعة غرفة تحديداً — مستقل تماماً عن نظام الأصدقاء
        socket.on('follow-room', async ({ roomId }) => {
            try {
                const mongoose = require('mongoose');
                if (!mongoose.Types.ObjectId.isValid(roomId)) return;
                const room = await VoiceRoom.findOneAndUpdate(
                    { _id: roomId, isOfficial: false },
                    { $addToSet: { followers: socket.user._id } },
                    { new: true }
                );
                if (room) socket.emit('room-follow-updated', { roomId, isFollowing: true, followersCount: room.followers.length });
            } catch (error) {
                console.error('[FOLLOW ROOM] Follow error:', error);
            }
        });

        socket.on('unfollow-room', async ({ roomId }) => {
            try {
                const mongoose = require('mongoose');
                if (!mongoose.Types.ObjectId.isValid(roomId)) return;
                const room = await VoiceRoom.findOneAndUpdate(
                    { _id: roomId, isOfficial: false },
                    { $pull: { followers: socket.user._id } },
                    { new: true }
                );
                if (room) socket.emit('room-follow-updated', { roomId, isFollowing: false, followersCount: room.followers.length });
            } catch (error) {
                console.error('[FOLLOW ROOM] Unfollow error:', error);
            }
        });

        // =====================================================
        // ✅ رفع اليد — طلب الصعود للمايك (بديل صريح عن انتظار مقعد يفضى بالصدفة)
        // -----------------------------------------------------
        // قائمة الطلبات محفوظة بمستند الغرفة نفسها (وليس بالذاكرة) حتى يراها المضيف
        // مهما تأخر بالرد، ولو أعاد فتح الغرفة من جديد (عبر getRoomById).
        // =====================================================
        const MAX_HAND_RAISES = 30; // 🛡️ سقف يمنع إغراق قائمة الانتظار بطلبات وهمية

        socket.on('raise-hand', async ({ roomId }) => withUserSeatLock(`hand-${socket.user._id}`, async () => {
            try {
                const VoiceRoom = require('../models/VoiceRoom');
                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room) return;

                // ✅ لا فائدة من رفع يد وأنت أصلاً قاعد على مقعد بنفس الغرفة
                const alreadySeated = room.seats.some(s => s.user && s.user.toString() === socket.user._id.toString());
                if (alreadySeated) return;

                const alreadyRaised = room.handRaises.some(h => h.user.toString() === socket.user._id.toString());
                if (alreadyRaised) return;
                if (room.handRaises.length >= MAX_HAND_RAISES) {
                    return socket.emit('seat-error', 'قائمة طلبات الصعود ممتلئة حالياً، حاول لاحقاً');
                }

                await VoiceRoom.updateOne(
                    { _id: room._id },
                    { $push: { handRaises: { user: socket.user._id, requestedAt: new Date() } } }
                );

                const finalRoomId = room.slug === 'main' ? 'main' : room._id.toString();
                io.to(`room-chat-${finalRoomId}`).emit('hand-raise-added', {
                    roomId: finalRoomId,
                    userId: socket.user.id.toString(),
                    username: socket.user.username,
                    profileImage: socket.user.profileImage,
                    requestedAt: new Date()
                });
            } catch (error) {
                console.error('[HAND RAISE] Raise error:', error);
            }
        }));

        socket.on('lower-hand', ({ roomId }) => withUserSeatLock(`hand-${socket.user._id}`, async () => {
            try {
                const VoiceRoom = require('../models/VoiceRoom');
                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room) return;

                await VoiceRoom.updateOne({ _id: room._id }, { $pull: { handRaises: { user: socket.user._id } } });

                const finalRoomId = room.slug === 'main' ? 'main' : room._id.toString();
                io.to(`room-chat-${finalRoomId}`).emit('hand-raise-removed', { roomId: finalRoomId, userId: socket.user.id.toString() });
            } catch (error) {
                console.error('[HAND RAISE] Lower error:', error);
            }
        }));

        // ✅ المضيف/المسؤول يدعو شخصاً (صاحب طلب مرفوع، أو أي حاضر بالغرفة) لمقعد محدد — لا
        // يُجلَس فوراً كما سابقاً، بل تُرسَل له دعوة ينتظر قبوله/رفضه صراحة عليها أولاً
        // 🛡️ يقفل بنفس مفتاح مقعد المستهدَف (وليس مفتاح رفع يده) عمداً — هذا يمنع تضارباً حقيقياً
        // مع أي join-voice-seat/leave-voice-seat يصدر منه أو من قِبله بنفس اللحظة (يعدّل نفس صف المقاعد)
        socket.on('host-invite-to-seat', ({ roomId, targetUserId, seatNumber }) => withUserSeatLock(targetUserId, async () => {
            try {
                const mongoose = require('mongoose');
                const VoiceRoom = require('../models/VoiceRoom');
                if (!mongoose.Types.ObjectId.isValid(targetUserId)) return;

                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room || !room.canModerate(socket.user._id)) {
                    return socket.emit('seat-error', 'لا تملك صلاحية الإدارة بهذي الغرفة');
                }

                const seatNum = parseInt(seatNumber);
                const seat = room.seats.find(s => s.seatNumber === seatNum);
                if (!seat) return;
                if (seat.user) return socket.emit('seat-error', 'هذا المقعد مشغول بالفعل');
                if (seat.isLocked) return socket.emit('seat-error', 'هذا المقعد مقفل حالياً');
                const isAdminSeat = seatNum <= room.adminSeatCount;

                const targetUser = await User.findById(targetUserId).select('isAdmin username profileImage activeFrameClass socketId');
                if (!targetUser) return;
                if (isAdminSeat && !targetUser.isAdmin) {
                    return socket.emit('seat-error', 'هذا المقعد محجوز للإدارة فقط');
                }
                if (!targetUser.socketId) {
                    return socket.emit('seat-error', 'هذا المستخدم غير متصل حالياً');
                }

                const finalRoomId = room.slug === 'main' ? 'main' : room._id.toString();

                // ✅ لو هذا الشخص رافع يده أصلاً (طلب الصعود بنفسه)، فموافقة المضيف هنا هي
                // "قبول طلبه" لا "دعوة جديدة" — طلبه هو نفسه القبول، فيُجلَس مباشرة بلا أي
                // نافذة قبول/رفض إضافية له (كانت تُحس غريبة: هو من طلب أصلاً!). آلية القبول/الرفض
                // الصريحة تبقى فقط للدعوة التي يبدأها المضيف بنفسه لشخص لم يطلب شيئاً
                const isApprovingRaisedHand = room.handRaises.some(h => h.user.toString() === targetUserId);
                if (isApprovingRaisedHand) {
                    await VoiceRoom.releaseUserSeatEverywhere(targetUserId);
                    const updatedRoom = await VoiceRoom.findOneAndUpdate(
                        { _id: room._id, seats: { $elemMatch: { seatNumber: seatNum, user: null, isLocked: false } } },
                        {
                            $set: { 'seats.$.user': targetUserId, 'seats.$.joinedAt': new Date(), 'seats.$.isMuted': false },
                            $pull: { handRaises: { user: targetUserId } },
                            $currentDate: { lastActivityAt: true }
                        },
                        { new: true }
                    );
                    if (!updatedRoom) {
                        return socket.emit('seat-error', 'هذا المقعد محجوز بالفعل أو مقفل');
                    }
                    io.emit('user-joined-seat', {
                        roomId: finalRoomId,
                        seatNumber: seatNum,
                        userId: targetUserId,
                        username: targetUser.username,
                        profileImage: targetUser.profileImage,
                        activeFrameClass: targetUser.activeFrameClass,
                        isMuted: false
                    });
                    io.to(`room-chat-${finalRoomId}`).emit('hand-raise-removed', { roomId: finalRoomId, userId: targetUserId });
                    io.to(targetUser.socketId).emit('you-were-invited-up', { roomId: finalRoomId, seatNumber: seatNum });
                    return;
                }

                const cooldownKey = `${finalRoomId}:${targetUserId}`;

                // 🛡️ تهدئة 26 ثانية بعد رفض صريح لنفس الشخص — يمنع إزعاجه بدعوة متكررة فوراً
                const lastDecline = seatInviteDeclineCooldown.get(cooldownKey);
                if (lastDecline) {
                    const remainingMs = SEAT_INVITE_COOLDOWN_MS - (Date.now() - lastDecline);
                    if (remainingMs > 0) {
                        return socket.emit('seat-error', `انتظر ${Math.ceil(remainingMs / 1000)} ثانية قبل إعادة دعوة هذا الشخص`);
                    }
                    seatInviteDeclineCooldown.delete(cooldownKey);
                }

                pendingSeatInvites.set(cooldownKey, {
                    seatNumber: seatNum,
                    hostSocketId: socket.id,
                    expiresAt: Date.now() + SEAT_INVITE_TTL_MS
                });

                io.to(targetUser.socketId).emit('seat-invite-received', {
                    roomId: finalRoomId,
                    roomName: room.name,
                    seatNumber: seatNum,
                    fromUserId: socket.user.id.toString(),
                    fromUsername: socket.user.username,
                    fromProfileImage: socket.user.profileImage,
                    expiresInMs: SEAT_INVITE_TTL_MS
                });
            } catch (error) {
                console.error('[HAND RAISE] Invite error:', error);
            }
        }));

        // ✅ المدعو يرد على دعوة المقعد صراحة — القبول وحده يُجلسه فعلياً (بنفس ذرية join-voice-seat)
        socket.on('seat-invite-respond', ({ roomId, accept }) => withUserSeatLock(socket.user._id, async () => {
            try {
                const VoiceRoom = require('../models/VoiceRoom');
                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room) return;

                const finalRoomId = room.slug === 'main' ? 'main' : room._id.toString();
                const key = `${finalRoomId}:${socket.user.id.toString()}`;
                const invite = pendingSeatInvites.get(key);
                pendingSeatInvites.delete(key);
                if (!invite || Date.now() > invite.expiresAt) {
                    return socket.emit('seat-error', 'انتهت صلاحية الدعوة');
                }

                if (!accept) {
                    seatInviteDeclineCooldown.set(key, Date.now());
                    io.to(invite.hostSocketId).emit('seat-invite-declined', {
                        roomId: finalRoomId,
                        targetUsername: socket.user.username,
                        cooldownSeconds: Math.round(SEAT_INVITE_COOLDOWN_MS / 1000)
                    });
                    return;
                }

                await VoiceRoom.releaseUserSeatEverywhere(socket.user._id);
                const updatedRoom = await VoiceRoom.findOneAndUpdate(
                    { _id: room._id, seats: { $elemMatch: { seatNumber: invite.seatNumber, user: null, isLocked: false } } },
                    {
                        $set: { 'seats.$.user': socket.user._id, 'seats.$.joinedAt': new Date(), 'seats.$.isMuted': false },
                        $pull: { handRaises: { user: socket.user._id } },
                        $currentDate: { lastActivityAt: true }
                    },
                    { new: true }
                );

                if (!updatedRoom) {
                    return socket.emit('seat-error', 'هذا المقعد لم يعد متاحاً — شغله أحد قبلك');
                }

                io.emit('user-joined-seat', {
                    roomId: finalRoomId,
                    seatNumber: invite.seatNumber,
                    userId: socket.user.id.toString(),
                    username: socket.user.username,
                    profileImage: socket.user.profileImage,
                    activeFrameClass: socket.user.activeFrameClass,
                    isMuted: false
                });
                io.to(`room-chat-${finalRoomId}`).emit('hand-raise-removed', { roomId: finalRoomId, userId: socket.user.id.toString() });
            } catch (error) {
                console.error('[SEAT INVITE] Respond error:', error);
            }
        }));

        // ✅ المضيف/المسؤول يرفض طلباً مرفوعاً دون دعوته لمقعد
        socket.on('host-dismiss-hand', async ({ roomId, targetUserId }) => {
            try {
                const VoiceRoom = require('../models/VoiceRoom');
                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room || !room.canModerate(socket.user._id)) {
                    return socket.emit('seat-error', 'لا تملك صلاحية الإدارة بهذي الغرفة');
                }

                await VoiceRoom.updateOne({ _id: room._id }, { $pull: { handRaises: { user: targetUserId } } });

                const finalRoomId = room.slug === 'main' ? 'main' : room._id.toString();
                io.to(`room-chat-${finalRoomId}`).emit('hand-raise-removed', { roomId: finalRoomId, userId: targetUserId });

                const targetUser = await User.findById(targetUserId).select('socketId');
                if (targetUser?.socketId) {
                    io.to(targetUser.socketId).emit('hand-raise-dismissed', { roomId: finalRoomId });
                }
            } catch (error) {
                console.error('[HAND RAISE] Dismiss error:', error);
            }
        });

        // =====================================================
        // ✅ معارك PK بين غرفتين — المضيف فقط يبدأ التحدي أو يرد عليه (وليس المسؤولون المساعدون)
        // =====================================================
        socket.on('pk-challenge-room', async ({ roomId, targetRoomId, durationSeconds }) => {
            try {
                if (!roomId || !targetRoomId || roomId === targetRoomId) return;
                const duration = RoomBattle.DURATION_PRESETS_SECONDS.includes(parseInt(durationSeconds))
                    ? parseInt(durationSeconds) : RoomBattle.DURATION_PRESETS_SECONDS[0];

                const [myRoom, targetRoom] = await Promise.all([
                    VoiceRoom.findOne({ _id: roomId, status: 'active' }),
                    VoiceRoom.findOne({ _id: targetRoomId, status: 'active' }).populate('host', 'username socketId')
                ]);

                if (!myRoom || !myRoom.host || myRoom.host.toString() !== socket.user._id.toString()) {
                    return socket.emit('seat-error', 'المضيف فقط يقدر يبدأ معركة PK');
                }
                if (!targetRoom || !targetRoom.host) {
                    return socket.emit('seat-error', 'الغرفة المستهدفة غير متاحة للتحدي');
                }
                if (myRoom.isOfficial || targetRoom.isOfficial) {
                    return socket.emit('seat-error', 'لا يمكن تحدي الغرفة الرسمية');
                }
                if (!targetRoom.isLive) {
                    return socket.emit('seat-error', 'هذي الغرفة ما إلها بث مباشر حالياً');
                }

                const [openForMine, openForTarget] = await Promise.all([
                    RoomBattle.findOpenForRoom(myRoom._id),
                    RoomBattle.findOpenForRoom(targetRoom._id)
                ]);
                if (openForMine) return socket.emit('seat-error', 'غرفتك بمعركة PK قائمة بالفعل');
                if (openForTarget) return socket.emit('seat-error', 'هذي الغرفة بمعركة PK قائمة بالفعل');

                const battle = await RoomBattle.create({
                    roomA: myRoom._id,
                    roomB: targetRoom._id,
                    challengedBy: socket.user._id,
                    durationSeconds: duration,
                    status: 'pending'
                });

                const timer = setTimeout(() => expirePendingChallenge(io, battle._id), RoomBattle.CHALLENGE_EXPIRY_SECONDS * 1000);
                pendingChallengeTimers.set(battle._id.toString(), timer);

                socket.emit('pk-challenge-sent', { battleId: battle._id.toString(), targetRoomName: targetRoom.name });

                if (targetRoom.host.socketId) {
                    io.to(targetRoom.host.socketId).emit('pk-challenge-received', {
                        battleId: battle._id.toString(),
                        challengerRoomId: myRoom._id.toString(),
                        challengerRoomName: myRoom.name,
                        challengerRoomCover: myRoom.coverImage,
                        durationSeconds: duration,
                        expiresInSeconds: RoomBattle.CHALLENGE_EXPIRY_SECONDS
                    });
                }
            } catch (error) {
                console.error('[PK BATTLE] Challenge error:', error);
            }
        });

        socket.on('pk-challenge-response', async ({ battleId, accept }) => {
            try {
                const battle = await RoomBattle.findOne({ _id: battleId, status: 'pending' });
                if (!battle) return;

                // 🛡️ الرد لا يصح إلا من مضيف الغرفة المتحدّاة (roomB) تحديداً
                const roomB = await VoiceRoom.findById(battle.roomB).select('host');
                if (!roomB || !roomB.host || roomB.host.toString() !== socket.user._id.toString()) {
                    return socket.emit('seat-error', 'ليس لديك تحدٍ بانتظار ردك');
                }

                clearBattleTimer(pendingChallengeTimers, battle._id);

                if (!accept) {
                    battle.status = 'declined';
                    await battle.save();
                    io.to(`room-chat-${battle.roomA}`).emit('pk-challenge-declined', { battleId: battle._id.toString(), roomB: battle.roomB.toString() });
                    return;
                }

                await activateBattle(io, battle);
            } catch (error) {
                console.error('[PK BATTLE] Response error:', error);
            }
        });

        // ✅ إلغاء تحدٍ معلّق أرسله المضيف نفسه قبل أي رد
        socket.on('pk-cancel-challenge', async ({ battleId }) => {
            try {
                const battle = await RoomBattle.findOne({ _id: battleId, status: 'pending', challengedBy: socket.user._id });
                if (!battle) return;
                clearBattleTimer(pendingChallengeTimers, battle._id);
                battle.status = 'cancelled';
                await battle.save();
                io.to(`room-chat-${battle.roomB}`).emit('pk-challenge-expired', { battleId: battle._id.toString(), roomB: battle.roomB.toString() });
            } catch (error) {
                console.error('[PK BATTLE] Cancel error:', error);
            }
        });

        // =====================================================
        // ✅ دردشة خاصة بكل غرفة (بديل الدردشة العامة القديمة)
        // -----------------------------------------------------
        // كل غرفة قناة Socket.IO منفصلة فعلياً (join/leave حقيقيين) — الرسائل توصل فقط
        // لمن هو داخل نفس الغرفة حالياً، وسقف 50 رسالة لكل غرفة على حدة (وليس عالمياً).
        // =====================================================
        socket.on('join-room-chat', async ({ roomId }) => {
            if (!roomId) return;

            // ✅ إعلان "انضم فلان" فور دخول الغرفة (مشاهداً، قبل أي طلب صعود) — نُحدّد هل
            // هذا انضمام حقيقي جديد أم مجرد تبويب/جهاز إضافي لنفس الشخص أصلاً موجود، عبر
            // فحص عضوية القناة الحالية قبل انضمام هذا السوكيت نفسه (بلا أي تخزين إضافي)
            const alreadyViewing = roomId !== 'main' && getRoomViewers(io, roomId).some(v => v.id === socket.user.id.toString());

            socket.join(`room-chat-${roomId}`);
            const musicState = roomMusicState.get(roomId);
            if (musicState) socket.emit('room-music-state', musicState); // ✅ مزامنة فورية لمن ينضم متأخراً
            broadcastRoomViewerCount(io, roomId);

            if (roomId !== 'main' && !alreadyViewing) {
                try {
                    const room = await VoiceRoom.resolveRoom(roomId);
                    // ✅ لا نُعلن دخول المضيف نفسه لغرفته — وجوده مثبَّت أصلاً بالمقعد الأول
                    if (room && room.host?.toString() !== socket.user._id.toString()) {
                        socket.to(`room-chat-${roomId}`).emit('user-entered-room', {
                            roomId,
                            userId: socket.user._id.toString(),
                            username: socket.user.username,
                            profileImage: socket.user.profileImage
                        });
                    }
                } catch (error) {
                    console.error('[ROOM CHAT] user-entered-room error:', error);
                }
            }
        });

        socket.on('leave-room-chat', ({ roomId }) => {
            if (!roomId) return;
            socket.leave(`room-chat-${roomId}`);
            broadcastRoomViewerCount(io, roomId);
        });

        // ✅ القائمة الكاملة الحيّة لمن يشاهد الغرفة الآن (مأخوذة من عضوية قناة السوكيت نفسها،
        // بلا حاجة لتخزين إضافي بقاعدة البيانات — نفس مصدر عدّاد المشاهدين تماماً)
        socket.on('get-room-viewers', ({ roomId }) => {
            if (!roomId) return;
            socket.emit('room-viewers-list', { roomId, viewers: getRoomViewers(io, roomId) });
        });

        socket.on('send-room-message', async ({ roomId, message }) => {
            try {
                if (!roomId || !message || !message.trim() || message.length > 300) return;

                // 🛡️ دردشة مقفلة من المضيف/المسؤولين — يبقى مسموحاً لهم هم فقط الكتابة
                if (roomId !== 'main') {
                    const roomCheck = await VoiceRoom.resolveRoom(roomId);
                    if (roomCheck?.chatLocked && !roomCheck.canModerate(socket.user._id)) {
                        socket.emit('room-chat-error', 'الدردشة مقفلة حالياً من المضيف');
                        return;
                    }
                }

                // 🛡️ محدد معدل بسيط: رسالة واحدة كل ثانيتين لكل مستخدم — يمنع إغراق دردشة الغرفة
                const rlKey = socket.user._id.toString();
                const now = Date.now();
                const lastSent = roomChatRateLimit.get(rlKey) || 0;
                if (now - lastSent < 2000) return;
                roomChatRateLimit.set(rlKey, now);

                // 🛡️ فلترة الكلمات المسيئة — تُرفض الرسالة كاملة ولا تُحفظ ولا تُبث لأحد
                const { containsProfanity } = require('../utils/profanityFilter');
                if (containsProfanity(message)) {
                    socket.emit('room-chat-error', 'رسالتك تحتوي على ألفاظ غير لائقة ولم يتم إرسالها');
                    return;
                }

                const channel = `room-chat-${roomId}`;

                const newMessage = await Message.create({
                    content: message.trim(),
                    sender: socket.user.id,
                    room: channel
                });
                const populatedMessage = await Message.findById(newMessage._id)
                    .populate('sender', 'username profileImage activeFrameClass activeBubbleSkinClass');
                if (!populatedMessage) return;

                const roomSockets = io.sockets.adapter.rooms.get(channel);
                if (!roomSockets) return;
                const senderId = socket.user.id.toString();

                for (const socketId of roomSockets) {
                    const receiverSocket = io.sockets.sockets.get(socketId);
                    if (!receiverSocket || !receiverSocket.user) continue;
                    const receiverId = receiverSocket.user.id.toString();
                    const isBlocked = await checkIfBlocked(senderId, receiverId);
                    if (!isBlocked) {
                        receiverSocket.emit('new-room-message', { roomId, message: populatedMessage.toObject() });
                    }
                }

                // ✅ سقف 50 رسالة لهذي الغرفة تحديداً — يحذف الأقدم تلقائياً (نفس مبدأ الدردشة العامة القديمة)
                const fiftiethMessage = await Message.findOne({ room: channel }).sort({ createdAt: -1 }).skip(49);
                if (fiftiethMessage) {
                    const result = await Message.deleteMany({ room: channel, createdAt: { $lt: fiftiethMessage.createdAt } });
                    if (result.deletedCount > 0) {
                        io.to(channel).emit('room-chat-cleanup', { roomId });
                    }
                }
            } catch (error) {
                console.error('[ROOM CHAT] Send error:', error);
            }
        });

        // ✅ تنظيف دردشة الغرفة بالكامل — المضيف/المسؤولون فقط
        socket.on('host-clear-room-chat', async ({ roomId }) => {
            try {
                if (!roomId || roomId === 'main') return;
                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room || !room.canModerate(socket.user._id)) return;

                await Message.deleteMany({ room: `room-chat-${roomId}` });
                io.to(`room-chat-${roomId}`).emit('room-chat-cleared', { roomId });
            } catch (error) {
                console.error('[ROOM CHAT] Clear error:', error);
            }
        });

        // ✅ قفل/فتح إمكانية الكتابة بدردشة الغرفة — المضيف/المسؤولون فقط، ويبقون هم قادرين
        // على الكتابة أثناء القفل (تحقّق send-room-message من هذا صراحة)
        socket.on('host-toggle-chat-lock', async ({ roomId }) => {
            try {
                if (!roomId || roomId === 'main') return;
                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room || !room.canModerate(socket.user._id)) return;

                room.chatLocked = !room.chatLocked;
                await room.save();
                io.to(`room-chat-${roomId}`).emit('room-chat-lock-updated', { roomId, locked: room.chatLocked });
            } catch (error) {
                console.error('[ROOM CHAT] Toggle lock error:', error);
            }
        });

        // ✅ إيموجي تفاعل متحرك فوق صورة مقعد — بث لحظي بدون تخزين بقاعدة البيانات (مجرد تأثير بصري عابر)
        socket.on('send-seat-reaction', async ({ roomId, seatNumber, emoji }) => {
            const allowedEmojis = ['❤️', '😂', '👏', '🔥', '😍', '👍', '🎉', '😮'];
            if (!roomId || !allowedEmojis.includes(emoji)) return;

            // 🛡️ تحقق فعلي إن هذا المستخدم جالس بالضبط على هذا المقعد بهذي الغرفة —
            // التفاعل مسموح فقط على النفس، ولا يكفي الاعتماد على إخفاء الزر بالواجهة
            const VoiceRoom = require('../models/VoiceRoom');
            const room = await VoiceRoom.resolveRoom(roomId);
            if (!room) return;
            const seat = room.seats.find(s => s.seatNumber === parseInt(seatNumber));
            if (!seat || !seat.user || seat.user.toString() !== socket.user._id.toString()) return;

            // 🛡️ محدد معدل بسيط: تفاعل واحد كل ثانية لكل مستخدم
            const rlKey = `reaction-${socket.user._id}`;
            const now = Date.now();
            const lastSent = roomChatRateLimit.get(rlKey) || 0;
            if (now - lastSent < 1000) return;
            roomChatRateLimit.set(rlKey, now);

            io.emit('seat-reaction-played', { roomId, seatNumber: parseInt(seatNumber), emoji });
        });

        // =====================================================
        // ✅ تفاعل بين شخصين جالسين (قبلة/عناق...) — يظهر تأثير بصري متصل حول مقعديهما معاً.
        // يتطلب أن يكون المُرسل والمستلم جالسين فعلياً بنفس الغرفة (مقعدان مختلفان)؛ أي شخص
        // آخر جالس بمقعد ثالث لا يتأثر إطلاقاً — التأثير مرتبط برقمي المقعدين المحدَّدين فقط
        // =====================================================
        socket.on('send-seat-pair-reaction', async ({ roomId, targetUserId, emoji }) => {
            try {
                const PAIR_REACTIONS = ['💋', '🤗', '🖐️', '❤️', '🌹'];
                if (!roomId || !targetUserId || !PAIR_REACTIONS.includes(emoji)) return;
                if (targetUserId === socket.user._id.toString()) return; // 🛡️ لا تفاعل مع النفس

                const VoiceRoom = require('../models/VoiceRoom');
                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room) return;

                // 🛡️ كلاهما لازم يكون جالساً فعلياً بنفس الغرفة حالياً — لا تفاعل مع مشاهد واقف
                const fromSeat = room.seats.find(s => s.user && s.user.toString() === socket.user._id.toString());
                const toSeat = room.seats.find(s => s.user && s.user.toString() === targetUserId);
                if (!fromSeat || !toSeat) return;

                // 🛡️ محدد معدل: تفاعل واحد كل ثانيتين لكل مُرسل
                const rlKey = `pair-reaction-${socket.user._id}`;
                const now = Date.now();
                const lastSent = roomChatRateLimit.get(rlKey) || 0;
                if (now - lastSent < 2000) return;
                roomChatRateLimit.set(rlKey, now);

                io.to(`room-chat-${roomId}`).emit('seat-pair-reaction-played', {
                    roomId,
                    fromSeat: fromSeat.seatNumber,
                    toSeat: toSeat.seatNumber,
                    emoji
                });
            } catch (error) {
                console.error('[SEAT PAIR REACTION] Error:', error);
            }
        });

        // ✅ عداد الدعم أسفل المقعد — إشارة عرض بصري فقط (الدفع الفعلي تم أصلاً عبر REST /api/gifts/send)
        socket.on('room-gift-support', ({ roomId, seatNumber, value }) => {
            const numValue = Number(value);
            if (!roomId || !Number.isFinite(numValue) || numValue <= 0) return;
            const safeValue = Math.min(numValue, 100000); // 🛡️ سقف معقول يمنع تضخيم العداد بقيم وهمية
            io.emit('room-support-updated', { roomId, seatNumber: parseInt(seatNumber), value: safeValue });
        });

        // =====================================================
        // ✅ مشغّل موسيقى الغرفة — المضيف/المسؤولون فقط يتحكمون، الجميع يسمع نفس المسار متزامناً
        // =====================================================
        socket.on('room-music-play', async ({ roomId, url, title }) => {
            try {
                const VoiceRoom = require('../models/VoiceRoom');
                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room) return socket.emit('room-music-error', 'الغرفة غير موجودة');
                if (!room.canModerate(socket.user._id)) return socket.emit('room-music-error', 'لا تملك صلاحية التحكّم بموسيقى هذي الغرفة');
                if (!url) return socket.emit('room-music-error', 'رابط الأغنية غير صالح');

                const state = { roomId, url, title: title || 'أغنية', startedAt: Date.now(), isPlaying: true, pausedAt: 0 };
                roomMusicState.set(roomId, state);
                io.to(`room-chat-${roomId}`).emit('room-music-state', state);
            } catch (error) {
                console.error('[MUSIC] room-music-play error:', error);
                socket.emit('room-music-error', 'تعذّر تشغيل الأغنية');
            }
        });

        socket.on('room-music-pause', async ({ roomId }) => {
            try {
                const VoiceRoom = require('../models/VoiceRoom');
                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room) return socket.emit('room-music-error', 'الغرفة غير موجودة');
                if (!room.canModerate(socket.user._id)) return socket.emit('room-music-error', 'لا تملك صلاحية التحكّم بموسيقى هذي الغرفة');

                const state = roomMusicState.get(roomId);
                if (!state || !state.isPlaying) return;
                // 🐛 إصلاح: كانت += تجمع فوق pausedAt القديمة، لكن startedAt (مضبوطة عند آخر
                // استئناف بمعادلة now - pausedAt*1000) تتضمنها أصلاً ضمنياً — فـ (الآن - startedAt)
                // تساوي بمفردها موضع التشغيل الحقيقي كاملاً. الجمع كان يُضاعف pausedAt في كل
                // دورة إيقاف/استئناف، فتقفز الأغنية للأمام تراكمياً مع كل تكرار
                state.pausedAt = (Date.now() - state.startedAt) / 1000;
                state.isPlaying = false;
                io.to(`room-chat-${roomId}`).emit('room-music-state', state);
            } catch (error) {
                console.error('[MUSIC] room-music-pause error:', error);
                socket.emit('room-music-error', 'تعذّر إيقاف الأغنية مؤقتاً');
            }
        });

        socket.on('room-music-resume', async ({ roomId }) => {
            try {
                const VoiceRoom = require('../models/VoiceRoom');
                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room) return socket.emit('room-music-error', 'الغرفة غير موجودة');
                if (!room.canModerate(socket.user._id)) return socket.emit('room-music-error', 'لا تملك صلاحية التحكّم بموسيقى هذي الغرفة');

                const state = roomMusicState.get(roomId);
                if (!state || state.isPlaying) return;
                state.startedAt = Date.now() - state.pausedAt * 1000;
                state.isPlaying = true;
                io.to(`room-chat-${roomId}`).emit('room-music-state', state);
            } catch (error) {
                console.error('[MUSIC] room-music-resume error:', error);
                socket.emit('room-music-error', 'تعذّر استئناف الأغنية');
            }
        });

        socket.on('room-music-stop', async ({ roomId }) => {
            try {
                const VoiceRoom = require('../models/VoiceRoom');
                const room = await VoiceRoom.resolveRoom(roomId);
                if (!room) return socket.emit('room-music-error', 'الغرفة غير موجودة');
                if (!room.canModerate(socket.user._id)) return socket.emit('room-music-error', 'لا تملك صلاحية التحكّم بموسيقى هذي الغرفة');

                roomMusicState.delete(roomId);
                io.to(`room-chat-${roomId}`).emit('room-music-state', null);
            } catch (error) {
                console.error('[MUSIC] room-music-stop error:', error);
                socket.emit('room-music-error', 'تعذّر إيقاف الأغنية');
            }
        });

        // ✅ "disconnecting" (وليس "disconnect") لأن socket.rooms ما زالت ممتلئة هنا — بعدها
        // مباشرة يغادرها Socket.IO تلقائياً قبل إطلاق حدث disconnect، فيفوتنا تحديث العدّاد
        socket.on('disconnecting', () => {
            for (const room of socket.rooms) {
                if (room.startsWith('room-chat-')) {
                    const roomId = room.slice('room-chat-'.length);
                    setImmediate(() => broadcastRoomViewerCount(io, roomId)); // ✅ بعد مغادرته فعلياً من القناة
                }
            }
        });

        socket.on('disconnect', async () => {
            console.log(`🔴 User disconnected: ${socket.id} | UserID: ${socket.user.username}`);
            try {
                await User.findByIdAndUpdate(socket.user.id, { isOnline: false, lastActive: new Date() });
                io.emit('userOnlineStatus', { userId: socket.user.id.toString(), isOnline: false, lastActive: new Date() });

                // ✅ لو كان مضيف غرفة مباشرة حالياً، لا نُنهي بثّه فوراً — مهلة سماح قصيرة تحسّباً
                // لانقطاع عابر (قفل شاشة الهاتف، تبديل شبكة) يعود بعدها المضيف خلال ثوانٍ فعلياً
                scheduleBroadcastEndAfterDisconnect(io, socket.user);

                // ✅ تحرير المقعد الصوتي دائماً بالاعتماد على قاعدة البيانات وحدها، وضمن نفس القفل
                // التسلسلي حتى لا يتصادم مع طلب انضمام/مغادرة وصل بنفس اللحظة تقريباً
                await withUserSeatLock(socket.user._id, async () => {
                    const VoiceRoom = require('../models/VoiceRoom');
                    const released = await VoiceRoom.releaseUserSeatEverywhere(socket.user._id) || [];
                    released.forEach(r => {
                        io.emit('user-left-seat', { roomId: r.roomId, seatNumber: r.seatNumber, userId: socket.user.id.toString() });
                    });
                });
            } catch (error) { console.error('Failed to update offline status:', error); }
        });
    });

    return io;
};



module.exports = initializeSocket;
