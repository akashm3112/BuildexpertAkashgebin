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
const adminRoutes = require('./routes/admin');

// Initialize services
const { bookingReminderService } = require('./services/bookingReminders');
const { serviceExpiryManager } = require('./services/serviceExpiryManager');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration - Professional production-ready setup
// Allowed origins are configured via ALLOWED_ORIGINS environment variable
// Example: ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.8:3000,https://app.example.com
const getAllowedOrigins = () => {
  if (!process.env.ALLOWED_ORIGINS) {
    console.error('❌ ERROR: ALLOWED_ORIGINS environment variable is not set.');
    console.error('   Please set ALLOWED_ORIGINS in your config.env file.');
    console.error('   Example: ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.8:3000');
    process.exit(1);
  }
  
  // Parse comma-separated origins from environment variable
  const origins = process.env.ALLOWED_ORIGINS
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0); // Remove empty strings
  
  if (origins.length === 0) {
    console.error('❌ ERROR: ALLOWED_ORIGINS contains no valid origins.');
    process.exit(1);
  }
  
  return origins;
};

const allowedOrigins = getAllowedOrigins();

// CORS configuration with origin validation
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // Validate origin against allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      const error = new Error(`CORS: Origin ${origin} is not allowed`);
      console.warn(`⚠️  CORS blocked: ${origin}`);
      callback(error);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours - cache preflight requests
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request timeout middleware - CRITICAL FOR PRODUCTION
app.use((req, res, next) => {
  // Set timeout for all requests (30 seconds)
  req.setTimeout(30000, () => {
    console.error('⚠️ Request timeout:', {
      url: req.url,
      method: req.method,
      ip: req.ip
    });
    if (!res.headersSent) {
      res.status(408).json({
        status: 'error',
        message: 'Request timeout - please try again'
      });
    }
  });
  
  res.setTimeout(30000, () => {
    console.error('⚠️ Response timeout:', {
      url: req.url,
      method: req.method,
      ip: req.ip
    });
  });
  
  next();
});

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint - ENHANCED WITH DATABASE CHECK
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    message: 'BuildXpert API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
    }
  };

  // Check database connectivity
  try {
    const { pool } = require('./database/connection');
    const result = await pool.query('SELECT NOW() as db_time, version() as db_version');
    health.database = {
      status: 'connected',
      timestamp: result.rows[0].db_time,
      version: result.rows[0].db_version.split(' ')[0] + ' ' + result.rows[0].db_version.split(' ')[1]
    };
    
    res.status(200).json(health);
  } catch (error) {
    health.status = 'unhealthy';
    health.database = {
      status: 'disconnected',
      error: error.message
    };
    
    console.error('❌ Health check failed - database disconnected:', error.message);
    res.status(503).json(health);
  }
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
app.use('/api/admin', adminRoutes);
app.use('/api/push-notifications', require('./routes/pushNotifications'));
app.use('/api/calls', require('./routes/calls'));
app.use('/api/test', require('./routes/test-labour'));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  // Error logging handled by logger (already logged above)
  
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
    origin: allowedOrigins, // Use same origins as Express CORS configuration
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Store active calls
const activeCalls = new Map();
const callTimeouts = new Map(); // Store call timeout IDs

