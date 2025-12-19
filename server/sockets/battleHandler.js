module.exports = (socket, io) => {
  const activeBattles = new Map();

  // Create new battle
  socket.on('create-battle', async (data) => {
    try {
      const { type, betAmount, userId, isPrivate = false, password = null } = data;
      
      const Battle = require('../models/Battle');
      const User = require('../models/User');

      // Check user balance
      const user = await User.findById(userId);
      if (user.balance < betAmount) {
        socket.emit('battle-error', 'رصيدك غير كافي');
        return;
      }

      // Deduct bet amount
      user.balance -= betAmount;
      await user.save();

      // Create battle
      const battle = new Battle({
        type,
        teamA: [{ user: userId, betAmount }],
        totalPrize: betAmount * 2 * 0.9, // 1.8x return (10% commission)
        chatRoom: `battle-${Date.now()}`,
        isPublic: !isPrivate,
        password
      });

      await battle.save();

      // Add to active battles
      activeBattles.set(battle._id.toString(), {
        battle,
        sockets: new Set([socket.id])
      });

      // Join battle room
      socket.join(battle.chatRoom);
      socket.battleId = battle._id;

      // Broadcast new battle
      io.emit('new-battle-created', {
        battleId: battle._id,
        type,
        betAmount,
        creator: userId,
        currentPlayers: 1,
        requiredPlayers: getRequiredPlayers(type)
      });

      socket.emit('battle-created', {
        battleId: battle._id,
        chatRoom: battle.chatRoom
      });

    } catch (error) {
      console.error('Create battle error:', error);
      socket.emit('battle-error', 'فشل إنشاء التحدي');
    }
  });

  // Join battle
  socket.on('join-battle', async (data) => {
    try {
      const { battleId, userId, password } = data;
      
      const Battle = require('../models/Battle');
      const User = require('../models/User');

      const battle = await Battle.findById(battleId);
      if (!battle) {
        socket.emit('battle-error', 'التحدي غير موجود');
        return;
      }

      // Check if battle is full
      const totalPlayers = battle.teamA.length + battle.teamB.length;
      const maxPlayers = getMaxPlayers(battle.type);
      
      if (totalPlayers >= maxPlayers) {
        socket.emit('battle-error', 'التحدي ممتلئ');
        return;
      }

      // Check password for private battles
      if (!battle.isPublic && battle.password !== password) {
        socket.emit('battle-error', 'كلمة المرور غير صحيحة');
        return;
      }

      // Check user balance
      const user = await User.findById(userId);
      const requiredBet = battle.teamA[0].betAmount;
      
      if (user.balance < requiredBet) {
        socket.emit('battle-error', 'رصيدك غير كافي');
        return;
      }

      // Deduct bet amount
      user.balance -= requiredBet;
      await user.save();

      // Add to team (alternating between teams)
      if (battle.teamA.length <= battle.teamB.length) {
        battle.teamA.push({ user: userId, betAmount: requiredBet });
      } else {
        battle.teamB.push({ user: userId, betAmount: requiredBet });
      }

      // Update total prize
      battle.totalPrize = (totalPlayers + 1) * requiredBet * 0.9;

      await battle.save();

      // Join battle room
      socket.join(battle.chatRoom);
      socket.battleId = battleId;

      // Update active battles
      if (activeBattles.has(battleId)) {
        activeBattles.get(battleId).sockets.add(socket.id);
      }

      // Notify all in battle
      io.to(battle.chatRoom).emit('player-joined', {
        userId,
        team: battle.teamA.length > battle.teamB.length ? 'A' : 'B',
        currentPlayers: totalPlayers + 1
      });

      // Update battle list
      io.emit('battle-updated', {
        battleId,
        currentPlayers: totalPlayers + 1
      });

      // Check if battle is ready to start
      if (totalPlayers + 1 === maxPlayers) {
        setTimeout(() => startBattle(battleId, io), 3000);
      }

    } catch (error) {
      console.error('Join battle error:', error);
      socket.emit('battle-error', 'فشل الانضمام للتحدي');
    }
  });

  // Leave battle
  socket.on('leave-battle', async ({ battleId, userId }) => {
    try {
      const Battle = require('../models/Battle');
      const battle = await Battle.findById(battleId);
      
      if (battle && battle.status === 'waiting') {
        // Refund user
        const User = require('../models/User');
        const user = await User.findById(userId);
        
        // Find user's bet
        const allPlayers = [...battle.teamA, ...battle.teamB];
        const player = allPlayers.find(p => p.user.toString() === userId);
        
        if (player && user) {
          user.balance += player.bAmount;
          await user.save();
        }

        // Remove from battle
        battle.teamA = battle.teamA.filter(p => p.user.toString() !== userId);
        battle.teamB = battle.teamB.filter(p => p.user.toString() !== userId);
        
        // Update prize
        const totalPlayers = battle.teamA.length + battle.teamB.length;
        if (totalPlayers > 0) {
          battle.totalPrize = totalPlayers * battle.teamA[0]?.betAmount * 0.9;
        } else {
          battle.status = 'cancelled';
        }
        
        await battle.save();

        // Leave room
        socket.leave(battle.chatRoom);
        socket.battleId = null;

        // Notify others
        io.to(battle.chatRoom).emit('player-left', { userId });
        io.emit('battle-updated', {
          battleId,
          currentPlayers: totalPlayers
        });
      }
    } catch (error) {
      console.error('Leave battle error:', error);
    }
  });

  // Battle ready
  socket.on('player-ready', async ({ battleId, userId }) => {
    try {
      const Battle = require('../models/Battle');
      const battle = await Battle.findById(battleId);
      
      // Mark player as ready
      const allPlayers = [...battle.teamA, ...battle.teamB];
      const playerIndex = allPlayers.findIndex(p => p.user.toString() === userId);
      
      if (playerIndex !== -1) {
        if (playerIndex < battle.teamA.length) {
          battle.teamA[playerIndex].ready = true;
        } else {
          battle.teamB[playerIndex - battle.teamA.length].ready = true;
        }
        
        await battle.save();

        // Check if all ready
        const allReady = allPlayers.every(p => p.ready);
        if (allReady && battle.status === 'waiting') {
          battle.status = 'in_progress';
          battle.startTime = new Date();
          await battle.save();
          
          io.to(battle.chatRoom).emit('battle-started', {
            startTime: battle.startTime
          });
        }
      }
    } catch (error) {
      console.error('Player ready error:', error);
    }
  });

  // Submit battle result
  socket.on('submit-result', async ({ battleId, winner }) => {
    try {
      const Battle = require('../models/Battle');
      const User = require('../models/User');
      const Transaction = require('../models/Transaction');
      
      const battle = await Battle.findById(battleId);
      if (!battle || battle.status !== 'in_progress') return;

      battle.winner = winner;
      battle.status = 'completed';
      battle.endTime = new Date();
      battle.duration = (battle.endTime - battle.startTime) / 60000; // minutes
      
      await battle.save();

      // Calculate winnings
      const winningTeam = winner === 'teamA' ? battle.teamA : battle.teamB;
      const losingTeam = winner === 'teamA' ? battle.teamB : battle.teamA;
      
      const totalPot = (battle.teamA.length + battle.teamB.length) * battle.teamA[0].betAmount;
      const commission = totalPot * 0.1; // 10% commission
      const winningPot = totalPot - commission;
      
      const prizePerPlayer = winningPot / winningTeam.length;

      // Distribute winnings
      for (const player of winningTeam) {
        const user = await User.findById(player.user);
        if (user) {
          user.balance += prizePerPlayer;
          user.totalWon += prizePerPlayer;
          user.experience += 50;
          user.level = user.calculateLevel();
          await user.save();

          // Create transaction record
          await Transaction.create({
            user: player.user,
            type: 'win',
            amount: prizePerPlayer,
            currency: 'USD',
            status: 'completed',
            battle: battleId,
            description: `فوز في تحدى ${battle.type}`
          });
        }
      }

      // Record losses
      for (const player of losingTeam) {
        const user = await User.findById(player.user);
        if (user) {
          user.totalLost += player.betAmount;
          user.experience += 10;
          user.level = user.calculateLevel();
          await user.save();

          await Transaction.create({
            user: player.user,
            type: 'loss',
            amount: player.betAmount,
            currency: 'USD',
            status: 'completed',
            battle: battleId,
            description: `خسارة في تحدى ${battle.type}`
          });
        }
      }

      // Create commission transaction
      await Transaction.create({
        type: 'commission',
        amount: commission,
        currency: 'USD',
        status: 'completed',
        battle: battleId,
        description: `عمولة تحدى ${battle.type}`
      });

      // Send victory notification
      io.to(battle.chatRoom).emit('battle-ended', {
        winner,
        prizePerPlayer,
        commission,
        winningTeam: winningTeam.map(p => p.user),
        losingTeam: losingTeam.map(p => p.user)
      });

      // Show victory modal to winners
      winningTeam.forEach(player => {
        io.to(`user-${player.user}`).emit('victory-modal', {
          prize: prizePerPlayer,
          battleType: battle.type,
          showGiftDistribution: prizePerPlayer >= 5
        });
      });

      // Remove from active battles
      activeBattles.delete(battleId);

    } catch (error) {
      console.error('Submit result error:', error);
    }
  });

  // Distribute gifts after victory
  socket.on('distribute-victory-gifts', async ({ battleId, userId, recipients, amount }) => {
    try {
      const Gift = require('../models/Gift');
      const User = require('../models/User');
      const Transaction = require('../models/Transaction');
      
      const user = await User.findById(userId);
      if (!user || user.balance < amount) {
        socket.emit('gift-error', 'رصيدك غير كافي');
        return;
      }

      // Convert USD to coins (100 coins = 1 USD)
      const coinsAmount = amount * 100;
      const coinsPerRecipient = Math.floor(coinsAmount / recipients.length);

      // Deduct from winner
      user.balance -= amount;
      user.totalGifted += amount;
      await user.save();

      // Distribute to recipients
      for (const recipientId of recipients) {
        const recipient = await User.findById(recipientId);
        if (recipient) {
          recipient.coins += coinsPerRecipient;
          recipient.totalReceivedGifts += coinsPerRecipient;
          await recipient.save();

          // Send gift animation
          io.to(`user-${recipientId}`).emit('receive-gift', {
            from: userId,
            amount: coinsPerRecipient,
            isVictoryGift: true
          });

          // Create transaction
          await Transaction.create({
            user: recipientId,
            type: 'gift_receive',
            amount: coinsPerRecipient,
            currency: 'coins',
            sender: userId,
            description: 'هدية نصر'
          });
        }
      }

      // Create transaction for sender
      await Transaction.create({
        user: userId,
        type: 'gift_send',
        amount: amount,
        currency: 'USD',
        status: 'completed',
        description: 'توزيع هدايا النصر'
      });

      // Show distribution effect
      io.emit('victory-gifts-distributed', {
        from: userId,
        recipientsCount: recipients.length,
        totalAmount: amount
      });

    } catch (error) {
      console.error('Distribute gifts error:', error);
    }
  });

  // Spectate battle
  socket.on('spectate-battle', ({ battleId, userId }) => {
    const battle = activeBattles.get(battleId);
    if (battle) {
      socket.join(battle.battle.chatRoom);
      socket.emit('spectating-battle', { battleId });
      
      io.to(battle.battle.chatRoom).emit('spectator-joined', {
        userId,
        spectatorCount: battle.sockets.size
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

  async function startBattle(battleId, io) {
    try {
      const Battle = require('../models/Battle');
      const battle = await Battle.findById(battleId);
      
      if (battle && battle.status === 'waiting') {
        battle.status = 'ready';
        await battle.save();
        
        io.to(battle.chatRoom).emit('battle-ready', {
          countdown: 10
        });

        // Start countdown
        let countdown = 10;
        const countdownInterval = setInterval(() => {
          countdown--;
          io.to(battle.chatRoom).emit('countdown-update', { countdown });
          
          if (countdown <= 0) {
            clearInterval(countdownInterval);
            battle.status = 'in_progress';
            battle.startTime = new Date();
            battle.save();
            
            io.to(battle.chatRoom).emit('battle-started', {
              startTime: battle.startTime
            });
          }
        }, 1000);
      }
    } catch (error) {
      console.error('Start battle error:', error);
    }
  }
};
