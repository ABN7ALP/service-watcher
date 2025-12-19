const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Create new battle
router.post('/create', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const { type, betAmount, isPrivate = false, password = null } = req.body;
        
        // Validate battle type
        const validTypes = ['1v1', '2v2', '4v4'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'نوع التحدي غير صالح'
            });
        }
        
        // Validate bet amount
        if (betAmount < 1 || betAmount > 1000) {
            return res.status(400).json({
                success: false,
                message: 'مبلغ الرهان يجب أن يكون بين 1 و 1000 دولار'
            });
        }
        
        const User = require('../models/User');
        const Battle = require('../models/Battle');
        const Transaction = require('../models/Transaction');
        
        // Check user balance
        const user = await User.findById(userId);
        if (user.balance < betAmount) {
            return res.status(400).json({
                success: false,
                message: 'رصيدك غير كافي'
            });
        }
        
        // Deduct bet amount
        user.balance -= betAmount;
        await user.save();
        
        // Create transaction record
        await Transaction.create({
            user: userId,
            type: 'bet',
            amount: betAmount * -1,
            currency: 'USD',
            status: 'completed',
            description: `رهان تحدى ${type}`
        });
        
        // Create battle
        const battle = new Battle({
            type,
            teamA: [{ user: userId, betAmount }],
            totalPrize: betAmount * 2 * 0.9, // 1.8x return (10% commission)
            chatRoom: `battle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            isPublic: !isPrivate,
            password: isPrivate ? password : null
        });
        
        await battle.save();
        
        res.json({
            success: true,
            message: 'تم إنشاء التحدي بنجاح',
            battle: {
                id: battle._id,
                type: battle.type,
                chatRoom: battle.chatRoom,
                currentPlayers: 1,
                requiredPlayers: getRequiredPlayers(type),
                betAmount,
                totalPrize: battle.totalPrize
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Join battle
router.post('/:id/join', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const { id: battleId } = req.params;
        const { password } = req.body;
        
        const Battle = require('../models/Battle');
        const User = require('../models/User');
        const Transaction = require('../models/Transaction');
        
        const battle = await Battle.findById(battleId);
        if (!battle) {
            return res.status(404).json({
                success: false,
                message: 'التحدي غير موجود'
            });
        }
        
        // Check if battle is already full or started
        if (battle.status !== 'waiting') {
            return res.status(400).json({
                success: false,
                message: 'لا يمكن الانضمام لهذا التحدي'
            });
        }
        
        // Check if user is already in battle
        const allPlayers = [...battle.teamA, ...battle.teamB];
        if (allPlayers.some(player => player.user.toString() === userId)) {
            return res.status(400).json({
                success: false,
                message: 'أنت بالفعل في هذا التحدي'
            });
        }
        
        // Check password for private battles
        if (!battle.isPublic && battle.password !== password) {
            return res.status(401).json({
                success: false,
                message: 'كلمة المرور غير صحيحة'
            });
        }
        
        // Get required bet amount
        const requiredBet = battle.teamA[0].betAmount;
        
        // Check user balance
        const user = await User.findById(userId);
        if (user.balance < requiredBet) {
            return res.status(400).json({
                success: false,
                message: 'رصيدك غير كافي'
            });
        }
        
        // Check if battle is full
        const maxPlayers = getMaxPlayers(battle.type);
        const currentPlayers = battle.teamA.length + battle.teamB.length;
        
        if (currentPlayers >= maxPlayers) {
            return res.status(400).json({
                success: false,
                message: 'التحدي ممتلئ'
            });
        }
        
        // Deduct bet amount
        user.balance -= requiredBet;
        await user.save();
        
        // Create transaction record
        await Transaction.create({
            user: userId,
            type: 'bet',
            amount: requiredBet * -1,
            currency: 'USD',
            status: 'completed',
            description: `رهان تحدى ${battle.type}`,
            battle: battleId
        });
        
        // Add user to appropriate team (alternating)
        if (battle.teamA.length <= battle.teamB.length) {
            battle.teamA.push({ user: userId, betAmount: requiredBet });
        } else {
            battle.teamB.push({ user: userId, betAmount: requiredBet });
        }
        
        // Update total prize
        const newPlayerCount = currentPlayers + 1;
        battle.totalPrize = newPlayerCount * requiredBet * 0.9;
        
        // Check if battle is now ready
        if (newPlayerCount === maxPlayers) {
            battle.status = 'ready';
        }
        
        await battle.save();
        
        res.json({
            success: true,
            message: 'تم الانضمام للتحدي بنجاح',
            battle: {
                id: battle._id,
                type: battle.type,
                chatRoom: battle.chatRoom,
                team: battle.teamA.length > battle.teamB.length ? 'A' : 'B',
                currentPlayers: newPlayerCount,
                requiredPlayers: maxPlayers,
                betAmount: requiredBet,
                totalPrize: battle.totalPrize
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Leave battle
router.post('/:id/leave', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const { id: battleId } = req.params;
        
        const Battle = require('../models/Battle');
        const User = require('../models/User');
        const Transaction = require('../models/Transaction');
        
        const battle = await Battle.findById(battleId);
        if (!battle) {
            return res.status(404).json({
                success: false,
                message: 'التحدي غير موجود'
            });
        }
        
        // Only allow leaving if battle is still waiting
        if (battle.status !== 'waiting') {
            return res.status(400).json({
                success: false,
                message: 'لا يمكن ترك التحدي بعد بدئه'
            });
        }
        
        // Find user in battle
        const allPlayers = [...battle.teamA, ...battle.teamB];
        const playerIndex = allPlayers.findIndex(p => p.user.toString() === userId);
        
        if (playerIndex === -1) {
            return res.status(400).json({
                success: false,
                message: 'أنت لست في هذا التحدي'
            });
        }
        
        // Get user's bet amount
        const player = allPlayers[playerIndex];
        
        // Refund user
        const user = await User.findById(userId);
        user.balance += player.betAmount;
        await user.save();
        
        // Create refund transaction
        await Transaction.create({
            user: userId,
            type: 'bet',
            amount: player.betAmount,
            currency: 'USD',
            status: 'completed',
            description: `استرداد رهان تحدى ${battle.type}`,
            battle: battleId
        });
        
        // Remove user from battle
        if (playerIndex < battle.teamA.length) {
            battle.teamA.splice(playerIndex, 1);
        } else {
            battle.teamB.splice(playerIndex - battle.teamA.length, 1);
        }
        
        // Update battle status
        const remainingPlayers = battle.teamA.length + battle.teamB.length;
        
        if (remainingPlayers === 0) {
            battle.status = 'cancelled';
        } else if (remainingPlayers === 1) {
            // If only one player remains, refund them too
            const remainingPlayer = battle.teamA[0] || battle.teamB[0];
            if (remainingPlayer) {
                const remainingUser = await User.findById(remainingPlayer.user);
                remainingUser.balance += remainingPlayer.betAmount;
                await remainingUser.save();
                
                await Transaction.create({
                    user: remainingPlayer.user,
                    type: 'bet',
                    amount: remainingPlayer.betAmount,
                    currency: 'USD',
                    status: 'completed',
                    description: `استرداد رهان تحدى ${battle.type} (ملغي)`,
                    battle: battleId
                });
                
                battle.status = 'cancelled';
            }
        } else {
            // Update prize pool for remaining players
            battle.totalPrize = remainingPlayers * battle.teamA[0]?.betAmount * 0.9;
        }
        
        await battle.save();
        
        res.json({
            success: true,
            message: 'تم ترك التحدي بنجاح',
            refundedAmount: player.betAmount
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get active battles
router.get('/active', auth, async (req, res) => {
    try {
        const { type, page = 1, limit = 20 } = req.query;
        
        const Battle = require('../models/Battle');
        
        const query = { 
            status: { $in: ['waiting', 'ready'] },
            isPublic: true
        };
        
        if (type) query.type = type;
        
        const battles = await Battle.find(query)
            .populate('teamA.user', 'username profileImage level')
            .populate('teamB.user', 'username profileImage level')
            .sort('-createdAt')
            .limit(limit * 1)
            .skip((page - 1) * limit);
            
        const total = await Battle.countDocuments(query);
        
        // Format response
        const formattedBattles = battles.map(battle => {
            const currentPlayers = battle.teamA.length + battle.teamB.length;
            const maxPlayers = getMaxPlayers(battle.type);
            
            return {
                id: battle._id,
                type: battle.type,
                betAmount: battle.teamA[0]?.betAmount || 0,
                currentPlayers,
                maxPlayers,
                playersNeeded: maxPlayers - currentPlayers,
                totalPrize: battle.totalPrize,
                status: battle.status,
                createdAt: battle.createdAt,
                teamA: battle.teamA.map(p => ({
                    user: p.user,
                    ready: p.ready
                })),
                teamB: battle.teamB.map(p => ({
                    user: p.user,
                    ready: p.ready
                })),
                isPrivate: !battle.isPublic,
                hasPassword: !!battle.password
            };
        });
        
        res.json({
            success: true,
            battles: formattedBattles,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get battle details
router.get('/:id', auth, async (req, res) => {
    try {
        const { id: battleId } = req.params;
        
        const Battle = require('../models/Battle');
        
        const battle = await Battle.findById(battleId)
            .populate('teamA.user', 'username profileImage level totalWon totalLost')
            .populate('teamB.user', 'username profileImage level totalWon totalLost')
            .populate('spectators', 'username profileImage');
        
        if (!battle) {
            return res.status(404).json({
                success: false,
                message: 'التحدي غير موجود'
            });
        }
        
        // Check if user can view private battle
        const { userId } = req.user;
        const allPlayers = [...battle.teamA, ...battle.teamB];
        const isParticipant = allPlayers.some(p => p.user._id.toString() === userId);
        const isSpectator = battle.spectators.some(s => s._id.toString() === userId);
        
        if (!battle.isPublic && !isParticipant && !isSpectator) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لعرض هذا التحدي'
            });
        }
        
        res.json({
            success: true,
            battle: {
                id: battle._id,
                type: battle.type,
                status: battle.status,
                teamA: battle.teamA,
                teamB: battle.teamB,
                totalPrize: battle.totalPrize,
                winner: battle.winner,
                startTime: battle.startTime,
                endTime: battle.endTime,
                chatRoom: battle.chatRoom,
                spectators: battle.spectators.length,
                isPublic: battle.isPublic,
                createdAt: battle.createdAt
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Mark player as ready
router.post('/:id/ready', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const { id: battleId } = req.params;
        
        const Battle = require('../models/Battle');
        
        const battle = await Battle.findById(battleId);
        if (!battle) {
            return res.status(404).json({
                success: false,
                message: 'التحدي غير موجود'
            });
        }
        
        // Check if user is in battle
        const allPlayers = [...battle.teamA, ...battle.teamB];
        const playerIndex = allPlayers.findIndex(p => p.user.toString() === userId);
        
        if (playerIndex === -1) {
            return res.status(400).json({
                success: false,
                message: 'أنت لست في هذا التحدي'
            });
        }
        
        // Mark as ready
        if (playerIndex < battle.teamA.length) {
            battle.teamA[playerIndex].ready = true;
        } else {
            battle.teamB[playerIndex - battle.teamA.length].ready = true;
        }
        
        await battle.save();
        
        // Check if all players are ready
        const allReady = allPlayers.every(p => p.ready);
        const maxPlayers = getMaxPlayers(battle.type);
        const currentPlayers = allPlayers.length;
        
        if (allReady && currentPlayers === maxPlayers) {
            battle.status = 'in_progress';
            battle.startTime = new Date();
            await battle.save();
        }
        
        res.json({
            success: true,
            message: 'تم التحديد كجاهز',
            allReady,
            battleStatus: battle.status
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Submit battle result (for testing/development)
router.post('/:id/result', auth, async (req, res) => {
    try {
        const { id: battleId } = req.params;
        const { winner } = req.body;
        const { userId } = req.user;
        
        // Check if user is admin
        const User = require('../models/User');
        const user = await User.findById(userId);
        
        if (!user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'صلاحيات غير كافية'
            });
        }
        
        const Battle = require('../models/Battle');
        const battle = await Battle.findById(battleId);
        
        if (!battle) {
            return res.status(404).json({
                success: false,
                message: 'التحدي غير موجود'
            });
        }
        
        if (battle.status !== 'in_progress') {
            return res.status(400).json({
                success: false,
                message: 'التحدي ليس قيد التنفيذ'
            });
        }
        
        // Update battle result
        battle.winner = winner;
        battle.status = 'completed';
        battle.endTime = new Date();
        
        await battle.save();
        
        // Distribute prizes (this would be handled by sockets in production)
        
        res.json({
            success: true,
            message: 'تم تحديث نتيجة التحدي',
            battle: {
                id: battle._id,
                winner: battle.winner,
                status: battle.status,
                endTime: battle.endTime
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get user battle history
router.get('/user/history', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const { page = 1, limit = 20, status } = req.query;
        
        const Battle = require('../models/Battle');
        
        const query = {
            $or: [
                { 'teamA.user': userId },
                { 'teamB.user': userId }
            ]
        };
        
        if (status) query.status = status;
        
        const battles = await Battle.find(query)
            .populate('teamA.user', 'username profileImage')
            .populate('teamB.user', 'username profileImage')
            .sort('-createdAt')
            .limit(limit * 1)
            .skip((page - 1) * limit);
            
        const total = await Battle.countDocuments(query);
        
        // Format battles for response
        const formattedBattles = battles.map(battle => {
            const allPlayers = [...battle.teamA, ...battle.teamB];
            const userPlayer = allPlayers.find(p => p.user._id.toString() === userId);
            const userTeam = battle.teamA.some(p => p.user._id.toString() === userId) ? 'A' : 'B';
            
            let result = 'pending';
            if (battle.status === 'completed') {
                if (!battle.winner) {
                    result = 'draw';
                } else if (battle.winner === userTeam) {
                    result = 'win';
                } else {
                    result = 'loss';
                }
            }
            
            return {
                id: battle._id,
                type: battle.type,
                betAmount: userPlayer?.betAmount || 0,
                result,
                status: battle.status,
                winner: battle.winner,
                startTime: battle.startTime,
                endTime: battle.endTime,
                totalPrize: battle.totalPrize,
                teamSize: getMaxPlayers(battle.type) / 2,
                opponent: allPlayers
                    .filter(p => p.user._id.toString() !== userId)
                    .map(p => p.user.username)
                    .join(', '),
                createdAt: battle.createdAt
            };
        });
        
        // Calculate stats
        const totalBattles = await Battle.countDocuments({
            $or: [
                { 'teamA.user': userId },
                { 'teamB.user': userId }
            ],
            status: 'completed'
        });
        
        const wins = await Battle.countDocuments({
            $or: [
                { winner: 'teamA', 'teamA.user': userId },
                { winner: 'teamB', 'teamB.user': userId }
            ],
            status: 'completed'
        });
        
        const losses = totalBattles - wins;
        
        res.json({
            success: true,
            battles: formattedBattles,
            stats: {
                totalBattles,
                wins,
                losses,
                winRate: totalBattles > 0 ? (wins / totalBattles * 100).toFixed(1) : 0
            },
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Helper functions
function getRequiredPlayers(type) {
    const players = {
        '1v1': 2,
        '2v2': 4,
        '4v4': 8
    };
    return players[type] || 2;
}

function getMaxPlayers(type) {
    return getRequiredPlayers(type);
}

module.exports = router;
