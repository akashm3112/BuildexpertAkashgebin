# Database Migration & Setup Guide

This guide provides comprehensive instructions for setting up the BuildXpert database from scratch or migrating to a new environment.

## 🚀 Quick Setup (Recommended)

### Option 1: Complete Setup (Recommended for new installations)
```bash
cd backend
node scripts/complete-migration.js
node scripts/complete-seed.js
```

### Option 2: Step-by-step Setup
```bash
cd backend
node scripts/migrate.js
node scripts/seed.js
```

## 📋 Database Schema Overview

### Core Tables

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `users` | User accounts and authentication | Role-based access (user/provider/admin) |
| `addresses` | User address management | Up to 3 addresses per user |
| `services_master` | Available service categories | 12 predefined services |
| `provider_profiles` | Provider-specific information | Experience, certificates |
| `provider_services` | Provider service registrations | Pricing, payment status |
| `provider_specific_services` | Detailed service offerings | Service-specific details |
| `bookings` | Service booking management | Complete booking lifecycle |
| `ratings` | Customer ratings and reviews | 1-5 star ratings with reviews |
| `notifications` | User notifications | Role-based notifications |
| `payments` | Payment tracking | Payment history and status |
| `push_tokens` | Push notification tokens | Platform-specific tokens |

### Key Relationships

```
users (1) ←→ (1) provider_profiles
users (1) ←→ (many) addresses
users (1) ←→ (many) notifications
users (1) ←→ (many) payments
users (1) ←→ (many) push_tokens

provider_profiles (1) ←→ (many) provider_services
provider_services (many) ←→ (1) services_master
provider_services (1) ←→ (many) provider_specific_services

bookings (many) ←→ (1) users
bookings (many) ←→ (1) provider_services
bookings (1) ←→ (1) ratings
```

## 🔧 Migration Scripts

### 1. `complete-migration.js` (Recommended)
- Creates all tables with proper constraints
- Sets up indexes for performance
- Seeds essential services
- Creates admin user
- Handles all database setup in one script

### 2. `migrate.js` (Legacy)
- Basic table creation
- Service seeding
- Missing some newer tables

### 3. `complete-seed.js` (Recommended)
- Creates sample users (admin, test users, test providers)
- Sets up provider profiles
- Creates sample addresses
- Assigns services to providers
- Creates sample bookings
- Sets up welcome notifications

### 4. `seed.js` (Legacy)
- Basic user creation
- Limited sample data

## 🌱 Available Services

The following services are automatically seeded:

| Service Name | Database Name | Paid Service | Description |
|--------------|---------------|--------------|-------------|
| Plumber | `plumber` | Yes | Plumbing services |
| Mason / Mastri | `mason-mastri` | Yes | Masonry and construction |
| Painting & Cleaning | `painting-cleaning` | Yes | Painting and cleaning services |
| Granite & Tiles | `granite-tiles` | Yes | Granite and tile work |
| Engineer / Interior | `engineer-interior` | Yes | Interior design and engineering |
| Electrician | `electrician` | Yes | Electrical services |
| Carpenter | `carpenter` | Yes | Carpentry work |
| Labor | `labors` | No | Free labor services |
| Painter | `painter` | Yes | Painting services |
| Interiors Building | `interiors-building` | Yes | Interior construction |
| Stainless Steel | `stainless-steel` | Yes | Stainless steel work |
| Contact Building | `contact-building` | Yes | Building construction |
| Glass & Mirror | `glass-mirror` | Yes | Glass and mirror installation services |

## 🔍 Verification Scripts

### Check Migration Completeness
```bash
node check-migration-completeness.js
```

### Check Database Structure
```bash
node check-table-structure.js
```

### Check Service IDs
```bash
node check-service-ids.js
```

## 🛠️ Environment Setup

### Required Environment Variables
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=buildxpert
DB_USER=postgres
DB_PASSWORD=your_password_here

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d

# Twilio Configuration (for SMS OTP)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# Cloudinary Configuration (for image uploads)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

## 📊 Database Constraints

