const { query } = require('../database/connection');

/**
 * Migration 027: Add provider_sub_services table and remove service_charge columns
 * 
 * This migration:
 * 1. Creates provider_sub_services table for storing dynamic sub-services
 * 2. Removes service_charge_value and service_charge_unit columns from provider_services
 * 3. Adds proper indexes for performance
 */
const addSubServicesRemoveServiceCharge = async () => {
  try {
    // Step 1: Create provider_sub_services table
    await query(`
      CREATE TABLE IF NOT EXISTS provider_sub_services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_service_id UUID NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
        service_id UUID NOT NULL REFERENCES services_master(id) ON DELETE CASCADE,
        price DECIMAL(10, 2) NOT NULL CHECK (price > 0),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(provider_service_id, service_id)
      );
    `);

    // Step 2: Create indexes for performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_provider_sub_services_provider_service_id 
      ON provider_sub_services(provider_service_id);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_provider_sub_services_service_id 
      ON provider_sub_services(service_id);
    `);

    // Composite index for common query pattern (provider_service_id + service_id)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_provider_sub_services_provider_service_service 
      ON provider_sub_services(provider_service_id, service_id);
    `);

    // Step 3: Remove service_charge columns from provider_services
    // Check if columns exist before dropping to avoid errors
    const serviceChargeValueExists = await query(`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'provider_services' 
        AND column_name = 'service_charge_value'
      );
    `);

    if (serviceChargeValueExists.rows[0].exists) {
      await query(`
        ALTER TABLE provider_services 
        DROP COLUMN IF EXISTS service_charge_value;
      `);
    }

    const serviceChargeUnitExists = await query(`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'provider_services' 
        AND column_name = 'service_charge_unit'
      );
    `);

    if (serviceChargeUnitExists.rows[0].exists) {
      await query(`
        ALTER TABLE provider_services 
        DROP COLUMN IF EXISTS service_charge_unit;
      `);
    }

    // Step 4: Create trigger to update updated_at timestamp
    await query(`
      CREATE OR REPLACE FUNCTION update_provider_sub_services_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await query(`
      DROP TRIGGER IF EXISTS trigger_update_provider_sub_services_updated_at 
      ON provider_sub_services;
    `);

    await query(`
      CREATE TRIGGER trigger_update_provider_sub_services_updated_at
      BEFORE UPDATE ON provider_sub_services
      FOR EACH ROW
      EXECUTE FUNCTION update_provider_sub_services_updated_at();
    `);

    console.log('✅ Migration 027 completed: Added provider_sub_services table and removed service_charge columns');
  } catch (error) {
    console.error('❌ Migration 027 failed:', error);
    throw error;
  }
};

module.exports = addSubServicesRemoveServiceCharge;

