# Database Setup Guide

This guide explains how to set up the database for the BuildXpert application.

## Quick Setup

### 1. Database Migration (Recommended)
Run the migration script to create all tables and seed essential data:

```bash
cd backend
node scripts/migrate.js
```

This will:
- Create all necessary database tables
- Add required indexes
- Seed the `services_master` table with all available services
- Set up proper constraints

### 2. Alternative: Manual Setup

If you prefer to run scripts separately:

```bash
# 1. Create tables only
node scripts/migrate.js

# 2. Seed services (if not already done by migrate.js)
node scripts/seed-services.js

# 3. Seed sample data (optional)
node scripts/seed.js
```

## Available Services

The following services are automatically seeded into the `services_master` table:

| Service Name | Database Name | Paid Service |
|--------------|---------------|--------------|
| Plumber | `plumber` | Yes |
| Mason / Mastri | `mason-mastri` | Yes |
| Painting & Cleaning | `painting-cleaning` | Yes |
| Granite & Tiles | `granite-tiles` | Yes |
| Engineer / Interior | `engineer-interior` | Yes |
| Electrician | `electrician` | Yes |
| Carpenter | `carpenter` | Yes |
| Labor | `labors` | No (Free) |
| Painter | `painter` | Yes |
| Interiors Building | `interiors-building` | Yes |
| Stainless Steel | `stainless-steel` | Yes |
| Contact Building | `contact-building` | Yes |

## Database Schema

### Core Tables

1. **users** - User accounts and authentication
2. **addresses** - User addresses
3. **services_master** - Available service categories
4. **provider_profiles** - Provider-specific information
5. **provider_services** - Provider service registrations
6. **bookings** - Service bookings
7. **ratings** - Customer ratings and reviews
8. **notifications** - User notifications
9. **payments** - Payment records

### Key Relationships

- `provider_services.service_id` → `services_master.id`
- `provider_services.provider_id` → `provider_profiles.id`
- `provider_profiles.user_id` → `users.id`
- `bookings.provider_service_id` → `provider_services.id`

## Troubleshooting

### "Service not found" Error
If you encounter "Service not found" errors in the providerApp:

1. Check if services exist in the database:
   ```bash
   node check-service-ids.js
   ```

2. If no services are found, run:
   ```bash
   node scripts/seed-services.js
   ```

### Migration Errors
If migration fails due to constraint conflicts:

1. Drop and recreate the database
2. Run migration again: `node scripts/migrate.js`

### Database Connection Issues
Ensure your `config.env` file has the correct database URL:
```
DATABASE_URL=postgresql://username:password@host:port/database_name
```

## Production Deployment

For production deployment:

1. **Always run migration first**: `node scripts/migrate.js`
2. **Verify services are seeded**: Check that all 12 services exist
3. **Test service registration**: Ensure providers can register for services
4. **Backup your database**: Before any major changes

## Adding New Services

To add new services:

1. Add the service to the `services` array in `scripts/migrate.js`
2. Add the service to the `categoryToServiceMap` in `routes/services.js`
3. Add the service to `SERVICE_CATEGORIES` in `providerApp/constants/serviceCategories.ts`
4. Run `node scripts/seed-services.js` to add to existing databases

## Scripts Overview

- **`migrate.js`** - Creates tables and seeds services
- **`seed-services.js`** - Seeds only services (safe to run multiple times)
- **`seed.js`** - Seeds sample users and data
- **`check-service-ids.js`** - Verifies services exist in database 