# Service Migration Guide: Painting & Cleaning Separation

## Overview

This migration separates the combined "painting-cleaning" service into two distinct services:
- **Painting** - Separate service (using the old painting-cleaning grid)
- **Cleaning** - Separate service (new grid)
- **Borewell** - New service (new grid)

## Changes Made

### 1. Database Changes
- **Migration 019**: `019-update-painting-service.js`
  - Creates 'painting' service if it doesn't exist
  - Migrates existing 'painting-cleaning' provider registrations to 'painting'
  - Updates bookings that reference 'painting-cleaning' to 'painting'
  - Ensures 'cleaning' and 'borewell' services exist
  - Safely removes 'painting-cleaning' service after migration

### 2. Backend Updates
- **Seed Files**: Updated to use 'painting' instead of 'painting-cleaning'
  - `scripts/seed-services.js`
  - `scripts/migrate.js`
  - `scripts/complete-migration.js`
  
- **Routes**: Updated service mappings
  - `routes/services.js`: Added 'painting' mapping, kept 'painting-cleaning' for backward compatibility
  - `routes/public.js`: Added 'painting' service descriptions
  
- **Provider Services**: Updated provider-specific services
  - `scripts/add-provider-specific-services.js`: Added 'painting' service options

### 3. Frontend Updates
- **userApp**: 
  - Updated `constants/serviceCategories.ts`: Changed 'painting-cleaning' to 'painting'
  - Updated `components/home/ServiceCategoryGrid.tsx`: Updated image references
  - Updated `app/(tabs)/index.tsx`: Added 'painting' translation mapping
  
- **providerApp**:
  - Updated `constants/serviceCategories.ts`: Changed 'painting-cleaning' to 'painting'
  - Updated `app/(tabs)/index.tsx`: Added 'painting' service mapping
  - Updated `app/(tabs)/services.tsx`: Added 'painting' service info

## Running the Migration

### Option 1: Run All Migrations (Recommended)
```bash
cd backend
node migrations/run-all-migrations.js
```

This will run all migrations including the new migration 019.

### Option 2: Run Migration 019 Only
```bash
cd backend
node migrations/019-update-painting-service.js
```

### Option 3: Manual Database Update
If you need to manually update the database:

```sql
-- 1. Create 'painting' service if it doesn't exist
INSERT INTO services_master (name, is_paid)
VALUES ('painting', true)
ON CONFLICT (name) DO NOTHING;

-- 2. Get service IDs
SELECT id, name FROM services_master WHERE name IN ('painting', 'painting-cleaning');

-- 3. Update provider_services (replace OLD_ID and NEW_ID with actual UUIDs)
UPDATE provider_services
SET service_id = 'NEW_PAINTING_ID'
WHERE service_id = 'OLD_PAINTING_CLEANING_ID';

-- 4. Verify no bookings reference old service
SELECT COUNT(*) FROM bookings b
JOIN provider_services ps ON b.provider_service_id = ps.id
WHERE ps.service_id = 'OLD_PAINTING_CLEANING_ID';

-- 5. If count is 0, remove old service
DELETE FROM services_master WHERE name = 'painting-cleaning';
```

## Verification

After running the migration, verify the changes:

```sql
-- Check services exist
SELECT name, is_paid FROM services_master 
WHERE name IN ('painting', 'cleaning', 'borewell')
ORDER BY name;

-- Check provider registrations
SELECT sm.name, COUNT(ps.id) as provider_count
FROM services_master sm
LEFT JOIN provider_services ps ON sm.id = ps.service_id
WHERE sm.name IN ('painting', 'cleaning', 'borewell')
GROUP BY sm.name;

-- Check for any remaining 'painting-cleaning' references
SELECT COUNT(*) FROM provider_services ps
JOIN services_master sm ON ps.service_id = sm.id
WHERE sm.name = 'painting-cleaning';
```

## Backward Compatibility

The system maintains backward compatibility:
- Frontend category ID 'painting-cleaning' maps to backend service 'painting'
- Old 'painting-cleaning' service registrations are automatically migrated
- Existing bookings continue to work after migration

## Service Registration

Providers can now register for:
- **Painting** service (separate from cleaning)
- **Cleaning** service (separate from painting)
- **Borewell** service (new service)

Users can see and book providers for all three services independently.

## Testing Checklist

- [ ] Migration runs successfully
- [ ] 'painting' service exists in database
- [ ] 'cleaning' service exists in database
- [ ] 'borewell' service exists in database
- [ ] Provider can register for 'painting' service
- [ ] Provider can register for 'cleaning' service
- [ ] Provider can register for 'borewell' service
- [ ] User can see 'painting' providers
- [ ] User can see 'cleaning' providers
- [ ] User can see 'borewell' providers
- [ ] Existing bookings still work
- [ ] Old 'painting-cleaning' registrations migrated correctly

## Rollback (If Needed)

If you need to rollback the migration:

```sql
-- 1. Recreate 'painting-cleaning' service
INSERT INTO services_master (name, is_paid)
VALUES ('painting-cleaning', true)
ON CONFLICT (name) DO NOTHING;

-- 2. Get service IDs
SELECT id, name FROM services_master WHERE name IN ('painting', 'painting-cleaning');

-- 3. Update provider_services back (replace IDs with actual UUIDs)
UPDATE provider_services
SET service_id = 'PAINTING_CLEANING_ID'
WHERE service_id = 'PAINTING_ID';

-- 4. Remove 'painting' service if no longer needed
DELETE FROM services_master WHERE name = 'painting';
```

## Support

For issues or questions, check:
- Migration logs in console output
- Database error logs
- Application error logs

