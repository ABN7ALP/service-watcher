const AdminLog = require('../models/AdminLog');

module.exports = (socket, io) => {
  const adminNamespace = io.of('/admin');

  // Admin namespace connection
  adminNamespace.on('connection', (adminSocket) => {
    console.log(`👑 Admin connected: ${adminSocket.id}`);

    // Verify admin
    adminSocket.on('admin-authenticate', async ({ token, adminId }) => {
      try {
        const jwt = require('jsonwebtoken');
        const User = require('../models/User');
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const admin = await User.findOne({
          _id: decoded.userId,
          isAdmin: true,
          isBanned: false
        });

        if (!admin) {
          adminSocket.emit('admin-auth-error', 'صلاحيات إدارة غير صالحة');
          return;
        }

        adminSocket.adminId = admin._id;
        adminSocket.adminName = admin.username;
        adminSocket.join('admin-room');
        
        // Log admin login
        await AdminLog.logAction({
          admin: admin._id,
          action: 'login',
          ipAddress: adminSocket.handshake.address,
          userAgent: adminSocket.handshake.headers['user-agent'],
          details: { socketId: adminSocket.id }
        });

        adminSocket.emit('admin-authenticated', {
          username: admin.username,
          permissions: admin.adminPermissions
        });

        // Send initial data
        sendInitialAdminData(adminSocket);

      } catch (error) {
        console.error('Admin auth error:', error);
        adminSocket.emit('admin-auth-error', 'فشل المصادقة');
      }
    });

    // Get real-time user activities
    adminSocket.on('get-user-activities', async () => {
      try {
        const User = require('../models/User');
        const activities = await User.find({
          lastActive: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
          isOnline: true
        })
        .select('username profileImage lastActive currentSeat balance')
        .limit(50)
        .sort('-lastActive');

        adminSocket.emit('user-activities', activities);
      } catch (error) {
        console.error('Get user activities error:', error);
      }
    });

    // Monitor specific user
    adminSocket.on('monitor-user', async (userId) => {
      try {
        const userSocketId = getUserSocketId(userId);
        if (userSocketId) {
          adminSocket.join(`monitor-${userId}`);
          
          // Get user's current room
          const userRooms = Array.from(io.sockets.adapter.rooms.keys())
            .filter(room => room !== userSocketId && io.sockets.adapter.rooms.get(room)?.has(userSocketId));
          
          adminSocket.emit('user-monitoring-started', {
            userId,
            socketId: userSocketId,
            rooms: userRooms
          });
        } else {
          adminSocket.emit('user-offline', userId);
        }
      } catch (error) {
        console.error('Monitor user error:', error);
      }
    });

    // Send notification to user
    adminSocket.on('send-user-notification', async ({ userId, message, type = 'info' }) => {
      try {
        const userSocketId = getUserSocketId(userId);
        if (userSocketId) {
          io.to(userSocketId).emit('admin-notification', {
            message,
            type,
            timestamp: new Date()
          });

          // Log the notification
          await AdminLog.logAction({
            admin: adminSocket.adminId,
            action: 'mass_notification',
            targetUser: userId,
            details: { message, type },
            severity: 'info'
          });

          adminSocket.emit('notification-sent', { userId, message });
        } else {
          adminSocket.emit('user-offline', userId);
        }
      } catch (error) {
        console.error('Send notification error:', error);
      }
    });

    // Broadcast message to all users
    adminSocket.on('broadcast-message', async ({ message, type = 'announcement' }) => {
      try {
        io.emit('system-broadcast', {
          message,
          type,
          from: 'الإدارة',
          timestamp: new Date()
        });

        // Log broadcast
        await AdminLog.logAction({
          admin: adminSocket.adminId,
          action: 'mass_notification',
          details: { message, type, audience: 'all' },
          severity: 'info'
        });

        adminSocket.emit('broadcast-sent', { message });
      } catch (error) {
        console.error('Broadcast error:', error);
      }
    });

    // Kick user from voice seat
    adminSocket.on('kick-from-seat', async ({ userId, seatNumber, reason }) => {
      try {
        const userSocketId = getUserSocketId(userId);
        if (userSocketId) {
          io.to(userSocketId).emit('kicked-from-seat', {
            seatNumber,
            reason,
            admin: adminSocket.adminName
          });

          // Force leave seat
          io.to('voice-chat').emit('user-left-seat', {
            seatNumber,
            userId
          });

          // Log action
          await AdminLog.logAction({
            admin: adminSocket.adminId,
            action: 'mute_user',
            targetUser: userId,
            details: { seatNumber, reason, action: 'kick' },
            severity: 'warning'
          });

          adminSocket.emit('user-kicked', { userId, seatNumber });
        }
      } catch (error) {
        console.error('Kick from seat error:', error);
      }
    });

    // Mute user in voice chat
    adminSocket.on('mute-user-voice', async ({ userId, duration, reason }) => {
      try {
        const userSocketId = getUserSocketId(userId);
        if (userSocketId) {
          io.to(userSocketId).emit('voice-muted', {
            duration,
            reason,
            admin: adminSocket.adminName
          });

          // Broadcast to voice chat
          io.to('voice-chat').emit('user-voice-muted', {
            userId,
            isMuted: true,
            duration
          });

          // Log action
          await AdminLog.logAction({
            admin: adminSocket.adminId,
            action: 'mute_user',
            targetUser: userId,
            details: { duration, reason, type: 'voice' },
            severity: 'warning'
          });

          adminSocket.emit('user-muted', { userId });
        }
      } catch (error) {
        console.error('Mute user error:', error);
      }
    });

    // Lock/Unlock voice seat
    adminSocket.on('toggle-seat-lock', async ({ seatNumber, locked, reason }) => {
      try {
        io.to('voice-chat').emit('seat-lock-toggled', {
          seatNumber,
          locked,
          reason,
          admin: adminSocket.adminName
        });

        // Log action
        await AdminLog.logAction({
          admin: adminSocket.adminId,
          action: 'update_settings',
          details: { 
            action: locked ? 'lock_seat' : 'unlock_seat',
            seatNumber,
            reason 
          },
          severity: 'info'
        });

        adminSocket.emit('seat-lock-updated', { seatNumber, locked });
      } catch (error) {
        console.error('Toggle seat lock error:', error);
      }
    });

    // Ban IP address
    adminSocket.on('ban-ip', async ({ ipAddress, reason, duration }) => {
      try {
        // In production, you would store this in Redis or database
        // and check on each request
        
        // Log action
        await AdminLog.logAction({
          admin: adminSocket.adminId,
          action: 'ip_ban',
          details: { ipAddress, reason, duration },
          severity: 'critical'
        });

        // Disconnect all sockets from this IP
        const sockets = await io.fetchSockets();
        sockets.forEach(socket => {
          if (socket.handshake.address === ipAddress) {
            socket.emit('ip-banned', { reason, duration });
            socket.disconnect(true);
          }
        });

        adminSocket.emit('ip-banned-success', { ipAddress });
      } catch (error) {
        console.error('Ban IP error:', error);
      }
    });

    // Get system health
    adminSocket.on('get-system-health', () => {
      const health = {
        timestamp: new Date(),
        connections: io.engine.clientsCount,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        adminConnections: adminNamespace.sockets.size
      };
      
      adminSocket.emit('system-health', health);
    });

    // Real-time transaction alerts
    adminSocket.on('subscribe-transactions', () => {
      adminSocket.join('transaction-alerts');
    });

    adminSocket.on('unsubscribe-transactions', () => {
      adminSocket.leave('transaction-alerts');
    });

    // Real-time battle alerts
    adminSocket.on('subscribe-battles', () => {
      adminSocket.join('battle-alerts');
    });

    // Force end battle
    adminSocket.on('force-end-battle', async ({ battleId, winner, reason }) => {
      try {
        const Battle = require('../models/Battle');
        const battle = await Battle.findById(battleId);
        
        if (battle && battle.status === 'in_progress') {
          battle.status = 'completed';
          battle.winner = winner || 'draw';
          battle.endTime = new Date();
          await battle.save();

          // Notify battle room
          io.to(battle.chatRoom).emit('battle-force-ended', {
            winner: battle.winner,
            reason,
            admin: adminSocket.adminName
          });

          // Log action
          await AdminLog.logAction({
            admin: adminSocket.adminId,
            action: 'update_settings',
            targetEntity: 'battle',
            entityId: battleId,
            details: { action: 'force_end', winner, reason },
            severity: 'warning'
          });

          adminSocket.emit('battle-ended', { battleId });
        }
      } catch (error) {
        console.error('Force end battle error:', error);
      }
    });

    // Disconnect
    adminSocket.on('disconnect', async () => {
      console.log(`👑 Admin disconnected: ${adminSocket.id}`);
      
      if (adminSocket.adminId) {
        await AdminLog.logAction({
          admin: adminSocket.adminId,
          action: 'logout',
          ipAddress: adminSocket.handshake.address,
          details: { socketId: adminSocket.id }
        });
      }
    });
  });

  // Helper function to get user socket ID
  function getUserSocketId(userId) {
    const sockets = Array.from(io.sockets.sockets.values());
    const userSocket = sockets.find(socket => socket.userId === userId);
    return userSocket ? userSocket.id : null;
  }

  // Send initial admin data
  async function sendInitialAdminData(socket) {
    try {
      const User = require('../models/User');
      const Transaction = require('../models/Transaction');
      const Withdrawal = require('../models/Withdrawal');
      const Battle = require('../models/Battle');

      const [
        pendingDeposits,
        pendingWithdrawals,
        activeBattles,
        recentUsers
      ] = await Promise.all([
        Transaction.countDocuments({ type: 'deposit', status: 'pending' }),
        Withdrawal.countDocuments({ status: 'pending' }),
        Battle.countDocuments({ status: { $in: ['waiting', 'ready', 'in_progress'] } }),
        User.find().sort('-createdAt').limit(10).select('username createdAt profileImage')
      ]);

      socket.emit('initial-admin-data', {
        pendingDeposits,
        pendingWithdrawals,
        activeBattles,
        recentUsers,
        serverTime: new Date()
      });
    } catch (error) {
      console.error('Send initial admin data error:', error);
    }
  }

  // Listen to regular socket events for admin monitoring
  socket.on('send-message', (data) => {
    // Forward to admin room for monitoring
    adminNamespace.to('admin-room').emit('user-message', {
      ...data,
      timestamp: new Date()
    });
  });

  socket.on('join-voice-seat', (data) => {
    adminNamespace.to('admin-room').emit('user-joined-voice', {
      ...data,
      timestamp: new Date()
    });
  });

  socket.on('create-battle', (data) => {
    adminNamespace.to('admin-room').emit('battle-created', {
      ...data,
      timestamp: new Date()
    });
  });
};
