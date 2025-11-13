const { query } = require('../database/connection');

/**
 * Add sample reports for testing
 */
const addSampleReports = async () => {
  try {

    // Check if provider_reports table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'provider_reports'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      
      await query(`
        CREATE TABLE provider_reports (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          reported_by_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          reported_provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
          report_type TEXT NOT NULL,
          description TEXT NOT NULL,
          status TEXT CHECK (status IN ('open', 'resolved', 'closed')) DEFAULT 'open',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      
    }

    // Get some users and providers for sample data
    const users = await query('SELECT id, full_name, phone FROM users WHERE role = $1 LIMIT 3', ['user']);
    const providers = await query('SELECT id, full_name, phone FROM users WHERE role = $1 LIMIT 3', ['provider']);

    if (users.rows.length === 0 || providers.rows.length === 0) {
      return;
    }

    // Clear existing sample reports
    await query("DELETE FROM provider_reports WHERE description LIKE 'Sample report:%'");

    // Add sample reports
    const sampleReports = [
      {
        reported_by_user_id: users.rows[0].id,
        reported_provider_id: providers.rows[0].id,
        report_type: 'Service Quality',
        description: 'Sample report: Provider did not show up for the scheduled appointment. Waited for 2 hours but no one came.',
        status: 'open'
      },
      {
        reported_by_user_id: users.rows[1]?.id || users.rows[0].id,
        reported_provider_id: providers.rows[1]?.id || providers.rows[0].id,
        report_type: 'Unprofessional Behavior',
        description: 'Sample report: Provider was very rude and unprofessional. Used inappropriate language and did not complete the work properly.',
        status: 'open'
      },
      {
        reported_by_user_id: users.rows[2]?.id || users.rows[0].id,
        reported_provider_id: providers.rows[2]?.id || providers.rows[0].id,
        report_type: 'Overcharging',
        description: 'Sample report: Provider charged much more than the quoted price and refused to provide a proper receipt.',
        status: 'resolved'
      },
      {
        reported_by_user_id: users.rows[0].id,
        reported_provider_id: providers.rows[1]?.id || providers.rows[0].id,
        report_type: 'Poor Work Quality',
        description: 'Sample report: The work done was of very poor quality. Had to call another provider to fix the issues.',
        status: 'closed'
      }
    ];

    for (const report of sampleReports) {
      await query(`
        INSERT INTO provider_reports (reported_by_user_id, reported_provider_id, report_type, description, status)
        VALUES ($1, $2, $3, $4, $5)
      `, [report.reported_by_user_id, report.reported_provider_id, report.report_type, report.description, report.status]);
    }


  } catch (error) {
    console.error('❌ Error adding sample reports:', error);
    throw error;
  }
};

// Run the migration
if (require.main === module) {
  addSampleReports()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Sample reports migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addSampleReports };
