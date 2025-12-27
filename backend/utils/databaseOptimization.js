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
        b.selected_service,
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
          a_customer.state as customer_state,
          a_customer.full_address as customer_address,
        `}
        -- Service info
        sm.name as service_name,
        ps.id as provider_service_id,
        b.service_charge_value,
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
      ${userType === 'provider' ? `
        LEFT JOIN addresses a_customer ON a_customer.user_id = b.user_id AND a_customer.type = 'home'
      ` : ''}
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
      selected_service: b.selected_service,
      address: b.address,
      description: b.description,
      created_at: b.created_at,
      service_name: b.service_name,
      provider_service_id: b.provider_service_id,
      service_charge_value: b.service_charge_value,
      working_proof_urls: b.working_proof_urls,
      ...(userType === 'user' ? {
        provider_name: b.provider_name,
        provider_phone: b.provider_phone,
        provider_profile_pic_url: b.provider_profile_pic_url,
      } : {
        customer_name: b.customer_name,
        customer_phone: b.customer_phone,
        customer_state: b.customer_state,
        customer_address: b.customer_address,
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
        ps.working_proof_urls,
        ps.payment_start_date,
        ps.payment_end_date,
        sm.name as service_name,
        a.state,
        a.city,
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

    // PRODUCTION OPTIMIZATION: Fetch sub-services for pricing
    let pricing = {
      minPrice: null,
      maxPrice: null,
      priceRange: null,
      displayPrice: 'Price on request',
      subServiceCount: 0
    };

    try {
      const tableExists = await getRow(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'provider_sub_services'
        );
      `);
      
      if (tableExists && tableExists.exists) {
        const subServices = await getRows(`
          SELECT price
          FROM provider_sub_services
          WHERE provider_service_id = $1
          ORDER BY price ASC
        `, [providerServiceId]);

        if (subServices && subServices.length > 0) {
          const prices = subServices.map(ss => parseFloat(ss.price)).filter(p => !isNaN(p) && p > 0);
          if (prices.length > 0) {
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const subServiceCount = prices.length;

            let displayPrice;
            if (subServiceCount === 1) {
              displayPrice = `₹${minPrice}`;
            } else if (minPrice === maxPrice) {
              displayPrice = `₹${minPrice}`;
            } else {
              displayPrice = `Starting from ₹${minPrice}`;
            }

            pricing = {
              minPrice,
              maxPrice,
              priceRange: minPrice === maxPrice ? minPrice : `${minPrice} - ${maxPrice}`,
              displayPrice,
              subServiceCount
            };
          }
        }
      }
    } catch (error) {
      logger.warn('Could not fetch sub-services for provider pricing', { 
        providerServiceId, 
        error: error.message 
      });
    }

    // PRODUCTION: Fetch full sub-services details for booking screen
    let subServices = [];
    try {
      const tableExists = await getRow(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'provider_sub_services'
        );
      `);
      
      if (tableExists && tableExists.exists) {
        subServices = await getRows(`
          SELECT 
            pss.id,
            pss.sub_service_id,
            pss.price,
            pss.created_at,
            pss.updated_at
          FROM provider_sub_services pss
          WHERE pss.provider_service_id = $1
            AND pss.sub_service_id IS NOT NULL
          ORDER BY pss.created_at ASC
        `, [providerServiceId]);

        // Map to frontend format
        subServices = subServices.map(ss => ({
          id: ss.id,
          serviceId: ss.sub_service_id, // Use sub_service_id directly (frontend identifier)
          serviceName: ss.sub_service_id, // For now, use sub_service_id as name
          price: parseFloat(ss.price),
          createdAt: ss.created_at,
          updatedAt: ss.updated_at
        }));
      }
    } catch (error) {
      logger.warn('Could not fetch sub-services details', { 
        providerServiceId, 
        error: error.message 
      });
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
      total_ratings: ratings.length,
      pricing: pricing, // Include pricing information from sub-services
      sub_services: subServices // Include full sub-services array for booking screen
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
