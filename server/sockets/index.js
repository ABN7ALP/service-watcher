const chatHandler = require('./chatHandler');
const battleHandler = require('./battleHandler');
const adminHandler = require('./adminHandler');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`🟢 User connected: ${socket.id}`);

    // Join user to their room
    socket.on('join-user', (userId) => {
      socket.join(`user-${userId}`);
      socket.userId = userId;
    });

    // Initialize handlers
    chatHandler(socket, io);
    battleHandler(socket, io);
    adminHandler(socket, io);

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`🔴 User disconnected: ${socket.id}`);
      
      // Notify others if user was in voice chat
      if (socket.seatNumber) {
        socket.to('voice-chat').emit('user-left-seat', {
          seatNumber: socket.seatNumber,
          userId: socket.userId
        });
      }
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });
};
