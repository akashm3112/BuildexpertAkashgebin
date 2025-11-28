const { query } = require('../database/connection');

/**
 * Migration 010: Add Authentication Security Tables
 * Purpose: Token blacklisting, session management, and security auditing
 * Features: Multi-device support, token revocation, comprehensive security logging
 */
const addAuthSecurityTables = async () => {
  try {

    // 1. Token Blacklist Table
    await query(`
      CREATE TABLE IF NOT EXISTS token_blacklist (
        id SERIAL PRIMARY KEY,
        token_jti VARCHAR(255) UNIQUE NOT NULL,
        user_id UUID NOT NULL,
        reason VARCHAR(100) NOT NULL,
        blacklisted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        
        CONSTRAINT fk_token_blacklist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 2. Create indexes for token_blacklist
    await query(`
      CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti ON token_blacklist(token_jti);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_token_blacklist_user_id ON token_blacklist(user_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist(expires_at);
    `);

    // 3. User Sessions Table
    await query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        token_jti VARCHAR(255) UNIQUE NOT NULL,
        device_name VARCHAR(255),
        device_type VARCHAR(50),
        ip_address VARCHAR(45) NOT NULL,
        user_agent TEXT,
        location_city VARCHAR(100),
        location_country VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        
        CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 4. Create indexes for user_sessions
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_token_jti ON user_sessions(token_jti);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON user_sessions(is_active);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity);
    `);

    // 5. Login Attempts Table
    await query(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        attempt_type VARCHAR(20) NOT NULL,
        failure_reason VARCHAR(100),
        user_agent TEXT,
        attempted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        user_id UUID,
        
        CONSTRAINT fk_login_attempts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 6. Create indexes for login_attempts
    await query(`
      CREATE INDEX IF NOT EXISTS idx_login_attempts_phone ON login_attempts(phone);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_address ON login_attempts(ip_address);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at ON login_attempts(attempted_at);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);
    `);

    // 7. Security Events Table
    await query(`
      CREATE TABLE IF NOT EXISTS security_events (
        id SERIAL PRIMARY KEY,
        user_id UUID,
        event_type VARCHAR(50) NOT NULL,
        event_description TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        severity VARCHAR(20) DEFAULT 'info',
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT fk_security_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 8. Create indexes for security_events
    await query(`
      CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);
    `);

    // 9. Create cleanup function
    await query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_auth_data()
      RETURNS void AS $$
      BEGIN
        -- Remove expired blacklisted tokens (older than their expiry)
        DELETE FROM token_blacklist WHERE expires_at < CURRENT_TIMESTAMP;
        
        -- Remove inactive sessions (expired or inactive for 30+ days)
        DELETE FROM user_sessions 
        WHERE expires_at < CURRENT_TIMESTAMP 
           OR (is_active = FALSE AND last_activity < CURRENT_TIMESTAMP - INTERVAL '30 days');
        
        -- Remove old login attempts (keep last 90 days only)
        DELETE FROM login_attempts WHERE attempted_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
        
        -- Remove old security events (keep last 1 year only)
        DELETE FROM security_events WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 year';
        
        RAISE NOTICE 'Auth data cleanup completed at %', CURRENT_TIMESTAMP;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 10. Add table comments for documentation
    await query(`
      COMMENT ON TABLE token_blacklist IS 'Stores revoked JWT tokens to prevent reuse after logout or security events';
    `);
    await query(`
      COMMENT ON TABLE user_sessions IS 'Tracks active user sessions across devices for session management';
    `);
    await query(`
      COMMENT ON TABLE login_attempts IS 'Records all login attempts for security monitoring and rate limiting';
    `);
    await query(`
      COMMENT ON TABLE security_events IS 'Audit log for all security-related events in the system';
    `);
    await query(`
      COMMENT ON FUNCTION cleanup_expired_auth_data IS 'Removes expired tokens, sessions, and old security data';
    `);

  } catch (error) {
    console.error('❌ Error creating auth security tables:', error);
    throw error;
  }
};

module.exports = addAuthSecurityTables;

// Run directly if executed as main module
if (require.main === module) {
  addAuthSecurityTables()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

