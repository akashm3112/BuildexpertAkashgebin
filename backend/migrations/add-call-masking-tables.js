const { query } = require('../database/connection');

/**
 * Add call masking related tables
 */
const addCallMaskingTables = async () => {
  try {
    console.log('📞 Creating call masking tables...');

    // 1. Create call_sessions table
    await query(`
      CREATE TABLE IF NOT EXISTS call_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL UNIQUE,
        proxy_number TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        provider_phone TEXT NOT NULL,
        customer_participant_sid TEXT,
        provider_participant_sid TEXT,
        status TEXT CHECK (status IN ('active', 'ended', 'expired')) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        ended_at TIMESTAMP
      );
    `);
    console.log('✅ call_sessions table created');

    // 2. Create call_logs table
    await query(`
      CREATE TABLE IF NOT EXISTS call_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL,
        call_sid TEXT NOT NULL UNIQUE,
        caller_type TEXT CHECK (caller_type IN ('user', 'provider')) NOT NULL,
        caller_phone TEXT NOT NULL,
        call_status TEXT DEFAULT 'initiated',
        call_duration INTEGER DEFAULT 0,
        call_started_at TIMESTAMP,
        call_ended_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ call_logs table created');

    // 3. Create call_recordings table (optional)
    await query(`
      CREATE TABLE IF NOT EXISTS call_recordings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        call_log_id UUID REFERENCES call_logs(id) ON DELETE CASCADE,
        recording_sid TEXT NOT NULL UNIQUE,
        recording_url TEXT,
        duration INTEGER DEFAULT 0,
        file_size INTEGER DEFAULT 0,
        status TEXT DEFAULT 'processing',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ call_recordings table created');

    // 4. Create indexes for better performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_call_sessions_booking_id ON call_sessions(booking_id);
      CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON call_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_call_sessions_session_id ON call_sessions(session_id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_booking_id ON call_logs(booking_id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid ON call_logs(call_sid);
      CREATE INDEX IF NOT EXISTS idx_call_logs_session_id ON call_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_status ON call_logs(call_status);
      CREATE INDEX IF NOT EXISTS idx_call_recordings_call_log_id ON call_recordings(call_log_id);
    `);
    console.log('✅ Call masking indexes created');

    console.log('🎉 Call masking tables setup completed!');
    return { success: true };
  } catch (error) {
    console.error('❌ Error creating call masking tables:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { addCallMaskingTables };

// Run migration if called directly
if (require.main === module) {
  addCallMaskingTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}



