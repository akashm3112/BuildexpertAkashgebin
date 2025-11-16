const { cleanupExpiredTokens } = require('./tokenBlacklist');
const { cleanupExpiredSessions } = require('./sessionManager');
const { cleanupOldSecurityData } = require('./securityAudit');
const { cleanupExpiredRefreshTokens } = require('./refreshToken');
const logger = require('./logger');
const { registry } = require('./memoryLeakPrevention');

/**
 * Run all cleanup tasks
 * @returns {Promise<Object>} Cleanup statistics
 */
const runCleanup = async () => {
  const startTime = Date.now();
  
  try {
    logger.info('🧹 Starting scheduled auth data cleanup...');
    
    // Run all cleanup tasks in parallel for efficiency
    const [tokensRemoved, sessionsRemoved, refreshTokensRemoved, securityDataStats] = await Promise.all([
      cleanupExpiredTokens(),
      cleanupExpiredSessions(),
      cleanupExpiredRefreshTokens(),
      cleanupOldSecurityData()
    ]);
    
    const duration = Date.now() - startTime;
    
    const stats = {
      tokensRemoved,
      sessionsRemoved,
      refreshTokensRemoved,
      loginAttemptsRemoved: securityDataStats.loginAttemptsRemoved,
      securityEventsRemoved: securityDataStats.securityEventsRemoved,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    };
    
    logger.info('✅ Auth data cleanup completed', stats);
    
    return {
      success: true,
      stats
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('❌ Auth data cleanup failed', {
      error: error.message,
      duration: `${duration}ms`
    });
    
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Initialize cleanup job scheduler
 * Runs cleanup every 24 hours
 * @returns {NodeJS.Timer} Interval timer
 */
const initializeCleanupJob = () => {
  // Run cleanup immediately on startup
  runCleanup().catch(error => {
    logger.error('Initial cleanup failed', { error: error.message });
  });
  
  // Schedule cleanup to run every 24 hours
  const interval = setInterval(() => {
    runCleanup().catch(error => {
      logger.error('Scheduled cleanup failed', { error: error.message });
    });
  }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
  
  // Register with memory leak prevention registry
  registry.registerTimer('auth-cleanup', interval, 'interval');
  registry.registerCleanup(() => stopCleanupJob(interval));
  
  logger.info('🕐 Auth cleanup job initialized (runs every 24 hours)');
  
  return interval;
};

/**
 * Stop cleanup job scheduler
 * @param {NodeJS.Timer} interval - The interval timer to stop
 */
const stopCleanupJob = (interval) => {
  if (interval) {
    clearInterval(interval);
    logger.info('🛑 Auth cleanup job stopped');
  }
};

module.exports = {
  runCleanup,
  initializeCleanupJob,
  stopCleanupJob
};

