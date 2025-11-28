const { query, getRows } = require('../database/connection');

/**
 * Migration: Update painting-cleaning service to painting
 * 
 * This migration:
 * 1. Adds 'painting' service if it doesn't exist
 * 2. Migrates existing 'painting-cleaning' provider registrations to 'painting'
 * 3. Updates bookings that reference 'painting-cleaning' to 'painting'
 * 4. Optionally removes 'painting-cleaning' service (commented out for safety)
 */
const updatePaintingService = async () => {
  try {
    console.log('🔄 Starting painting service migration...');

    // Check if 'painting' service already exists
    const paintingService = await query(
      'SELECT id, name FROM services_master WHERE name = $1',
      ['painting']
    );

    let paintingServiceId;
    
    if (paintingService.rows.length === 0) {
      // Create 'painting' service
      console.log('📝 Creating new "painting" service...');
      const result = await query(
        `INSERT INTO services_master (name, is_paid) 
         VALUES ($1, $2) 
         RETURNING id`,
        ['painting', true]
      );
      paintingServiceId = result.rows[0].id;
      console.log('✅ Created "painting" service with ID:', paintingServiceId);
    } else {
      paintingServiceId = paintingService.rows[0].id;
      console.log('ℹ️  "painting" service already exists with ID:', paintingServiceId);
    }

    // Check if 'painting-cleaning' service exists
    const paintingCleaningService = await query(
      'SELECT id, name FROM services_master WHERE name = $1',
      ['painting-cleaning']
    );

    if (paintingCleaningService.rows.length > 0) {
      const paintingCleaningServiceId = paintingCleaningService.rows[0].id;
      console.log('🔄 Found "painting-cleaning" service with ID:', paintingCleaningServiceId);

      // Migrate provider_services from 'painting-cleaning' to 'painting'
      const providerServicesToMigrate = await getRows(
        `SELECT id, provider_id, service_id 
         FROM provider_services 
         WHERE service_id = $1`,
        [paintingCleaningServiceId]
      );

      if (providerServicesToMigrate.length > 0) {
        console.log(`📦 Migrating ${providerServicesToMigrate.length} provider service registrations...`);
        
        for (const ps of providerServicesToMigrate) {
          // Check if provider already has 'painting' service registered
          const existingPainting = await query(
            `SELECT id FROM provider_services 
             WHERE provider_id = $1 AND service_id = $2`,
            [ps.provider_id, paintingServiceId]
          );

          if (existingPainting.rows.length === 0) {
            // Update the service_id to point to 'painting'
            await query(
              `UPDATE provider_services 
               SET service_id = $1 
               WHERE id = $2`,
              [paintingServiceId, ps.id]
            );
            console.log(`  ✅ Migrated provider_service ${ps.id}`);
          } else {
            // Provider already has 'painting' service, delete the duplicate
            console.log(`  ⚠️  Provider ${ps.provider_id} already has 'painting' service, removing duplicate...`);
            
            // Check if there are bookings for this provider_service
            const bookingsCount = await query(
              'SELECT COUNT(*) as count FROM bookings WHERE provider_service_id = $1',
              [ps.id]
            );

            if (parseInt(bookingsCount.rows[0].count) === 0) {
              // No bookings, safe to delete
              await query('DELETE FROM provider_services WHERE id = $1', [ps.id]);
              console.log(`  ✅ Removed duplicate provider_service ${ps.id}`);
            } else {
              // Has bookings, update to existing painting service
              const existingId = existingPainting.rows[0].id;
              await query(
                'UPDATE bookings SET provider_service_id = $1 WHERE provider_service_id = $2',
                [existingId, ps.id]
              );
              await query('DELETE FROM provider_services WHERE id = $1', [ps.id]);
              console.log(`  ✅ Migrated bookings and removed duplicate provider_service ${ps.id}`);
            }
          }
        }
        console.log('✅ Provider service migrations completed');
      } else {
        console.log('ℹ️  No provider services to migrate');
      }

      // Check for any remaining references before removing the old service
      const remainingProviderServices = await query(
        'SELECT COUNT(*) as count FROM provider_services WHERE service_id = $1',
        [paintingCleaningServiceId]
      );

      const remainingBookings = await query(
        `SELECT COUNT(*) as count FROM bookings b
         JOIN provider_services ps ON b.provider_service_id = ps.id
         WHERE ps.service_id = $1`,
        [paintingCleaningServiceId]
      );

      if (parseInt(remainingProviderServices.rows[0].count) === 0 && 
          parseInt(remainingBookings.rows[0].count) === 0) {
        // Safe to remove the old service
        console.log('🗑️  Removing old "painting-cleaning" service...');
        await query('DELETE FROM services_master WHERE id = $1', [paintingCleaningServiceId]);
        console.log('✅ Removed "painting-cleaning" service');
      } else {
        console.log('⚠️  "painting-cleaning" service still has references, keeping it for backward compatibility');
      }
    } else {
      console.log('ℹ️  "painting-cleaning" service not found, migration not needed');
    }

    // Ensure 'cleaning' service exists
    const cleaningService = await query(
      'SELECT id FROM services_master WHERE name = $1',
      ['cleaning']
    );
    if (cleaningService.rows.length === 0) {
      console.log('📝 Creating "cleaning" service...');
      await query(
        'INSERT INTO services_master (name, is_paid) VALUES ($1, $2)',
        ['cleaning', true]
      );
      console.log('✅ Created "cleaning" service');
    }

    // Ensure 'borewell' service exists
    const borewellService = await query(
      'SELECT id FROM services_master WHERE name = $1',
      ['borewell']
    );
    if (borewellService.rows.length === 0) {
      console.log('📝 Creating "borewell" service...');
      await query(
        'INSERT INTO services_master (name, is_paid) VALUES ($1, $2)',
        ['borewell', true]
      );
      console.log('✅ Created "borewell" service');
    }

    console.log('✅ Painting service migration completed successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Error in painting service migration:', error);
    return { success: false, error: error.message };
  }
};

module.exports = updatePaintingService;

// Run if called directly
if (require.main === module) {
  updatePaintingService()
    .then(result => {
      if (result.success) {
        console.log('✅ Migration completed successfully');
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

