# 🗄️ Database Migration Guide

## Overview

The BuildXpert backend now uses a comprehensive, production-ready migration system that ensures your database schema is always up-to-date and consistent.

## 🚀 Quick Start

### Run All Migrations
```bash
# Run all migrations (recommended for new setups)
npm run db:migrate

# Force re-run all migrations (use with caution)
npm run db:migrate:force

# Check migration status
npm run db:migrate:status
```

## 📋 Migration Structure

### Migration Files (in order)
1. **`001-create-core-tables.js`** - Core application tables
2. **`002-add-payment-transactions-table.js`** - Payment system
3. **`003-add-payment-logging-tables.js`** - Payment event tracking
4. **`004-add-call-masking-tables.js`** - WebRTC call functionality
5. **`005-add-push-notification-tables.js`** - Push notifications

### Core Tables Created
- **`users`** - User accounts and authentication
- **`addresses`** - User address management
- **`services_master`** - Service categories
- **`provider_profiles`** - Service provider profiles
- **`provider_services`** - Provider service offerings
- **`bookings`** - Service booking management
- **`ratings`** - Customer ratings and reviews
- **`notifications`** - User notifications

### Payment System Tables
- **`payment_transactions`** - Main payment records
- **`payment_events`** - Detailed payment event tracking
- **`payment_api_logs`** - API interaction logs
- **`payment_security_events`** - Security and fraud detection

### Call System Tables
- **`call_sessions`** - WebRTC call sessions
- **`call_logs`** - Call history and details
- **`call_events`** - Detailed call event tracking
- **`call_recordings`** - Call recording metadata

### Notification System Tables
- **`user_push_tokens`** - Device push tokens
- **`scheduled_notifications`** - Scheduled notifications
- **`notification_logs`** - Notification delivery logs
- **`user_notification_settings`** - User preferences
- **`notification_receipts`** - Delivery receipts
- **`notification_queue`** - Failed message retry queue

## 🔧 Migration Features

### ✅ Production-Ready Features
- **Idempotent migrations** - Safe to run multiple times
- **Migration tracking** - Records which migrations have been executed
- **Error handling** - Comprehensive error reporting and rollback
- **Performance monitoring** - Tracks execution time for each migration
- **Optional migrations** - Can skip non-essential features
- **Force mode** - Re-run migrations if needed

### 🛡️ Safety Features
- **Transaction safety** - Each migration runs in its own transaction
- **Rollback on failure** - Failed migrations don't leave partial state
- **Dependency checking** - Ensures migrations run in correct order
- **Duplicate prevention** - Won't run the same migration twice
- **Backup recommendations** - Clear guidance for production deployments

## 📊 Migration Commands

### Basic Commands
```bash
# Run all migrations
npm run db:migrate

# Check what migrations have been run
npm run db:migrate:status

# Force re-run all migrations (use carefully)
npm run db:migrate:force
```

### Advanced Options
```bash
# Run with verbose output
node migrations/run-all-migrations.js --verbose

# Skip optional migrations
node migrations/run-all-migrations.js --skip-optional

# Force re-run with verbose output
node migrations/run-all-migrations.js --force --verbose
```

## 🏗️ Development Workflow

### For New Development
1. **Start fresh**: Run `npm run db:migrate` to set up the database
2. **Add new features**: Create new migration files following the naming convention
3. **Test locally**: Run migrations on your development database
4. **Deploy**: Run migrations on production during deployment

### For Existing Projects
1. **Check status**: Run `npm run db:migrate:status` to see current state
2. **Run migrations**: Use `npm run db:migrate` to apply new migrations
3. **Verify**: Check that all tables and indexes are created correctly

## 🚨 Production Deployment

### Pre-Deployment Checklist
- [ ] **Backup database** - Always backup before running migrations
- [ ] **Test migrations** - Run on staging environment first
- [ ] **Check dependencies** - Ensure all required services are available
- [ ] **Monitor resources** - Ensure sufficient disk space and memory

### Deployment Steps
```bash
# 1. Backup your database
pg_dump your_database > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Run migrations
npm run db:migrate

# 3. Verify migration status
npm run db:migrate:status

# 4. Test application functionality
npm start
```

### Rollback Strategy
If a migration fails:
1. **Check logs** - Review error messages in the migration output
2. **Fix issues** - Address any database or configuration problems
3. **Re-run** - Use `npm run db:migrate:force` to retry
4. **Restore backup** - If necessary, restore from backup and fix issues

## 🔍 Troubleshooting

### Common Issues

#### Migration Already Executed
```
✅ Migration 001 already executed, skipping
```
**Solution**: This is normal. Migrations are designed to be idempotent.

#### Database Connection Error
```
❌ Error creating core tables: connection refused
```
**Solution**: Check your database configuration in `config.env`

#### Permission Denied
```
❌ Error: permission denied for table users
```
**Solution**: Ensure your database user has CREATE TABLE permissions

#### Migration Failed
```
❌ Migration 002 failed: relation "users" does not exist
```
**Solution**: Run migrations in order. Core tables must be created first.

### Getting Help

#### Check Migration Status
```bash
npm run db:migrate:status
```

#### View Detailed Logs
```bash
npm run db:migrate --verbose
```

#### Manual Database Check
```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check migration history
SELECT * FROM migrations ORDER BY executed_at;
```

## 📈 Performance Considerations

### Index Creation
All migrations include comprehensive indexes for optimal performance:
- **Primary keys** - UUID primary keys for all tables
- **Foreign keys** - Proper foreign key constraints
- **Query indexes** - Indexes on frequently queried columns
- **Composite indexes** - Multi-column indexes for complex queries

### Database Optimization
- **Connection pooling** - Configured for production use
- **Query optimization** - All queries are optimized for performance
- **Memory management** - Efficient use of database resources

## 🔄 Migration Best Practices

### Do's ✅
- Always backup before running migrations in production
- Test migrations on staging environment first
- Run migrations during maintenance windows for large changes
- Monitor database performance after migrations
- Keep migration files in version control

### Don'ts ❌
- Don't modify existing migration files after they've been run
- Don't run migrations without proper testing
- Don't skip the backup step in production
- Don't run migrations during peak usage hours
- Don't ignore migration error messages

## 📚 Additional Resources

- **Database Schema**: See `MIGRATION_GUIDE.md` for detailed table structures
- **API Documentation**: Check route files for table usage examples
- **Security Guide**: See `SECURITY_CHECKLIST.md` for security considerations
- **Production Guide**: See `PRODUCTION_READY_SUMMARY.md` for deployment info

---

**🎉 Your database is now ready for production use!**

The migration system ensures your database schema is always consistent, secure, and optimized for performance.
