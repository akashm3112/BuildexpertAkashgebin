/**
 * PM2 Ecosystem Configuration for Production
 * 
 * This configuration enables:
 * - Multi-core clustering (utilizes all CPU cores)
 * - Auto-restart on crashes
 * - Zero-downtime reloads
 * - Memory and CPU monitoring
 * - Log management
 * 
 * For 3-4k concurrent users, PM2 clustering is ESSENTIAL
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 stop all
 *   pm2 reload all
 *   pm2 logs
 *   pm2 monit
 */

module.exports = {
  apps: [{
    name: 'buildxpert-api',
    script: './server.js',
    instances: 'max', // Use all available CPU cores (or set to specific number like 4)
    exec_mode: 'cluster', // Enable clustering mode
    watch: false, // Disable in production
    max_memory_restart: '1G', // Restart if memory exceeds 1GB
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000,
      // Database pool configuration for high concurrency
      DB_POOL_MAX: 50, // Recommended: 50-100 for 3-4k concurrent users
      DB_POOL_MIN: 5,  // Recommended: 5-10 for 3-4k concurrent users
      // Note: Total connections = DB_POOL_MAX * instances
      // Example: 50 * 4 cores = 200 total connections (ensure DB can handle this)
    },
    // Logging configuration
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // Auto-restart configuration
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    // Advanced PM2 features
    kill_timeout: 5000,
    listen_timeout: 10000,
    shutdown_with_message: true,
    wait_ready: true,
    // Instance management
    instance_var: 'INSTANCE_ID',
    // Health monitoring
    pmx: true,
    // Graceful shutdown
    kill_timeout: 5000
  }]
};

