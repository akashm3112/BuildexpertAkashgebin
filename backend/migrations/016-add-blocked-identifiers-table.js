const { query } = require('../database/connection');

const createBlockedIdentifiersTable = async () => {
  try {
    console.log('🔒 Creating blocked identifiers table...');

    await query(`
      CREATE TABLE IF NOT EXISTS blocked_identifiers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        identifier_type VARCHAR(20) NOT NULL CHECK (identifier_type IN ('phone', 'email')),
        identifier_value VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        reason TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        blocked_by UUID REFERENCES users(id) ON DELETE SET NULL,
        blocked_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT blocked_identifiers_unique UNIQUE (identifier_type, identifier_value, role)
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_blocked_identifiers_lookup
        ON blocked_identifiers (identifier_type, identifier_value, role);
    `);

    console.log('✅ Blocked identifiers table ready');
  } catch (error) {
    console.error('❌ Error creating blocked identifiers table:', error);
    throw error;
  }
};

module.exports = createBlockedIdentifiersTable;

if (require.main === module) {
  createBlockedIdentifiersTable()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

