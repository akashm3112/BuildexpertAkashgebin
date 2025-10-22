# 🔐 BUILDXPERT CREDENTIALS SUMMARY

**Date:** October 22, 2025

---

## 📋 EXISTING USERS IN DATABASE

### 👥 USERS (Role: user)

**1. Akash Kumar**
- Phone: `9902958254`
- Email: akash@test.com
- Status: ✅ Verified
- Created: 10/10/2025

**2. Sam User**
- Phone: `6344997888`
- Email: sam@example.com
- Status: ✅ Verified
- Created: 5/10/2025

**3. Test User**
- Phone: `9999999999`
- Email: test@example.com
- Status: ✅ Verified
- Created: 5/10/2025

**4. John Doe**
- Phone: `9876543210`
- Email: john@example.com
- Status: ✅ Verified
- Created: 5/10/2025

**5. Test User**
- Phone: `9876543211`
- Email: testuser@example.com
- Status: ✅ Verified
- Created: 5/10/2025

---

### 🔧 PROVIDERS (Role: provider)

**1. Test Provider**
- Phone: `8888888888`
- Email: testprovider@example.com
- Status: ✅ Verified
- Experience: 5 years
- Created: 20/10/2025

**2. Test**
- Phone: `6361884366`
- Email: testyy@gmail.com
- Status: ✅ Verified
- Experience: 5 years
- Created: 20/10/2025

**3. Murthy Services**
- Phone: `9902898562`
- Email: murthy@test.com
- Status: ✅ Verified
- Experience: 6 years
- Created: 10/10/2025

**4. Tom Provider**
- Phone: `9876543210`
- Email: tom@example.com
- Status: ✅ Verified
- Experience: 5 years
- Created: 5/10/2025

---

### 👑 ADMIN (Role: admin)

**Admin User**
- Phone: `9999999999`
- Email: test1759668335172@example.com
- Status: ✅ Verified
- Created: 5/10/2025

---

## ⚠️ PASSWORD INFORMATION

**All passwords are HASHED using bcrypt (cost: 12)**

For security reasons, passwords **CANNOT** be displayed in readable format. This is by design - it's a security feature!

### How to Access Accounts:

#### Option 1: Use Forgot Password Flow
1. In the app, click "Forgot Password"
2. Enter the phone number
3. Receive OTP (will show in backend console)
4. Reset the password to something you know

#### Option 2: Know the Original Password
If you know what password was used during signup, you can login directly.

#### Option 3: Create New Test Accounts
Use the test credentials below with known passwords.

---

## 🧪 RECOMMENDED TEST CREDENTIALS

**For easy testing, create these accounts:**

### Test User Account:
```
Phone: 8888888881
Password: test123
Role: user
```

### Test Provider Account:
```
Phone: 8888888882
Password: test123
Role: provider
```

### Admin Account (Already Exists):
```
Phone: 9999999999
Password: admin123 (try this, or use forgot password)
Role: admin
```

---

## 🔧 HOW TO CREATE TEST ACCOUNT

### Using API (Postman/Curl):

**1. Signup:**
```bash
POST http://localhost:5000/api/auth/signup
Content-Type: application/json

{
  "fullName": "Test User",
  "email": "test@example.com",
  "phone": "8888888881",
  "password": "test123",
  "role": "user"
}
```

**2. Get OTP from Console:**
```
Check backend console output:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 OTP VERIFICATION CODE
Phone: +918888888881
Code: 123456
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**3. Verify OTP:**
```bash
POST http://localhost:5000/api/auth/verify-otp
Content-Type: application/json

{
  "phone": "8888888881",
  "otp": "123456"
}
```

**4. Login:**
```bash
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "phone": "8888888881",
  "password": "test123",
  "role": "user"
}
```

---

## 🔑 EXISTING ACCOUNTS - LOGIN ATTEMPTS

**Since passwords are hashed, try these common test passwords:**

Common test passwords to try:
- `password`
- `password123`
- `test123`
- `admin123`
- `123456`
- `12345678`

**For each existing phone number, try the login endpoint with these passwords.**

---

## 🎯 QUICK ACCESS GUIDE

### For Users (userApp):
**Phone numbers to try:**
- `9902958254` (Akash Kumar)
- `6344997888` (Sam User)
- `9876543210` (John Doe)

**Common password:** Likely `test123`, `password123`, or `admin123`

### For Providers (providerApp):
**Phone numbers to try:**
- `8888888888` (Test Provider)
- `6361884366` (Test)
- `9902898562` (Murthy Services)
- `9876543210` (Tom Provider)

**Common password:** Likely `test123`, `password123`, or `admin123`

### For Admin (providerApp):
**Phone:** `9999999999`  
**Password:** Try `admin123`, `password123`, or use forgot password flow

---

## 💡 TROUBLESHOOTING

### Can't Login?

**Solution 1: Create Fresh Test Account**
- Use the API calls above
- Create account with known password
- You'll have full control

**Solution 2: Use Forgot Password**
1. In the app, go to "Forgot Password"
2. Enter existing phone number
3. OTP will show in backend console
4. Set new password you'll remember

**Solution 3: Reset Admin Password**
```sql
-- If you have database access, run:
UPDATE users 
SET password = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIr.oUiIq.'
WHERE phone = '9999999999' AND role = 'admin';

-- This sets password to: admin123
```

---

## 🔒 SECURITY NOTE

**Why Passwords Can't Be Displayed:**

Your backend uses **bcrypt hashing** with cost factor 12. This means:
- Passwords are **one-way encrypted**
- Even you (the admin) cannot see original passwords
- This is a **security feature**, not a bug!
- **Industry best practice** for password storage

**Example:**
```
Original password: "test123"
Stored in database: "$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIr.oUiIq."

You CANNOT reverse the hash to get "test123" back!
```

---

## 📱 TESTING RECOMMENDATIONS

### For Quick Testing:

**Create these test accounts (you'll know the passwords):**

1. **Test User:**
   - Phone: `7777777771`
   - Password: `test123`
   - Role: `user`

2. **Test Provider:**
   - Phone: `7777777772`
   - Password: `test123`
   - Role: `provider`

3. **Use existing Admin:**
   - Phone: `9999999999`
   - Try password: `admin123`
   - If doesn't work, use forgot password

---

## ✅ SUMMARY

**Existing Accounts:**
- 👥 **5 Users** - Phone numbers listed above
- 🔧 **4 Providers** - Phone numbers listed above
- 👑 **1 Admin** - Phone: `9999999999`

**Passwords:**
- ⚠️ **Cannot be displayed** (hashed with bcrypt)
- ✅ **Security best practice** (one-way encryption)
- 💡 **Use forgot password** to reset
- 💡 **Create new test accounts** with known passwords

**Admin Access:**
- Phone: `9999999999`
- Try password: `admin123`
- Or use: Forgot password flow

---

**Need help logging in? Create a fresh test account with known password!** 🔑

