const { query, getRow, getRows } = require('../database/connection');


class DatabaseOptimizer {
  
  static async getBookingsWithDetails(userId, options = {}) {
    const { status, page = 1, limit = 10, userType = 'user' } = options;
    const offset = (page - 1) * limit;

    let whereClause, queryParams, paramCount;

    if (userType === 'user') {
      whereClause = 'WHERE b.user_id = $1';
      queryParams = [userId];
      paramCount = 2;
    } else {
      // For providers
      whereClause = `
        WHERE ps.provider_id = (
          SELECT id FROM provider_profiles WHERE user_id = $1
        )
      `;
      queryParams = [userId];
      paramCount = 2;
    }

    if (status) {
      whereClause += ` AND b.status = $${paramCount}`;
      queryParams.push(status);
      paramCount++;
    }

    // Single optimized query with all joins
    const bookings = await getRows(`
      SELECT 
        b.id,
        b.status,
        b.appointment_date,
        b.appointment_time,
        b.address,
        b.description,
        b.created_at,
        -- User/Provider info
        ${userType === 'user' ? `
          u.full_name as provider_name,
          u.phone as provider_phone,
          u.profile_pic_url as provider_profile_pic_url,
        ` : `
          u.full_name as customer_name,
          u.phone as customer_phone,
        `}
        -- Service info
        sm.name as service_name,
        ps.id as provider_service_id,
        ps.service_charge_value,
        ps.service_charge_unit,
        ps.working_proof_urls,
        -- Rating info (if exists)
        r.rating as rating_value,
        r.review as rating_review,
        r.created_at as rating_created_at
      FROM bookings b
      JOIN provider_services ps ON b.provider_service_id = ps.id
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      JOIN users u ON ${userType === 'user' ? 'pp.user_id' : 'b.user_id'} = u.id
      JOIN services_master sm ON ps.service_id = sm.id
      LEFT JOIN ratings r ON r.booking_id = b.id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `, [...queryParams, limit, offset]);

    // Get total count efficiently
    const countResult = await getRow(`
      SELECT COUNT(*) as total
      FROM bookings b
      JOIN provider_services ps ON b.provider_service_id = ps.id
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      ${whereClause}
    `, queryParams);

    const total = parseInt(countResult.total);
    const totalPages = Math.ceil(total / limit);

    // Transform the data
    const mappedBookings = bookings.map(b => ({
      id: b.id,
      status: b.status,
      appointment_date: b.appointment_date,
      appointment_time: b.appointment_time,
      address: b.address,
      description: b.description,
      created_at: b.created_at,
      service_name: b.service_name,
      provider_service_id: b.provider_service_id,
      service_charge_value: b.service_charge_value,
      service_charge_unit: b.service_charge_unit,
      working_proof_urls: b.working_proof_urls,
      ...(userType === 'user' ? {
        provider_name: b.provider_name,
        provider_phone: b.provider_phone,
        provider_profile_pic_url: b.provider_profile_pic_url,
      } : {
        customer_name: b.customer_name,
        customer_phone: b.customer_phone,
      }),
      rating: b.rating_value !== null ? {
        rating: b.rating_value,
        review: b.rating_review,
        created_at: b.rating_created_at
      } : null
    }));

    return {
      bookings: mappedBookings,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }

  /**
   * Get provider details with ratings in a single query
   * Prevents N+1 queries for provider ratings
   */
  static async getProviderWithRatings(providerServiceId) {
    // Get provider details
    const provider = await getRow(`
      SELECT 
        u.id as user_id,
        u.full_name,
        u.phone,
        u.profile_pic_url,
        pp.years_of_experience,
        pp.service_description,
        pp.is_engineering_provider,
        pp.engineering_certificate_url,
        ps.id as provider_service_id,
        ps.service_charge_value,
        ps.service_charge_unit,
        ps.working_proof_urls,
        ps.payment_start_date,
        ps.payment_end_date,
        sm.name as service_name,
        a.state,
        a.full_address
      FROM provider_services ps
      JOIN provider_profiles pp ON ps.provider_id = pp.id
      JOIN users u ON pp.user_id = u.id
      JOIN services_master sm ON ps.service_id = sm.id
      LEFT JOIN addresses a ON a.user_id = u.id AND a.type = 'home'
      WHERE ps.id = $1 AND ps.payment_status = 'active'
    `, [providerServiceId]);

    if (!provider) {
      return null;
    }

    // Get ratings with customer names in a single query
    const ratings = await getRows(`
      SELECT 
        r.rating, 
        r.review, 
        r.created_at, 
        u.full_name as customer_name,
        b.appointment_date
      FROM ratings r
      JOIN bookings b ON r.booking_id = b.id
      JOIN users u ON b.user_id = u.id
      WHERE b.provider_service_id = $1
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [providerServiceId]);

    // Calculate average rating
    const avgRating = ratings.length > 0 
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length 
      : 0;

    return {
      ...provider,
      ratings,
      average_rating: Math.round(avgRating * 10) / 10, // Round to 1 decimal place
      total_ratings: ratings.length
    };
  }

  /**
   * Get notifications with optimized pagination
   */
  static async getNotificationsWithPagination(userId, userRole, options = {}) {
    const { page = 1, limit = 20, type } = options;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE user_id = $1 AND role = $2';
    let queryParams = [userId, userRole];
    let paramCount = 3;
    
    if (type) {
      whereClause += ` AND title ILIKE $${paramCount}`;
      queryParams.push(`%${type}%`);
      paramCount++;
    }
    
    // Get notifications and count in parallel
    const [notifications, countResult] = await Promise.all([
      getRows(`
        SELECT id, title, message, is_read, created_at, role 
        FROM notifications 
        ${whereClause} 
        ORDER BY created_at DESC 
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `, [...queryParams, limit, offset]),
      getRow(`
        SELECT COUNT(*) as total FROM notifications ${whereClause}
      `, queryParams)
    ]);
    
    const totalCount = parseInt(countResult.total);
    const totalPages = Math.ceil(totalCount / limit);

    return {
      notifications,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }

  /**
   * Batch update multiple records efficiently
   */
  static async batchUpdate(table, updates, whereColumn, whereValues) {
    if (updates.length === 0) return [];
    
    const results = [];
    
    // Process in batches of 100 to avoid query size limits
    const batchSize = 100;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      // Create a single query for the batch
      const values = batch.map((update, index) => {
        const globalIndex = i + index + 1;
        return `($${globalIndex * 2 - 1}, $${globalIndex * 2})`;
      }).join(', ');
      
      const params = batch.flatMap(update => [update.id, update.value]);
      
      const result = await query(`
        UPDATE ${table} 
        SET ${whereColumn} = batch.value
        FROM (VALUES ${values}) AS batch(id, value)
        WHERE ${table}.id = batch.id::uuid
        RETURNING ${table}.id
      `, params);
      
      results.push(...result.rows);
    }
    
    return results;
  }

  /**
   * Get user profile with all related data in one query
   */
  static async getUserProfileWithDetails(userId) {
    const user = await getRow(`
      SELECT 
        u.*,
        pp.years_of_experience,
        pp.service_description,
        pp.is_engineering_provider,
        pp.engineering_certificate_url,
        a.state,
        a.city,
        a.full_address,
        a.pincode
      FROM users u
      LEFT JOIN provider_profiles pp ON u.id = pp.user_id
      LEFT JOIN addresses a ON u.id = a.user_id AND a.type = 'home'
      WHERE u.id = $1
    `, [userId]);

    if (!user) return null;

    // Get user's registered services if they're a provider
    let registeredServices = [];
    if (user.role === 'provider') {
      registeredServices = await getRows(`
        SELECT 
          ps.id,
          ps.service_charge_value,
          ps.service_charge_unit,
          ps.payment_status,
          ps.payment_start_date,
          ps.payment_end_date,
          sm.name as service_name,
          sm.category
        FROM provider_services ps
        JOIN services_master sm ON ps.service_id = sm.id
        WHERE ps.provider_id = (
          SELECT id FROM provider_profiles WHERE user_id = $1
        )
        ORDER BY ps.created_at DESC
      `, [userId]);
    }

    return {
      ...user,
      registered_services: registeredServices
    };
  }
}

module.exports = DatabaseOptimizer;
