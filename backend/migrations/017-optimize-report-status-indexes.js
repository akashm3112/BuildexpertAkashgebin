const { query } = require('../database/connection');

/**
 * Migration 017: Optimize Report Status Indexes
 * Purpose: Add functional indexes for case-insensitive status queries
 * This improves performance of admin dashboard stats queries
 */
const optimizeReportStatusIndexes = async () => {
  try {
    // Add functional index for case-insensitive status queries on user_reports_providers
    // This allows LOWER(status) comparisons to use the index
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_reports_providers_status_lower 
      ON user_reports_providers(LOWER(status))
      WHERE status IS NOT NULL AND status != '';
    `);

    // Add functional index for case-insensitive status queries on provider_reports_users
    await query(`
      CREATE INDEX IF NOT EXISTS idx_provider_reports_users_status_lower 
      ON provider_reports_users(LOWER(status))
      WHERE status IS NOT NULL AND status != '';
    `);

    // Add functional index for legacy provider_reports if it exists as a table
    try {
      const tableTypeCheck = await query(`
        SELECT table_type 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'provider_reports'
      `);
      
      if (tableTypeCheck.rows.length > 0 && tableTypeCheck.rows[0].table_type === 'BASE TABLE') {
        await query(`
          CREATE INDEX IF NOT EXISTS idx_provider_reports_status_lower 
          ON provider_reports(LOWER(status))
          WHERE status IS NOT NULL AND status != '';
        `);
      }
    } catch (error) {
      // Legacy table might not exist, ignore
    }

    console.log('✅ Report status indexes optimized successfully');

  } catch (error) {
    console.error('❌ Error optimizing report status indexes:', error);
    throw error;
  }
};

module.exports = optimizeReportStatusIndexes;

// Run directly if executed as main module
if (require.main === module) {
  optimizeReportStatusIndexes()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

