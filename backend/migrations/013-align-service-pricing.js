const { query } = require('../database/connection');

/**
 * Migration 013
 * Aligns all provider service pricing to ₹99 and enforces defaults for future records.
 */
const alignServicePricing = async () => {
  try {

    // Ensure default base price is ₹99 going forward
    await query(`
      ALTER TABLE services_master
      ALTER COLUMN base_price SET DEFAULT 99
    `);

    // Update existing paid services to ₹99 base price
    await query(`
      UPDATE services_master
      SET base_price = 99
      WHERE is_paid = TRUE AND (base_price IS NULL OR base_price <> 99)
    `);

    // Set free services explicitly to 0 to avoid inheriting default
    await query(`
      UPDATE services_master
      SET base_price = 0
      WHERE is_paid = FALSE AND (base_price IS NULL OR base_price <> 0)
    `);

    // Update pricing plans to ₹99 for paid services, keep metadata consistent
    await query(`
      UPDATE service_pricing sp
      SET price = 99,
          currency_code = COALESCE(sp.currency_code, 'INR'),
          metadata = COALESCE(sp.metadata, '{}'::jsonb) || jsonb_build_object('aligned_by', 'migration_013')
      FROM services_master sm
      WHERE sp.service_id = sm.id
        AND sm.is_paid = TRUE
        AND sp.price <> 99
    `);

    // Ensure free-service plans are explicitly zero
    await query(`
      UPDATE service_pricing sp
      SET price = 0,
          billing_period = 'lifetime',
          currency_code = COALESCE(sp.currency_code, 'INR'),
          metadata = COALESCE(sp.metadata, '{}'::jsonb) || jsonb_build_object('aligned_by', 'migration_013')
      FROM services_master sm
      WHERE sp.service_id = sm.id
        AND sm.is_paid = FALSE
        AND sp.price <> 0
    `);

    // Backfill payment transactions that recorded legacy amounts (only pending ones)
    await query(`
      UPDATE payment_transactions pt
      SET amount = 99,
          currency_code = COALESCE(pt.currency_code, 'INR')
      FROM service_pricing sp
      WHERE pt.status = 'pending'
        AND pt.pricing_plan_id = sp.id
        AND sp.price = 99
        AND pt.amount <> 99
    `);

    return { success: true };
  } catch (error) {
    console.error('❌ Error aligning service pricing:', error);
    return { success: false, error: error.message };
  }
};

module.exports = alignServicePricing;

if (require.main === module) {
  alignServicePricing()
    .then(result => {
      if (result.success) {
        process.exit(0);
      } else {
        console.error('❌ Migration failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Migration execution error:', error);
      process.exit(1);
    });
}

