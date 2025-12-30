const AdminRepository = require('../repositories/adminRepository');
const { blockIdentifiersForAccount } = require('../utils/blocklist');
const { withTransaction } = require('../database/connection');
const { tableExists } = require('../utils/tableCache');
const logger = require('../utils/logger');

/**
 * Service layer for admin business logic
 * Contains business rules and orchestrates repository calls
 */

class AdminService {
  /**
   * Get dashboard statistics
   */
  static async getDashboardStats() {
    try {
      const stats = await AdminRepository.getDashboardStats();
      const reportsStats = await AdminRepository.getReportStats(stats.tableChecks || {});

      // Parse user/provider counts - handle empty arrays
      const countsByRole = {};
      if (stats.userProviderCounts && Array.isArray(stats.userProviderCounts)) {
        stats.userProviderCounts.forEach(row => {
          if (row && row.role) {
            countsByRole[row.role] = parseInt(row.count) || 0;
          }
        });
      }

      return {
        totalUsers: countsByRole.user || 0,
        totalProviders: countsByRole.provider || 0,
        totalBookings: parseInt(stats.bookingsCount) || 0,
        totalRevenue: parseFloat(stats.revenue) || 0,
        pendingReports: parseInt(reportsStats?.open) || 0,
        reportsStats: reportsStats || { total: 0, open: 0, resolved: 0, closed: 0 }
      };
    } catch (error) {
      logger.error('Error fetching admin dashboard stats', { error: error.message, stack: error.stack });
      // Return default values on error to prevent frontend from breaking
      return {
        totalUsers: 0,
        totalProviders: 0,
        totalBookings: 0,
        totalRevenue: 0,
        pendingReports: 0,
        reportsStats: { total: 0, open: 0, resolved: 0, closed: 0 }
      };
    }
  }

  /**
   * Get users with pagination
   */
  static async getUsers(page, limit) {
    return AdminRepository.getUsers(page, limit);
  }

  /**
   * Get providers with pagination
   */
  static async getProviders(page, limit) {
    return AdminRepository.getProviders(page, limit);
  }

  /**
   * Get reports with pagination
   */
  static async getReports(page, limit, status, type) {
    return AdminRepository.getReports(page, limit, status, type);
  }

  /**
   * Update report status
   */
  static async updateReportStatus(id, status) {
    const report = await AdminRepository.updateReportStatus(id, status);
    if (!report) {
      throw new Error('Report not found');
    }
    return report;
  }

  /**
   * Delete pending reports (transactional)
   */
  static async deletePendingReports() {
    return withTransaction(async (client) => {
      const deletedUserReports = await client.query(
        `DELETE FROM user_reports_providers WHERE status = 'open' RETURNING id`
      );

      const deletedProviderReports = await client.query(
        `DELETE FROM provider_reports_users WHERE status = 'open' RETURNING id`
      );

      let deletedLegacyReports = { rows: [] };
      if (await tableExists('public.provider_reports')) {
        try {
          const tableTypeCheck = await client.query(`
            SELECT table_type 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'provider_reports'
          `);
          
          if (tableTypeCheck.rows.length > 0 && tableTypeCheck.rows[0].table_type === 'BASE TABLE') {
            deletedLegacyReports = await client.query(
              `DELETE FROM provider_reports WHERE status = 'open' RETURNING id`
            );
          }
        } catch (error) {
          logger.warn('Failed to delete legacy provider_reports', { error: error.message });
        }
      }

      return {
        deletedUserReports: deletedUserReports.rows.map(r => r.id),
        deletedProviderReports: deletedProviderReports.rows.map(r => r.id),
        deletedLegacyReports: deletedLegacyReports.rows.map(r => r.id),
        totalDeleted: deletedUserReports.rows.length + 
                     deletedProviderReports.rows.length + 
                     deletedLegacyReports.rows.length
      };
    }, { name: 'delete-pending-reports' });
  }

