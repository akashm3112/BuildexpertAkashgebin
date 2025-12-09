# Seed Scripts Security Notice

## ⚠️ PRODUCTION SECURITY WARNING

**These seed scripts are for DEVELOPMENT ONLY and should NEVER be run in production!**

### Security Issues:
1. **Weak Passwords**: Scripts use weak default passwords (`password123`, `admin123`)
2. **Hardcoded Credentials**: Admin credentials are hardcoded in scripts
3. **Auto-creation**: Automatically creates admin accounts

### Production Requirements:
1. **Admin accounts must be created manually** with strong passwords
2. **All passwords must be strong** (minimum 12 characters, mixed case, numbers, symbols)
3. **Never run seed scripts in production**
4. **Use proper password reset flows** for admin account creation

### Safe Usage:
- ✅ Development/Testing environments only
- ✅ Local development databases
- ✅ Staging environments (with caution)
- ❌ **NEVER in production**

### Creating Admin Accounts in Production:
Use the standard signup flow or create manually via database with:
- Strong password (hashed with bcrypt)
- Proper role assignment
- Email verification
- Phone verification

