const { query } = require('../database/connection');

/**
 * Add call masking related tables
 * This migration creates tables for WebRTC call functionality
 */
const addCallMaskingTables = async () => {
  try {

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

    // 2. Create call_logs table with enhanced fields
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
        connection_quality JSONB,
        error_details JSONB,
        end_reason TEXT,
        metrics JSONB,
        call_started_at TIMESTAMP,
        call_ended_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 3. Create call_events table for detailed call event tracking
    await query(`
      CREATE TABLE IF NOT EXISTS call_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        call_log_id UUID REFERENCES call_logs(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        event_data JSONB,
        timestamp TIMESTAMP DEFAULT NOW()
      );
    `);

    // 4. Create call_recordings table (optional)
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

    // 5. Create comprehensive indexes for better performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_call_sessions_booking_id ON call_sessions(booking_id);
      CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON call_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_call_sessions_session_id ON call_sessions(session_id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_booking_id ON call_logs(booking_id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid ON call_logs(call_sid);
      CREATE INDEX IF NOT EXISTS idx_call_logs_session_id ON call_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_call_status ON call_logs(call_status);
      CREATE INDEX IF NOT EXISTS idx_call_logs_end_reason ON call_logs(end_reason);
      CREATE INDEX IF NOT EXISTS idx_call_logs_call_started_at ON call_logs(call_started_at);
      CREATE INDEX IF NOT EXISTS idx_call_logs_call_ended_at ON call_logs(call_ended_at);
      CREATE INDEX IF NOT EXISTS idx_call_events_call_log_id ON call_events(call_log_id);
      CREATE INDEX IF NOT EXISTS idx_call_events_event_type ON call_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_call_events_timestamp ON call_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_call_recordings_call_log_id ON call_recordings(call_log_id);
    `);

    return { success: true };
  } catch (error) {
    console.error('❌ Error creating call masking tables:', error);
    return { success: false, error: error.message };
  }
};

module.exports = addCallMaskingTables;

// Run if called directly
if (require.main === module) {
  addCallMaskingTables()
    .then(result => {
      if (result.success) {
        process.exit(0);
      } else {
        console.error('❌ Migration failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Migration error:', error);
      process.exit(1);
    });
}