### User Constraints
- Unique constraint on `(phone, role)` - allows same phone for different roles
- Role validation: `user`, `provider`, `admin`
- Email is unique (optional)

### Booking Constraints
- Status validation: `pending`, `accepted`, `rejected`, `completed`, `cancelled`
- One rating per booking (unique constraint)

### Notification Constraints
- Role validation: `user`, `provider`, `admin`
- Proper role separation for notifications

### Payment Constraints
- Status validation: `success`, `failed`, `pending`

## 🔒 Security Features

### Password Hashing
- All passwords are hashed using bcrypt with salt rounds of 12
- Admin credentials: Phone: `9999999999`, Password: `admin123`
- Test user passwords: `password123`, `testpassword`

### Role-Based Access
- Users can only see notifications for their role
- Providers can only manage their own services
- Admin has full access

### Data Validation
- Input validation on all API endpoints
- SQL injection prevention through parameterized queries
- XSS protection through proper escaping

## 🚨 Troubleshooting

### Common Issues

#### 1. "Service not found" Error
```bash
# Check if services exist
node check-service-ids.js

# Re-seed services if needed
node scripts/seed-services.js
```

#### 2. Migration Errors
```bash
# Drop and recreate database
DROP DATABASE buildxpert;
CREATE DATABASE buildxpert;

# Run complete migration
node scripts/complete-migration.js
```

#### 3. Notification Role Issues
```bash
# Fix notification roles
node fix-notification-roles.js

# Clean up test notifications
node cleanup-all-test-notifications.js
```

#### 4. Database Connection Issues
- Verify PostgreSQL is running
- Check database credentials in `config.env`
- Ensure database exists: `createdb buildxpert`

### Performance Optimization

#### Indexes Created
- `idx_users_phone` - Fast user lookup by phone
- `idx_users_email` - Fast user lookup by email
- `idx_addresses_user_id` - Fast address lookup
- `idx_provider_services_provider_id` - Fast provider service lookup
- `idx_bookings_user_id` - Fast booking lookup
- `idx_notifications_user_id` - Fast notification lookup
- `idx_notifications_role` - Fast notification filtering by role

#### Query Optimization
- Use parameterized queries to prevent SQL injection
- Implement pagination for large datasets
- Use proper JOINs for related data

## 📈 Production Deployment

### Pre-deployment Checklist
1. ✅ Run complete migration: `node scripts/complete-migration.js`
2. ✅ Verify all tables exist: `node check-migration-completeness.js`
3. ✅ Check service seeding: `node check-service-ids.js`
4. ✅ Test notification system: `node verify-notification-system.js`
5. ✅ Backup existing data (if migrating)
6. ✅ Update environment variables for production
7. ✅ Test all API endpoints

### Production Commands
```bash
# Fresh installation
node scripts/complete-migration.js
node scripts/complete-seed.js

# Verify installation
node check-migration-completeness.js
node check-service-ids.js
```

### Backup and Restore
```bash
# Backup database
pg_dump buildxpert > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore database
psql buildxpert < backup_file.sql
```

## 🔄 Migration Between Environments

### Development to Production
1. Export data from development
2. Run complete migration on production
3. Import data to production
4. Verify all functionality

### Production to Development
1. Backup production database
2. Restore to development
3. Update environment variables
4. Test all features

## 📝 Scripts Reference

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `complete-migration.js` | Full database setup | New installations |
| `complete-seed.js` | Complete sample data | Development/testing |
| `migrate.js` | Basic migration | Legacy compatibility |
| `seed.js` | Basic seeding | Legacy compatibility |
| `seed-services.js` | Service seeding only | Add missing services |
| `add-role-to-notifications.js` | Add role column | Fix notification issues |
| `add-provider-specific-services.js` | Add specific services table | Feature enhancement |

## 🎯 Best Practices

1. **Always use complete migration for new installations**
2. **Backup before major changes**
3. **Test migrations in development first**
4. **Verify data integrity after migration**
5. **Use proper environment variables**
6. **Monitor database performance**
7. **Regular backups in production**

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section
2. Run verification scripts
3. Check database logs
4. Verify environment configuration
5. Test with sample data
