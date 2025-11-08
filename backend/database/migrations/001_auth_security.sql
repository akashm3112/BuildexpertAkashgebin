-- ============================================================================
-- AUTHENTICATION SECURITY TABLES
-- Purpose: Token blacklisting, session management, and security auditing
-- Created: 2025
-- Version: 1.0
-- ============================================================================

-- ============================================================================
-- TOKEN BLACKLIST TABLE
-- Purpose: Store revoked/invalidated tokens to prevent reuse
-- Use Cases: Logout, forced logout, token compromise, password changes
-- ============================================================================
CREATE TABLE IF NOT EXISTS token_blacklist (
  id SERIAL PRIMARY KEY,
  token_jti VARCHAR(255) UNIQUE NOT NULL,  -- JWT ID (jti claim) for token identification
  user_id UUID NOT NULL,  -- UUID to match users table
  reason VARCHAR(100) NOT NULL,  -- 'logout', 'password_change', 'force_logout', 'security_breach'
  blacklisted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,  -- When the token would naturally expire
  ip_address VARCHAR(45),  -- IPv4 or IPv6
  user_agent TEXT,
  
  -- Indexes for performance
  CONSTRAINT fk_token_blacklist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_token_blacklist_jti ON token_blacklist(token_jti);
CREATE INDEX idx_token_blacklist_user_id ON token_blacklist(user_id);
CREATE INDEX idx_token_blacklist_expires_at ON token_blacklist(expires_at);

-- ============================================================================
-- ACTIVE SESSIONS TABLE
-- Purpose: Track active user sessions for proper session management
-- Features: Device tracking, location tracking, last activity
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,  -- UUID to match users table
  token_jti VARCHAR(255) UNIQUE NOT NULL,  -- JWT ID for this session
  device_name VARCHAR(255),  -- e.g., "iPhone 13", "Chrome on Windows"
  device_type VARCHAR(50),  -- 'mobile', 'tablet', 'desktop', 'unknown'
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT,
  location_city VARCHAR(100),
  location_country VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Indexes for performance
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token_jti ON user_sessions(token_jti);
CREATE INDEX idx_user_sessions_is_active ON user_sessions(is_active);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_last_activity ON user_sessions(last_activity);

-- ============================================================================
-- LOGIN ATTEMPTS TABLE
-- Purpose: Track failed login attempts for rate limiting and security monitoring
-- Features: Brute force protection, suspicious activity detection
-- ============================================================================
CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  attempt_type VARCHAR(20) NOT NULL,  -- 'success', 'failed', 'blocked'
  failure_reason VARCHAR(100),  -- 'invalid_password', 'user_not_found', 'rate_limit', etc.
  user_agent TEXT,
  attempted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID,  -- UUID to match users table, NULL if user not found
  
  CONSTRAINT fk_login_attempts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_login_attempts_phone ON login_attempts(phone);
CREATE INDEX idx_login_attempts_ip_address ON login_attempts(ip_address);
CREATE INDEX idx_login_attempts_attempted_at ON login_attempts(attempted_at);
CREATE INDEX idx_login_attempts_user_id ON login_attempts(user_id);

-- ============================================================================
-- SECURITY EVENTS TABLE
-- Purpose: Audit trail for security-related events
-- Features: Comprehensive security logging, compliance, forensics
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_events (
  id SERIAL PRIMARY KEY,
  user_id UUID,  -- UUID to match users table, NULL for anonymous events
  event_type VARCHAR(50) NOT NULL,  -- 'login', 'logout', 'password_change', 'token_refresh', etc.
  event_description TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  severity VARCHAR(20) DEFAULT 'info',  -- 'info', 'warning', 'critical'
  metadata JSONB,  -- Additional event-specific data
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_security_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_event_type ON security_events(event_type);
CREATE INDEX idx_security_events_severity ON security_events(severity);
CREATE INDEX idx_security_events_created_at ON security_events(created_at);

-- ============================================================================
-- CLEANUP FUNCTION
-- Purpose: Automatically remove expired tokens and old sessions
-- Schedule: Run daily via cron job or pg_cron
-- ============================================================================
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

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE token_blacklist IS 'Stores revoked JWT tokens to prevent reuse after logout or security events';
COMMENT ON TABLE user_sessions IS 'Tracks active user sessions across devices for session management';
COMMENT ON TABLE login_attempts IS 'Records all login attempts for security monitoring and rate limiting';
COMMENT ON TABLE security_events IS 'Audit log for all security-related events in the system';
COMMENT ON FUNCTION cleanup_expired_auth_data IS 'Removes expired tokens, sessions, and old security data';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

