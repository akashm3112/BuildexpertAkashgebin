const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config({ path: './config.env' });

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const providerRoutes = require('./routes/providers');
const serviceRoutes = require('./routes/services');
const bookingRoutes = require('./routes/bookings');
const uploadRoutes = require('./routes/upload');
const publicRoutes = require('./routes/public');
const notificationRoutes = require('./routes/notifications');
const earningsRoutes = require('./routes/earnings');
const paymentRoutes = require('./routes/payments');

// Initialize services
const { bookingReminderService } = require('./services/bookingReminders');
const { serviceExpiryManager } = require('./services/serviceExpiryManager');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:8081', 
    'http://localhost:19006',
    'http://192.168.1.8:5000',
    'http://192.168.1.8:5000',
    'http://192.168.1.8:3000',
    'http://192.168.1.8:3000',
    'http://192.168.1.8:8081',
    'http://192.168.1.8:8081',
    'http://192.168.1.8:19006',
    'http://192.168.1.8:19006'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'BuildXpert API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/push-notifications', require('./routes/pushNotifications'));
app.use('/api/calls', require('./routes/calls'));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:3000', 
      'http://localhost:8081', 
      'http://localhost:19006',
      'http://192.168.1.8:5000',
      'http://192.168.1.8:5000',
      'http://192.168.1.8:3000',
      'http://192.168.1.8:3000',
      'http://192.168.1.8:8081',
      'http://192.168.1.8:8081',
      'http://192.168.1.8:19006',
      'http://192.168.1.8:19006'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Store active calls
const activeCalls = new Map();

io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);
  
  // Join user's personal room
  socket.on('join', (userId) => {
    if (userId) {
      socket.join(userId);
      socket.userId = userId;
      console.log(`Socket ${socket.id} joined room ${userId}`);
    }
  });

  // WebRTC Signaling Events
  
  // Initiate call
  socket.on('call:initiate', async ({ bookingId, callerId, callerName, receiverId, receiverName }) => {
    console.log('📞 Call initiated:', { bookingId, from: callerId, to: receiverId });
    
    activeCalls.set(bookingId, {
      callerId,
      receiverId,
      startTime: Date.now(),
      status: 'ringing'
    });

    // Notify receiver about incoming call
    io.to(receiverId).emit('call:incoming', {
      bookingId,
      callerId,
      callerName,
      socketId: socket.id
    });
  });

  // Accept call
  socket.on('call:accept', ({ bookingId, receiverId }) => {
    console.log('📞 Call accepted:', bookingId);
    
    const call = activeCalls.get(bookingId);
    if (call) {
      call.status = 'active';
      call.acceptTime = Date.now();
      
      // Notify caller that call was accepted
      io.to(call.callerId).emit('call:accepted', {
        bookingId,
        receiverId,
        socketId: socket.id
      });
    }
  });

  // Reject call
  socket.on('call:reject', ({ bookingId, reason = 'declined' }) => {
    console.log('📞 Call rejected:', bookingId);
    
    const call = activeCalls.get(bookingId);
    if (call) {
      io.to(call.callerId).emit('call:rejected', { bookingId, reason });
      activeCalls.delete(bookingId);
    }
  });

  // WebRTC Offer
  socket.on('call:offer', ({ bookingId, offer, to }) => {
    console.log('📞 Sending offer to:', to);
    io.to(to).emit('call:offer', {
      bookingId,
      offer,
      from: socket.userId
    });
  });

  // WebRTC Answer
  socket.on('call:answer', ({ bookingId, answer, to }) => {
    console.log('📞 Sending answer to:', to);
    io.to(to).emit('call:answer', {
      bookingId,
      answer,
      from: socket.userId
    });
  });

  // ICE Candidate
  socket.on('call:ice-candidate', ({ bookingId, candidate, to }) => {
    io.to(to).emit('call:ice-candidate', {
      bookingId,
      candidate,
      from: socket.userId
    });
  });

  // End call
  socket.on('call:end', ({ bookingId, userId }) => {
    console.log('📞 Call ended:', bookingId);
    
    const call = activeCalls.get(bookingId);
    if (call) {
      const endTime = Date.now();
      const duration = call.acceptTime ? Math.floor((endTime - call.acceptTime) / 1000) : 0;
      
      // Notify both parties
      io.to(call.callerId).emit('call:ended', { bookingId, duration, endedBy: userId });
      io.to(call.receiverId).emit('call:ended', { bookingId, duration, endedBy: userId });
      
      activeCalls.delete(bookingId);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
    
    // Clean up any active calls for this user
    if (socket.userId) {
      for (const [bookingId, call] of activeCalls.entries()) {
        if (call.callerId === socket.userId || call.receiverId === socket.userId) {
          const otherUserId = call.callerId === socket.userId ? call.receiverId : call.callerId;
          io.to(otherUserId).emit('call:ended', { bookingId, reason: 'disconnect' });
          activeCalls.delete(bookingId);
        }
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BuildXpert API server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Network access: http://192.168.0.106:${PORT}/health`);
  console.log(`📊 API Documentation: http://localhost:${PORT}/api`);
  
  // Start background services
  console.log('🔧 Starting background services...');
  serviceExpiryManager.start();
  console.log('✅ All background services started');
});

module.exports = { app, io }; 