const { query } = require('../database/connection');

/**
 * Migration 018: Add Refresh Tokens Table
 * Purpose: Implement refresh token mechanism for better security
 * - Short-lived access tokens (15 minutes)
 * - Long-lived refresh tokens (7 days)
 * - Token rotation on refresh
 */
const addRefreshTokensTable = async () => {
  try {
    // Create refresh_tokens table
    await query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        token_jti UUID NOT NULL UNIQUE, -- JWT ID of the refresh token
        access_token_jti UUID NOT NULL, -- JWT ID of the associated access token
        device_name TEXT,
        device_type TEXT,
        ip_address INET,
        user_agent TEXT,
        is_revoked BOOLEAN DEFAULT FALSE,
        revoked_at TIMESTAMP WITH TIME ZONE,
        revoked_reason TEXT,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_used_at TIMESTAMP WITH TIME ZONE,
        family_id UUID, -- For token family rotation (prevents token reuse attacks)
        CONSTRAINT refresh_tokens_expires_at_check CHECK (expires_at > created_at)
      );
    `);

    // Create indexes for performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_jti ON refresh_tokens(token_jti);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_access_token_jti ON refresh_tokens(access_token_jti);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens(family_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_is_revoked ON refresh_tokens(is_revoked);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active ON refresh_tokens(user_id, is_revoked, expires_at);
    `);

    console.log('✅ Refresh tokens table created successfully');

  } catch (error) {
    console.error('❌ Error creating refresh tokens table:', error);
    throw error;
  }
};

module.exports = addRefreshTokensTable;

// Run directly if executed as main module
if (require.main === module) {
  addRefreshTokensTable()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