  /**
   * Delete user (transactional with cascading deletes)
   */
  static async deleteUser(userId, adminId) {
    // First check if user exists
    const user = await AdminRepository.getUserById(userId, 'user');
    if (!user) {
      throw new Error('User not found');
    }

    // Block identifiers before deletion
    try {
      await blockIdentifiersForAccount({
        phone: user.phone,
        email: user.email,
        reason: 'Removed by admin due to reports or policy violations',
        blockedBy: adminId,
        metadata: {
          source: 'admin_remove_user',
          originalRole: user.role,
          adminId: adminId || null,
          removedAt: new Date().toISOString()
        }
      });
    } catch (blockError) {
      logger.error('Failed to block user identifiers prior to deletion', {
        error: blockError.message,
        userId
      });
      throw new Error('Failed to block user account. Deletion aborted.');
    }

    // Delete in transaction
    return withTransaction(async (client) => {
      // Delete related data in correct order to avoid foreign key constraints
      await client.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_reports_providers WHERE reported_by_user_id = $1', [userId]);
      await client.query('DELETE FROM bookings WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM addresses WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM users WHERE id = $1', [userId]);

      return { success: true };
    }, { name: 'delete-user' });
  }

  /**
   * Delete provider (transactional with cascading deletes)
   */
  static async deleteProvider(providerId, adminId) {
    // First check if provider exists
    const provider = await AdminRepository.getUserById(providerId, 'provider');
    if (!provider) {
      throw new Error('Provider not found');
    }

    // Get provider profile for cascading deletes
    const providerProfile = await AdminRepository.getProviderProfileByUserId(providerId);

    // Block identifiers before deletion
    try {
      await blockIdentifiersForAccount({
        phone: provider.phone,
        email: provider.email,
        reason: 'Removed by admin due to reports or policy violations',
        blockedBy: adminId,
        metadata: {
          source: 'admin_remove_provider',
          originalRole: provider.role,
          adminId: adminId || null,
          removedAt: new Date().toISOString()
        }
      });
    } catch (blockError) {
      logger.error('Failed to block provider identifiers prior to deletion', {
        error: blockError.message,
        providerId
      });
      throw new Error('Failed to block provider account. Deletion aborted.');
    }

    // Delete in transaction
    return withTransaction(async (client) => {
      // Delete related data in correct order
      await client.query('DELETE FROM notifications WHERE user_id = $1', [providerId]);
      await client.query('DELETE FROM user_reports_providers WHERE reported_provider_id = $1 OR reported_by_user_id = $1', [providerId]);
      
      // Delete bookings first (to avoid foreign key constraint)
      // Note: Admin deletion of provider removes all bookings (different from customer account deletion)
      if (providerProfile) {
        await client.query(`
          DELETE FROM bookings 
          WHERE provider_service_id IN (
            SELECT ps.id FROM provider_services ps 
            WHERE ps.provider_id = $1
          )
        `, [providerProfile.id]);
        
        // Delete provider services after bookings are deleted
        await client.query('DELETE FROM provider_services WHERE provider_id = $1', [providerProfile.id]);
      }
      
      await client.query('DELETE FROM addresses WHERE user_id = $1', [providerId]);
      
      // Delete provider profile (this has CASCADE)
      if (providerProfile) {
        await client.query('DELETE FROM provider_profiles WHERE id = $1', [providerProfile.id]);
      }
      
      // Delete user
      await client.query('DELETE FROM users WHERE id = $1', [providerId]);

      return { success: true };
    }, { name: 'delete-provider' });
  }

  /**
   * Update user verification status
   */
  static async updateUserVerification(userId, role, isVerified) {
    const user = await AdminRepository.updateUserVerification(userId, role, isVerified);
    if (!user) {
      throw new Error(`${role === 'user' ? 'User' : 'Provider'} not found`);
    }
    return user;
  }
}

module.exports = AdminService;