io.on('connection', (socket) => {
  // Socket connection logging removed for production
  
  // Join user's personal room
  socket.on('join', (userId) => {
    if (userId) {
      socket.join(userId);
      socket.userId = userId;
      // Socket room joining logging removed for production
    }
  });

  // WebRTC Signaling Events
  
  // Initiate call
  socket.on('call:initiate', async ({ bookingId, callerId, callerName, receiverId, receiverName }) => {
    // Call initiation logging removed for production
    
    activeCalls.set(bookingId, {
      callerId,
      receiverId,
      startTime: Date.now(),
      status: 'ringing'
    });

    // Set call timeout (30 seconds)
    const timeoutId = setTimeout(() => {
      const call = activeCalls.get(bookingId);
      if (call && call.status === 'ringing') {
        // Call timeout logging removed for production
        
        // Notify caller about timeout
        io.to(call.callerId).emit('call:ended', { 
          bookingId, 
          duration: 0, 
          endedBy: 'timeout',
          reason: 'Call timed out - no answer'
        });
        
        // Clean up
        activeCalls.delete(bookingId);
        callTimeouts.delete(bookingId);
      }
    }, 30000); // 30 seconds timeout
    
    callTimeouts.set(bookingId, timeoutId);

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
    // Call accepted logging removed for production
    
    const call = activeCalls.get(bookingId);
    if (call) {
      call.status = 'active';
      call.acceptTime = Date.now();
      
      // Clear the timeout since call was accepted
      const timeoutId = callTimeouts.get(bookingId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        callTimeouts.delete(bookingId);
      }
      
      // Notify caller that call was accepted
      io.to(call.callerId).emit('call:accepted', {
        bookingId,
        receiverId: receiverId || socket.userId,
        socketId: socket.id
      });
    } else {
      // Call not found logging removed for production
    }
  });

  // Reject call
  socket.on('call:reject', ({ bookingId, reason = 'declined' }) => {
    // Call rejected logging removed for production
    
    const call = activeCalls.get(bookingId);
    if (call) {
      // Clear the timeout since call was rejected
      const timeoutId = callTimeouts.get(bookingId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        callTimeouts.delete(bookingId);
      }
      
      io.to(call.callerId).emit('call:rejected', { bookingId, reason });
      activeCalls.delete(bookingId);
    }
  });

  // WebRTC Offer
  socket.on('call:offer', ({ bookingId, offer, to }) => {
    // WebRTC signaling logging removed for production
    io.to(to).emit('call:offer', {
      bookingId,
      offer,
      from: socket.userId
    });
  });

  // WebRTC Answer
  socket.on('call:answer', ({ bookingId, answer, to }) => {
    // WebRTC answer logging removed for production
    io.to(to).emit('call:answer', {
      bookingId,
      answer,
      from: socket.userId
    });
  });

  // ICE Candidate
  socket.on('call:ice-candidate', ({ bookingId, candidate, to }) => {
    // ICE candidate logging removed for production
    io.to(to).emit('call:ice-candidate', {
      bookingId,
      candidate,
      from: socket.userId
    });
  });

  // End call
  socket.on('call:end', ({ bookingId, userId }) => {
    // Call ended logging removed for production
    
    const call = activeCalls.get(bookingId);
    if (call) {
      const endTime = Date.now();
      const duration = call.acceptTime ? Math.floor((endTime - call.acceptTime) / 1000) : 0;
      
      // Clear any pending timeout
      const timeoutId = callTimeouts.get(bookingId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        callTimeouts.delete(bookingId);
      }
      
      // Notify both parties
      io.to(call.callerId).emit('call:ended', { bookingId, duration, endedBy: userId });
      io.to(call.receiverId).emit('call:ended', { bookingId, duration, endedBy: userId });
      
      activeCalls.delete(bookingId);
    }
  });

  // Connection error handling
  socket.on('error', (error) => {
    // Socket error logging removed for production
  });

  // WebRTC connection state events
  socket.on('call:connection-state', ({ bookingId, state, details }) => {
    // Connection state logging removed for production
  });

  // WebRTC error events
  socket.on('call:error', ({ bookingId, error, details }) => {
    // WebRTC error logging removed for production
  });

  // Call quality metrics
  socket.on('call:quality', ({ bookingId, metrics }) => {
    // Call quality logging removed for production
  });

  socket.on('disconnect', (reason) => {
    // Client disconnect logging removed for production
    
    // Clean up any active calls for this user
    if (socket.userId) {
      for (const [bookingId, call] of activeCalls.entries()) {
        if (call.callerId === socket.userId || call.receiverId === socket.userId) {
          const otherUserId = call.callerId === socket.userId ? call.receiverId : call.callerId;
          // Call cleanup logging removed for production
          
          io.to(otherUserId).emit('call:ended', { bookingId, reason: 'disconnect' });
          
          // Clear timeout for this call
          const timeoutId = callTimeouts.get(bookingId);
          if (timeoutId) {
            clearTimeout(timeoutId);
            callTimeouts.delete(bookingId);
          }
          
          activeCalls.delete(bookingId);
        }
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BuildXpert API server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 API Documentation: http://localhost:${PORT}/api`);
  console.log(`🌐 Allowed CORS origins: ${allowedOrigins.join(', ')}`);
  
  // Start background services
  console.log('🔧 Starting background services...');
  serviceExpiryManager.start();
  console.log('✅ All background services started');
});

module.exports = { app, io }; 