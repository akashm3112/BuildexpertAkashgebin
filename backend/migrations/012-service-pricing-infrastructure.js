const { query } = require('../database/connection');

/**
 * Migration 012
 * Establishes production-grade service pricing infrastructure:
 *  - Adds pricing metadata to services_master
 *  - Introduces service_pricing table with lifecycle controls
 *  - Links payment transactions to pricing plans
 */
const updateServicePricingInfrastructure = async () => {
  try {
    console.log('🏷️ Updating service pricing infrastructure...');

    // Extend services_master with pricing metadata
    await query(`
      ALTER TABLE services_master
      ADD COLUMN IF NOT EXISTS base_price NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS currency_code CHAR(3),
      ADD COLUMN IF NOT EXISTS billing_cycle TEXT,
      ADD COLUMN IF NOT EXISTS billing_interval SMALLINT,
      ADD COLUMN IF NOT EXISTS default_pricing_plan_id UUID
    `);

    // Update existing services with sensible defaults
    await query(`
      UPDATE services_master
      SET
        base_price = CASE
          WHEN base_price IS NULL OR base_price = 0 THEN
            CASE WHEN is_paid = TRUE THEN 2499 ELSE 0 END
          ELSE base_price
        END,
        currency_code = COALESCE(NULLIF(currency_code, ''), 'INR'),
        billing_cycle = COALESCE(NULLIF(billing_cycle, ''), CASE WHEN is_paid = TRUE THEN 'yearly' ELSE 'lifetime' END),
        billing_interval = COALESCE(NULLIF(billing_interval, 0), 1)
    `);

    // Enforce non-null constraints and defaults
    await query(`
      ALTER TABLE services_master
      ALTER COLUMN base_price SET DEFAULT 0,
      ALTER COLUMN currency_code SET DEFAULT 'INR',
      ALTER COLUMN billing_cycle SET DEFAULT 'yearly',
      ALTER COLUMN billing_interval SET DEFAULT 1,
      ALTER COLUMN base_price SET NOT NULL,
      ALTER COLUMN currency_code SET NOT NULL,
      ALTER COLUMN billing_cycle SET NOT NULL,
      ALTER COLUMN billing_interval SET NOT NULL
    `);

    await query(`
      ALTER TABLE services_master
      DROP CONSTRAINT IF EXISTS services_master_billing_cycle_check
    `);

    await query(`
      ALTER TABLE services_master
      ADD CONSTRAINT services_master_billing_cycle_check
      CHECK (billing_cycle IN ('one_time', 'monthly', 'quarterly', 'yearly', 'biennial', 'triennial', 'lifetime'))
    `);

    // Create service_pricing table for plan management
    await query(`
      CREATE TABLE IF NOT EXISTS service_pricing (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        service_id UUID NOT NULL REFERENCES services_master(id) ON DELETE CASCADE,
        plan_name TEXT NOT NULL,
        description TEXT,
        price NUMERIC(12,2) NOT NULL,
        currency_code CHAR(3) NOT NULL DEFAULT 'INR',
        billing_period TEXT NOT NULL CHECK (billing_period IN ('one_time','monthly','quarterly','yearly','biennial','triennial','custom','lifetime')),
        billing_interval SMALLINT NOT NULL DEFAULT 1 CHECK (billing_interval > 0),
        trial_days SMALLINT DEFAULT 0,
        grace_period_days SMALLINT DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        priority SMALLINT DEFAULT 0,
        effective_from TIMESTAMP DEFAULT NOW(),
        effective_to TIMESTAMP,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_service_pricing_service_plan
      ON service_pricing(service_id, LOWER(plan_name))
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_service_pricing_active
      ON service_pricing(service_id, is_active, effective_from, effective_to)
    `);

    // Seed default pricing plan for existing services if missing
    await query(`
      INSERT INTO service_pricing (
        service_id,
        plan_name,
        description,
        price,
        currency_code,
        billing_period,
        billing_interval,
        trial_days,
        grace_period_days,
        is_active,
        priority,
        metadata
      )
      SELECT
        id,
        'standard',
        'Default provider subscription plan',
        base_price,
        currency_code,
        CASE WHEN is_paid THEN 'yearly' ELSE 'lifetime' END,
        billing_interval,
        0,
        0,
        TRUE,
        0,
        jsonb_build_object('seeded', true, 'source', '012-service-pricing')
      FROM services_master sm
      WHERE NOT EXISTS (
        SELECT 1 FROM service_pricing sp WHERE sp.service_id = sm.id
      )
    `);

    // Set default pricing plan references
    await query(`
      WITH plan_mapping AS (
        SELECT sp.service_id, sp.id
        FROM service_pricing sp
        WHERE sp.plan_name = 'standard'
      )
      UPDATE services_master sm
      SET default_pricing_plan_id = pm.id
      FROM plan_mapping pm
      WHERE sm.id = pm.service_id
        AND (sm.default_pricing_plan_id IS NULL OR sm.default_pricing_plan_id <> pm.id)
    `);

    await query(`
      ALTER TABLE services_master
      DROP CONSTRAINT IF EXISTS fk_services_master_default_pricing
    `);

    await query(`
      ALTER TABLE services_master
      ADD CONSTRAINT fk_services_master_default_pricing
      FOREIGN KEY (default_pricing_plan_id)
      REFERENCES service_pricing(id)
      ON DELETE SET NULL
    `);

    // Extend payment_transactions with pricing linkage
    await query(`
      ALTER TABLE payment_transactions
      ADD COLUMN IF NOT EXISTS pricing_plan_id UUID,
      ADD COLUMN IF NOT EXISTS currency_code CHAR(3) DEFAULT 'INR'
    `);

    await query(`
      ALTER TABLE payment_transactions
      DROP CONSTRAINT IF EXISTS fk_payment_transactions_pricing_plan
    `);

    await query(`
      ALTER TABLE payment_transactions
      ADD CONSTRAINT fk_payment_transactions_pricing_plan
      FOREIGN KEY (pricing_plan_id)
      REFERENCES service_pricing(id)
      ON DELETE SET NULL
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_pricing_plan
      ON payment_transactions(pricing_plan_id)
    `);

    await query(`
      UPDATE payment_transactions
      SET currency_code = COALESCE(currency_code, 'INR')
    `);

    console.log('✅ Service pricing infrastructure updated successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Error updating service pricing infrastructure:', error);
    return { success: false, error: error.message };
  }
};

module.exports = updateServicePricingInfrastructure;

if (require.main === module) {
  updateServicePricingInfrastructure()
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
      console.error('❌ Migration execution error:', error);
      process.exit(1);
    });
}

