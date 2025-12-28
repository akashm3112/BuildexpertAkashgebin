const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config({ path: './config.env' });
const logger = require('./utils/logger');

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
require('./services/bookingReminders');
const { serviceExpiryManager } = require('./services/serviceExpiryManager');
const { initializeCleanupJob } = require('./utils/cleanupJob');
const { notificationCleanupService } = require('./services/notificationCleanupService');
const { validateCallPermissions } = require('./utils/callPermissions');
const { WebRTCPermissionError } = require('./utils/errorTypes');
const notificationQueue = require('./utils/notificationQueue');
const { preloadTableCache } = require('./utils/tableCache');
const { warmAllCaches } = require('./utils/cacheWarming');

// Initialize memory leak prevention
const { 
  ManagedMap, 
  SocketConnectionManager, 
  MemoryMonitor,
  registry,
  initialize: initializeMemoryLeakPrevention 
} = require('./utils/memoryLeakPrevention');
initializeMemoryLeakPrevention();

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration - Professional production-ready setup
// Allowed origins are configured via ALLOWED_ORIGINS environment variable
// Example: ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.8:3000,https://app.example.com
const getAllowedOrigins = () => {
  if (!process.env.ALLOWED_ORIGINS) {
    logger.error('ALLOWED_ORIGINS environment variable is not set. Please set ALLOWED_ORIGINS in your config.env file. Example: ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.8:3000');
    process.exit(1);
  }
  
  // Parse comma-separated origins from environment variable
  const origins = process.env.ALLOWED_ORIGINS
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0); // Remove empty strings
  
  if (origins.length === 0) {
    logger.error('ALLOWED_ORIGINS contains no valid origins.');
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
      logger.warn('CORS blocked', { origin });
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

// Monitoring middleware (must be before routes)
const { monitoringMiddleware, errorMonitoringMiddleware } = require('./utils/monitoring');
app.use(monitoringMiddleware);

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request timeout middleware - CRITICAL FOR PRODUCTION
app.use((req, res, next) => {
  // Set timeout for all requests (30 seconds)
  req.setTimeout(30000, () => {
    logger.error('Request timeout', {
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
    logger.error('Response timeout', {
      url: req.url,
      method: req.method,
      ip: req.ip
    });
  });
  
  next();
});

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoints
const healthRoutes = require('./routes/health');
app.use('/health', healthRoutes);

// Monitoring endpoints
const monitoringRoutes = require('./routes/monitoring');
app.use('/api/monitoring', monitoringRoutes);

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

// Import error handling middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// 404 handler - must be after all routes
app.use('*', notFoundHandler);

// Error monitoring middleware (before error handler, must be 4-parameter)
app.use(errorMonitoringMiddleware);

// Global error handler - must be last middleware
app.use(errorHandler);

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

// Store active calls with automatic cleanup
const activeCalls = new ManagedMap({
  name: 'activeCalls',
  ttl: 86400000, // 24 hours max call duration
  maxSize: 1000,
  cleanupInterval: 600000, // Clean every 10 minutes
  trackExpiry: true
});

const callTimeouts = new ManagedMap({
  name: 'callTimeouts',
  ttl: 86400000, // 24 hours
  maxSize: 1000,
  cleanupInterval: 600000, // Clean every 10 minutes
  trackExpiry: false // Don't auto-delete timeouts
});

// Initialize Socket Connection Manager
const socketManager = new SocketConnectionManager(io);
socketManager.startCleanup();

// Initialize Memory Monitor
const memoryMonitor = new MemoryMonitor({
  threshold: 500, // 500MB
  checkInterval: 60000, // Check every minute
  maxWarnings: 5
});
memoryMonitor.start();

io.on('connection', (socket) => {
  // Register socket connection (without userId initially)
  socketManager.registerConnection(socket);
  
  // Join user's personal room
  socket.on('join', (userId) => {
    if (userId) {
      socket.join(userId);
      socket.userId = userId;
      // Update existing socket registration with userId (don't register again)
      // The registerConnection method should handle updating existing registrations
      socketManager.registerConnection(socket, userId);
    }
  });

  // WebRTC Signaling Events
  
  // Initiate call
  socket.on('call:initiate', async (payload = {}, ack) => {
    const callerId = socket.userId;
    const bookingId = payload.bookingId;

    if (!callerId) {
      const message = 'User not authenticated. Please join the socket room first.';
      logger.error('Call initiate failed - no userId', { socketId: socket.id, bookingId });
      ack?.({ status: 'error', message, errorCode: 'WEBRTC_NOT_AUTHENTICATED' });
      return;
    }

    if (!bookingId) {
      const message = 'Invalid call initiation payload - bookingId required';
      logger.error('Call initiate failed - no bookingId', { socketId: socket.id, callerId });
      ack?.({ status: 'error', message, errorCode: 'WEBRTC_INVALID_PAYLOAD' });
      return;
    }

    try {
      const { caller, receiver, metadata } = await validateCallPermissions({
        bookingId,
        callerId,
        providedCallerType: payload.callerType
      });

      activeCalls.set(bookingId, {
        callerId: caller.id,
        receiverId: receiver.id,
        startTime: Date.now(),
        status: 'ringing'
      });

      const timeoutId = setTimeout(() => {
        const call = activeCalls.get(bookingId);
        if (call && call.status === 'ringing') {
          io.to(call.callerId).emit('call:ended', {
            bookingId,
            duration: 0,
            endedBy: 'timeout',
            reason: 'Call timed out - no answer'
          });
          activeCalls.delete(bookingId);
          callTimeouts.delete(bookingId);
        }
      }, 30000);

      callTimeouts.set(bookingId, timeoutId);

      io.to(receiver.id).emit('call:incoming', {
        bookingId,
        callerId: caller.id,
        callerName: caller.name,
        receiverId: receiver.id,
        receiverName: receiver.name,
        serviceName: metadata.serviceName,
        socketId: socket.id
      });

      ack?.({ status: 'success' });
    } catch (error) {
      const message = error.message || 'Failed to initiate call';
      const errorCode = error.errorCode || 'WEBRTC_ERROR';
      logger.error('Socket call initiate failed', {
        bookingId,
        callerId,
        error: message,
        errorCode,
        stack: error.stack
      });

      ack?.({ status: 'error', message, errorCode });
      socket.emit('call:error', { bookingId, message, errorCode });
    }
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
      // Convert ManagedMap entries() to array for iteration
      const callEntries = Array.from(activeCalls.map.entries());
      
      for (const [bookingId, callEntry] of callEntries) {
        const call = callEntry.value; // Extract value from managed entry
        if (call.callerId === socket.userId || call.receiverId === socket.userId) {
          const otherUserId = call.callerId === socket.userId ? call.receiverId : call.callerId;
          // Call cleanup logging removed for production
          
          io.to(otherUserId).emit('call:ended', { bookingId, reason: 'disconnect' });
          
          // Clear timeout for this call
          const timeoutEntry = callTimeouts.get(bookingId);
          if (timeoutEntry) {
            clearTimeout(timeoutEntry);
            callTimeouts.delete(bookingId);
          }
          
          activeCalls.delete(bookingId);
        }
      }
    }
    
    // Unregister socket connection
    socketManager.unregisterConnection(socket);
    
    // Remove all socket event listeners to prevent memory leaks
    socket.removeAllListeners();
  });
});

server.listen(PORT, '0.0.0.0', async () => {
  logger.info('BuildXpert API server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    healthCheck: `http://localhost:${PORT}/health`,
    allowedOrigins: allowedOrigins.join(', ')
  });
  
  // Start background services
  logger.info('Starting background services');
  serviceExpiryManager.start();
  initializeCleanupJob(); // Auth data cleanup (tokens, sessions, security logs)
  notificationQueue.start();
  notificationCleanupService.start(); // Notification cleanup (runs weekly on Sundays at 2 AM UTC)
  
  // Preload table cache for admin routes
  try {
    await preloadTableCache();
  } catch (error) {
    logger.warn('Failed to preload table cache', {
      error: error.message,
      stack: error.stack
    });
  }
  
  // Warm application caches
  try {
    await warmAllCaches();
  } catch (error) {
    logger.warn('Failed to warm caches', {
      error: error.message,
      stack: error.stack
    });
  }
  
  logger.info('All background services started');
  
  // Check critical environment variables
  const criticalEnvVars = {
    'DATABASE_URL': process.env.DATABASE_URL,
    'JWT_SECRET': process.env.JWT_SECRET,
    'EXPO_ACCESS_TOKEN': process.env.EXPO_ACCESS_TOKEN,
  };
  
  const missingVars = Object.entries(criticalEnvVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key);
  
  if (missingVars.length > 0) {
    logger.warn('Missing optional environment variables (may affect functionality)', {
      missing: missingVars,
      note: 'EXPO_ACCESS_TOKEN is optional but recommended for better push notification rate limits'
    });
  }
});

module.exports = { app, io }; 