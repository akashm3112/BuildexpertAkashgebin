const { query, getRow } = require('../database/connection');
const { tableExists } = require('../utils/tableCache');
const logger = require('../utils/logger');

/**
 * Repository layer for admin database operations
 * Contains all SQL queries separated from business logic
 */

class AdminRepository {
  /**
   * Get dashboard statistics
   */
  static async getDashboardStats() {
    // Get user and provider counts in single query
    const userProviderCounts = await query(`
      SELECT 
        role,
        COUNT(*) as count
      FROM users
      WHERE role IN ('user', 'provider')
      GROUP BY role
    `);

    // Get bookings count
    const bookingsCount = await query('SELECT COUNT(*) as count FROM bookings');

    // Get revenue
    const revenueResult = await query(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM payment_transactions 
      WHERE status = 'completed'
    `);

    // Check tables in parallel
    const [userReportsExists, providerReportsExists, legacyReportsExists] = await Promise.all([
      tableExists('public.user_reports_providers'),
      tableExists('public.provider_reports_users'),
      tableExists('public.provider_reports')
    ]);

    return {
      userProviderCounts: userProviderCounts.rows,
      bookingsCount: parseInt(bookingsCount.rows[0].count),
      revenue: parseFloat(revenueResult.rows[0].total) || 0,
      tableChecks: {
        userReportsExists,
        providerReportsExists,
        legacyReportsExists
      }
    };
  }

  /**
   * Get report statistics by status
   */
  static async getReportStats(tableChecks) {
    const { userReportsExists, providerReportsExists, legacyReportsExists } = tableChecks;
    let reportsStats = { total: 0, open: 0, resolved: 0, closed: 0 };
    
    const reportQueries = [];
    
    if (userReportsExists) {
      reportQueries.push(
        query(`
          SELECT 
            COUNT(*) FILTER (WHERE status IS NOT NULL AND status != '') as total,
            COUNT(*) FILTER (WHERE status = 'open') as open_count,
            COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
            COUNT(*) FILTER (WHERE status = 'closed') as closed_count
          FROM user_reports_providers
          WHERE status IS NOT NULL AND status != ''
        `).then(result => {
          const row = result.rows[0];
          reportsStats.total += parseInt(row.total) || 0;
          reportsStats.open += parseInt(row.open_count) || 0;
          reportsStats.resolved += parseInt(row.resolved_count) || 0;
          reportsStats.closed += parseInt(row.closed_count) || 0;
        }).catch(error => {
          logger.warn('Failed to count user_reports_providers', { error: error.message });
        })
      );
    }

    if (providerReportsExists) {
      reportQueries.push(
        query(`
          SELECT 
            COUNT(*) FILTER (WHERE status IS NOT NULL AND status != '') as total,
            COUNT(*) FILTER (WHERE status = 'open') as open_count,
            COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
            COUNT(*) FILTER (WHERE status = 'closed') as closed_count
          FROM provider_reports_users
          WHERE status IS NOT NULL AND status != ''
        `).then(result => {
          const row = result.rows[0];
          reportsStats.total += parseInt(row.total) || 0;
          reportsStats.open += parseInt(row.open_count) || 0;
          reportsStats.resolved += parseInt(row.resolved_count) || 0;
          reportsStats.closed += parseInt(row.closed_count) || 0;
        }).catch(error => {
          logger.warn('Failed to count provider_reports_users', { error: error.message });
        })
      );
    }

    if (legacyReportsExists) {
      reportQueries.push(
        query(`
          SELECT table_type 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'provider_reports'
        `).then(tableTypeResult => {
          if (tableTypeResult.rows.length > 0 && tableTypeResult.rows[0].table_type === 'BASE TABLE') {
            return query(`
              SELECT 
                COUNT(*) FILTER (WHERE status IS NOT NULL AND status != '') as total,
                COUNT(*) FILTER (WHERE status = 'open') as open_count,
                COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
                COUNT(*) FILTER (WHERE status = 'closed') as closed_count
              FROM provider_reports
              WHERE status IS NOT NULL AND status != ''
            `).then(result => {
              const row = result.rows[0];
              reportsStats.total += parseInt(row.total) || 0;
              reportsStats.open += parseInt(row.open_count) || 0;
              reportsStats.resolved += parseInt(row.resolved_count) || 0;
              reportsStats.closed += parseInt(row.closed_count) || 0;
            });
          }
        }).catch(error => {
          logger.warn('Failed to count legacy provider_reports', { error: error.message });
        })
      );
    }

    await Promise.all(reportQueries);
    return reportsStats;
  }

  /**
   * Get users with pagination
   */
  static async getUsers(page, limit) {
    const offset = (page - 1) * limit;
    
    const [usersResult, countResult] = await Promise.all([
      query(`
        SELECT 
          u.id, u.full_name, u.email, u.phone, u.role, u.is_verified, u.created_at,
          COUNT(b.id) as total_bookings
        FROM users u
        LEFT JOIN bookings b ON u.id = b.user_id
        WHERE u.role = 'user'
        GROUP BY u.id, u.full_name, u.email, u.phone, u.role, u.is_verified, u.created_at
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]),
      query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['user'])
    ]);

    return {
      users: usersResult.rows,
      totalCount: parseInt(countResult.rows[0].count)
    };
  }

  /**
   * Get providers with pagination
   */
  static async getProviders(page, limit) {
    const offset = (page - 1) * limit;
    
    let providersResult;
    try {
      providersResult = await query(`
        SELECT 
          u.id, u.full_name, u.email, u.phone, u.role, u.is_verified, u.created_at,
          pp.business_name, pp.experience_years, pp.rating, pp.total_reviews
        FROM users u
        LEFT JOIN provider_profiles pp ON u.id = pp.user_id
        WHERE u.role = 'provider'
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
    } catch (error) {
      // Fallback if provider_profiles doesn't exist
      providersResult = await query(`
        SELECT 
          u.id, u.full_name, u.email, u.phone, u.role, u.is_verified, u.created_at,
          NULL as business_name, NULL as experience_years, NULL as rating, NULL as total_reviews
        FROM users u
        WHERE u.role = 'provider'
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
    }

    const countResult = await query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['provider']);

    return {
      providers: providersResult.rows,
      totalCount: parseInt(countResult.rows[0].count)
    };
  }

  /**
   * Get reports with pagination (SQL-based using UNION ALL)
   * Uses CTE to combine all report types and paginate in SQL
   */
  static async getReports(page, limit, status, type) {
    const offset = (page - 1) * limit;
    const params = [];
    let paramIndex = 1;

    // Build status filter
    const statusFilter = status !== 'all' 
      ? `AND status = $${paramIndex++}`
      : '';
    if (status !== 'all') {
      params.push(status.toLowerCase());
    }

    // Build CTE parts for each report type
    const cteParts = [];
    const countQueries = [];

    // User reports (users reporting providers)
    if (type === 'all' || type === 'user') {
      if (await tableExists('public.user_reports_providers')) {
        cteParts.push(`
          SELECT 
            urp.id, 
            urp.incident_type as report_type, 
            urp.description, 
            urp.status, 
            urp.created_at, 
            urp.updated_at,
            urp.reported_by_user_id, 
            urp.reported_provider_id,
            urp.incident_date,
            urp.incident_time,
            urp.evidence,
            u.full_name as reporter_name, 
            u.phone as reporter_phone,
            p.full_name as reported_provider_name, 
            p.phone as reported_provider_phone,
            pp.business_name as reported_provider_business,
            'user_report' as report_source,
            'User Report' as report_category,
            'User' as reporter_type,
            'Provider' as reported_type
          FROM user_reports_providers urp
          LEFT JOIN users u ON urp.reported_by_user_id = u.id
          LEFT JOIN users p ON urp.reported_provider_id = p.id
          LEFT JOIN provider_profiles pp ON p.id = pp.user_id
          WHERE urp.status IS NOT NULL AND urp.status != '' ${statusFilter}
        `);

        countQueries.push(`
          SELECT COUNT(*) as count
          FROM user_reports_providers
          WHERE status IS NOT NULL AND status != '' ${statusFilter}
        `);
      }

      // Legacy provider_reports table
      if (await tableExists('public.provider_reports')) {
        try {
          const tableTypeCheck = await query(`
            SELECT table_type 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'provider_reports'
          `);
          
          if (tableTypeCheck.rows.length > 0 && tableTypeCheck.rows[0].table_type === 'BASE TABLE') {
            cteParts.push(`
              SELECT 
                pr.id,
                COALESCE(pr.report_type, pr.incident_type) as report_type,
                pr.description,
                pr.status,
                pr.created_at,
                pr.updated_at,
                pr.reported_by_user_id,
                pr.reported_provider_id,
                NULL::DATE as incident_date,
                NULL::TIME as incident_time,
                NULL::JSONB as evidence,
                u.full_name as reporter_name,
                u.phone as reporter_phone,
                p.full_name as reported_provider_name,
                p.phone as reported_provider_phone,
                pp.business_name as reported_provider_business,
                'legacy_user_report' as report_source,
                'User Report' as report_category,
                'User' as reporter_type,
                'Provider' as reported_type
              FROM provider_reports pr
              LEFT JOIN users u ON pr.reported_by_user_id = u.id
              LEFT JOIN users p ON pr.reported_provider_id = p.id
              LEFT JOIN provider_profiles pp ON p.id = pp.user_id
              WHERE pr.status IS NOT NULL AND pr.status != '' ${statusFilter}
            `);

            countQueries.push(`
              SELECT COUNT(*) as count
              FROM provider_reports
              WHERE status IS NOT NULL AND status != '' ${statusFilter}
            `);
          }
        } catch (error) {
          logger.warn('Failed to check legacy provider_reports', { error: error.message });
        }
      }
    }

    // Provider reports (providers reporting users)
    if (type === 'all' || type === 'provider') {
      if (await tableExists('public.provider_reports_users')) {
        cteParts.push(`
          SELECT 
            pru.id,
            pru.incident_type as report_type,
            pru.description,
            pru.status,
            pru.created_at,
            pru.updated_at,
            pru.provider_id as reported_by_user_id,
            pru.customer_user_id as reported_provider_id,
            pru.incident_date,
            pru.incident_time,
            pru.evidence,
            p.full_name as reporter_name,
            p.phone as reporter_phone,
            COALESCE(u.full_name, pru.customer_name) as reported_provider_name,
            u.phone as reported_provider_phone,
            NULL::TEXT as reported_provider_business,
            'provider_report' as report_source,
            'Provider Report' as report_category,
            'Provider' as reporter_type,
            'User' as reported_type
          FROM provider_reports_users pru
          LEFT JOIN users p ON pru.provider_id = p.id
          LEFT JOIN users u ON pru.customer_user_id = u.id
          WHERE pru.status IS NOT NULL AND pru.status != '' ${statusFilter}
        `);

        countQueries.push(`
          SELECT COUNT(*) as count
          FROM provider_reports_users
          WHERE status IS NOT NULL AND status != '' ${statusFilter}
        `);
      }
    }

    if (cteParts.length === 0) {
      return { reports: [], totalCount: 0 };
    }

    // Get total count
    const countParams = status !== 'all' ? [status.toLowerCase()] : [];
    const countResults = await Promise.all(
      countQueries.map(q => query(q, countParams))
    );
    const totalCount = countResults.reduce((sum, result) => sum + parseInt(result.rows[0].count), 0);

    // Build UNION ALL query with pagination
    const unionQuery = `
      WITH all_reports AS (
        ${cteParts.join(' UNION ALL ')}
      )
      SELECT * FROM all_reports
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(limit, offset);
    const reportsResult = await query(unionQuery, params);

    return {
      reports: reportsResult.rows,
      totalCount
    };
  }

  /**
   * Update report status
   */
  static async updateReportStatus(id, status) {
    // Try user_reports_providers first
    let result = await query(
      'UPDATE user_reports_providers SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );

    // If not found, try provider_reports_users
    if (result.rows.length === 0) {
      result = await query(
        'UPDATE provider_reports_users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [status, id]
      );
    }

    // If still not found, try legacy provider_reports
    if (result.rows.length === 0 && await tableExists('public.provider_reports')) {
      try {
        const tableTypeCheck = await query(`
          SELECT table_type 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'provider_reports'
        `);
        
        if (tableTypeCheck.rows.length > 0 && tableTypeCheck.rows[0].table_type === 'BASE TABLE') {
          result = await query(
            'UPDATE provider_reports SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [status, id]
          );
        }
      } catch (error) {
        logger.warn('Failed to update legacy provider_reports', { error: error.message });
      }
    }

    return result.rows[0] || null;
  }

  /**
   * Get user by ID and role
   */
  static async getUserById(id, role) {
    return getRow('SELECT * FROM users WHERE id = $1 AND role = $2', [id, role]);
  }

  /**
   * Get provider profile by user ID
   */
  static async getProviderProfileByUserId(userId) {
    return getRow('SELECT id FROM provider_profiles WHERE user_id = $1', [userId]);
  }

  /**
   * Update user verification status
   */
  static async updateUserVerification(id, role, isVerified) {
    const result = await query(
      'UPDATE users SET is_verified = $1 WHERE id = $2 AND role = $3 RETURNING *',
      [isVerified, id, role]
    );
    return result.rows[0] || null;
  }
}

module.exports = AdminRepository;

