module.exports = (socket, io) => {
  // Join voice chat seat
  socket.on('join-voice-seat', async ({ seatNumber, userId }) => {
    try {
      // Check if seat is available or admin seat
      const isAdminSeat = seatNumber >= 24 && seatNumber <= 26;
      
      if (isAdminSeat) {
        // Check if user has admin permissions
        const User = require('../models/User');
        const user = await User.findById(userId);
        
        if (!user || !user.isAdmin) {
          socket.emit('seat-error', 'لا تملك صلاحية الجلوس على مقاعد الإدارة');
          return;
        }
      }

      socket.seatNumber = seatNumber;
      socket.join('voice-chat');
      
      // Leave previous seat if any
      socket.to('voice-chat').emit('user-left-seat', {
        seatNumber: socket.prevSeatNumber,
        userId
      });

      // Join new seat
      socket.to('voice-chat').emit('user-joined-seat', {
        seatNumber,
        userId,
        username: socket.username
      });

      socket.prevSeatNumber = seatNumber;
    } catch (error) {
      console.error('Join seat error:', error);
      socket.emit('seat-error', 'حدث خطأ أثناء محاولة الجلوس');
    }
  });

  // Leave voice seat
  socket.on('leave-voice-seat', ({ seatNumber, userId }) => {
    socket.leave('voice-chat');
    socket.seatNumber = null;
    
    io.to('voice-chat').emit('user-left-seat', {
      seatNumber,
      userId
    });
  });

  // Mute/Unmute microphone
  socket.on('toggle-mute', ({ userId, isMuted }) => {
    socket.to('voice-chat').emit('user-toggled-mute', {
      userId,
      isMuted
    });
  });

  // Send text message
  socket.on('send-message', async (data) => {
    try {
      const { roomId, message, type = 'text', senderId, allowSave = true, allowScreenshot = true } = data;
      
      // Save to database if needed
      if (roomId !== 'public') {
        const Chat = require('../models/Chat');
        
        const chat = await Chat.findOne({ roomId });
        if (chat) {
          chat.messages.push({
            sender: senderId,
            messageType: type,
            content: message,
            allowSave,
            allowScreenshot,
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours
          });
          chat.lastMessageAt = new Date();
          await chat.save();
        }
      }

      // Broadcast message
      io.to(roomId).emit('new-message', {
        ...data,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('message-error', 'فشل إرسال الرسالة');
    }
  });

  // Send image
  socket.on('send-image', async (data) => {
    try {
      const { roomId, imageUrl, senderId, allowSave = false, allowScreenshot = false } = data;
      
      // Save to database
      const Chat = require('../models/Chat');
      const chat = await Chat.findOne({ roomId });
      
      if (chat) {
        chat.messages.push({
          sender: senderId,
          messageType: 'image',
          imageUrl,
          allowSave,
          allowScreenshot,
          viewCount: 0,
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
        });
        await chat.save();
      }

      io.to(roomId).emit('new-image', {
        ...data,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Send image error:', error);
    }
  });

  // Send voice message
  socket.on('send-voice', async (data) => {
    try {
      const { roomId, voiceUrl, duration, senderId } = data;
      
      if (duration > 15) {
        socket.emit('voice-error', 'مدة التسجيل يجب ألا تتجاوز 15 ثانية');
        return;
      }

      const Chat = require('../models/Chat');
      const chat = await Chat.findOne({ roomId });
      
      if (chat) {
        chat.messages.push({
          sender: senderId,
          messageType: 'voice',
          voiceUrl,
          voiceDuration: duration,
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
        });
        await chat.save();
      }

      io.to(roomId).emit('new-voice', {
        ...data,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Send voice error:', error);
    }
  });

  // Join room
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    socket.emit('room-joined', roomId);
  });

  // Leave room
  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
  });
};
